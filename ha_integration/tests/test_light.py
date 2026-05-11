"""Tests for light entity."""
from __future__ import annotations

import json
import pytest
from unittest.mock import MagicMock

from tests.conftest import EntityModel, MockRuntime, import_entity

light_mod = import_entity("light")
EspTreeLight = light_mod.EspTreeLight
_parse_options = light_mod._parse_options
_COLOR_MODE_MAP = light_mod._COLOR_MODE_MAP


class TestParseOptions:
    def test_empty(self):
        result = _parse_options("")
        assert result["color_modes"] == []
        assert result["effects"] == []

    def test_color_modes(self):
        result = _parse_options("color_modes=brightness|rgb|color_temp")
        assert result["color_modes"] == ["brightness", "rgb", "color_temp"]

    def test_effects(self):
        result = _parse_options("effects=rainbow|strobe|pulse")
        assert result["effects"] == ["rainbow", "strobe", "pulse"]

    def test_mireds(self):
        result = _parse_options("min_mireds=153;max_mireds=500")
        assert result["min_mireds"] == 153
        assert result["max_mireds"] == 500

    def test_combined(self):
        result = _parse_options("color_modes=brightness|rgb;effects=rainbow;min_mireds=153;max_mireds=500")
        assert result["color_modes"] == ["brightness", "rgb"]
        assert result["effects"] == ["rainbow"]
        assert result["min_mireds"] == 153
        assert result["max_mireds"] == 500


class TestEspTreeLight:
    def _make(self, options_json="", value=None):
        runtime = MockRuntime()
        model = EntityModel(options_json=options_json, value=value)
        entity = EspTreeLight(model)
        hass = MagicMock()
        hass.data = {"esp_tree": {"runtime": runtime}}
        entity.hass = hass
        return entity, runtime

    def test_default_state(self):
        entity, _ = self._make()
        assert entity.is_on is False
        assert entity.brightness == 0
        assert entity.color_mode is None

    def test_supported_color_modes_from_options(self):
        entity, _ = self._make("color_modes=brightness|rgb")
        modes = entity.supported_color_modes
        assert _COLOR_MODE_MAP["brightness"] in modes
        assert _COLOR_MODE_MAP["rgb"] in modes

    def test_supported_color_modes_default_onoff(self):
        entity, _ = self._make()
        modes = entity.supported_color_modes
        assert _COLOR_MODE_MAP["onoff"] in modes

    def test_effect_list(self):
        entity, _ = self._make("effects=rainbow|strobe")
        assert entity.effect_list == ["rainbow", "strobe"]

    def test_effect_list_empty(self):
        entity, _ = self._make()
        assert entity.effect_list is None

    def test_mireds(self):
        entity, _ = self._make("min_mireds=200;max_mireds=400")
        assert entity.min_mireds == 200
        assert entity.max_mireds == 400

    def test_mireds_defaults(self):
        entity, _ = self._make()
        assert entity.min_mireds == 153
        assert entity.max_mireds == 500

    def test_process_state_json_boolean(self):
        entity, _ = self._make()
        state_json = json.dumps({
            "state": True, "color_mode": "rgb", "brightness": 128,
            "color": {"r": 255, "g": 0, "b": 0}, "effect": "rainbow",
        })
        entity.model.value = state_json
        entity._process_state()
        assert entity.is_on is True
        assert entity.brightness == 128
        assert entity.color_mode == _COLOR_MODE_MAP["rgb"]
        assert entity.rgb_color == (255, 0, 0)
        assert entity.effect == "rainbow"

    def test_process_state_string_on(self):
        entity, _ = self._make()
        state_json = json.dumps({"state": "ON", "brightness": 200})
        entity.model.value = state_json
        entity._process_state()
        assert entity.is_on is True
        assert entity.brightness == 200

    def test_process_state_off(self):
        entity, _ = self._make()
        entity._state = True
        state_json = json.dumps({"state": False})
        entity.model.value = state_json
        entity._process_state()
        assert entity.is_on is False

    def test_process_state_invalid_json(self):
        entity, _ = self._make()
        entity.model.value = "not json"
        entity._process_state()
        assert entity.is_on is True

    def test_process_state_color_temp(self):
        entity, _ = self._make()
        state_json = json.dumps({"state": True, "color_mode": "color_temp", "color_temp": 300})
        entity.model.value = state_json
        entity._process_state()
        assert entity.color_temp == 300
        assert entity.color_mode == _COLOR_MODE_MAP["color_temp"]

    @pytest.mark.asyncio
    async def test_async_turn_on_basic(self):
        entity, runtime = self._make()
        await entity.async_turn_on()
        cmds = runtime._commands
        assert len(cmds) == 1
        assert cmds[0][2] == "turn_on"
        payload = json.loads(cmds[0][3]["payload"])
        assert payload["state"] == "ON"

    @pytest.mark.asyncio
    async def test_async_turn_on_with_brightness(self):
        entity, runtime = self._make()
        await entity.async_turn_on(brightness=128)
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"
        assert payload["brightness"] == 128

    @pytest.mark.asyncio
    async def test_async_turn_on_with_rgb(self):
        entity, runtime = self._make()
        await entity.async_turn_on(rgb_color=(255, 0, 0))
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["color"] == {"r": 255, "g": 0, "b": 0}

    @pytest.mark.asyncio
    async def test_async_turn_on_with_color_temp_kelvin(self):
        entity, runtime = self._make()
        await entity.async_turn_on(color_temp_kelvin=4000)
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"
        assert payload["color_temp"] == 4000

    @pytest.mark.asyncio
    async def test_async_turn_on_with_white(self):
        entity, runtime = self._make()
        await entity.async_turn_on(white=128)
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"
        assert payload["white"] == 128

    @pytest.mark.asyncio
    async def test_async_turn_on_with_effect(self):
        entity, runtime = self._make()
        await entity.async_turn_on(effect="rainbow")
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"
        assert payload["effect"] == "rainbow"

    @pytest.mark.asyncio
    async def test_async_turn_on_combined(self):
        entity, runtime = self._make()
        await entity.async_turn_on(
            brightness=200,
            rgb_color=(128, 64, 32),
            color_temp_kelvin=3000,
            effect="pulse",
        )
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "ON"
        assert payload["brightness"] == 200
        assert payload["color"] == {"r": 128, "g": 64, "b": 32}
        assert payload["color_temp"] == 3000
        assert payload["effect"] == "pulse"

    @pytest.mark.asyncio
    async def test_async_turn_off(self):
        entity, runtime = self._make()
        await entity.async_turn_off()
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "OFF"

    @pytest.mark.asyncio
    async def test_async_turn_off_with_transition(self):
        entity, runtime = self._make()
        await entity.async_turn_off(transition=5)
        payload = json.loads(runtime._commands[0][3]["payload"])
        assert payload["state"] == "OFF"
        assert payload["transition"] == 5