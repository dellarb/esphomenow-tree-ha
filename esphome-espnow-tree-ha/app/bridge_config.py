from __future__ import annotations

import logging
from typing import TYPE_CHECKING

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

    def _resolve_from_config(self) -> BridgeTarget | None:
        if self.settings.bridge_host:
            from .models import BridgeTarget
            return BridgeTarget(self.settings.bridge_host, self.settings.bridge_port, "addon_options")
        saved = self._db.get_bridge_config()
        if saved.get("bridge_host"):
            from .models import BridgeTarget
            return BridgeTarget(str(saved["bridge_host"]), int(saved.get("bridge_port") or 80), "stored")
        return None

    async def _discover(self) -> BridgeTarget | None:
        discovered = await self._ha.discover_bridge()
        if discovered is not None:
            self._db.set_bridge_config(discovered.host, discovered.port, True, validated=True)
            return discovered
        return None

    async def resolve(self, validate: bool = True) -> BridgeTarget | None:
        logger.info(f"BRIDGE resolve start (validate={validate})")
        target = self._resolve_from_config()
        if target is None:
            target = await self._discover()
        if target is None:
            raise RuntimeError("bridge is not configured and auto-discovery found no reachable topology URL")
        logger.info(f"BRIDGE resolve done host={target.host} port={target.port}")
        return target

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None
