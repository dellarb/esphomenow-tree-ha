from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import secrets
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import websockets
from google.protobuf.message import DecodeError

from .bridge_ws_client import TopologyBroadcast
from .models import BridgeTarget, normalize_mac, now_ts
from .protobuf.generated import esp_tree_runtime_pb2 as pb

logger = logging.getLogger(__name__)

API_VERSION = 2
CLIENT_KIND = "ha_integration"
PROTOCOL = "esp-tree-pb"
WS_PATH = "/esp-tree/v2/pb"
BACKOFF_DELAYS = [1, 2, 5, 10]


FrameHandler = Callable[["BridgeV2Client", pb.Envelope, bytes], Awaitable[None]]
ConnectionHandler = Callable[["BridgeV2Client", bool], Awaitable[None]]


@dataclass
class RemoteRoute:
    bridge_uuid: str
    bridge_mac: str
    remote_mac: str
    session_id: str = ""


class BridgeV2Client:
    def __init__(
        self,
        bridge_uuid: str,
        target: BridgeTarget,
        *,
        on_frame: FrameHandler,
        on_connection_change: ConnectionHandler,
    ) -> None:
        self.bridge_uuid = bridge_uuid
        self.target = target
        self._on_frame = on_frame
        self._on_connection_change = on_connection_change
        self._ws: Any | None = None
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._send_lock = asyncio.Lock()
        self._pending: dict[str, asyncio.Future[pb.Envelope]] = {}
        self.connected = False
        self.bridge_mac = ""

    def ws_url(self) -> str:
        host = self.target.host.strip()
        if host.startswith("ws://") or host.startswith("wss://"):
            return f"{host.rstrip('/')}{WS_PATH}"
        return f"ws://{host}:{self.target.port}{WS_PATH}"

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run(), name=f"bridge-v2-{self.bridge_uuid}")

    async def stop(self) -> None:
        self._stop_event.set()
        self._fail_pending(ConnectionError("bridge v2 client stopped"))
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def _run(self) -> None:
        backoff_index = 0
        while not self._stop_event.is_set():
            connected_at = time.monotonic()
            try:
                await self._connect_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("bridge v2 %s disconnected: %s", self.target.host, exc)
            finally:
                was_connected = self.connected
                self.connected = False
                self._ws = None
                self._fail_pending(ConnectionError("bridge v2 websocket disconnected"))
                if was_connected:
                    await self._on_connection_change(self, False)
            if self._stop_event.is_set():
                break
            if time.monotonic() - connected_at > 60:
                backoff_index = 0
            delay = BACKOFF_DELAYS[min(backoff_index, len(BACKOFF_DELAYS) - 1)]
            backoff_index = min(backoff_index + 1, len(BACKOFF_DELAYS) - 1)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

    async def _connect_once(self) -> None:
        async with websockets.connect(self.ws_url(), subprotocols=[PROTOCOL], max_size=65536, close_timeout=5) as ws:
            self._ws = ws
            await self._authenticate()
            await self._send(
                pb.Envelope(
                    request_id=uuid.uuid4().hex,
                    api_version=API_VERSION,
                    client_hello=pb.ClientHello(request_full_snapshot=True, integration_version="addon"),
                )
            )
            self.connected = True
            await self._on_connection_change(self, True)
            async for raw in ws:
                if not isinstance(raw, bytes):
                    raise RuntimeError("bridge v2 sent non-binary frame")
                env = pb.Envelope()
                try:
                    env.ParseFromString(raw)
                except DecodeError as exc:
                    raise RuntimeError("invalid bridge v2 protobuf frame") from exc
                fut = self._pending.pop(env.request_id, None) if env.request_id else None
                if fut and not fut.done():
                    fut.set_result(env)
                    continue
                await self._on_frame(self, env, raw)

    async def _authenticate(self) -> None:
        assert self._ws is not None
        raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
        if not isinstance(raw, bytes):
            raise RuntimeError("missing binary auth challenge")
        env = pb.Envelope()
        env.ParseFromString(raw)
        if env.WhichOneof("msg") != "auth_challenge":
            raise RuntimeError("missing auth challenge")
        challenge = env.auth_challenge
        if challenge.protocol != PROTOCOL or challenge.max_version < API_VERSION:
            raise RuntimeError("incompatible bridge runtime API")
        client_nonce = secrets.token_bytes(16)
        digest_input = (
            f"{PROTOCOL}|v2|{CLIENT_KIND}|"
            f"{challenge.server_nonce.hex()}|{client_nonce.hex()}"
        ).encode()
        digest = hmac.new(self.target.api_key.encode(), digest_input, hashlib.sha256).digest()
        await self._send(
            pb.Envelope(
                request_id=uuid.uuid4().hex,
                api_version=API_VERSION,
                auth_response=pb.AuthResponse(
                    client_kind=CLIENT_KIND,
                    client_name=self.target.name or "ESP Tree Add-on",
                    client_nonce=client_nonce,
                    hmac_sha256=digest,
                ),
            )
        )
        raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
        if not isinstance(raw, bytes):
            raise RuntimeError("missing binary auth result")
        auth_env = pb.Envelope()
        auth_env.ParseFromString(raw)
        kind = auth_env.WhichOneof("msg")
        if kind == "auth_failed":
            raise RuntimeError(auth_env.auth_failed.message or auth_env.auth_failed.code)
        if kind != "auth_ok":
            raise RuntimeError("missing auth ok")
        self.bridge_mac = normalize_mac(auth_env.auth_ok.bridge.bridge_mac)

    async def _send(self, envelope: pb.Envelope) -> None:
        if self._ws is None:
            raise RuntimeError("bridge v2 websocket is not connected")
        async with self._send_lock:
            await self._ws.send(envelope.SerializeToString())

    async def request(self, envelope: pb.Envelope, timeout: float = 10.0) -> pb.Envelope:
        if not envelope.request_id:
            envelope.request_id = uuid.uuid4().hex
        envelope.api_version = API_VERSION
        fut: asyncio.Future[pb.Envelope] = asyncio.get_running_loop().create_future()
        self._pending[envelope.request_id] = fut
        try:
            await self._send(envelope)
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._pending.pop(envelope.request_id, None)

    async def command(self, request: pb.CommandRequest, timeout: float = 10.0) -> pb.CommandResult:
        env = await self.request(pb.Envelope(command_request=request), timeout=timeout)
        return env.command_result

    async def config_command(self, request: pb.ConfigCommandRequest, timeout: float = 10.0) -> pb.ConfigCommandResult:
        env = await self.request(pb.Envelope(config_command_request=request), timeout=timeout)
        return env.config_command_result

    def _fail_pending(self, exc: Exception) -> None:
        pending = self._pending
        self._pending = {}
        for fut in pending.values():
            if not fut.done():
                fut.set_exception(exc)


