#!/usr/bin/env python3
"""Test script for ESPNow Tree Bridge v2 Protobuf API.

Connects to the bridge, authenticates, requests a full snapshot,
and displays information about the bridge, remotes, and entities.

Usage:
    python protobuf_api.py --host 192.168.1.50 --port 80 --api-key your_key
    python protobuf_api.py --host 192.168.1.50 --port 80 --api-key your_key --watch

Environment variables:
    BRIDGE_HOST, BRIDGE_PORT, BRIDGE_API_KEY
"""

import argparse
import asyncio
import hashlib
import hmac
import os
import secrets
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

import aiohttp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ha_integration", "custom_components", "esp_tree"))

from protobuf.generated import esp_tree_runtime_pb2 as pb


PROTOCOL = "esp-tree-pb"
API_VERSION = 2
CLIENT_KIND = "ha_integration"
CLIENT_NAME = "protobuf_api_test"


@dataclass
class EntityInfo:
    object_id: str
    platform: str
    friendly_name: str
    native_type: str
    disabled_by_default: bool
    diagnostic: bool
    writable: bool
    has_command: bool


@dataclass
class RemoteInfo:
    mac: str
    esphome_name: str
    friendly_name: str
    model: str
    chip_name: str
    online: bool
    hops_to_bridge: int
    rssi: int
    offline_s: int
    entity_count: int
    entities: list[EntityInfo] = field(default_factory=list)


@dataclass
class BridgeInfo:
    mac: str
    name: str
    network_id: str
    uptime_s: int
    wifi_rssi: int
    remote_count: int
    online: bool


@dataclass
class SnapshotReport:
    bridge: Optional[BridgeInfo]
    remotes: list[RemoteInfo]
    total_entities: int
    snapshot_unix_ms: int


def format_value(state: pb.EntityState) -> str:
    which = state.WhichOneof("value")
    if which == "bool_value":
        return str(state.bool_value)
    elif which == "int_value":
        return str(state.int_value)
    elif which == "float_value":
        return f"{state.float_value:.4f}"
    elif which == "string_value":
        return state.string_value[:50]
    elif which == "bytes_value":
        return f"<bytes {len(state.bytes_value)}>"
    return "<none>"


