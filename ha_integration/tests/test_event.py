"""Tests for event entity."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from tests.conftest import EntityModel, MockRuntime, import_entity

event_mod = import_entity("event")
EspTreeEvent = event_mod.EspTreeEvent
_parse_event_types = event_mod._parse_event_types


class TestParseEventTypes:
    def test_empty(self):
        assert _parse_event_types("") == []

    def test_pipe_separated(self):
        result = _parse_event_types("options=button_pressed|button_released")
        assert result == ["button_pressed", "button_released"]

    def test_with_other_options(self):
        result = _parse_event_types("options=type1|type2;other=foo")
        assert result == ["type1", "type2"]


class TestEspTreeEvent:
    def _make(self, options_json="", value=None):
        runtime = MockRuntime()
        model = EntityModel(options_json=options_json, value=value, platform="event")
        entity = EspTreeEvent(model)
        hass = MagicMock()
        hass.data = {"esp_tree": {"runtime": runtime}}
        entity.hass = hass
        entity._trigger_event = MagicMock()
        return entity, runtime

    def test_event_types_from_options(self):
        entity, _ = self._make("options=button_pressed|button_released")
        assert entity.event_types == ["button_pressed", "button_released"]

    def test_event_types_empty(self):
        entity, _ = self._make()
        assert entity.event_types == []

    def test_process_event_fires(self):
        entity, _ = self._make("options=button_pressed")
        entity.model.value = "button_pressed"
        entity._process_event()
        entity._trigger_event.assert_called_once_with("button_pressed")

    def test_process_event_no_repeat(self):
        entity, _ = self._make("options=button_pressed")
        entity.model.value = "button_pressed"
        entity._process_event()
        entity._process_event()
        entity._trigger_event.assert_called_once_with("button_pressed")

    def test_process_event_different_type(self):
        entity, _ = self._make("options=pressed|released")
        entity.model.value = "pressed"
        entity._process_event()
        entity.model.value = "released"
        entity._process_event()
        assert entity._trigger_event.call_count == 2
        entity._trigger_event.assert_called_with("released")

    def test_process_event_ignores_empty(self):
        entity, _ = self._make()
        entity.model.value = ""
        entity._process_event()
        entity._trigger_event.assert_not_called()

    def test_process_event_ignores_none(self):
        entity, _ = self._make()
        entity.model.value = None
        entity._process_event()
        entity._trigger_event.assert_not_called()