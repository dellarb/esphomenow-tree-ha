from __future__ import annotations

from homeassistant.components.alarm_control_panel import (
    AlarmControlPanelEntity,
    AlarmControlPanelEntityFeature,
    AlarmControlPanelState,
    CodeFormat,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity

_STATE_MAP = {
    "disarmed": AlarmControlPanelState.DISARMED,
    "armed_home": AlarmControlPanelState.ARMED_HOME,
    "armed_away": AlarmControlPanelState.ARMED_AWAY,
    "armed_night": AlarmControlPanelState.ARMED_NIGHT,
    "armed_vacation": AlarmControlPanelState.ARMED_VACATION,
    "armed_custom_bypass": AlarmControlPanelState.ARMED_CUSTOM_BYPASS,
    "triggered": AlarmControlPanelState.TRIGGERED,
    "pending": AlarmControlPanelState.PENDING,
    "arming": AlarmControlPanelState.ARMING,
    "disarming": AlarmControlPanelState.DISARMING,
}


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


def _parse_features(raw: str) -> AlarmControlPanelEntityFeature:
    features = AlarmControlPanelEntityFeature(0)
    bitmask = _option_int(raw, "features", 0)
    if bitmask & 0x01:
        features |= AlarmControlPanelEntityFeature.ARM_HOME
    if bitmask & 0x02:
        features |= AlarmControlPanelEntityFeature.ARM_AWAY
    if bitmask & 0x04:
        features |= AlarmControlPanelEntityFeature.ARM_NIGHT
    if bitmask & 0x08:
        features |= AlarmControlPanelEntityFeature.TRIGGER
    if bitmask & 0x10:
        features |= AlarmControlPanelEntityFeature.ARM_CUSTOM_BYPASS
    if bitmask & 0x20:
        features |= AlarmControlPanelEntityFeature.ARM_VACATION
    return features


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    if entry.data.get("type") != "remote":
        return

    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeAlarmControlPanel(model)])

    get_runtime(hass).register_platform("alarm_control_panel", add, entry.entry_id)


class EspTreeAlarmControlPanel(EspTreeEntity, AlarmControlPanelEntity):
    def __init__(self, model: EntityModel) -> None:
        super().__init__(model)
        self._alarm_state: AlarmControlPanelState = AlarmControlPanelState.DISARMED
        self._supported_features = _parse_features(model.options_json)
        self._code_arm_required = bool(_option_int(model.options_json, "requires_code_to_arm", 0))

    @property
    def alarm_state(self) -> AlarmControlPanelState:
        return self._alarm_state

    @property
    def supported_features(self) -> AlarmControlPanelEntityFeature:
        return self._supported_features

    @property
    def code_arm_required(self) -> bool:
        return self._code_arm_required

    @property
    def code_format(self) -> CodeFormat | None:
        if bool(_option_int(self.model.options_json, "requires_code", 0)):
            return CodeFormat.NUMBER
        return None

    async def async_added_to_hass(self) -> None:
        runtime = get_runtime(self.hass)
        self.async_on_remove(
            runtime.subscribe_entity(self.model.remote_mac, self.model.object_id, self._process_state)
        )

    def _process_state(self) -> None:
        raw = self.model.value
        if isinstance(raw, str):
            self._alarm_state = _STATE_MAP.get(raw, AlarmControlPanelState.DISARMED)
        self.async_write_ha_state()

    async def async_alarm_arm_home(self, code: str | None = None) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_home")

    async def async_alarm_arm_away(self, code: str | None = None) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_away")

    async def async_alarm_arm_night(self, code: str | None = None) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_night")

    async def async_alarm_arm_vacation(self, code: str | None = None) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_vacation")

    async def async_alarm_arm_custom_bypass(self, code: str | None = None) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_custom_bypass")

    async def async_alarm_disarm(self, code: str | None = None) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "disarm")

    async def async_alarm_trigger(self, code: str | None = None) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "trigger")