from __future__ import annotations

DOMAIN = "espnow_tree"
CONF_HOST = "host"
CONF_PORT = "port"
CONF_API_KEY = "api_key"
CONF_BRIDGE_MAC = "bridge_mac"
CONF_BRIDGE_UUID = "bridge_uuid"
CONF_NETWORK_ID = "network_id"
CONF_NAME = "name"
CONF_TYPE = "type"

DEFAULT_PORT = 80
SHARED_DB_PATH = "/share/espnow_tree/espnow_tree.db"
PROTOCOL = "espnow-tree-pb"
API_VERSION = 2
CLIENT_KIND = "ha_integration"
INTEGRATION_VERSION = "0.2.4"

PLATFORMS = [
    "sensor",
    "binary_sensor",
    "switch",
    "button",
    "number",
    "select",
    "text",
]
