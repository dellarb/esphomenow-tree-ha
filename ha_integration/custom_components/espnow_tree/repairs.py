from __future__ import annotations

import voluptuous as vol

from homeassistant import data_entry_flow
from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant


class RestartRequiredFlow(RepairsFlow):
    """Handler for the restart required fix flow."""

    async def async_step_init(self, user_input: dict | None = None) -> data_entry_flow.FlowResult:
        return await self.async_step_confirm_restart()

    async def async_step_confirm_restart(self, user_input: dict | None = None) -> data_entry_flow.FlowResult:
        if user_input is not None:
            await self.hass.services.async_call("homeassistant", "restart")
            return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="confirm_restart",
            data_schema=vol.Schema({}),
            description_placeholders={"name": "ESPNow Tree"},
        )


async def async_create_fix_flow(
    hass: HomeAssistant,
    issue_id: str,
    data: dict | None = None,
) -> RepairsFlow | None:
    """Create flow."""
    if issue_id.startswith("restart_required"):
        return RestartRequiredFlow()
    return None
