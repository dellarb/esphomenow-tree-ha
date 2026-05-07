from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeSwitch(model)])

    get_runtime(hass).register_platform("switch", add, entry.entry_id if entry.data.get("type") == "remote" else None)


class EspTreeSwitch(EspTreeEntity, SwitchEntity):
    @property
    def is_on(self):
        return bool(self.model.value)

    async def async_turn_on(self, **kwargs):
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "turn_on")

    async def async_turn_off(self, **kwargs):
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "turn_off")
