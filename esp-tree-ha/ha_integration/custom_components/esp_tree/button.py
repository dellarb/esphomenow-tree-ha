from __future__ import annotations

from homeassistant.components.button import ButtonEntity
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
        async_add_entities([EspTreeButton(model)])

    get_runtime(hass).register_platform("button", add, entry.entry_id if entry.data.get("type") == "remote" else None)


class EspTreeButton(EspTreeEntity, ButtonEntity):
    async def async_press(self) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "press")
