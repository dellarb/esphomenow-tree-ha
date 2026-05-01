from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

import httpx

from .config import Settings
from .db import Database
from .ha_client import HomeAssistantClient
from .models import BridgeTarget, normalize_mac


class BridgeClient:
    CHUNK_POST_PART_SIZE = 512

    def __init__(self, target: BridgeTarget) -> None:
        self.target = target
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                follow_redirects=True,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def get_topology(self) -> list[dict[str, Any]]:
        client = await self._get_client()
        response = await client.get(f"{self.target.base_url}/topology.json", timeout=10.0)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError("bridge topology response is not a list")
        return data

    async def get_ota_status(self) -> dict[str, Any]:
        client = await self._get_client()
        response = await client.get(f"{self.target.base_url}/api/ota/status", timeout=10.0)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("bridge OTA status response is not an object")
        return data

    async def start_ota(self, target_mac: str, size: int, md5: str) -> dict[str, Any]:
        payload = {"target": normalize_mac(target_mac), "size": str(size), "md5": md5.lower()}
        client = await self._get_client()
        response = await client.post(f"{self.target.base_url}/api/ota/start", data=payload, timeout=15.0)
        if response.status_code >= 400:
            raise RuntimeError(_response_error(response))
        data = response.json()
        return data if isinstance(data, dict) else {"status": "started"}

    async def send_chunk(self, seq: int, data: bytes) -> dict[str, Any]:
        client = await self._get_client()
        parsed: dict[str, Any] = {"status": "ok"}
        for offset in range(0, len(data), self.CHUNK_POST_PART_SIZE):
            part = data[offset : offset + self.CHUNK_POST_PART_SIZE]
            payload = {
                "seq": str(seq),
                "offset": str(offset),
                "total": str(len(data)),
                "data": base64.b64encode(part).decode("ascii"),
            }
            response = await client.post(f"{self.target.base_url}/api/ota/chunk", data=payload, timeout=20.0)
            if response.status_code >= 400:
                raise RuntimeError(_response_error(response))
            part_result = response.json()
            parsed = part_result if isinstance(part_result, dict) else {"status": "ok"}
            if parsed.get("status") in {"chunk_not_needed", "chunk_accepted"}:
                return parsed
        return parsed

    async def abort_ota(self) -> dict[str, Any]:
        client = await self._get_client()
        response = await client.post(f"{self.target.base_url}/api/ota/abort", timeout=10.0)
        if response.status_code >= 400:
            raise RuntimeError(_response_error(response))
        parsed = response.json()
        return parsed if isinstance(parsed, dict) else {"status": "aborting"}


class BridgeManager:
    def __init__(self, settings: Settings, db: Database, ha: HomeAssistantClient) -> None:
        self.settings = settings
        self.db = db
        self.ha = ha
        self._cached_target: BridgeTarget | None = None
        self._client: BridgeClient | None = None

    async def resolve(self, validate: bool = True) -> BridgeTarget:
        if self._cached_target is not None:
            if validate:
                await self._validate(self._cached_target)
            return self._cached_target

        if self.settings.bridge_host:
            target = BridgeTarget(self.settings.bridge_host, self.settings.bridge_port, "addon_options")
            if validate:
                await self._validate(target)
            self._cached_target = target
            return target

        saved = self.db.get_bridge_config()
        if saved.get("bridge_host"):
            target = BridgeTarget(str(saved["bridge_host"]), int(saved.get("bridge_port") or 80), "stored")
            if validate:
                await self._validate(target)
            self._cached_target = target
            return target

        discovered = await self.ha.discover_bridge()
        if discovered is not None:
            if validate:
                await self._validate(discovered)
            self.db.set_bridge_config(discovered.host, discovered.port, True, validated=True)
            self._cached_target = discovered
            return discovered

        raise RuntimeError("bridge is not configured and auto-discovery found no reachable topology URL")

    async def _validate(self, target: BridgeTarget) -> None:
        topology = await BridgeClient(target).get_topology()
        if not topology:
            raise RuntimeError("bridge topology is empty")
        self.db.mark_bridge_validated()

    async def topology(self) -> tuple[BridgeTarget, list[dict[str, Any]]]:
        if self._client is None:
            target = await self.resolve(validate=False)
            self._client = BridgeClient(target)
        else:
            target = await self.resolve(validate=False)
        topology = await self._client.get_topology()
        self.db.upsert_devices_from_topology(topology, target.host)
        self.db.mark_bridge_validated()
        return target, topology

    async def client(self) -> BridgeClient:
        if self._client is None:
            target = await self.resolve(validate=False)
            self._client = BridgeClient(target)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.close()
            self._client = None


def read_file_chunk(path: Path, seq: int, chunk_size: int) -> bytes:
    if chunk_size <= 0:
        raise ValueError("bridge reported an invalid chunk size")
    with path.open("rb") as handle:
        handle.seek(seq * chunk_size)
        return handle.read(chunk_size)


def _response_error(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            return str(data.get("error") or data.get("message") or response.text)
    except ValueError:
        pass
    return response.text or f"HTTP {response.status_code}"
