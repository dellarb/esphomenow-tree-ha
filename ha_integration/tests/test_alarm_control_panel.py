"""Tests for alarm_control_panel entity."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from tests.conftest import EntityModel, MockRuntime, import_entity

alarm_mod = import_entity("alarm_control_panel")
EspTreeAlarmControlPanel = alarm_mod.EspTreeAlarmControlPanel
_parse_features = alarm_mod._parse_features
AlarmControlPanelState = alarm_mod.AlarmControlPanelState
AlarmControlPanelEntityFeature = alarm_mod.AlarmControlPanelEntityFeature
CodeFormat = alarm_mod.CodeFormat


class TestParseFeatures:
    def test_empty(self):
        features = _parse_features("")
        assert features == AlarmControlPanelEntityFeature(0)

    def test_arm_home(self):
        assert AlarmControlPanelEntityFeature.ARM_HOME in _parse_features("features=1")

    def test_arm_away(self):
        assert AlarmControlPanelEntityFeature.ARM_AWAY in _parse_features("features=2")

    def test_arm_night(self):
        assert AlarmControlPanelEntityFeature.ARM_NIGHT in _parse_features("features=4")

    def test_trigger(self):
        assert AlarmControlPanelEntityFeature.TRIGGER in _parse_features("features=8")

    def test_arm_custom_bypass(self):
        assert AlarmControlPanelEntityFeature.ARM_CUSTOM_BYPASS in _parse_features("features=16")

    def test_arm_vacation(self):
        assert AlarmControlPanelEntityFeature.ARM_VACATION in _parse_features("features=32")

    def test_all(self):
        features = _parse_features("features=63")
        for f in [AlarmControlPanelEntityFeature.ARM_HOME, AlarmControlPanelEntityFeature.ARM_AWAY,
                  AlarmControlPanelEntityFeature.ARM_NIGHT, AlarmControlPanelEntityFeature.TRIGGER,
                  AlarmControlPanelEntityFeature.ARM_CUSTOM_BYPASS, AlarmControlPanelEntityFeature.ARM_VACATION]:
            assert f in features


class TestEspTreeAlarmControlPanel:
    def _make(self, options_json="", value=None):
        runtime = MockRuntime()
        model = EntityModel(options_json=options_json, value=value, platform="alarm_control_panel")
        entity = EspTreeAlarmControlPanel(model)
        hass = MagicMock()
        hass.data = {"esp_tree": {"runtime": runtime}}
        entity.hass = hass
        return entity, runtime

    def test_default_state_disarmed(self):
        entity, _ = self._make()
        assert entity.alarm_state == AlarmControlPanelState.DISARMED

    def test_process_state_armed_home(self):
        entity, _ = self._make()
        entity.model.value = "armed_home"
        entity._process_state()
        assert entity.alarm_state == AlarmControlPanelState.ARMED_HOME

    def test_process_state_triggered(self):
        entity, _ = self._make()
        entity.model.value = "triggered"
        entity._process_state()
        assert entity.alarm_state == AlarmControlPanelState.TRIGGERED

    def test_process_state_pending(self):
        entity, _ = self._make()
        entity.model.value = "pending"
        entity._process_state()
        assert entity.alarm_state == AlarmControlPanelState.PENDING

    def test_process_state_unknown_defaults_disarmed(self):
        entity, _ = self._make()
        entity.model.value = "unknown_state"
        entity._process_state()
        assert entity.alarm_state == AlarmControlPanelState.DISARMED

    def test_code_format_number(self):
        entity, _ = self._make("requires_code=1")
        assert entity.code_format == CodeFormat.NUMBER

    def test_code_format_none(self):
        entity, _ = self._make()
        assert entity.code_format is None

    @pytest.mark.asyncio
    async def test_async_alarm_arm_home(self):
        entity, runtime = self._make()
        await entity.async_alarm_arm_home()
        assert runtime._commands[0][2] == "arm_home"

    @pytest.mark.asyncio
    async def test_async_alarm_arm_away(self):
        entity, runtime = self._make()
        await entity.async_alarm_arm_away()
        assert runtime._commands[0][2] == "arm_away"

    @pytest.mark.asyncio
    async def test_async_alarm_arm_night(self):
        entity, runtime = self._make()
        await entity.async_alarm_arm_night()
        assert runtime._commands[0][2] == "arm_night"

    @pytest.mark.asyncio
    async def test_async_alarm_arm_vacation(self):
        entity, runtime = self._make()
        await entity.async_alarm_arm_vacation()
        assert runtime._commands[0][2] == "arm_vacation"

    @pytest.mark.asyncio
    async def test_async_alarm_arm_custom_bypass(self):
        entity, runtime = self._make()
        await entity.async_alarm_arm_custom_bypass()
        assert runtime._commands[0][2] == "arm_custom_bypass"

    @pytest.mark.asyncio
    async def test_async_alarm_disarm(self):
        entity, runtime = self._make()
        await entity.async_alarm_disarm()
        assert runtime._commands[0][2] == "disarm"

    @pytest.mark.asyncio
    async def test_async_alarm_trigger(self):
        entity, runtime = self._make()
        await entity.async_alarm_trigger()
        assert runtime._commands[0][2] == "trigger"