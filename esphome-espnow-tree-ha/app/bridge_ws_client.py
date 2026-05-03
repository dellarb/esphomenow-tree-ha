from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Callable, Optional

import websockets
import websockets.client

from .config import Settings
from .models import BridgeTarget, normalize_mac
from .ota_chunks import MAX_WS_CHUNK_SIZE, OTA_WINDOW_SIZE

logger = logging.getLogger(__name__)

API_VERSION = 1
PROTOCOL_NAME = "espnow-tree-ws"
PROTOCOL_VERSION_LABEL = "v1"
WS_PATH = "/espnow-tree/v1/ws"

BACKOFF_DELAYS = [1, 2, 5, 10]
HEARTBEAT_TIMEOUT_S = 90


def _mac_key(value: str) -> str:
    return normalize_mac(value).replace(":", "").upper()


class BridgeWsClient:
    def __init__(
        self,
        target: BridgeTarget,
        api_key: str,
        on_topology: Optional[Callable[[dict[str, Any]], None]] = None,
        on_event: Optional[Callable[[str, dict[str, Any]], None]] = None,
        on_connection_change: Optional[Callable[[bool], None]] = None,
    ) -> None:
        self.target = target
        self.api_key = api_key
        self._on_topology = on_topology
        self._on_event = on_event
        self._on_connection_change = on_connection_change

        self._ws: Optional[websockets.client.WebSocketClientProtocol] = None
        self._connected = False
        self._authenticated = False
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
        self._refresh_task: Optional[asyncio.Task] = None

        self._topology_cache: Optional[dict[str, Any]] = None
        self._known_schema_hashes: dict[str, str] = {}

        self._request_id = 0
        self._pending_requests: dict[str, asyncio.Future[dict[str, Any]]] = {}

        self._bridge_info: Optional[dict[str, Any]] = None
        self._backoff_index = 0
        self._on_binary_frame: Optional[Callable[[bytes], None]] = None

    @property
    def connected(self) -> bool:
        return self._connected and self._authenticated

    @property
    def bridge_info(self) -> Optional[dict[str, Any]]:
        return self._bridge_info

    @property
    def topology_cache(self) -> Optional[dict[str, Any]]:
        return self._topology_cache

    def ws_url(self) -> str:
        host = self.target.host.strip()
        if host.startswith("ws://") or host.startswith("wss://"):
            base = host.rstrip("/")
            return f"{base}{WS_PATH}"
        port = self.target.port
        return f"ws://{host}:{port}{WS_PATH}"

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run(), name="bridge-ws-client")

    async def stop(self) -> None:
        self._stop_event.set()
        # Cancel all pending requests
        for request_id, future in list(self._pending_requests.items()):
            if not future.done():
                future.cancel()
        self._pending_requests.clear()
        # Cancel any pending refresh task
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass
            self._refresh_task = None
        if self._ws:
            await self._ws.close()
        if self._task and not self._task.done():
            try:
                await asyncio.wait_for(self._task, timeout=3.0)
            except asyncio.TimeoutError:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
        self._task = None

    async def request(self, msg_type: str, payload: dict[str, Any] | None = None, timeout: float = 10.0) -> dict[str, Any]:
        self._request_id += 1
        request_id = str(self._request_id)
        envelope: dict[str, Any] = {"v": API_VERSION, "id": request_id, "type": msg_type}
        if payload is not None:
            envelope["payload"] = payload
        logger.info(f"BRIDGE_WS request id={request_id} type={msg_type} payload={payload}")
        future: asyncio.Future[dict[str, Any]] = asyncio.get_event_loop().create_future()
        self._pending_requests[request_id] = future
        try:
            await self._send(envelope)
            result = await asyncio.wait_for(future, timeout=timeout)
            logger.info(f"BRIDGE_WS response id={request_id} type={result.get('type')} success=true")
            return result
        except Exception as exc:
            logger.info(f"BRIDGE_WS response id={request_id} error={exc}")
            raise
        finally:
            self._pending_requests.pop(request_id, None)

    async def get_topology(self, known_schema_hashes: dict[str, str] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        hashes = known_schema_hashes or self._known_schema_hashes
        if hashes:
            payload["known_schema_hashes"] = hashes
        result = await self.request("topology.get", payload if payload else None, timeout=15.0)
        if result.get("type") == "topology.snapshot":
            self._topology_cache = result.get("payload", {})
            nodes = self._topology_cache.get("nodes", [])
            for node in nodes:
                mac = normalize_mac(node.get("mac", ""))
                sh = node.get("schema_hash")
                if mac and sh:
                    self._known_schema_hashes[mac] = sh
            if self._on_topology:
                self._on_topology(self._topology_cache)
        return result

    def _reset_backoff(self) -> None:
        self._backoff_index = 0

    def _next_backoff(self) -> float:
        if self._backoff_index < len(BACKOFF_DELAYS):
            delay = BACKOFF_DELAYS[self._backoff_index]
        else:
            delay = BACKOFF_DELAYS[-1]
        self._backoff_index = min(self._backoff_index + 1, len(BACKOFF_DELAYS) - 1)
        return delay

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._connect_and_run()
            except Exception as exc:
                if self._stop_event.is_set():
                    break
                logger.warning("bridge ws client error: %s", exc)
            if self._stop_event.is_set():
                break
            delay = self._next_backoff()
            logger.info("bridge ws reconnecting in %.0fs", delay)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=delay)
                break
            except asyncio.TimeoutError:
                pass

    async def _connect_and_run(self) -> None:
        url = self.ws_url()
        logger.info("bridge ws connecting to %s", url)
        try:
            async with websockets.connect(url, max_size=65536, ping_interval=30, ping_timeout=10, close_timeout=5) as ws:
                self._ws = ws
                self._connected = True
                self._ota_client = None
                try:
                    await self._do_auth(ws)
                    self._reset_backoff()
                    self._notify_connection_change(True)
                    logger.info("bridge ws authenticated")
                    await self._message_loop(ws)
                except Exception as exc:
                    logger.warning("bridge ws session error: %s", exc)
                finally:
                    self._authenticated = False
                    self._connected = False
                    self._ws = None
                    self._notify_connection_change(False)
        except (ConnectionRefusedError, OSError, websockets.exceptions.InvalidURI, websockets.exceptions.InvalidHandshake) as exc:
            logger.warning("bridge ws connect failed: %s", exc)

    def _notify_connection_change(self, connected: bool) -> None:
        if self._on_connection_change:
            try:
                self._on_connection_change(connected)
            except Exception:
                pass

    async def _do_auth(self, ws: websockets.client.WebSocketClientProtocol) -> None:
        raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
        challenge = json.loads(raw)
        if challenge.get("type") != "auth.challenge":
            raise RuntimeError(f"expected auth.challenge, got {challenge.get('type')}")
        payload = challenge.get("payload", {})
        server_nonce = payload.get("server_nonce", "")
        min_version = payload.get("min_version", 0)
        max_version = payload.get("max_version", 0)
        if not min_version or not max_version or API_VERSION < min_version or API_VERSION > max_version:
            raise RuntimeError(f"unsupported version: server supports {min_version}-{max_version}, client is {API_VERSION}")
        client_nonce = os.urandom(16).hex()
        hmac_input = f"{PROTOCOL_NAME}|{PROTOCOL_VERSION_LABEL}|ha-addon|{server_nonce}|{client_nonce}"
        computed = hmac.new(self.api_key.encode(), hmac_input.encode(), hashlib.sha256).hexdigest()
        response = {
            "v": API_VERSION,
            "id": "auth-1",
            "type": "auth.response",
            "payload": {
                "client": "ha-addon",
                "client_nonce": client_nonce,
                "hmac": computed,
            },
        }
        await ws.send(json.dumps(response))
        result_raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
        result = json.loads(result_raw)
        result_type = result.get("type", "")
        if result_type == "error":
            code = result.get("payload", {}).get("code", "")
            msg = result.get("payload", {}).get("message", "")
            raise RuntimeError(f"auth failed: {code}: {msg}")
        if result_type != "auth.ok":
            raise RuntimeError(f"unexpected auth response: {result_type}")
        self._authenticated = True
        self._bridge_info = result.get("payload", {})
        info_result = await self._request_topology(ws)
        if info_result and info_result.get("type") == "topology.snapshot":
            self._topology_cache = info_result.get("payload", {})
            nodes = self._topology_cache.get("nodes", [])
            for node in nodes:
                mac = normalize_mac(node.get("mac", ""))
                sh = node.get("schema_hash")
                if mac and sh:
                    self._known_schema_hashes[mac] = sh
            if self._on_topology:
                self._on_topology(self._topology_cache)

    async def _request_topology(self, ws: websockets.client.WebSocketClientProtocol) -> dict[str, Any] | None:
        self._request_id += 1
        request_id = str(self._request_id)
        payload: dict[str, Any] = {}
        if self._known_schema_hashes:
            payload["known_schema_hashes"] = self._known_schema_hashes
        envelope: dict[str, Any] = {"v": API_VERSION, "id": request_id, "type": "topology.get"}
        if payload:
            envelope["payload"] = payload
        await ws.send(json.dumps(envelope))
        logger.debug("bridge ws topology.get sent, waiting for response id=%s", request_id)
        deadline = asyncio.get_event_loop().time() + 15.0
        while asyncio.get_event_loop().time() < deadline:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                break
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 2.0))
            except asyncio.TimeoutError:
                continue
            if isinstance(raw, bytes):
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == request_id:
                return msg
            msg_type = msg.get("type", "")
            if msg_type == "bridge.heartbeat":
                continue
            logger.debug("bridge ws auth-phase unhandled message: %s", msg_type)
        logger.warning("bridge ws topology.get timed out")
        return None

    async def _message_loop(self, ws: websockets.client.WebSocketClientProtocol) -> None:
        last_rx_time = asyncio.get_event_loop().time()
        while not self._stop_event.is_set():
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            except asyncio.TimeoutError:
                elapsed = asyncio.get_event_loop().time() - last_rx_time
                if elapsed > HEARTBEAT_TIMEOUT_S:
                    logger.warning("bridge ws heartbeat timeout (%.0fs)", elapsed)
                    return
                continue
            except websockets.exceptions.ConnectionClosed:
                logger.info("bridge ws connection closed")
                return

            if isinstance(raw, bytes):
                if self._on_binary_frame:
                    try:
                        self._on_binary_frame(raw)
                    except Exception as exc:
                        logger.warning("bridge ws binary frame handler error: %s", exc)
                continue

            last_rx_time = asyncio.get_event_loop().time()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("bridge ws invalid json: %s", raw[:200])
                continue

            msg_type = msg.get("type", "")
            msg_id = msg.get("id", "")

            if msg_id and msg_id in self._pending_requests:
                future = self._pending_requests.pop(msg_id)
                if not future.done():
                    future.set_result(msg)
                continue

            if msg_type == "bridge.heartbeat":
                continue
            elif msg_type == "topology.changed":
                self._backoff_index = 0
                self._schedule_topology_refresh()
            elif msg_type == "remote.availability":
                self._emit_event("remote.availability", msg.get("payload", {}))
                self._update_availability_in_cache(msg.get("payload", {}))
            elif msg_type == "remote.state":
                self._emit_event("remote.state", msg.get("payload", {}))
                self._update_state_in_cache(msg.get("payload", {}))
            elif msg_type == "remote.schema_changed":
                self._backoff_index = 0
                node_mac = normalize_mac(msg.get("payload", {}).get("mac", ""))
                if node_mac and node_mac in self._known_schema_hashes:
                    del self._known_schema_hashes[node_mac]
                self._schedule_topology_refresh()
            elif msg_type == "remote.metadata_changed":
                self._emit_event("remote.metadata_changed", msg.get("payload", {}))
            elif msg_type == "error":
                code = msg.get("payload", {}).get("code", "")
                message = msg.get("payload", {}).get("message", "")
                logger.warning("bridge ws error: %s: %s", code, message)
            else:
                logger.debug("bridge ws unhandled event: %s", msg_type)

    def _schedule_topology_refresh(self) -> None:
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()
        async def _refresh() -> None:
            await asyncio.sleep(0.5)
            if self._connected and self._authenticated and self._ws:
                try:
                    await self.get_topology()
                except Exception as exc:
                    logger.warning("bridge ws scheduled topology refresh failed: %s", exc)
        self._refresh_task = asyncio.create_task(_refresh(), name="ws-topology-refresh")

    def _emit_event(self, event_type: str, payload: dict[str, Any]) -> None:
        if self._on_event:
            try:
                self._on_event(event_type, payload)
            except Exception as exc:
                logger.warning("bridge ws event handler error: %s", exc)

    def _update_state_in_cache(self, payload: dict[str, Any]) -> None:
        if not self._topology_cache:
            return
        mac = normalize_mac(payload.get("mac", ""))
        state = payload.get("state", {})
        if not mac or not state:
            return
        for node in self._topology_cache.get("nodes", []):
            if normalize_mac(node.get("mac", "")) == mac:
                node_state = node.get("state")
                if isinstance(node_state, dict):
                    node_state.update(state)
                else:
                    node["state"] = state
                break

    def _update_availability_in_cache(self, payload: dict[str, Any]) -> None:
        if not self._topology_cache:
            return
        mac = normalize_mac(payload.get("mac", ""))
        if not mac:
            return
        for node in self._topology_cache.get("nodes", []):
            if normalize_mac(node.get("mac", "")) == mac:
                if "online" in payload:
                    node["online"] = payload["online"]
                if "rssi" in payload:
                    node["rssi"] = payload["rssi"]
                if "last_seen_ms" in payload:
                    node["last_seen_ms"] = payload["last_seen_ms"]
                break

    async def _send(self, envelope: dict[str, Any]) -> None:
        if not self._ws or not self._connected:
            raise RuntimeError("not connected")
        await self._ws.send(json.dumps(envelope))

    async def send_binary_frame(self, data: bytes) -> None:
        if not self._ws or not self._connected:
            raise RuntimeError("not connected")
        await self._ws.send(data, binary=True)

    async def ota_start(
        self,
        target_mac: str,
        size: int,
        md5: str,
        sha256: str,
        filename: str,
        preferred_chunk_size: int = MAX_WS_CHUNK_SIZE,
    ) -> dict[str, Any]:
        payload = {
            "target_mac": normalize_mac(target_mac),
            "size": size,
            "md5": md5.lower(),
            "sha256": sha256.lower(),
            "filename": filename,
            "preferred_chunk_size": min(preferred_chunk_size, MAX_WS_CHUNK_SIZE),
        }
        result = await self.request("ota.start", payload, timeout=30.0)
        if result.get("type") == "error":
            code = result.get("payload", {}).get("code", "unknown")
            message = result.get("payload", {}).get("message", "unknown error")
            raise RuntimeError(f"ota.start failed: {code} — {message}")
        if result.get("type") != "ota.accepted":
            raise RuntimeError(f"ota.start unexpected response type: {result.get('type')}")
        return result.get("payload", {})

    async def ota_status(self) -> dict[str, Any]:
        result = await self.request("ota.status", {}, timeout=10.0)
        if result.get("type") == "error":
            code = result.get("payload", {}).get("code", "unknown")
            message = result.get("payload", {}).get("message", "unknown error")
            raise RuntimeError(f"ota.status failed: {code} — {message}")
        return result.get("payload", {})

    async def ota_abort(self, job_id: str, reason: str = "user") -> dict[str, Any]:
        payload = {"job_id": job_id, "reason": reason}
        result = await self.request("ota.abort", payload, timeout=10.0)
        if result.get("type") == "error":
            code = result.get("payload", {}).get("code", "unknown")
            message = result.get("payload", {}).get("message", "unknown error")
            raise RuntimeError(f"ota.abort failed: {code} — {message}")
        return result.get("payload", {})


