"""Tests for cover entity."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from tests.conftest import EntityModel, MockRuntime, import_entity

cover_mod = import_entity("cover")
EspTreeCover = cover_mod.EspTreeCover
CoverEntityFeature = cover_mod.CoverEntityFeature


class TestEspTreeCover:
    def _make(self, value=None):
        runtime = MockRuntime()
        model = EntityModel(platform="cover", value=value)
        entity = EspTreeCover(model)
        hass = MagicMock()
        hass.data = {"esp_tree": {"runtime": runtime}}
        entity.hass = hass
        return entity, runtime

    def test_position_int(self):
        entity, _ = self._make(value=75)
        assert entity.current_cover_position == 75

    def test_position_none(self):
        entity, _ = self._make(value=None)
        assert entity.current_cover_position is None

    def test_is_closed_position_zero(self):
        entity, _ = self._make(value=0)
        assert entity.is_closed is True

    def test_is_closed_position_nonzero(self):
        entity, _ = self._make(value=50)
        assert entity.is_closed is False

    def test_supported_features(self):
        entity, _ = self._make()
        features = entity.supported_features
        assert CoverEntityFeature.OPEN in features
        assert CoverEntityFeature.CLOSE in features
        assert CoverEntityFeature.STOP in features
        assert CoverEntityFeature.SET_POSITION in features

    @pytest.mark.asyncio
    async def test_async_open_cover(self):
        entity, runtime = self._make()
        await entity.async_open_cover()
        assert runtime._commands[0][2] == "open"

    @pytest.mark.asyncio
    async def test_async_close_cover(self):
        entity, runtime = self._make()
        await entity.async_close_cover()
        assert runtime._commands[0][2] == "close"

    @pytest.mark.asyncio
    async def test_async_stop_cover(self):
        entity, runtime = self._make()
        await entity.async_stop_cover()
        assert runtime._commands[0][2] == "stop"

    @pytest.mark.asyncio
    async def test_async_set_cover_position(self):
        entity, runtime = self._make()
        await entity.async_set_cover_position(position=50)
        assert runtime._commands[0][2] == "set_value"
        assert runtime._commands[0][3]["value"] == 50