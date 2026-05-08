from __future__ import annotations

import json

from homeassistant.components.fan import (
    FanEntity,
    FanEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity


def _option_int(raw: str, key: str, default: int = 0) -> int:
    for part in raw.split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        if k == key:
            try:
                return int(v)
            except ValueError:
                return default
    return default


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    if entry.data.get("type") != "remote":
        return

    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeFan(model)])

    get_runtime(hass).register_platform("fan", add, entry.entry_id)


class EspTreeFan(EspTreeEntity, FanEntity):
    def __init__(self, model: EntityModel) -> None:
        super().__init__(model)
        self._speed_count = _option_int(model.options_json, "speed_count", 0)
        self._oscillation = _option_int(model.options_json, "oscillation", 0)
        self._direction = _option_int(model.options_json, "direction", 0)
        self._state = False
        self._percentage: int | None = None
        self._oscillating = False
        self._current_direction = "forward"

    @property
    def is_on(self) -> bool:
        return self._state

    @property
    def percentage(self) -> int | None:
        return self._percentage

    @property
    def speed_count(self) -> int:
        return self._speed_count or 100

    @property
    def oscillating(self) -> bool:
        return self._oscillating

    @property
    def current_direction(self) -> str:
        return self._current_direction

    @property
    def supported_features(self) -> FanEntityFeature:
        features = FanEntityFeature.TURN_ON | FanEntityFeature.TURN_OFF
        if self._speed_count > 0:
            features |= FanEntityFeature.SET_SPEED
        if self._oscillation:
            features |= FanEntityFeature.OSCILLATE
        if self._direction:
            features |= FanEntityFeature.DIRECTION
        return features

    async def async_added_to_hass(self) -> None:
        runtime = get_runtime(self.hass)
        self.async_on_remove(
            runtime.subscribe_entity(self.model.remote_mac, self.model.object_id, self._process_state)
        )

    def _process_state(self) -> None:
        raw = self.model.value
        if isinstance(raw, str):
            try:
                data = json.loads(raw)
                state = data.get("state")
                self._state = bool(state) if state is not None else False
                speed_level = data.get("speed_level")
                if speed_level is not None and self._speed_count > 0:
                    self._percentage = int(speed_level * 100 / self._speed_count)
                else:
                    self._percentage = None
                if "oscillating" in data:
                    self._oscillating = bool(data["oscillating"])
                direction = data.get("direction")
                if direction:
                    self._current_direction = "reverse" if direction in ("reverse", "REVERSE", 1) else "forward"
            except (json.JSONDecodeError, KeyError, TypeError):
                self._state = bool(raw)
        elif isinstance(raw, (bool, int)):
            self._state = bool(raw)
        self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "turn_on"
        )

    async def async_turn_off(self, **kwargs) -> None:
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "turn_off"
        )

    async def async_set_percentage(self, percentage: int) -> None:
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "set_speed",
            value=str(percentage),
        )

    async def async_oscillate(self, oscillating: bool) -> None:
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "set_oscillation",
            value="oscillate_on" if oscillating else "oscillate_off",
        )

    async def async_set_direction(self, direction: str) -> None:
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "set_direction",
            value=direction,
        )