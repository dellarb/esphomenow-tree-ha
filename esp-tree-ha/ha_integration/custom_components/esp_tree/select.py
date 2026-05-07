from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity


def _options(raw: str) -> list[str]:
    if "options=" in raw:
        raw = raw.split("options=", 1)[1].split(";", 1)[0]
    return [part for part in raw.replace(",", "|").split("|") if part]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeSelect(model)])

    get_runtime(hass).register_platform("select", add, entry.entry_id if entry.data.get("type") == "remote" else None)


class EspTreeSelect(EspTreeEntity, SelectEntity):
    @property
    def options(self) -> list[str]:
        return _options(self.model.options_json)

    @property
    def current_option(self):
        opts = self.options
        if isinstance(self.model.value, int) and 0 <= self.model.value < len(opts):
            return opts[self.model.value]
        return str(self.model.value) if self.model.value is not None else None

    async def async_select_option(self, option: str) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "select_option", value=option)
