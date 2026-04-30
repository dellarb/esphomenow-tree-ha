from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

import httpx

from .models import BridgeTarget


class HomeAssistantClient:
    def __init__(self, supervisor_token: str) -> None:
        self.supervisor_token = supervisor_token
        self.base_url = "http://supervisor/core/api"

    async def states(self) -> list[dict]:
        if not self.supervisor_token:
            return []
        headers = {"Authorization": f"Bearer {self.supervisor_token}"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{self.base_url}/states", headers=headers)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, list) else []

    @staticmethod
    def _candidate_from_value(value: object) -> BridgeTarget | None:
        text = str(value or "").strip()
        if not text or text.lower() in {"unknown", "unavailable", "none"}:
            return None
        if text.startswith("http://") or text.startswith("https://"):
            parsed = urlparse(text)
            if parsed.hostname:
                return BridgeTarget(parsed.hostname, parsed.port or 80, "ha")
        try:
            ipaddress.ip_address(text)
            return BridgeTarget(text, 80, "ha")
        except ValueError:
            return None

    async def discover_bridge(self) -> BridgeTarget | None:
        for state in await self.states():
            entity_id = str(state.get("entity_id", ""))
            attrs = state.get("attributes") or {}
            haystack = " ".join(
                [
                    entity_id,
                    str(attrs.get("friendly_name", "")),
                    str(attrs.get("device_class", "")),
                    str(attrs.get("icon", "")),
                ]
            ).lower()
            values = [state.get("state"), attrs.get("topology_url"), attrs.get("url")]
            if "topology_url" not in haystack and "topology" not in haystack:
                continue
            for value in values:
                candidate = self._candidate_from_value(value)
                if candidate is not None:
                    return candidate
        return None
