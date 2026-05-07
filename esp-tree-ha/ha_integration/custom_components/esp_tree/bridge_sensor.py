from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory

from .bridge_entity import EspTreeBridgeEntity


BRIDGE_SENSORS = [
    ("rssi", "RSSI", SensorDeviceClass.SIGNAL_STRENGTH, "dBm", "measurement"),
    ("uptime_s", "Uptime", SensorDeviceClass.DURATION, "s", "total"),
    ("entity_count", "Remote Count", None, None, "measurement"),
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    bridge_mac = entry.data.get("bridge_mac")
    if not bridge_mac:
        return

    entities = []
    for object_id, name, device_class, unit, state_class in BRIDGE_SENSORS:
        entities.append(BridgeSensor(bridge_mac, object_id, name, device_class, unit, state_class))
    async_add_entities(entities)


class BridgeSensor(EspTreeBridgeEntity, SensorEntity):
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self,
        bridge_mac: str,
        object_id: str,
        name: str,
        device_class: str | None,
        unit: str | None,
        state_class: str | None,
    ) -> None:
        super().__init__(bridge_mac, object_id, name)
        self._device_class = device_class
        self._unit = unit
        self._state_class = state_class

    @property
    def native_value(self):
        return self._get_bridge_value(self._object_id)

    @property
    def device_class(self):
        return self._device_class

    @property
    def native_unit_of_measurement(self):
        return self._unit

    @property
    def state_class(self):
        return self._state_class
