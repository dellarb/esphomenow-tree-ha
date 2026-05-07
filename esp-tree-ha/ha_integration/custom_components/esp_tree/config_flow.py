from __future__ import annotations

import logging
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.helpers import selector

from .const import CONF_ADDON_URL, CONF_INTEGRATION_TOKEN, CONF_TYPE, DOMAIN

_LOGGER = logging.getLogger(__name__)


class OptionsFlowHandler(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None) -> ConfigFlowResult:
        return self.async_show_menu(
            step_id="init",
            menu_options=["uninstall_confirm"],
            description_placeholders={"name": "ESP Tree"},
        )

    async def async_step_uninstall_confirm(self, user_input=None) -> ConfigFlowResult:
        if user_input is not None:
            _LOGGER.warning("Uninstall confirmed, running cleanup")
            from . import cleanup_integration
            await cleanup_integration(self.hass, remove_hub=True)
            return self.async_create_entry(title="Uninstalled", data={})
        return self.async_show_form(
            step_id="uninstall_confirm",
            data_schema=vol.Schema(
                {
                    vol.Required("confirm", default=True): bool,
                }
            ),
            description_placeholders={"name": "ESP Tree"},
            last_step=True,
        )


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._remote_info: dict | None = None

    @staticmethod
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> config_entries.OptionsFlow:
        return OptionsFlowHandler()

    def _hub_configured(self) -> bool:
        return any(
            entry.data.get(CONF_TYPE) == "hub"
            for entry in self.hass.config_entries.async_entries(DOMAIN)
        )

    def _hub_entry(self):
        return next(
            (
                entry
                for entry in self.hass.config_entries.async_entries(DOMAIN)
                if entry.data.get(CONF_TYPE) == "hub"
            ),
            None,
        )

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        if self._hub_configured():
            return self.async_abort(reason="already_configured")
        await self.async_set_unique_id("esp_tree_shared_db")
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="ESP Tree", data={CONF_TYPE: "hub"})

    async def async_step_import(self, import_info: dict | None = None) -> ConfigFlowResult:
        return await self.async_step_user(import_info)

    async def async_step_hassio(self, info: dict) -> ConfigFlowResult:
        config = info.get("config") if isinstance(info.get("config"), dict) else info
        data = {
            CONF_TYPE: "hub",
            CONF_ADDON_URL: config.get(CONF_ADDON_URL) or config.get("addon_url") or "",
            CONF_INTEGRATION_TOKEN: config.get(CONF_INTEGRATION_TOKEN) or config.get("integration_token") or "",
        }
        existing = self._hub_entry()
        if existing:
            self.hass.config_entries.async_update_entry(existing, data={**existing.data, **data})
            try:
                await self.hass.config_entries.async_reload(existing.entry_id)
            except Exception as exc:
                _LOGGER.warning("Could not reload ESP Tree hub entry after discovery update: %s", exc)
            return self.async_abort(reason="already_configured")
        await self.async_set_unique_id("esp_tree_shared_db")
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="ESP Tree", data=data)

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
