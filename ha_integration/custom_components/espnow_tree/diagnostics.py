from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict:
    runtime = get_runtime(hass)
    return {
        "entry": {
            "title": entry.title,
            "host": entry.data.get("host"),
            "port": entry.data.get("port"),
        },
        "bridges": list(runtime.clients),
        "remotes": {
            mac: {
                "name": remote.display_name,
                "bridge_mac": remote.bridge_mac,
                "parent_mac": remote.parent_mac,
                "session_id": remote.session_id,
                "last_tx_counter": remote.last_tx_counter,
                "online": remote.online,
                "schema_hash": remote.schema_hash,
                "entity_count": len(remote.entities),
            }
            for mac, remote in runtime.remotes.items()
        },
    }
