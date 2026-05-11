from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    if entry.data.get("type") != "remote":
        return

    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeBinarySensor(model)])

    get_runtime(hass).register_platform("binary_sensor", add, entry.entry_id)


class EspTreeBinarySensor(EspTreeEntity, BinarySensorEntity):
    @property
    def is_on(self):
        return bool(self.model.value)

    @property
    def device_class(self):
        return self.model.device_class or None
