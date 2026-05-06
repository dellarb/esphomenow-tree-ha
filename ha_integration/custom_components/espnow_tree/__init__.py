from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from .const import DOMAIN, PLATFORMS


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    from .bridge_runtime import EspnowTreeRuntime
    from .services import async_setup_services

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault("runtime", EspnowTreeRuntime(hass))
    async_setup_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    from .bridge_runtime import EspnowTreeRuntime

    hass.data.setdefault(DOMAIN, {})
    runtime = hass.data[DOMAIN].setdefault("runtime", EspnowTreeRuntime(hass))

    if entry.data.get("type") == "remote":
        remote_mac = entry.data.get("remote_mac")
        if remote_mac:
            runtime.register_remote_entry(remote_mac, entry.entry_id)
        area_id = entry.data.get("area_id")
        if area_id:
            registry = dr.async_get(hass)
            device = registry.async_get_device(identifiers={(DOMAIN, remote_mac)})
            if device:
                registry.async_update_device(device.id, area_id=area_id)
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        return True

    await runtime.add_entry(entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        await hass.data[DOMAIN]["runtime"].remove_entry(entry)
    return unload_ok
