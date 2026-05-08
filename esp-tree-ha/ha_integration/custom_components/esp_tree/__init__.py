from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path

import voluptuous as vol
from homeassistant import data_entry_flow
from homeassistant.components.repairs import RepairsFlow
from homeassistant.config_entries import ConfigEntry, SOURCE_IMPORT
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceEntry
from homeassistant.helpers.event import async_track_time_interval

from .activity_logger import ActivityLogger
from .const import CONF_TYPE, DOMAIN, PLATFORMS

_LOGGER = logging.getLogger(__name__)

ActivityLogger.get()


class RestartRequiredFlow(RepairsFlow):
    async def async_step_init(self, user_input: dict | None = None) -> data_entry_flow.FlowResult:
        return await self.async_step_confirm_restart()

    async def async_step_confirm_restart(self, user_input: dict | None = None) -> data_entry_flow.FlowResult:
        if user_input is not None:
            await self.hass.services.async_call(
                "homeassistant",
                "restart",
                blocking=True,
            )
            return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="confirm_restart",
            data_schema=vol.Schema({}),
            description_placeholders={"name": "ESP Tree"},
        )


async def async_create_fix_flow(
    hass: HomeAssistant,
    issue_id: str,
    data: dict | None = None,
) -> RepairsFlow | None:
    if issue_id.startswith("restart_required"):
        return RestartRequiredFlow()
    return None


async def _migrate_legacy_entries(hass: HomeAssistant) -> None:
    entries = hass.config_entries.async_entries(DOMAIN)
    for entry in entries:
        if CONF_TYPE not in entry.data or entry.data.get(CONF_TYPE) == "bridge":
            _LOGGER.info("Removing legacy ESP Tree entry %s", entry.entry_id)
            await hass.config_entries.async_remove(entry.entry_id)


def _ensure_data(hass: HomeAssistant) -> dict:
    from .bridge_runtime import EspTreeRuntime

    domain_data = hass.data.setdefault(DOMAIN, {})
    domain_data.setdefault("runtime", EspTreeRuntime(hass))
    return domain_data


async def _sync_shared_addon_config(hass: HomeAssistant) -> None:
    from .config_flow import has_connection_data, hub_data_from_config, read_shared_config

    shared_config = read_shared_config()
    data = hub_data_from_config(shared_config)
    if not has_connection_data(data):
        return

    hub_entries = [
        entry
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.data.get(CONF_TYPE) == "hub"
    ]
    if hub_entries:
        for entry in hub_entries:
            merged = hub_data_from_config(entry.data, data)
            if has_connection_data(merged) and merged != entry.data:
                _LOGGER.info("Updating ESP Tree hub entry from shared add-on config")
                hass.config_entries.async_update_entry(entry, data=merged)
                try:
                    await hass.config_entries.async_reload(entry.entry_id)
                except Exception as exc:
                    _LOGGER.warning("Could not reload ESP Tree hub entry after shared config update: %s", exc)
        return

    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("shared_config_import_running"):
        return
    domain_data["shared_config_import_running"] = True
    try:
        await hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data=shared_config,
        )
    except Exception as exc:
        _LOGGER.warning("Could not import ESP Tree shared add-on config: %s", exc)
    finally:
        domain_data["shared_config_import_running"] = False


async def _start_shared_config_import_watcher(hass: HomeAssistant) -> None:
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("shared_config_import_unsub"):
        return

    async def _tick(_now=None) -> None:
        await _sync_shared_addon_config(hass)

    await _sync_shared_addon_config(hass)
    domain_data["shared_config_import_unsub"] = async_track_time_interval(
        hass,
        _tick,
        timedelta(seconds=30),
    )


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    from .services import async_setup_services
    from .update_repair import async_start_update_repair_watcher
    from .websocket_api import async_register_websocket_commands
    from .config_flow import has_connection_data, hub_data_from_config, read_shared_config

    await _migrate_legacy_entries(hass)
    shared_config = read_shared_config()
    hub_entries = [
        entry
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.data.get(CONF_TYPE) == "hub"
    ]
    if shared_config:
        for entry in hub_entries:
            merged = hub_data_from_config(entry.data, shared_config)
            if has_connection_data(merged) and merged != entry.data:
                _LOGGER.info("Updating ESP Tree hub entry from shared add-on config")
                hass.config_entries.async_update_entry(entry, data=merged)

    async def _dismiss_restart_notification() -> None:
        try:
            await hass.services.async_call(
                "persistent_notification",
                "dismiss",
                {"notification_id": "esp_tree_restart_required"},
                blocking=False,
            )
        except Exception as exc:
            _LOGGER.debug("Could not dismiss ESP Tree restart notification: %s", exc)
        marker_path = Path(__file__).resolve().parent / ".restart_required.json"
        if marker_path.exists():
            try:
                marker_path.unlink()
            except OSError:
                pass

    hass.async_create_task(_dismiss_restart_notification())
    domain_data = _ensure_data(hass)
    async_setup_services(hass)
    async_register_websocket_commands(hass)
    await async_start_update_repair_watcher(hass)
    await _start_shared_config_import_watcher(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = _ensure_data(hass)
    runtime = domain_data["runtime"]

    if entry.data.get(CONF_TYPE) == "hub":
        await runtime.add_entry(entry)
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
        await hass.config_entries.async_remove(entry.entry_id)
        return False


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = True
    if entry.data.get(CONF_TYPE) == "remote":
        unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        await hass.data[DOMAIN]["runtime"].remove_entry(entry)
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


async def cleanup_integration(hass: HomeAssistant, *, remove_hub: bool = False) -> None:
    domain_data = hass.data.get(DOMAIN)
    if not domain_data:
        return

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
    if runtime.client:
        await runtime.client.stop()
        runtime.client = None
    runtime.bridge_snapshots.clear()
    runtime.remotes.clear()
    runtime.entities.clear()
    runtime._remote_entry_ids.clear()

    if remove_hub:
        for entry in entries:
            if entry.data.get(CONF_TYPE) == "hub":
                await hass.config_entries.async_remove(entry.entry_id)

    shared_db_path = Path("/share/esp_tree/esp_tree.db")
    if shared_db_path.exists():
        shared_db_path.unlink(missing_ok=True)
    shared_dir = shared_db_path.parent
    if shared_dir.exists() and not any(shared_dir.iterdir()):
        try:
            shared_dir.rmdir()
        except OSError:
            pass
