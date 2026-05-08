from __future__ import annotations

from homeassistant.components.text import TextEntity
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
        async_add_entities([EspTreeText(model)])

    get_runtime(hass).register_platform("text", add, entry.entry_id)


class EspTreeText(EspTreeEntity, TextEntity):
    @property
    def native_value(self):
        return self.model.value

    async def async_set_value(self, value: str) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "set_value", value=value)
