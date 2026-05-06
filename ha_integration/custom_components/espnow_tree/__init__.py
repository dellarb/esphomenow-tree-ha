from __future__ import annotations

import json
import os

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.issue_registry import IssueSeverity, async_create_issue

from .const import DOMAIN, PLATFORMS

VERSION_STORAGE_KEY = f"{DOMAIN}.version"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    from .bridge_runtime import EspnowTreeRuntime
    from .services import async_setup_services

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN].setdefault("runtime", EspnowTreeRuntime(hass))
    async_setup_services(hass)

    await _check_and_create_restart_issue(hass)

    return True


async def _check_and_create_restart_issue(hass: HomeAssistant) -> None:
    manifest_path = os.path.join(os.path.dirname(__file__), "manifest.json")
    with open(manifest_path) as f:
        manifest = json.load(f)
    current_version = manifest.get("version", "0")

    store = hass.helpers.storage.Store(1, VERSION_STORAGE_KEY)
    stored_data = await store.async_load() or {}
    stored_version = stored_data.get("version")

    if stored_version != current_version:
        async_create_issue(
            hass=hass,
            domain=DOMAIN,
            issue_id="restart_required",
            is_fixable=True,
            severity=IssueSeverity.WARNING,
            translation_key="restart_required",
            translation_placeholders={"name": "ESPNow Tree"},
            issue_domain=DOMAIN,
        )

        stored_data["version"] = current_version
        await store.async_save(stored_data)


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