class BridgeConnection:
    def __init__(self, host: str, port: int, api_key: str):
        self.host = host
        self.port = port
        self.api_key = api_key
        self.url = f"ws://{host}:{port}/esp-tree/v2/pb"
        self._session: Optional[aiohttp.ClientSession] = None
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._pending: dict[str, asyncio.Future[pb.Envelope]] = {}
        self.connected = False

    async def __aenter__(self):
        self._session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *args):
        if self._ws and not self._ws.closed:
            await self._ws.close()
        if self._session:
            await self._session.close()

    async def connect(self) -> None:
        assert self._session is not None
        self._ws = await self._session.ws_connect(
            self.url,
            protocols=(PROTOCOL,),
            heartbeat=30,
            max_msg_size=65536,
        )
        await self._authenticate()
        self.connected = True

    async def _authenticate(self) -> None:
        ws = self._ws
        assert ws is not None

        msg = await ws.receive()
        if msg.type != aiohttp.WSMsgType.BINARY:
            raise RuntimeError(f"expected binary auth challenge, got {msg.type}")

        env = pb.Envelope()
        env.ParseFromString(msg.data)

        if env.WhichOneof("msg") != "auth_challenge":
            raise RuntimeError("missing auth challenge")

        challenge = env.auth_challenge
        if challenge.protocol != PROTOCOL or challenge.max_version < API_VERSION:
            raise RuntimeError(
                f"incompatible bridge: protocol={challenge.protocol}, "
                f"max_version={challenge.max_version}, our version={API_VERSION}"
            )

        client_nonce = secrets.token_bytes(16)
        digest_input = (
            f"{PROTOCOL}|v2|{CLIENT_KIND}|"
            f"{challenge.server_nonce.hex()}|{client_nonce.hex()}"
        ).encode()
        digest = hmac.new(self.api_key.encode(), digest_input, hashlib.sha256).digest()

        await self._send(
            pb.Envelope(
                request_id=uuid.uuid4().hex,
                api_version=API_VERSION,
                auth_response=pb.AuthResponse(
                    client_kind=CLIENT_KIND,
                    client_name=CLIENT_NAME,
                    client_nonce=client_nonce,
                    hmac_sha256=digest,
                ),
            )
        )

        msg = await ws.receive()
        if msg.type != aiohttp.WSMsgType.BINARY:
            raise RuntimeError("missing auth result")

        auth_env = pb.Envelope()
        auth_env.ParseFromString(msg.data)
        kind = auth_env.WhichOneof("msg")

        if kind == "auth_failed":
            raise RuntimeError(
                f"auth failed: {auth_env.auth_failed.code} — {auth_env.auth_failed.message}"
            )
        if kind != "auth_ok":
            raise RuntimeError(f"unexpected auth response: {kind}")

        return None

    async def _send(self, envelope: pb.Envelope) -> None:
        ws = self._ws
        assert ws is not None
        await ws.send_bytes(envelope.SerializeToString())

    async def request(self, envelope: pb.Envelope, timeout: float = 10) -> pb.Envelope:
        if not envelope.request_id:
            envelope.request_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[pb.Envelope] = loop.create_future()
        self._pending[envelope.request_id] = fut
        await self._send(envelope)
        return await asyncio.wait_for(fut, timeout)

    async def send_hello(self, request_snapshot: bool = True) -> None:
        await self._send(
            pb.Envelope(
                api_version=API_VERSION,
                client_hello=pb.ClientHello(
                    request_full_snapshot=request_snapshot,
                    integration_version="protobuf_api_test",
                ),
            )
        )

    async def receive_message(self, timeout: float = 10) -> pb.Envelope:
        ws = self._ws
        assert ws is not None
        msg = await ws.receive()
        if msg.type != aiohttp.WSMsgType.BINARY:
            raise RuntimeError(f"expected binary frame, got {msg.type}")
        env = pb.Envelope()
        env.ParseFromString(msg.data)

        if env.request_id and env.request_id in self._pending:
            fut = self._pending.pop(env.request_id)
            if not fut.done():
                fut.set_result(env)

        return env

    async def receive_snapshot(self, timeout: float = 15) -> SnapshotReport:
        deadline = time.time() + timeout
        remotes: list[RemoteInfo] = []
        bridge_info: Optional[BridgeInfo] = None
        total_entities = 0

        while time.time() < deadline:
            remaining = deadline - time.time()
            env = await self.receive_message(timeout=min(remaining, 5.0))

            msg_kind = env.WhichOneof("msg")

            if msg_kind == "full_snapshot":
                snap = env.full_snapshot

                b = snap.bridge
                bridge_info = BridgeInfo(
                    mac=b.bridge_mac,
                    name=b.friendly_name or b.bridge_name,
                    network_id=b.network_id,
                    uptime_s=snap.bridge_runtime.uptime_s if snap.bridge_runtime else 0,
                    wifi_rssi=snap.bridge_runtime.wifi_rssi if snap.bridge_runtime else 0,
                    remote_count=snap.bridge_runtime.remote_count if snap.bridge_runtime else 0,
                    online=snap.bridge_runtime.online if snap.bridge_runtime else False,
                )

                for remote in snap.remotes:
                    identity = remote.identity
                    runtime = remote.runtime
                    desc_set = remote.descriptor_set

                    entities = []
                    for ed in desc_set.entities:
                        entities.append(EntityInfo(
                            object_id=ed.object_id,
                            platform=ed.platform,
                            friendly_name=ed.friendly_name,
                            native_type=ed.native_type,
                            disabled_by_default=ed.disabled_by_default,
                            diagnostic=ed.diagnostic,
                            writable=ed.writable,
                            has_command=ed.HasField("command"),
                        ))
                        total_entities += 1

                    remotes.append(RemoteInfo(
                        mac=identity.remote_mac,
                        esphome_name=identity.esphome_name,
                        friendly_name=identity.friendly_name,
                        model=identity.model,
                        chip_name=identity.chip_name,
                        online=runtime.online if runtime else False,
                        hops_to_bridge=runtime.hops_to_bridge if runtime else 0,
                        rssi=runtime.rssi if runtime else 0,
                        offline_s=runtime.offline_s if runtime else 0,
                        entity_count=identity.entity_count,
                        entities=entities,
                    ))

                return SnapshotReport(
                    bridge=bridge_info,
                    remotes=remotes,
                    total_entities=total_entities,
                    snapshot_unix_ms=snap.snapshot_unix_ms,
                )

            elif msg_kind == "event_batch":
                pass

            elif msg_kind == "bridge_heartbeat":
                bh = env.event_batch.events[0].bridge_heartbeat
                print(f"  [heartbeat] uptime={bh.uptime_s}s bridge_time={bh.bridge_unix_ms}")

        raise RuntimeError("timeout waiting for full_snapshot")


