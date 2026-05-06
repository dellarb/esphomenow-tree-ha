from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_binary_sensor import BridgeOnlineBinarySensor
from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspnowTreeEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    if entry.data.get("type") == "bridge":
        bridge_mac = entry.data.get("bridge_mac")
        if not bridge_mac:
            return
        async_add_entities([BridgeOnlineBinarySensor(bridge_mac)])
        return

    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspnowTreeBinarySensor(model)])

    get_runtime(hass).register_platform("binary_sensor", add, entry.entry_id if entry.data.get("type") == "remote" else None)


class EspnowTreeBinarySensor(EspnowTreeEntity, BinarySensorEntity):
    @property
    def is_on(self):
        return bool(self.model.value)

    @property
    def device_class(self):
        return self.model.device_class or None
