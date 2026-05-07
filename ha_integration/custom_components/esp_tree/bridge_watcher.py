from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_interval

from .bridge_db import BridgeDB, BridgeRow
from .const import CONF_BRIDGE_UUID, CONF_TYPE, DOMAIN

_LOGGER = logging.getLogger(__name__)

BRIDGE_DB_SOURCE = "bridge_db"
POLL_INTERVAL = timedelta(seconds=10)


class BridgeWatcher:
    def __init__(self, hass: HomeAssistant, db: BridgeDB) -> None:
        self.hass = hass
        self.db = db
        self._cached_bridges: dict[str, BridgeRow] = {}
        self._remove_timer: Callable[[], None] | None = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        if self._remove_timer is None:
            self._remove_timer = async_track_time_interval(self.hass, self._tick, POLL_INTERVAL)
        self.hass.async_create_task(self._tick())

    async def stop(self) -> None:
        if self._remove_timer is not None:
            self._remove_timer()
            self._remove_timer = None

    async def _tick(self, _now=None) -> None:
        async with self._lock:
            bridges = await self.db.get_bridges()
            current = {bridge.uuid: bridge for bridge in bridges}

            for bridge in bridges:
                entry = self._entry_for_bridge(bridge.uuid)
                previous = self._cached_bridges.get(bridge.uuid)
                if entry is None:
                    await self._add_bridge_entry(bridge)
                elif previous is not None and previous != bridge:
                    await self._reload_bridge_entry(entry, bridge)

            for entry in self._bridge_entries():
                bridge_uuid = entry.data.get(CONF_BRIDGE_UUID)
                if bridge_uuid and bridge_uuid not in current:
                    await self._remove_bridge_entry(entry)

            for entry in self._legacy_bridge_entries():
                await self._remove_bridge_entry(entry)

            self._cached_bridges = current

    def _bridge_entries(self) -> list[ConfigEntry]:
        return [
            entry
            for entry in self.hass.config_entries.async_entries(DOMAIN)
            if entry.data.get(CONF_TYPE) == "bridge" and entry.data.get(CONF_BRIDGE_UUID)
        ]

    def _legacy_bridge_entries(self) -> list[ConfigEntry]:
        return [
            entry
            for entry in self.hass.config_entries.async_entries(DOMAIN)
            if entry.data.get(CONF_TYPE) == "bridge" and not entry.data.get(CONF_BRIDGE_UUID)
        ]

    def _entry_for_bridge(self, bridge_uuid: str) -> ConfigEntry | None:
        return next((entry for entry in self._bridge_entries() if entry.data.get(CONF_BRIDGE_UUID) == bridge_uuid), None)

    async def _add_bridge_entry(self, bridge: BridgeRow) -> None:
        _LOGGER.info("Creating ESP Tree bridge entry for %s at %s:%s", bridge.title, bridge.host, bridge.port)
        self.hass.async_create_task(
            self.hass.config_entries.flow.async_init(
                DOMAIN,
                context={"source": BRIDGE_DB_SOURCE},
                data={
                    "uuid": bridge.uuid,
                    "title": bridge.title,
                },
            )
        )

    async def _remove_bridge_entry(self, entry: ConfigEntry) -> None:
        _LOGGER.info("Removing ESP Tree bridge entry %s because it no longer exists in the shared DB", entry.title)
        await self.hass.config_entries.async_remove(entry.entry_id)

    async def _reload_bridge_entry(self, entry: ConfigEntry, bridge: BridgeRow) -> None:
        _LOGGER.info("Reloading ESP Tree bridge entry %s after shared DB change", bridge.title)
        self.hass.config_entries.async_update_entry(entry, title=bridge.title)
        await self.hass.config_entries.async_reload(entry.entry_id)
