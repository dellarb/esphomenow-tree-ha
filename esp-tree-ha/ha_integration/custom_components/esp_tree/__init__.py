from __future__ import annotations

import logging
import shutil
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceEntry

from .const import BRIDGE_PLATFORMS, CONF_TYPE, DOMAIN, PLATFORMS, SHARED_DB_PATH

_LOGGER = logging.getLogger(__name__)


async def _migrate_legacy_entries(hass: HomeAssistant) -> None:
    entries = hass.config_entries.async_entries(DOMAIN)
    for entry in entries:
        if CONF_TYPE not in entry.data:
            _LOGGER.info("Removing legacy ESP Tree entry %s (no type field)", entry.entry_id)
            await hass.config_entries.async_remove(entry.entry_id)


def _ensure_data(hass: HomeAssistant) -> dict:
    from .bridge_db import BridgeDB
    from .bridge_runtime import EspnowTreeRuntime
    from .bridge_watcher import BridgeWatcher

    domain_data = hass.data.setdefault(DOMAIN, {})
    bridge_db = domain_data.setdefault("bridge_db", BridgeDB())
    domain_data.setdefault("runtime", EspnowTreeRuntime(hass, bridge_db))
    domain_data.setdefault("bridge_watcher", BridgeWatcher(hass, bridge_db))
    return domain_data


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    from .services import async_setup_services
    from .update_repair import async_start_update_repair_watcher
    from .websocket_api import async_register_websocket_commands

    await _migrate_legacy_entries(hass)
    _ensure_data(hass)
    async_setup_services(hass)
    async_register_websocket_commands(hass)
    await async_start_update_repair_watcher(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = _ensure_data(hass)
    runtime = domain_data["runtime"]

    if entry.data.get(CONF_TYPE) == "hub":
        await domain_data["bridge_watcher"].start()
        return True

    if entry.data.get(CONF_TYPE) == "remote":
        remote_mac = entry.data.get("remote_mac")
        if remote_mac:
            runtime.register_remote_entry(remote_mac, entry.entry_id)
            await runtime.ensure_remote_device(remote_mac, entry)
        area_id = entry.data.get("area_id")
        if area_id and remote_mac:
            registry = dr.async_get(hass)
            device = registry.async_get_device(identifiers={(DOMAIN, remote_mac)})
            if device:
                registry.async_update_device(device.id, area_id=area_id)
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        return True

    if entry.data.get(CONF_TYPE) == "bridge":
        await domain_data["bridge_watcher"].start()
        await runtime.add_entry(entry)
        await hass.config_entries.async_forward_entry_setups(entry, BRIDGE_PLATFORMS)
        return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = True
    if entry.data.get(CONF_TYPE) == "remote":
        unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        await hass.data[DOMAIN]["runtime"].remove_entry(entry)
        if entry.data.get(CONF_TYPE) == "hub":
            await hass.data[DOMAIN]["bridge_watcher"].stop()
    return unload_ok


async def async_remove_config_entry_device(
    hass: HomeAssistant, config_entry: ConfigEntry, device_entry: DeviceEntry
) -> bool:
    if config_entry.data.get(CONF_TYPE) != "remote":
        return False
    identifiers = {identifier for domain, identifier in device_entry.identifiers if domain == DOMAIN}
    remote_mac = next(iter(identifiers), None)
    if remote_mac:
        await hass.data[DOMAIN]["runtime"].forget_remote(remote_mac)
    return await hass.config_entries.async_remove(config_entry.entry_id)


async def cleanup_integration(hass: HomeAssistant) -> None:
    domain_data = hass.data.get(DOMAIN)
    if not domain_data:
        return

    bridge_watcher = domain_data.get("bridge_watcher")
    if bridge_watcher:
        await bridge_watcher.stop()

    runtime = domain_data.get("runtime")
    if not runtime:
        return

    entries = hass.config_entries.async_entries(DOMAIN)
    for entry in entries:
        if entry.data.get(CONF_TYPE) == "remote":
            await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    for entry in entries:
        if entry.data.get(CONF_TYPE) == "bridge":
            await runtime.remove_entry(entry)
            await hass.config_entries.async_remove(entry.entry_id)

    for entry in entries:
        if entry.data.get(CONF_TYPE) == "remote":
            await hass.config_entries.async_remove(entry.entry_id)

    registry = dr.async_get(hass)
    remaining_entry_ids = {entry.entry_id for entry in hass.config_entries.async_entries(DOMAIN)}
    for device in list(registry.devices.values()):
        if not device.config_entries.intersection(remaining_entry_ids):
            for ident in device.identifiers:
                if ident[0] == DOMAIN:
                    registry.async_remove_device(device.id)
                    break

    await runtime.store.clear()
    runtime.clients.clear()
    runtime.entry_clients.clear()
    runtime.bridge_snapshots.clear()
    runtime.remotes.clear()
    runtime.entities.clear()
    runtime._remote_entry_ids.clear()

    for entry in entries:
        if entry.data.get(CONF_TYPE) == "hub":
            await hass.config_entries.async_remove(entry.entry_id)

    integration_path = Path(__file__).resolve().parent
    for item in integration_path.iterdir():
        if item.name == "__pycache__":
            continue
        if item.is_file():
            item.unlink(missing_ok=True)
        elif item.is_dir() and item.name != "__pycache__":
            shutil.rmtree(item, ignore_errors=True)

    shared_db_path = Path(SHARED_DB_PATH)
    if shared_db_path.exists():
        shared_db_path.unlink(missing_ok=True)
    shared_dir = shared_db_path.parent
    if shared_dir.exists() and not any(shared_dir.iterdir()):
        try:
            shared_dir.rmdir()
        except OSError:
            pass
