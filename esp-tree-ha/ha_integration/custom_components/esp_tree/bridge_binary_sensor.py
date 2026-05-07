from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory

from .bridge_entity import EspTreeBridgeEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    bridge_mac = entry.data.get("bridge_mac")
    if not bridge_mac:
        return

    async_add_entities([BridgeOnlineBinarySensor(bridge_mac)])


class BridgeOnlineBinarySensor(EspTreeBridgeEntity, BinarySensorEntity):
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    @property
    def is_on(self):
        return self._get_bridge_value("online")
