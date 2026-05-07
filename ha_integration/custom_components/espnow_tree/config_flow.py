from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.helpers import selector

from .const import CONF_BRIDGE_UUID, CONF_TYPE, DOMAIN


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._remote_info: dict | None = None

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        await self.async_set_unique_id("espnow_tree_shared_db")
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="ESP Tree Integration Hub", data={CONF_TYPE: "hub"})

    async def async_step_import(self, import_info: dict | None = None) -> ConfigFlowResult:
        return await self.async_step_user(import_info)

    async def async_step_bridge_db(self, bridge_info: dict) -> ConfigFlowResult:
        bridge_uuid = bridge_info.get(CONF_BRIDGE_UUID) or bridge_info.get("uuid") or ""
        if not bridge_uuid:
            return self.async_abort(reason="missing_bridge_uuid")
        await self.async_set_unique_id(bridge_uuid)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(
            title=bridge_info.get("title") or "ESPNow Tree Bridge",
            data={
                CONF_TYPE: "bridge",
                CONF_BRIDGE_UUID: bridge_uuid,
            },
        )

    async def async_step_integration_discovery(self, discovery_info: dict) -> ConfigFlowResult:
        """Triggered by bridge_runtime when new remote detected."""
        self._remote_info = discovery_info
        remote_mac = discovery_info["remote_mac"]
        await self.async_set_unique_id(remote_mac)
        self._abort_if_unique_id_configured()
        self.context["title_placeholders"] = {"name": discovery_info["name"]}
        return await self.async_step_discovery_confirm()

    async def async_step_discovery_confirm(self, user_input=None) -> ConfigFlowResult:
        """Show form with area selector + Add button."""
        if user_input is not None:
            info = self._remote_info
            return self.async_create_entry(
                title=info["name"],
                data={
                    "type": "remote",
                    "remote_mac": info["remote_mac"],
                    "bridge_mac": info["bridge_mac"],
                    "area_id": user_input.get("area_id"),
                },
            )
        return self.async_show_form(
            step_id="discovery_confirm",
            data_schema=vol.Schema(
                {
                    vol.Optional("area_id"): selector.AreaSelector(),
                }
            ),
            description_placeholders={"name": self._remote_info["name"]},
        )
