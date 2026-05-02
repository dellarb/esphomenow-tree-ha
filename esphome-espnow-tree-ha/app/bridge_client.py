from __future__ import annotations

import base64
import json
import logging
from urllib.parse import urlencode
from pathlib import Path
from typing import Any

import httpx

from .config import Settings
from .db import Database
from .ha_client import HomeAssistantClient
from .models import BridgeTarget, normalize_mac

logger = logging.getLogger(__name__)


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
        url = f"{self.target.base_url}/topology.json"
        logger.info(f"BRIDGE GET {url}")
        response = await client.get(url, timeout=10.0)
        logger.info(f"BRIDGE GET {url} -> {response.status_code}")
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError("bridge topology response is not a list")
        return data

    async def get_ota_status(self) -> dict[str, Any]:
        client = await self._get_client()
        url = f"{self.target.base_url}/api/ota/status"
        logger.info(f"BRIDGE GET {url}")
        response = await client.get(url, timeout=10.0)
        logger.info(f"BRIDGE GET {url} -> {response.status_code}")
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("bridge OTA status response is not an object")
        return data

    async def start_ota(self, target_mac: str, size: int, md5: str) -> dict[str, Any]:
        payload = {"target": normalize_mac(target_mac), "size": str(size), "md5": md5.lower()}
        client = await self._get_client()
        url = f"{self.target.base_url}/api/ota/start"
        logger.info(f"BRIDGE POST {url} payload={payload}")
        response = await client.post(
            url,
            content=urlencode(payload),
            headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
            timeout=15.0,
        )
        logger.info(f"BRIDGE POST {url} -> {response.status_code}")
        if response.status_code >= 400:
            raise RuntimeError(_response_error(response))
        data = response.json()
        return data if isinstance(data, dict) else {"status": "started"}

    async def send_chunk(self, seq: int, data: bytes) -> dict[str, Any]:
        client = await self._get_client()
        parsed: dict[str, Any] = {"status": "ok"}
        for offset in range(0, len(data), self.CHUNK_POST_PART_SIZE):
            part = data[offset : offset + self.CHUNK_POST_PART_SIZE]
            encoded = base64.b64encode(part).decode("ascii").replace("+", "-").replace("/", "_").rstrip("=")
            url = f"{self.target.base_url}/api/ota/chunk?seq={seq}"
            logger.info(f"BRIDGE POST {url} seq={seq} offset={offset} len={len(data)}")
            response = await client.post(
                url,
                content=urlencode(
                    {
                        "offset": str(offset),
                        "total": str(len(data)),
                        "data": encoded,
                    }
                ),
                headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
                timeout=20.0,
            )
            logger.info(f"BRIDGE POST {url} -> {response.status_code}")
            if response.status_code >= 400:
                raise RuntimeError(_response_error(response))
            part_result = response.json()
            parsed = part_result if isinstance(part_result, dict) else {"status": "ok"}
            if parsed.get("status") in {"chunk_not_needed", "chunk_accepted"}:
                return parsed
        return parsed

    async def abort_ota(self) -> dict[str, Any]:
        client = await self._get_client()
        url = f"{self.target.base_url}/api/ota/abort"
        logger.info(f"BRIDGE POST {url}")
        response = await client.post(url, timeout=10.0)
        logger.info(f"BRIDGE POST {url} -> {response.status_code}")
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
        logger.info(f"BRIDGE resolve start (validate={validate})")
        target = self._resolve_from_config()
        if target is None:
            target = await self._discover()
        if validate:
            await self._validate(target)
        if (self._cached_target is not None and
                (self._cached_target.host != target.host or self._cached_target.port != target.port)):
            if self._client is not None:
                await self._client.close()
                self._client = None
        self._cached_target = target
        logger.info(f"BRIDGE resolve done host={target.host} port={target.port}")
        return target

    def _resolve_from_config(self) -> BridgeTarget | None:
        if self.settings.bridge_host:
            return BridgeTarget(self.settings.bridge_host, self.settings.bridge_port, "addon_options")
        saved = self.db.get_bridge_config()
        if saved.get("bridge_host"):
            return BridgeTarget(str(saved["bridge_host"]), int(saved.get("bridge_port") or 80), "stored")
        return None

    async def _discover(self) -> BridgeTarget:
        discovered = await self.ha.discover_bridge()
        if discovered is not None:
            self.db.set_bridge_config(discovered.host, discovered.port, True, validated=True)
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
    status = f"HTTP {response.status_code}"
    try:
        data = response.json()
        if isinstance(data, dict):
            detail = data.get("error") or data.get("message") or data.get("detail")
            if detail:
                return f"{status}: {detail}"
    except ValueError:
        pass
    text = response.text.strip()
    if text:
        snippet = text
        if text.startswith("<"):
            snippet = f"{text[:200]}{'...' if len(text) > 200 else ''}"
        else:
            try:
                snippet = json.dumps(json.loads(text))
            except ValueError:
                snippet = text
        return f"{status}: {snippet}"
    return status
