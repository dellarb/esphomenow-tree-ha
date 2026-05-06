from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries

from .const import CONF_API_KEY, CONF_HOST, CONF_NAME, CONF_PORT, DEFAULT_PORT, DOMAIN


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors: dict[str, str] = {}
        if user_input is not None:
            title = user_input.get(CONF_NAME) or user_input[CONF_HOST]
            await self.async_set_unique_id(f"{user_input[CONF_HOST]}:{user_input[CONF_PORT]}")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=title, data=user_input)

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST): str,
                vol.Optional(CONF_PORT, default=DEFAULT_PORT): int,
                vol.Required(CONF_API_KEY): str,
                vol.Optional(CONF_NAME, default="ESPNow Tree Bridge"): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
