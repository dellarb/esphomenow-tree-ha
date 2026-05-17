from esphome import pins
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components.esp32 import add_idf_sdkconfig_option
from esphome.const import CONF_ID
import esphome.core as core

CODEOWNERS = ["@esphome"]
DEPENDENCIES = ["web_server"]
AUTO_LOAD = ["esp_tree_common"]

CONF_NETWORK_ID = "network_id"
CONF_PSK = "psk"
CONF_HEARTBEAT_INTERVAL = "heartbeat_interval_seconds"
CONF_MQTT_DISCOVERY_PREFIX = "mqtt_discovery_prefix"
CONF_ESPNOW_MODE = "espnow_mode"
CONF_OTA_OVER_ESPNOW = "ota_over_espnow"
CONF_FORCE_V1_PACKET_SIZE = "force_v1_packet_size"
CONF_API_KEY = "api_key"

espnow_ns = cg.esphome_ns.namespace("esp_tree")
ESPTreeBridge = espnow_ns.class_("ESPTreeBridge", cg.Component)

CONF_SERIAL_TRANSPORT = "serial_transport"
CONF_BAUD_RATE = "baud_rate"
CONF_RX_BUFFER_SIZE = "rx_buffer_size"
CONF_USB_CDC = "usb_cdc"
CONF_TX_PIN = "tx_pin"
CONF_RX_PIN = "rx_pin"

SERIAL_TRANSPORT_SCHEMA = cv.Schema(
    {
        cv.Optional(CONF_BAUD_RATE, default=460800): cv.All(
            cv.int_, cv.Range(min=9600, max=921600)
        ),
        cv.Optional(CONF_RX_BUFFER_SIZE, default=8192): cv.All(
            cv.int_, cv.Range(min=2048, max=65536)
        ),
        cv.Optional(CONF_USB_CDC): cv.Schema({}),
        cv.Optional(CONF_TX_PIN): pins.internal_gpio_output_pin_schema,
        cv.Optional(CONF_RX_PIN): pins.internal_gpio_input_pin_schema,
    }
)


def _validate_transport_exclusivity(config):
    has_serial = CONF_SERIAL_TRANSPORT in config
    has_wifi = "wifi" in core.CORE.loaded_integrations
    if has_serial and has_wifi:
        raise cv.Invalid(
            "wifi: and serial_transport: cannot both be configured. "
            "Use serial_transport: for USB/UART transport or wifi: for WiFi transport, not both."
        )
    if not has_serial and not has_wifi:
        raise cv.Invalid(
            "Either wifi: or serial_transport: must be configured. "
            "The bridge requires a transport layer."
        )
    return config


CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(ESPTreeBridge),
            cv.Required(CONF_NETWORK_ID): cv.string_strict,
            cv.Required(CONF_PSK): cv.All(cv.string_strict, cv.Length(min=1)),
            cv.Optional(CONF_HEARTBEAT_INTERVAL, default=60): cv.int_range(
                min=10, max=3600
            ),
            cv.Optional(CONF_ESPNOW_MODE, default="lr"): cv.one_of(
                "lr", "regular", lower=True
            ),
            cv.Optional(CONF_MQTT_DISCOVERY_PREFIX, default="homeassistant"): cv.string_strict,
            cv.Optional(CONF_OTA_OVER_ESPNOW, default=False): cv.boolean,
            cv.Optional(CONF_FORCE_V1_PACKET_SIZE, default=False): cv.boolean,
            cv.Optional(CONF_API_KEY, default=""): cv.string_strict,
            cv.Optional(CONF_SERIAL_TRANSPORT): SERIAL_TRANSPORT_SCHEMA,
        }
    ).extend(cv.COMPONENT_SCHEMA),
    _validate_transport_exclusivity,
)


async def to_code(config):
    add_idf_sdkconfig_option("CONFIG_HTTPD_WS_SUPPORT", True)
    cg.add_build_flag("-Isrc/esphome/components")
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    serial_config = config.get(CONF_SERIAL_TRANSPORT)
    if serial_config is not None:
        cg.add_build_flag("-DUSE_SERIAL")
        if CONF_USB_CDC in serial_config:
            # TODO: Create USB CDC ACM instance following ESPHome usb_cdc_acm pattern
            pass
        else:
            # TODO: Create UART component with configured tx/rx pins and rx_buffer_size
            # following ESPHome uart component creation pattern, then pass to bridge
            # via cg.add(var.set_uart_component(uart_var))
            pass
    else:
        if "wifi" not in core.CORE.loaded_integrations:
            raise cv.Invalid(
                "wifi: is required when serial_transport: is not configured"
            )

    cg.add(var.set_network_id(config[CONF_NETWORK_ID]))
    cg.add(var.set_psk(config[CONF_PSK]))
    cg.add(var.set_api_key(config[CONF_API_KEY]))
    cg.add(var.set_heartbeat_interval(config[CONF_HEARTBEAT_INTERVAL]))
    cg.add(var.set_ota_over_espnow(config[CONF_OTA_OVER_ESPNOW]))
    cg.add(var.set_espnow_mode(config[CONF_ESPNOW_MODE]))

    friendly_name = core.CORE.friendly_name or core.CORE.name or "ESP-NOW LR Bridge"
    hostname = core.CORE.name or "esp-tree-bridge"
    cg.add(var.set_force_v1_packet_size(config[CONF_FORCE_V1_PACKET_SIZE]))
    cg.add(var.set_bridge_friendly_name(friendly_name))
    cg.add(var.set_hostname(hostname))

    # MQTT discovery prefix is only used when mqtt: block is present in YAML.
    if "mqtt" in core.CORE.loaded_integrations:
        cg.add(var.set_mqtt_discovery_prefix(config.get(CONF_MQTT_DISCOVERY_PREFIX, "homeassistant")))
        cg.add_build_flag("-DUSE_MQTT")
