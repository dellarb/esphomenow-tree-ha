from __future__ import annotations

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall

from .bridge_runtime import get_runtime
from .const import DOMAIN


def async_setup_services(hass: HomeAssistant) -> None:
    async def handle_send_command(call: ServiceCall) -> None:
        runtime = get_runtime(hass)
        await runtime.send_command(
            call.data["remote_mac"],
            call.data["object_id"],
            call.data["command"],
            value=call.data.get("value"),
        )

    hass.services.async_register(
        DOMAIN,
        "send_command",
        handle_send_command,
        schema=vol.Schema(
            {
                vol.Required("remote_mac"): str,
                vol.Required("object_id"): str,
                vol.Required("command"): str,
                vol.Optional("value"): object,
            }
        ),
    )