def print_snapshot(report: SnapshotReport) -> None:
    b = report.bridge
    if not b:
        print("No bridge info received")
        return

    print()
    print("=" * 60)
    print("ESP Tree Bridge — Connection Successful")
    print("=" * 60)
    print()
    print(f"  Bridge MAC:       {b.mac}")
    print(f"  Name:             {b.name}")
    print(f"  Network ID:       {b.network_id}")
    print(f"  Uptime:           {b.uptime_s}s ({_format_uptime(b.uptime_s)})")
    print(f"  WiFi RSSI:        {b.wifi_rssi} dBm")
    print(f"  Online:           {b.online}")
    print()

    online_count = sum(1 for r in report.remotes if r.online)
    offline_count = len(report.remotes) - online_count

    print("-" * 60)
    print(f"  Remotes:          {len(report.remotes)} total ({online_count} online, {offline_count} offline)")
    print(f"  Entities:         {report.total_entities} total")
    print("-" * 60)
    print()

    for i, remote in enumerate(report.remotes, 1):
        status = "ONLINE" if remote.online else f"OFFLINE ({remote.offline_s}s)"
        print(f"  [{i}] {remote.esphome_name} ({remote.mac})")
        print(f"      Friendly:     {remote.friendly_name}")
        print(f"      Model:        {remote.model} / {remote.chip_name}")
        print(f"      Status:       {status}")
        print(f"      Hops:         {remote.hops_to_bridge}")
        print(f"      RSSI:         {remote.rssi} dBm")
        print(f"      Entities:     {remote.entity_count} ({len(remote.entities)} descriptors)")
        if remote.entities:
            print(f"      Entity types:")
            by_platform: dict[str, int] = {}
            for e in remote.entities:
                by_platform[e.platform] = by_platform.get(e.platform, 0) + 1
            for platform, count in sorted(by_platform.items()):
                print(f"        - {platform}: {count}")
        print()


def _format_uptime(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    elif seconds < 86400:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h {m}m"
    else:
        d = seconds // 86400
        h = (seconds % 86400) // 3600
        return f"{d}d {h}h"


async def main() -> None:
    parser = argparse.ArgumentParser(description="Test ESPNow Tree Bridge v2 Protobuf API")
    parser.add_argument("--host", default=os.getenv("BRIDGE_HOST"), help="Bridge host")
    parser.add_argument("--port", type=int, default=os.getenv("BRIDGE_PORT"), help="Bridge port")
    parser.add_argument("--api-key", default=os.getenv("BRIDGE_API_KEY"), help="API key")
    parser.add_argument("--watch", action="store_true", help="Watch for events after snapshot")
    parser.add_argument("--timeout", type=float, default=15, help="Snapshot timeout in seconds")

    args = parser.parse_args()

    if not args.host:
        parser.print_help()
        print()
        print("Error: --host or BRIDGE_HOST required")
        sys.exit(1)

    port = args.port or 80
    if not args.api_key:
        print("Error: --api-key or BRIDGE_API_KEY required")
        sys.exit(1)

    print(f"Connecting to {args.host}:{port}...")

    try:
        async with BridgeConnection(args.host, port, args.api_key) as conn:
            await conn.connect()
            print("Authenticated successfully")

            await conn.send_hello(request_snapshot=True)
            report = await conn.receive_snapshot(timeout=args.timeout)

            print_snapshot(report)

            if args.watch:
                print()
                print("Watching for events (Ctrl+C to exit)...")
                print()
                try:
                    while True:
                        env = await conn.receive_message(timeout=30)
                        kind = env.WhichOneof("msg")
                        if kind == "event_batch":
                            for event in env.event_batch.events:
                                ev_kind = event.WhichOneof("kind")
                                if ev_kind == "remote_availability":
                                    ra = event.remote_availability
                                    status = "online" if ra.online else "offline"
                                    print(f"  [event] remote_availability: {ra.remote_mac} is {status} "
                                          f"(hops={ra.hops_to_bridge}, rssi={ra.rssi})")
                                elif ev_kind == "remote_state":
                                    rs = event.remote_state
                                    print(f"  [event] remote_state: {rs.remote_mac} ({len(rs.states)} state changes)")
                                    for st in rs.states:
                                        print(f"    - {st.object_id}: {format_value(st)}")
                                elif ev_kind == "bridge_heartbeat":
                                    bh = event.bridge_heartbeat
                                    print(f"  [event] bridge_heartbeat: uptime={bh.uptime_s}s")
                                elif ev_kind == "topology_changed":
                                    tc = event.topology_changed
                                    print(f"  [event] topology_changed: {tc.remote_mac} "
                                          f"(parent={tc.parent_mac}, hops={tc.hops_to_bridge})")
                                elif ev_kind == "remote_schema_changed":
                                    rsc = event.remote_schema_changed
                                    print(f"  [event] remote_schema_changed: {rsc.remote_mac}")
                                elif ev_kind == "remote_metadata_changed":
                                    rmc = event.remote_metadata_changed
                                    print(f"  [event] remote_metadata_changed: {rmc.identity.remote_mac}")
                                else:
                                    print(f"  [event] {ev_kind}")
                        elif kind == "ping":
                            await conn._send(pb.Envelope(
                                api_version=API_VERSION,
                                pong=pb.Pong(monotonic_ms=env.ping.monotonic_ms),
                            ))
                        elif kind == "error":
                            print(f"  [error] {env.error.code}: {env.error.message}")
                        else:
                            print(f"  [msg] {kind}")

                except asyncio.TimeoutError:
                    print("  (no events for 30s)")

    except aiohttp.ClientConnectorError as exc:
        print(f"Connection failed: {exc}")
        sys.exit(1)
    except RuntimeError as exc:
        print(f"Error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
