from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import websockets

from .bridge_ws_client import TopologyBroadcast
from .config import Settings

logger = logging.getLogger(__name__)

HA_WS_URL = "ws://supervisor/core/websocket"
POLL_INTERVAL_S = 10


class IntegrationWsApi:
    def __init__(self, token: str, url: str = HA_WS_URL) -> None:
        self.token = token
        self.url = url

    async def call(self, command: dict[str, Any], timeout: float = 10.0) -> dict[str, Any]:
        if not self.token:
            raise RuntimeError("SUPERVISOR_TOKEN is not available for Home Assistant WebSocket API access")
        async with websockets.connect(self.url, open_timeout=timeout, close_timeout=1) as ws:
            await asyncio.wait_for(ws.recv(), timeout=timeout)
            await ws.send(json.dumps({"type": "auth", "access_token": self.token}))
            auth = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
            if auth.get("type") != "auth_ok":
                raise RuntimeError(f"Home Assistant WebSocket auth failed: {auth.get('message') or auth.get('type')}")
            request = {"id": 1, **command}
            await ws.send(json.dumps(request))
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                msg = json.loads(raw)
                if msg.get("id") != 1:
                    continue
                if not msg.get("success", False):
                    error = msg.get("error") or {}
                    raise RuntimeError(error.get("message") or error.get("code") or "Home Assistant WebSocket command failed")
                result = msg.get("result") or {}
                if not isinstance(result, dict):
                    raise RuntimeError("Home Assistant WebSocket result was not an object")
                return result


class IntegrationWsManager:
    def __init__(self, settings: Settings, db: Any | None = None) -> None:
        self.settings = settings
        self._db = db
        self._api = IntegrationWsApi(settings.supervisor_token)
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._connected = False
        self._topology_cache: dict[str, Any] | None = None
        self._topology_cache_ts = 0.0
        self._broadcast = TopologyBroadcast()

    @property
    def broadcast(self) -> TopologyBroadcast:
        return self._broadcast

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def client(self) -> None:
        return None

    @property
    def ota_client(self) -> None:
        return None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run(), name="esp-tree-integration-ws")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.refresh_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.info("integration ws topology poll deferred: %s", exc)
                self._set_connected(False)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=POLL_INTERVAL_S)
            except asyncio.TimeoutError:
                pass

    def _set_connected(self, connected: bool) -> None:
        if self._connected == connected:
            return
        self._connected = connected
        self._broadcast.emit("bridge.connection", {"connected": connected, "source": "integration"})

    async def refresh_once(self) -> dict[str, Any]:
        result = await self._api.call({"type": "esp_tree/topology"}, timeout=15.0)
        nodes = result.get("nodes") or []
        if not isinstance(nodes, list):
            raise RuntimeError("integration topology result did not include a node list")
        connected = bool(result.get("connected", False))
        self._set_connected(connected)
        self._topology_cache = {"nodes": nodes}
        self._topology_cache_ts = time.monotonic()
        if self._db:
            try:
                bridge = next((node for node in nodes if node.get("is_bridge")), None)
                bridge_host = str((bridge or {}).get("name") or (bridge or {}).get("label") or "integration")
                self._db.upsert_devices_from_topology(nodes, bridge_host)
            except Exception as exc:
                logger.warning("integration topology db update failed: %s", exc)
        self._broadcast.emit("topology.snapshot", self._topology_cache)
        return self._topology_cache

    async def topology(self, max_age_s: float = 4.0) -> list[dict[str, Any]]:
        if self._topology_cache and time.monotonic() - self._topology_cache_ts < max_age_s:
            return self.get_topology_list()
        await self.refresh_once()
        return self.get_topology_list()

    def get_topology_list(self) -> list[dict[str, Any]]:
        if not self._topology_cache:
            return []
        nodes = self._topology_cache.get("nodes") or []
        return nodes if isinstance(nodes, list) else []

    async def send_config(self, mac: str, command: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        result = await self._api.call(
            {
                "type": "esp_tree/config_command",
                "mac": mac,
                "command": command,
                "params": params or {},
            },
            timeout=10.0,
        )
        self.schedule_topology_refresh()
        return result

    def schedule_topology_refresh(self) -> None:
        async def _refresh() -> None:
            await asyncio.sleep(0.5)
            try:
                await self.refresh_once()
            except Exception as exc:
                logger.info("integration scheduled topology refresh deferred: %s", exc)

        asyncio.create_task(_refresh(), name="integration-topology-refresh")
