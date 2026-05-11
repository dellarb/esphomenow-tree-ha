"""Tests for fan entity."""
from __future__ import annotations

import json
import pytest
from unittest.mock import MagicMock

from tests.conftest import EntityModel, MockRuntime, import_entity

fan_mod = import_entity("fan")
EspTreeFan = fan_mod.EspTreeFan
FanEntityFeature = fan_mod.FanEntityFeature


class TestEspTreeFan:
    def _make(self, options_json="", value=None):
        runtime = MockRuntime()
        model = EntityModel(options_json=options_json, value=value, platform="fan")
        entity = EspTreeFan(model)
        hass = MagicMock()
        hass.data = {"esp_tree": {"runtime": runtime}}
        entity.hass = hass
        return entity, runtime

    def test_default_state(self):
        entity, _ = self._make()
        assert entity.is_on is False
        assert entity.percentage is None
        assert entity.oscillating is False
        assert entity.current_direction == "forward"

    def test_speed_count_from_options(self):
        entity, _ = self._make("speed_count=3")
        assert entity.speed_count == 3

    def test_speed_count_default(self):
        entity, _ = self._make()
        assert entity.speed_count == 100

    def test_supported_features_set_speed(self):
        entity, _ = self._make("speed_count=3")
        assert FanEntityFeature.SET_SPEED in entity.supported_features

    def test_supported_features_oscillate(self):
        entity, _ = self._make("oscillation=1")
        assert FanEntityFeature.OSCILLATE in entity.supported_features

    def test_supported_features_direction(self):
        entity, _ = self._make("direction=1")
        assert FanEntityFeature.DIRECTION in entity.supported_features

    def test_supported_features_always_has_turn_on_off(self):
        entity, _ = self._make()
        assert FanEntityFeature.TURN_ON in entity.supported_features
        assert FanEntityFeature.TURN_OFF in entity.supported_features

    def test_process_state_json(self):
        entity, _ = self._make("speed_count=3")
        state_json = json.dumps({"state": True, "speed_level": 2, "oscillating": True, "direction": "forward"})
        entity.model.value = state_json
        entity._process_state()
        assert entity.is_on is True
        assert entity.percentage == int(2 * 100 / 3)
        assert entity.oscillating is True
        assert entity.current_direction == "forward"

    def test_process_state_reverse_direction(self):
        entity, _ = self._make("direction=1")
        state_json = json.dumps({"state": True, "direction": "reverse"})
        entity.model.value = state_json
        entity._process_state()
        assert entity.current_direction == "reverse"

    def test_process_state_invalid_json(self):
        entity, _ = self._make()
        entity.model.value = "not json"
        entity._process_state()
        assert entity.is_on is True

    @pytest.mark.asyncio
    async def test_async_turn_on(self):
        entity, runtime = self._make()
        await entity.async_turn_on()
        assert runtime._commands[0][2] == "turn_on"
        assert runtime._commands[0][3]["payload"] == '{"state": "ON"}'

    @pytest.mark.asyncio
    async def test_async_turn_on_with_percentage(self):
        entity, runtime = self._make("speed_count=3")
        await entity.async_turn_on(percentage=50)
        assert runtime._commands[0][2] == "turn_on"
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"
        assert payload["percentage"] == 50

    @pytest.mark.asyncio
    async def test_async_turn_on_with_speed(self):
        entity, runtime = self._make("speed_count=3")
        await entity.async_turn_on(speed="medium")
        assert runtime._commands[0][2] == "turn_on"
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"

    @pytest.mark.asyncio
    async def test_async_turn_off(self):
        entity, runtime = self._make()
        await entity.async_turn_off()
        assert runtime._commands[0][2] == "turn_off"

    @pytest.mark.asyncio
    async def test_async_set_percentage(self):
        entity, runtime = self._make("speed_count=3")
        entity._state = True
        await entity.async_set_percentage(50)
        assert runtime._commands[0][2] == "set_speed"
        assert runtime._commands[0][3]["value"] == "50"

    @pytest.mark.asyncio
    async def test_async_set_percentage_from_off_turns_on(self):
        entity, runtime = self._make("speed_count=3")
        entity._state = False
        await entity.async_set_percentage(50)
        assert runtime._commands[0][2] == "turn_on"
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"
        assert payload["percentage"] == 50

    @pytest.mark.asyncio
    async def test_async_set_percentage_zero_stays_off(self):
        entity, runtime = self._make("speed_count=3")
        entity._state = False
        await entity.async_set_percentage(0)
        assert runtime._commands[0][2] == "set_speed"
        assert runtime._commands[0][3]["value"] == "0"

    @pytest.mark.asyncio
    async def test_async_oscillate_on(self):
        entity, runtime = self._make("oscillation=1")
        await entity.async_oscillate(True)
        assert runtime._commands[0][2] == "set_oscillation"
        assert runtime._commands[0][3]["value"] == "oscillate_on"

    @pytest.mark.asyncio
    async def test_async_oscillate_off(self):
        entity, runtime = self._make("oscillation=1")
        await entity.async_oscillate(False)
        assert runtime._commands[0][2] == "set_oscillation"
        assert runtime._commands[0][3]["value"] == "oscillate_off"

    @pytest.mark.asyncio
    async def test_async_set_direction(self):
        entity, runtime = self._make("direction=1")
        await entity.async_set_direction("reverse")
        assert runtime._commands[0][2] == "set_direction"
        assert runtime._commands[0][3]["value"] == "reverse"