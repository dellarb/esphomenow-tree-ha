from __future__ import annotations

from homeassistant.components.number import NumberEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspnowTreeEntity


def _option_float(options: str, key: str, default: float | None = None) -> float | None:
    for part in options.split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        if k == key:
            try:
                return float(v)
            except ValueError:
                return default
    return default


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspnowTreeNumber(model)])

    get_runtime(hass).register_platform("number", add, entry.entry_id if entry.data.get("type") == "remote" else None)


class EspnowTreeNumber(EspnowTreeEntity, NumberEntity):
    @property
    def native_value(self):
        return self.model.value

    @property
    def native_min_value(self):
        return _option_float(self.model.options_json, "min")

    @property
    def native_max_value(self):
        return _option_float(self.model.options_json, "max")

    @property
    def native_step(self):
        return _option_float(self.model.options_json, "step", 1)

    async def async_set_native_value(self, value: float) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "set_value", value=value)
