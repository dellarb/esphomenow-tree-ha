from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from .db import Database

if TYPE_CHECKING:
    from .config import Settings
    from .models import BridgeTarget

logger = logging.getLogger(__name__)


class BridgeManager:
    def __init__(self, settings: Settings, db: Database, ha: Any) -> None:
        self.settings = settings
        self._db = db
        self._ha = ha
        self._client = None

    def _resolve_from_db(self) -> BridgeTarget | None:
        default_bridge = self._db.get_default_bridge()
        if default_bridge and default_bridge.get("host"):
            from .models import BridgeTarget
            return BridgeTarget(
                host=str(default_bridge["host"]),
                port=int(default_bridge.get("port") or 80),
                source="stored",
                name=str(default_bridge.get("name") or ""),
                api_key=str(default_bridge.get("api_key") or "")
            )
        return None

    async def _discover_ha(self) -> BridgeTarget | None:
        discovered = await self._ha.discover_bridge()
        if discovered is not None:
            self._db.add_bridge(
                host=discovered.host,
                port=discovered.port,
                name=discovered.name,
                discovered_via="ha_states",
                api_key=""
            )
            return BridgeTarget(
                host=discovered.host,
                port=discovered.port,
                source="ha_states",
                name=discovered.name,
                api_key=""
            )
        return None

    async def resolve(self, validate: bool = True) -> BridgeTarget | None:
        logger.info("BRIDGE resolve start (validate=%s)", validate)
        target = self._resolve_from_db()
        if target is None:
            target = await self._discover_ha()
        if target is None:
            raise RuntimeError("bridge is not configured and auto-discovery found no reachable bridge")
        logger.info("BRIDGE resolve done host=%s port=%s", target.host, target.port)
        return target

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None