class BridgeV2Manager:
    def __init__(self, db: Any) -> None:
        self._db = db
        self.broadcast = TopologyBroadcast()
        self._clients: dict[str, BridgeV2Client] = {}
        self._bridge_mac_to_uuid: dict[str, str] = {}
        self._snapshots: dict[str, pb.FullSnapshot] = {}
        self._topology_nodes: dict[str, dict[str, Any]] = {}
        self._routes: dict[str, RemoteRoute] = {}
        self._integration_clients: set[asyncio.Queue[bytes]] = set()

    @property
    def connected(self) -> bool:
        return any(client.connected for client in self._clients.values())

    async def sync_bridges(self, bridges: list[dict[str, Any]]) -> None:
        wanted: set[str] = set()
        for bridge in bridges:
            if not bridge.get("enabled", True):
                continue
            bridge_uuid = str(bridge.get("uuid") or "")
            api_key = str(bridge.get("api_key") or "")
            host = str(bridge.get("host") or "").strip()
            if not bridge_uuid or not host or not api_key:
                continue
            wanted.add(bridge_uuid)
            existing = self._clients.get(bridge_uuid)
            target = BridgeTarget(
                host=host,
                port=int(bridge.get("port") or 80),
                source="shared_db",
                name=str(bridge.get("name") or ""),
                api_key=api_key,
            )
            if existing and existing.target == target:
                continue
            if existing:
                await existing.stop()
            client = BridgeV2Client(
                bridge_uuid,
                target,
                on_frame=self._handle_bridge_frame,
                on_connection_change=self._handle_connection_change,
            )
            self._clients[bridge_uuid] = client
            client.start()
        for bridge_uuid in list(self._clients):
            if bridge_uuid not in wanted:
                await self._clients.pop(bridge_uuid).stop()

    async def stop(self) -> None:
        for client in list(self._clients.values()):
            await client.stop()
        self._clients.clear()
        self._integration_clients.clear()

    def add_integration_client(self) -> asyncio.Queue[bytes]:
        q: asyncio.Queue[bytes] = asyncio.Queue(maxsize=256)
        self._integration_clients.add(q)
        return q

    def remove_integration_client(self, q: asyncio.Queue[bytes]) -> None:
        self._integration_clients.discard(q)

    async def replay_snapshots(self, q: asyncio.Queue[bytes]) -> None:
        for snapshot in self._snapshots.values():
            await q.put(pb.Envelope(api_version=API_VERSION, full_snapshot=snapshot).SerializeToString())

    async def handle_integration_frame(self, data: bytes) -> bytes:
        env = pb.Envelope()
        env.ParseFromString(data)
        kind = env.WhichOneof("msg")
        if kind == "command_request":
            route = self._route_for_remote(env.command_request.remote_mac)
            if not route:
                return pb.Envelope(
                    request_id=env.request_id,
                    api_version=API_VERSION,
                    command_result=pb.CommandResult(
                        remote_mac=normalize_mac(env.command_request.remote_mac),
                        object_id=env.command_request.object_id,
                        command=env.command_request.command,
                        status=pb.COMMAND_STATUS_UNAVAILABLE,
                        error_code="unknown_remote",
                        error_message="remote is not known to the add-on",
                    ),
                ).SerializeToString()
            result = await self._clients[route.bridge_uuid].command(env.command_request)
            return pb.Envelope(request_id=env.request_id, api_version=API_VERSION, command_result=result).SerializeToString()
        if kind == "config_command_request":
            route = self._route_for_remote(env.config_command_request.remote_mac)
            if not route:
                return pb.Envelope(
                    request_id=env.request_id,
                    api_version=API_VERSION,
                    config_command_result=pb.ConfigCommandResult(
                        remote_mac=normalize_mac(env.config_command_request.remote_mac),
                        command=env.config_command_request.command,
                        status=pb.COMMAND_STATUS_UNAVAILABLE,
                        error_code="unknown_remote",
                        error_message="remote is not known to the add-on",
                    ),
                ).SerializeToString()
            result = await self._clients[route.bridge_uuid].config_command(env.config_command_request)
            return pb.Envelope(request_id=env.request_id, api_version=API_VERSION, config_command_result=result).SerializeToString()
        if kind == "ping":
            return pb.Envelope(request_id=env.request_id, api_version=API_VERSION, pong=pb.Pong(monotonic_ms=env.ping.monotonic_ms)).SerializeToString()
        return pb.Envelope(
            request_id=env.request_id,
            api_version=API_VERSION,
            error=pb.Error(code="unsupported_frame", message=f"unsupported integration frame: {kind}"),
        ).SerializeToString()

    async def send_config(self, mac: str, command: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        req = pb.ConfigCommandRequest(remote_mac=normalize_mac(mac), command=command)
        params = params or {}
        if params.get("interval_seconds") is not None:
            req.interval_seconds = int(params["interval_seconds"])
        if params.get("parent_mac") is not None:
            req.parent_mac = normalize_mac(str(params["parent_mac"]))
        if params.get("clear") is not None:
            req.clear_parent = bool(params["clear"])
        if params.get("clear_parent") is not None:
            req.clear_parent = bool(params["clear_parent"])
        if params.get("enable") is not None:
            req.relay_enable = bool(params["enable"])
        if params.get("relay_enable") is not None:
            req.relay_enable = bool(params["relay_enable"])
        route = self._route_for_remote(mac)
        if not route:
            raise RuntimeError("remote is not known to the add-on")
        result = await self._clients[route.bridge_uuid].config_command(req)
        return {
            "ok": result.status in (pb.COMMAND_STATUS_ACCEPTED, pb.COMMAND_STATUS_DELIVERED),
            "status": pb.CommandStatus.Name(result.status),
            "error": result.error_message or result.error_code,
            "bridge_mac": normalize_mac(result.bridge_mac),
        }

    async def refresh_once(self) -> None:
        for client in self._clients.values():
            if client.connected:
                await client._send(
                    pb.Envelope(
                        request_id=uuid.uuid4().hex,
                        api_version=API_VERSION,
                        client_hello=pb.ClientHello(request_full_snapshot=True, integration_version="addon"),
                    )
                )

    async def topology(self) -> list[dict[str, Any]]:
        nodes = self.get_topology_list()
        if not nodes and self.connected:
            logger.info("bridge v2 topology empty but connected, requesting refresh")
            await self.refresh_once()
            await asyncio.sleep(0.5)
            nodes = self.get_topology_list()
        return nodes

    def get_topology_list(self) -> list[dict[str, Any]]:
        return list(self._topology_nodes.values())

    def _route_for_remote(self, remote_mac: str) -> RemoteRoute | None:
        route = self._routes.get(normalize_mac(remote_mac))
        if not route:
            return None
        client = self._clients.get(route.bridge_uuid)
        if not client or not client.connected:
            return None
        return route

    async def _handle_bridge_frame(self, client: BridgeV2Client, env: pb.Envelope, raw: bytes) -> None:
        kind = env.WhichOneof("msg")
        if kind == "full_snapshot":
            logger.debug("bridge v2 %s: received full_snapshot", client.target.host)
            self._handle_snapshot(client, env.full_snapshot)
            await self._broadcast_binary(raw)
            self._emit_topology()
        elif kind == "event_batch":
            self._handle_event_batch(client, env.event_batch)
            await self._broadcast_binary(raw)
            self._emit_topology()
        else:
            logger.warning("bridge v2 %s: unhandled message kind=%s", client.target.host, kind)

    async def _handle_connection_change(self, client: BridgeV2Client, connected: bool) -> None:
        if connected:
            self.broadcast.emit("bridge.connection", {"bridge_uuid": client.bridge_uuid, "connected": True})
            return
        offline = self._offline_batch_for_bridge(client)
        if offline.events:
            raw = pb.Envelope(api_version=API_VERSION, event_batch=offline).SerializeToString()
            self._handle_event_batch(client, offline)
            await self._broadcast_binary(raw)
        self.broadcast.emit("bridge.connection", {"bridge_uuid": client.bridge_uuid, "connected": False})
        self._emit_topology()

    def _handle_snapshot(self, client: BridgeV2Client, snapshot: pb.FullSnapshot) -> None:
        bridge_mac = normalize_mac(snapshot.bridge.bridge_mac or client.bridge_mac)
        remote_count = len(snapshot.remotes)
        logger.debug(
            "bridge v2 %s: handling snapshot bridge_mac=%s remotes=%d",
            client.target.host, bridge_mac, remote_count,
        )
        if bridge_mac:
            self._bridge_mac_to_uuid[bridge_mac] = client.bridge_uuid
            client.bridge_mac = bridge_mac
            self._db.update_bridge(client.bridge_uuid, network_id=snapshot.bridge.network_id, last_connected_at=now_ts())
        self._snapshots[client.bridge_uuid] = snapshot
        for node in self._snapshot_nodes(client.bridge_uuid, snapshot):
            self._topology_nodes[normalize_mac(node.get("mac"))] = node
        for remote in snapshot.remotes:
            remote_mac = normalize_mac(remote.identity.remote_mac)
            self._routes[remote_mac] = RemoteRoute(
                bridge_uuid=client.bridge_uuid,
                bridge_mac=bridge_mac,
                remote_mac=remote_mac,
                session_id=remote.runtime.session_id,
            )
        try:
            self._db.upsert_devices_from_topology(self.get_topology_list(), snapshot.bridge.bridge_name or client.target.name)
        except Exception as exc:
            logger.warning("bridge v2 topology db update failed: %s", exc)
        logger.debug(
            "bridge v2 %s: topology now has %d nodes", client.target.host, len(self._topology_nodes),
        )

    def _handle_event_batch(self, client: BridgeV2Client, batch: pb.EventBatch) -> None:
        for event in batch.events:
            kind = event.WhichOneof("kind")
            if kind == "remote_availability":
                ev = event.remote_availability
                remote_mac = normalize_mac(ev.remote_mac)
                bridge_mac = normalize_mac(ev.bridge_mac or client.bridge_mac)
                route = self._routes.setdefault(remote_mac, RemoteRoute(client.bridge_uuid, bridge_mac, remote_mac))
                route.bridge_uuid = client.bridge_uuid
                route.bridge_mac = bridge_mac
                route.session_id = ev.session_id
                node = self._topology_nodes.get(remote_mac)
                if node:
                    node["online"] = bool(ev.online)
                    node["rssi"] = ev.rssi
                    node["hops"] = ev.hops_to_bridge
                    node["offline_reason"] = ev.reason
                    node["uptime_s"] = ev.uptime_s
                self.broadcast.emit(
                    "remote.availability",
                    {"mac": remote_mac, "online": bool(ev.online), "bridge_mac": bridge_mac, "reason": ev.reason},
                )
            elif kind == "remote_state":
                ev = event.remote_state
                remote_mac = normalize_mac(ev.remote_mac)
                route = self._routes.get(remote_mac)
                if route:
                    route.session_id = ev.session_id
            elif kind == "remote_schema_changed":
                self._handle_remote_snapshot(client, event.remote_schema_changed.snapshot, event.remote_schema_changed.bridge_mac)
            elif kind == "remote_metadata_changed":
                self._handle_remote_snapshot(client, self._remote_snapshot_from_metadata(event.remote_metadata_changed), event.remote_metadata_changed.runtime.bridge_mac)
            elif kind == "topology_changed":
                ev = event.topology_changed
                node = self._topology_nodes.get(normalize_mac(ev.remote_mac))
                if node:
                    node["parent_mac"] = normalize_mac(ev.parent_mac)
                    node["hops"] = ev.hops_to_bridge
                    node["rssi"] = ev.rssi
                    node["uptime_s"] = ev.uptime_s
            elif kind == "bridge_heartbeat":
                node = self._topology_nodes.get(normalize_mac(event.bridge_heartbeat.bridge_mac))
                if node:
                    node["uptime_s"] = event.bridge_heartbeat.uptime_s

    def _handle_remote_snapshot(self, client: BridgeV2Client, snapshot: pb.RemoteSnapshot, bridge_mac_value: str) -> None:
        bridge_mac = normalize_mac(bridge_mac_value or snapshot.runtime.bridge_mac or client.bridge_mac)
        node = self._remote_node(snapshot, bridge_mac)
        self._topology_nodes[normalize_mac(node["mac"])] = node
        self._routes[normalize_mac(node["mac"])] = RemoteRoute(
            bridge_uuid=client.bridge_uuid,
            bridge_mac=bridge_mac,
            remote_mac=normalize_mac(node["mac"]),
            session_id=snapshot.runtime.session_id,
        )

    def _offline_batch_for_bridge(self, client: BridgeV2Client) -> pb.EventBatch:
        batch = pb.EventBatch()
        for route in list(self._routes.values()):
            if route.bridge_uuid != client.bridge_uuid:
                continue
            ev = batch.events.add().remote_availability
            ev.remote_mac = route.remote_mac
            ev.bridge_mac = route.bridge_mac
            ev.session_id = route.session_id
            ev.online = False
            ev.reason = "bridge_disconnected"
            ev.observed_unix_ms = int(time.time() * 1000)
        return batch

    async def _broadcast_binary(self, raw: bytes) -> None:
        for q in list(self._integration_clients):
            try:
                q.put_nowait(raw)
            except asyncio.QueueFull:
                self._integration_clients.discard(q)

    def _emit_topology(self) -> None:
        self.broadcast.emit("topology.snapshot", {"nodes": self.get_topology_list()})

    def _snapshot_nodes(self, bridge_uuid: str, snapshot: pb.FullSnapshot) -> list[dict[str, Any]]:
        bridge_mac = normalize_mac(snapshot.bridge.bridge_mac)
        name = snapshot.bridge.friendly_name or snapshot.bridge.bridge_name or bridge_mac
        nodes = [
            {
                "mac": bridge_mac,
                "node_key": bridge_mac.replace(":", ""),
                "device_unique_id": f"espnow_lr_{bridge_mac.replace(':', '')}",
                "parent_mac": "",
                "name": snapshot.bridge.bridge_name or name,
                "esphome_name": snapshot.bridge.bridge_name or name,
                "friendly_name": name,
                "label": name,
                "manufacturer": snapshot.bridge.manufacturer or "ESPHome",
                "model": snapshot.bridge.model or "espnow_lr_bridge",
                "sw_version": snapshot.bridge.project_version,
                "project_name": snapshot.bridge.project_name,
                "firmware_version": snapshot.bridge.project_version,
                "firmware_build_date": snapshot.bridge.firmware_build_date,
                "online": snapshot.bridge_runtime.online,
                "rssi": snapshot.bridge_runtime.wifi_rssi,
                "hops": 0,
                "uptime_s": snapshot.bridge_runtime.uptime_s,
                "offline_s": 0,
                "entity_count": snapshot.bridge_runtime.remote_count,
                "route_v2_capable": True,
                "can_relay": True,
                "relay_enabled": True,
                "direct_child_count": 0,
                "total_child_count": len(snapshot.remotes),
                "from_v2_api": True,
                "is_bridge": True,
                "bridge_uuid": bridge_uuid,
                "network_id": snapshot.bridge.network_id,
            }
        ]
        nodes.extend(self._remote_node(remote, bridge_mac) for remote in snapshot.remotes)
        return nodes

    def _remote_node(self, remote: pb.RemoteSnapshot, bridge_mac: str) -> dict[str, Any]:
        ident = remote.identity
        runtime = remote.runtime
        remote_mac = normalize_mac(ident.remote_mac)
        return {
            "mac": remote_mac,
            "node_key": remote_mac.replace(":", ""),
            "device_unique_id": f"espnow_lr_{remote_mac.replace(':', '')}",
            "parent_mac": normalize_mac(runtime.parent_mac),
            "name": ident.esphome_name or ident.friendly_name or remote_mac,
            "esphome_name": ident.esphome_name,
            "friendly_name": ident.friendly_name or ident.esphome_name or remote_mac,
            "label": ident.friendly_name or ident.esphome_name or remote_mac,
            "manufacturer": ident.manufacturer or "ESPHome",
            "model": ident.model or "espnow_lr_remote",
            "sw_version": ident.project_version,
            "project_name": ident.project_name,
            "firmware_version": ident.project_version,
            "firmware_build_date": ident.firmware_build_date,
            "firmware_md5": ident.firmware_md5,
            "online": runtime.online,
            "chip_name": ident.chip_name,
            "rssi": runtime.rssi,
            "hops": runtime.hops_to_bridge,
            "offline_s": runtime.offline_s,
            "uptime_s": runtime.uptime_s,
            "route_v2_capable": True,
            "can_relay": ident.can_relay,
            "relay_enabled": ident.relay_enabled,
            "direct_child_count": 0,
            "total_child_count": 0,
            "from_v2_api": True,
            "is_bridge": False,
            "bridge_mac": bridge_mac,
            "network_id": "",
            "entity_count": ident.entity_count,
        }

    def _remote_snapshot_from_metadata(self, ev: pb.RemoteMetadataChangedEvent) -> pb.RemoteSnapshot:
        snapshot = pb.RemoteSnapshot()
        snapshot.identity.CopyFrom(ev.identity)
        snapshot.runtime.CopyFrom(ev.runtime)
        return snapshot
