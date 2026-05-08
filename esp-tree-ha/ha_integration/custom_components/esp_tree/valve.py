from __future__ import annotations

from homeassistant.components.valve import (
    ValveEntity,
    ValveEntityFeature,
)
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
        async_add_entities([EspTreeValve(model)])

    get_runtime(hass).register_platform("valve", add, entry.entry_id)


class EspTreeValve(EspTreeEntity, ValveEntity):
    def __init__(self, model: EntityModel) -> None:
        super().__init__(model)

    @property
    def supported_features(self) -> ValveEntityFeature:
        return (
            ValveEntityFeature.OPEN
            | ValveEntityFeature.CLOSE
            | ValveEntityFeature.STOP
            | ValveEntityFeature.SET_POSITION
        )

    @property
    def current_valve_position(self) -> int | None:
        val = self.model.value
        if isinstance(val, (int, float)):
            return int(val)
        return None

    @property
    def is_closed(self) -> bool:
        pos = self.current_valve_position
        return pos == 0 if pos is not None else False

    @property
    def is_opening(self) -> bool:
        return False

    @property
    def is_closing(self) -> bool:
        return False

    async def async_open_valve(self, **kwargs) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "open")

    async def async_close_valve(self, **kwargs) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "close")

    async def async_stop_valve(self, **kwargs) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "stop")

    async def async_set_valve_position(self, position: int) -> None:
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "set_value", value=position
        )