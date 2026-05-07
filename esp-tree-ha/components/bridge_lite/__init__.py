import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components.esp32 import add_idf_sdkconfig_option
from esphome.const import CONF_ID

CODEOWNERS = ["@esphome"]
DEPENDENCIES = ["wifi", "web_server"]
AUTO_LOAD = ["espnow_lr_common"]

CONF_NETWORK_ID = "network_id"
CONF_PSK = "psk"
CONF_ESPNOW_MODE = "espnow_mode"
CONF_API_KEY = "api_key"

espnow_ns = cg.esphome_ns.namespace("espnow_lr")
BridgeLite = espnow_ns.class_("BridgeLite", cg.Component)

CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(BridgeLite),
        cv.Required(CONF_NETWORK_ID): cv.string_strict,
        cv.Required(CONF_PSK): cv.All(cv.string_strict, cv.Length(min=1)),
        cv.Optional(CONF_ESPNOW_MODE, default="lr"): cv.one_of("lr", "regular", lower=True),
        cv.Optional(CONF_API_KEY, default=""): cv.string_strict,
    }
).extend(cv.COMPONENT_SCHEMA)

async def to_code(config):
    add_idf_sdkconfig_option("CONFIG_HTTPD_WS_SUPPORT", True)
    cg.add_build_flag("-Isrc/esphome/components")
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    cg.add(var.set_network_id(config[CONF_NETWORK_ID]))
    cg.add(var.set_psk(config[CONF_PSK]))
    cg.add(var.set_api_key(config[CONF_API_KEY]))
    cg.add(var.set_espnow_mode(config[CONF_ESPNOW_MODE]))