class BridgeWsManager:
    def __init__(self, settings: Settings, db: Any | None = None) -> None:
        self.settings = settings
        self._db = db
        self._client: Optional[BridgeWsClient] = None
        self._target: Optional[BridgeTarget] = None
        self._topology_cache: Optional[dict[str, Any]] = None
        self._topology_cache_ts = 0.0

    def is_ws_mode(self) -> bool:
        return self.settings.bridge_transport == "ws"

    def start(self, target: BridgeTarget) -> BridgeWsClient:
        self._target = target
        client = BridgeWsClient(
            target=target,
            api_key=self.settings.bridge_api_key,
            on_topology=self._on_topology,
            on_event=self._on_event,
            on_connection_change=self._on_connection_change,
        )
        self._client = client
        client.start()
        return client

    def set_target(self, target: BridgeTarget) -> None:
        self._target = target

    async def stop(self) -> None:
        if self._client:
            await self._client.stop()
            self._client = None

    @property
    def client(self) -> Optional[BridgeWsClient]:
        return self._client

    @property
    def connected(self) -> bool:
        return self._client.connected if self._client else False

    @property
    def ota_client(self) -> Any:
        if self._client is not None and self._client.connected:
            from .bridge_ws_ota import BridgeWsOTAClient
            return BridgeWsOTAClient(self._client)
        return None

    async def topology(self, max_age_s: float = 4.0) -> list[dict[str, Any]]:
        if self._topology_cache and time.monotonic() - self._topology_cache_ts < max_age_s:
            return self.get_topology_list()
        if self.connected and self._client:
            await self._client.get_topology()
            return self.get_topology_list()
        await self.refresh_once()
        return self.get_topology_list()

    async def refresh_once(self) -> dict[str, Any]:
        if not self._target:
            raise RuntimeError("WebSocket bridge target is not configured")
        client = BridgeWsClient(
            target=self._target,
            api_key=self.settings.bridge_api_key,
            on_topology=self._on_topology,
            on_event=self._on_event,
            on_connection_change=None,
        )
        url = client.ws_url()
        logger.info("bridge ws one-shot topology request to %s", url)
        async with websockets.connect(url, max_size=65536, ping_interval=None, close_timeout=2) as ws:
            client._ws = ws
            client._connected = True
            await client._do_auth(ws)
        if not self._topology_cache:
            raise RuntimeError("bridge returned no topology snapshot")
        return self._topology_cache

    def get_topology_list(self) -> list[dict[str, Any]]:
        if not self._topology_cache:
            return []
        nodes = self._topology_cache.get("nodes", [])
        result = []
        bridge = self._topology_cache.get("bridge", {})
        if bridge:
            bridge_mac = bridge.get("mac", "")
            bridge_mac_key = _mac_key(bridge_mac)
            bridge_name = bridge.get("name", "")
            bridge_esphome_name = bridge.get("esphome_name") or bridge_name
            bridge_label = bridge.get("label") or bridge.get("friendly_name") or bridge_name
            result.append({
                "mac": bridge_mac,
                "node_key": bridge_mac_key,
                "device_unique_id": bridge.get("device_unique_id") or ("espnow_lr_" + bridge_mac_key),
                "parent_mac": "",
                "name": bridge_name,
                "esphome_name": bridge_esphome_name,
                "friendly_name": bridge_label,
                "label": bridge_label,
                "manufacturer": bridge.get("manufacturer", "ESPHome"),
                "model": bridge.get("model", "espnow_lr_bridge"),
                "sw_version": bridge.get("software_version") or bridge.get("firmware", {}).get("version") or bridge.get("firmware_version", ""),
                "project_name": bridge.get("project_name", ""),
                "firmware_version": bridge.get("firmware_version") or bridge.get("firmware", {}).get("version", ""),
                "firmware_build_date": bridge.get("firmware", {}).get("build_date", ""),
                "online": True,
                "chip_name": bridge.get("chip_name") or bridge.get("chip_model"),
                "rssi": bridge.get("radio", {}).get("rssi"),
                "hops": 0,
                "uptime_s": bridge.get("uptime_s"),
                "offline_s": 0,
                "entity_count": bridge.get("entity_count"),
                "route_v2_capable": True,
                "from_ws_api": True,
                "is_bridge": True,
            })
        for node in nodes:
            identity = node.get("identity", {})
            radio = node.get("radio", {})
            session = node.get("session", {})
            schema = node.get("schema")
            parent_mac = node.get("parent_mac") or radio.get("parent_mac") or ""
            hops = radio.get("hops_to_bridge", node.get("hop_count"))
            entry: dict[str, Any] = {
                "mac": node.get("mac", ""),
                "node_key": node.get("node_key", ""),
                "device_unique_id": node.get("device_unique_id", ""),
                "parent_mac": parent_mac,
                "name": node.get("name") or identity.get("esphome_name", ""),
                "esphome_name": identity.get("esphome_name") or node.get("name", ""),
                "friendly_name": node.get("friendly_name") or identity.get("node_label", ""),
                "label": node.get("friendly_name") or node.get("name") or identity.get("node_label", ""),
                "manufacturer": identity.get("manufacturer", "ESPHome"),
                "model": identity.get("model", "espnow_lr_remote"),
                "sw_version": identity.get("project_version") or node.get("sw_version", ""),
                "project_name": identity.get("project_name", ""),
                "firmware_version": identity.get("project_version") or node.get("sw_version", ""),
                "firmware_build_date": identity.get("build_date", ""),
                "online": node.get("online", False),
                "chip_name": node.get("chip_name") or identity.get("chip_model"),
                "rssi": radio.get("rssi", node.get("rssi")),
                "hops": hops,
                "uptime_s": node.get("uptime_s", 0),
                "offline_s": node.get("offline_s", 0),
                "route_v2_capable": session.get("route_v2_capable", node.get("route_v2_capable", False)),
                "entity_count": schema.get("total_entities") if isinstance(schema, dict) else None,
                "from_ws_api": True,
            }
            if schema and isinstance(schema, dict) and schema.get("entities"):
                entry["entities"] = schema["entities"]
                entry["entity_count"] = len(schema["entities"])
            state = node.get("state")
            if state and isinstance(state, dict):
                entry["state"] = state
            result.append(entry)
        return result

    def _on_topology(self, snapshot: dict[str, Any]) -> None:
        self._topology_cache = snapshot
        self._topology_cache_ts = time.monotonic()
        logger.info("bridge ws topology updated: %d nodes", len(snapshot.get("nodes", [])))
        if self._db:
            try:
                topology_list = self.get_topology_list()
                bridge_host = snapshot.get("bridge", {}).get("name", "")
                self._db.upsert_devices_from_topology(topology_list, bridge_host)
            except Exception as exc:
                logger.warning("bridge ws topology db update failed: %s", exc)

    def _on_event(self, event_type: str, payload: dict[str, Any]) -> None:
        logger.debug("bridge ws event: %s", event_type)

    def _on_connection_change(self, connected: bool) -> None:
        if connected:
            logger.info("bridge ws connected and authenticated")
        else:
            logger.warning("bridge ws disconnected")
