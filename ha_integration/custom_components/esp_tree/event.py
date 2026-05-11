from __future__ import annotations

import logging

from homeassistant.components.event import EventEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity

_LOGGER = logging.getLogger(__name__)


def _parse_event_types(raw: str) -> list[str]:
    for part in raw.split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        if k == "options":
            return [t.strip() for t in v.replace(",", "|").split("|") if t.strip()]
    return []


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    if entry.data.get("type") != "remote":
        return

    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeEvent(model)])

    get_runtime(hass).register_platform("event", add, entry.entry_id)


class EspTreeEvent(EspTreeEntity, EventEntity):
    def __init__(self, model: EntityModel) -> None:
        super().__init__(model)
        self._event_types = _parse_event_types(model.options_json)
        self._last_event_type: str | None = None

    @property
    def event_types(self) -> list[str]:
        return self._event_types

    async def async_added_to_hass(self) -> None:
        runtime = get_runtime(self.hass)
        self.async_on_remove(
            runtime.subscribe_entity(self.model.remote_mac, self.model.object_id, self._process_event)
        )

    @callback
    def _process_event(self) -> None:
        event_type = self.model.value
        if isinstance(event_type, str) and event_type and event_type != self._last_event_type:
            self._last_event_type = event_type
            self._trigger_event(event_type)
        self.async_write_ha_state()