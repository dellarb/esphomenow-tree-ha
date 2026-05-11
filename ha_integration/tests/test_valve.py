"""Tests for valve entity."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from tests.conftest import EntityModel, MockRuntime, import_entity

valve_mod = import_entity("valve")
EspTreeValve = valve_mod.EspTreeValve
ValveEntityFeature = valve_mod.ValveEntityFeature


class TestEspTreeValve:
    def _make(self, value=None):
        runtime = MockRuntime()
        model = EntityModel(platform="valve", value=value)
        entity = EspTreeValve(model)
        hass = MagicMock()
        hass.data = {"esp_tree": {"runtime": runtime}}
        entity.hass = hass
        return entity, runtime

    def test_position_int(self):
        entity, _ = self._make(value=75)
        assert entity.current_valve_position == 75

    def test_position_none(self):
        entity, _ = self._make(value=None)
        assert entity.current_valve_position is None

    def test_is_closed_position_zero(self):
        entity, _ = self._make(value=0)
        assert entity.is_closed is True

    def test_is_closed_position_nonzero(self):
        entity, _ = self._make(value=50)
        assert entity.is_closed is False

    def test_reports_position(self):
        entity, _ = self._make()
        assert entity.reports_position is True

    def test_supported_features(self):
        entity, _ = self._make()
        features = entity.supported_features
        assert ValveEntityFeature.OPEN in features
        assert ValveEntityFeature.CLOSE in features
        assert ValveEntityFeature.STOP in features
        assert ValveEntityFeature.SET_POSITION in features

    @pytest.mark.asyncio
    async def test_async_open_valve(self):
        entity, runtime = self._make()
        await entity.async_open_valve()
        assert runtime._commands[0][2] == "open"

    @pytest.mark.asyncio
    async def test_async_close_valve(self):
        entity, runtime = self._make()
        await entity.async_close_valve()
        assert runtime._commands[0][2] == "close"

    @pytest.mark.asyncio
    async def test_async_stop_valve(self):
        entity, runtime = self._make()
        await entity.async_stop_valve()
        assert runtime._commands[0][2] == "stop"

    @pytest.mark.asyncio
    async def test_async_set_valve_position(self):
        entity, runtime = self._make()
        await entity.async_set_valve_position(50)
        assert runtime._commands[0][2] == "set_value"
        assert runtime._commands[0][3]["value"] == 50