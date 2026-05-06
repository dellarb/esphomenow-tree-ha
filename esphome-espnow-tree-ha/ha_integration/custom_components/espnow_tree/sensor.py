from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspnowTreeEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspnowTreeSensor(model)])

    get_runtime(hass).register_platform("sensor", add)
    get_runtime(hass).register_platform("text_sensor", add)


class EspnowTreeSensor(EspnowTreeEntity, SensorEntity):
    @property
    def native_value(self):
        return self.model.value

    @property
    def native_unit_of_measurement(self):
        return self.model.unit or None

    @property
    def device_class(self):
        return self.model.device_class or None

    @property
    def state_class(self):
        return self.model.state_class or None
