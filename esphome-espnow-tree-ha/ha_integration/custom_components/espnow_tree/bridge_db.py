from __future__ import annotations

import logging
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import aiosqlite

from .const import CONF_BRIDGE_UUID, CONF_TYPE, SHARED_DB_PATH

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class BridgeRow:
    uuid: str
    name: str
    host: str
    port: int
    discovered_via: str
    api_key: str
    network_id: str
    is_active: bool
    last_connected_at: int | None
    created_at: int | None

    @property
    def title(self) -> str:
        return self.name or self.host or self.uuid

    def config_entry_data(self) -> dict[str, str]:
        return {
            CONF_TYPE: "bridge",
            CONF_BRIDGE_UUID: self.uuid,
        }


class BridgeDB:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path or os.environ.get("ESPNOW_TREE_DB", SHARED_DB_PATH))

    def _uri(self) -> str:
        return f"file:{self.path}?mode=ro"

    async def get_bridges(self) -> list[BridgeRow]:
        if not self.path.exists():
            _LOGGER.info("ESPNow Tree shared DB is not available yet at %s", self.path)
            return []
        try:
            async with aiosqlite.connect(self._uri(), uri=True, timeout=10) as conn:
                conn.row_factory = aiosqlite.Row
                rows = await conn.execute_fetchall(
                    """
                    SELECT uuid, name, host, port, discovered_via, api_key, network_id,
                           is_active, last_connected_at, created_at
                    FROM bridges
                    ORDER BY is_active DESC, created_at DESC
                    """
                )
        except sqlite3.OperationalError as exc:
            _LOGGER.info("ESPNow Tree bridge DB read deferred: %s", exc)
            return []
        return [self._row_to_bridge(row) for row in rows]

    async def get_bridge(self, bridge_uuid: str) -> BridgeRow | None:
        if not self.path.exists():
            return None
        try:
            async with aiosqlite.connect(self._uri(), uri=True, timeout=10) as conn:
                conn.row_factory = aiosqlite.Row
                rows = await conn.execute_fetchall(
                    """
                    SELECT uuid, name, host, port, discovered_via, api_key, network_id,
                           is_active, last_connected_at, created_at
                    FROM bridges
                    WHERE uuid = ?
                    """,
                    (bridge_uuid,),
                )
        except sqlite3.OperationalError as exc:
            _LOGGER.info("ESPNow Tree bridge DB lookup deferred: %s", exc)
            return None
        if not rows:
            return None
        return self._row_to_bridge(rows[0])

    @staticmethod
    def _row_to_bridge(row: aiosqlite.Row) -> BridgeRow:
        return BridgeRow(
            uuid=str(row["uuid"]),
            name=str(row["name"] or ""),
            host=str(row["host"]),
            port=int(row["port"] or 80),
            discovered_via=str(row["discovered_via"] or "manual"),
            api_key=str(row["api_key"] or ""),
            network_id=str(row["network_id"] or ""),
            is_active=bool(row["is_active"]),
            last_connected_at=row["last_connected_at"],
            created_at=row["created_at"],
        )
