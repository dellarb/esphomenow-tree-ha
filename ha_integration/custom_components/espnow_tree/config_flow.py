from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.helpers import selector

from .const import CONF_API_KEY, CONF_HOST, CONF_NAME, CONF_PORT, DEFAULT_PORT, DOMAIN


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._remote_info: dict | None = None

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            title = user_input.get(CONF_NAME) or user_input[CONF_HOST]
            await self.async_set_unique_id(f"{user_input[CONF_HOST]}:{user_input[CONF_PORT]}")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=title, data={**user_input, "type": "bridge"})

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST): str,
                vol.Optional(CONF_PORT, default=DEFAULT_PORT): int,
                vol.Required(CONF_API_KEY): str,
                vol.Optional(CONF_NAME, default="ESPNow Tree Bridge"): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

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
                    vol.Optional("area_id"): selector({"area": {}}),
                }
            ),
            description_placeholders={"name": self._remote_info["name"]},
        )
