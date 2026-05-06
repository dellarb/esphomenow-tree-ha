from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

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
    await runtime.add_entry(entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        await hass.data[DOMAIN]["runtime"].remove_entry(entry)
    return unload_ok
