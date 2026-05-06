from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .const import DOMAIN
from .device_model import norm_mac
from .protobuf.generated import espnow_tree_runtime_pb2 as pb


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_status)
    websocket_api.async_register_command(hass, websocket_topology)
    websocket_api.async_register_command(hass, websocket_config_command)


@websocket_api.websocket_command({vol.Required("type"): "espnow_tree/status"})
@websocket_api.async_response
async def websocket_status(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    runtime = get_runtime(hass)
    connection.send_result(
        msg["id"],
        {
            "connected": runtime.bridge_connected(),
            "bridge_count": len(runtime.clients),
            "remote_count": len(runtime.remotes),
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "espnow_tree/topology"})
@websocket_api.async_response
async def websocket_topology(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    runtime = get_runtime(hass)
    connection.send_result(
        msg["id"],
        {
            "connected": runtime.bridge_connected(),
            "nodes": runtime.topology_nodes(),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "espnow_tree/config_command",
        vol.Required("mac"): str,
        vol.Required("command"): str,
        vol.Optional("params", default={}): dict,
    }
)
@websocket_api.async_response
async def websocket_config_command(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    runtime = get_runtime(hass)
    try:
        result = await runtime.send_config_command(norm_mac(msg["mac"]), msg["command"], msg.get("params") or {})
    except Exception as exc:
        connection.send_error(msg["id"], "command_failed", str(exc))
        return
    connection.send_result(msg["id"], _config_result_to_dict(result))


def _config_result_to_dict(result: pb.ConfigCommandResult) -> dict[str, Any]:
    if result.status in (pb.COMMAND_STATUS_ACCEPTED, pb.COMMAND_STATUS_DELIVERED):
        status = "ok"
    elif result.status == pb.COMMAND_STATUS_TIMEOUT:
        status = "timeout"
    elif result.status == pb.COMMAND_STATUS_UNSUPPORTED:
        status = "unsupported"
    elif result.status == pb.COMMAND_STATUS_UNAVAILABLE:
        status = "no_session"
    else:
        status = "rejected"
    return {
        "result": status,
        "command": result.command,
        "remote_mac": norm_mac(result.remote_mac),
        "bridge_mac": norm_mac(result.bridge_mac),
        "session_id": result.session_id,
        "error_code": result.error_code,
        "error_message": result.error_message,
    }
