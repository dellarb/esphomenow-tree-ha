# Workplan: Full ESPHome Entity Type Integration via Bridge Protobuf API

## Objective

Integrate all 7 missing ESPHome entity types through the bridge protobuf (v2) API and into Home Assistant, achieving parity with the bridge's existing MQTT discovery path. Currently, the HA integration only supports 8 entity types (sensor, binary_sensor, switch, button, number, select, text, text_sensor). This workplan adds light, fan, cover, valve, lock, alarm_control_panel, and event.

The existing MQTT discovery path on the bridge already fully supports these types — this effort brings the same capabilities to the protobuf/WebSocket path used by the HA integration.

---

## Scope

### In Scope

| Entity Type | HA Platform | Bridge Wire Type | Proto Encoding | Commands |
|---|---|---|---|---|
| light | `LightEntity` | `FIELD_TYPE_LIGHT` (0x09) | `string_value` (JSON) | turn_on, turn_off (JSON payload) |
| fan | `FanEntity` | `FIELD_TYPE_FAN` (0x0A) | `string_value` (JSON) | turn_on, turn_off, set speed/oscillation/direction |
| lock | `LockEntity` | `FIELD_TYPE_LOCK` (0x0B) | `bool_value` | lock, unlock |
| cover | `CoverEntity` | `FIELD_TYPE_COVER` (0x08) | `int_value` (0-100 position) | open, close, stop, set_position |
| valve | `ValveEntity` | `FIELD_TYPE_VALVE` (0x11) | `int_value` (0-100 position) | open, close, stop, set_position |
| alarm_control_panel | `AlarmControlPanelEntity` | `FIELD_TYPE_ALARM` (0x0C) | `string_value` (JSON) | arm_home, arm_away, arm_night, arm_vacation, trigger |
| event | `EventEntity` | `FIELD_TYPE_EVENT` (0x0E) | `string_value` (event type) | none (read-only) |

### Out of Scope

- climate, humidifier, dehumidifier, time, datetime — these fall back to "sensor" in MQTT and require bridge firmware schema work first
- Alarm code/disarm support — deferred to follow-up (arm + trigger only for V1)
- OTA (unchanged — OTA remains HTTP-only)
- Bridge MQTT path modifications (MQTT is the reference, not a target for change)

### Minimum Requirements

- Home Assistant 2024.8+ (required for `EventEntity` and `ValveEntity`)
- Bridge firmware with `api_runtime_handle_command` modifications (Phase 0)

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| State encoding | JSON in `string_value` for complex types (light, fan, alarm); `int_value` for position (cover, valve); `bool_value` for lock; `string_value` for event type | Matches bridge's `runtime_write_entity_state_` output; no proto schema changes needed |
| Command encoding | JSON in `string_value` arg for complex commands (light, fan, alarm); simple command names for scalar types (cover/valve/lock) | Matches bridge's `decode_command_payload_` input; `CommandArgument` supports typed values |
| Capability source | Parse `options_json` per entity in `__init__` | Matches existing pattern (number, select); options contain color_modes, effects, speeds, etc. |
| State parsing | Each entity class parses its own state in `_handle_state_update` | Localizes domain logic; matches existing pattern |
| File structure | Separate platform file per entity type | Matches existing pattern and HA convention |
| Bridge changes | Modify `api_runtime_handle_command` to pass through JSON args for complex types | Required because current handler maps turn_on→ON and ignores args |

---

## Phase 0: Bridge Firmware — Command Handler Modification

**Why:** The bridge's `api_runtime_handle_command()` currently maps `turn_on`→`"ON"` and `turn_off`→`"OFF"` for all types, discarding any args. For complex types (light, fan, alarm), the HA integration needs to pass JSON payloads that `decode_command_payload_` already knows how to parse. Without this change, JSON command args are silently dropped.

**File to modify:** `/home/ben/ai-hermes-agent/ESPLR_V2/components/esp_tree_bridge/esp_tree_bridge.cpp`

### Step 0.1: Modify `api_runtime_handle_command` payload construction

Current logic (simplified):
```cpp
if (request.command == "turn_on") payload = "ON";
else if (request.command == "turn_off") payload = "OFF";
else if (request.command == "press") payload = "PRESS";
else if (request.command == "open") payload = "OPEN";
else if (request.command == "close") payload = "CLOSE";
else if (request.command == "stop") payload = "STOP";
else if (request.command == "lock") payload = "LOCK";
else if (request.command == "unlock") payload = "UNLOCK";
else if (!request.args.empty()) payload = request.args.front().value;
else payload = request.command;
```

Change to: after mapping simple commands, check if args contain a JSON payload and prefer it:
```cpp
if (request.command == "turn_on") payload = "ON";
else if (request.command == "turn_off") payload = "OFF";
else if (request.command == "press") payload = "PRESS";
else if (request.command == "open") payload = "OPEN";
else if (request.command == "close") payload = "CLOSE";
else if (request.command == "stop") payload = "STOP";
else if (request.command == "lock") payload = "LOCK";
else if (request.command == "unlock") payload = "UNLOCK";
else if (!request.args.empty()) payload = request.args.front().value;
else payload = request.command;

// Override simple mapping if a JSON arg is provided
if (!request.args.empty()) {
  const auto &first_arg = request.args.front();
  if (!first_arg.value.empty() && first_arg.value[0] == '{') {
    payload = first_arg.value;
  }
}
```

This preserves backward compatibility (simple turn_on→ON still works for switch/binary) while enabling JSON payloads for complex types.

### Step 0.2: Build and verify bridge firmware

```bash
cd /home/ben/ai-hermes-agent/ESPLR_V2 && ./compile.sh
```

Verify no regression on existing switch/binary button commands.

---

## Phase 1: HA Integration — Platform Registration & Wiring

### Step 1.1: Update `const.py` PLATFORMS list

**File:** `esp-tree-ha/ha_integration/custom_components/esp_tree/const.py`

Add 7 new platforms:
```python
PLATFORMS = [
    "sensor",
    "binary_sensor",
    "switch",
    "button",
    "number",
    "select",
    "text",
    "light",
    "fan",
    "cover",
    "valve",
    "lock",
    "alarm_control_panel",
    "event",
]
```

### Step 1.2: Verify `__init__.py` platform forwarding

**File:** `esp-tree-ha/ha_integration/custom_components/esp_tree/__init__.py`

The existing `async_forward_entry_setups(entry, PLATFORMS)` call forwards all platforms in `PLATFORMS`. Since we added to that list in Step 1.1, no changes needed here — it picks them up automatically.

### Step 1.3: Update `bridge_runtime.py` entity model hydration

**File:** `esp-tree-ha/ha_integration/custom_components/esp_tree/bridge_runtime.py`

The `register_platform()` method already dispatches entities to platform callbacks by `entity.platform`. Since the bridge sets `platform` to `component_for_type()` output (e.g., `"light"`, `"fan"`), and we'll register callbacks for those platform names in each entity file's `async_setup_entry`, no changes needed to `bridge_runtime.py` registration logic.

However, verify that `_apply_state()` correctly handles all proto `value` oneof variants for the new types:
- `string_value` — used by light, fan, alarm, event
- `int_value` — used by cover, valve
- `bool_value` — used by lock

Current `_apply_state`:
```python
value_kind = state.WhichOneof("value")
entity.value = getattr(state, value_kind) if value_kind else None
```

This already works generically — no changes needed.

---

## Phase 2: Light Entity (Most Complex — Establishes JSON Patterns)

**File to create:** `esp-tree-ha/ha_integration/custom_components/esp_tree/light.py`

### Bridge Reference: What MQTT Already Does

**State JSON** (from `build_light_state_json`):
```json
{
  "state": true,
  "color_mode": "rgb",
  "brightness": 128,
  "color": {"r": 255, "g": 0, "b": 0},
  "color_temp": 300,
  "white": 0,
  "effect": "None"
}
```

**Command JSON** (from `decode_command_payload_`):
```json
{
  "state": "ON",
  "brightness": 200,
  "color": {"r": 255, "g": 0, "b": 0},
  "color_temp": 300,
  "white": 128,
  "effect": "rainbow"
}
```

**Entity options**:
- `color_modes=brightness|rgb|color_temp` — pipe-separated list of supported color modes
- `effects=rainbow|strobe|pulse` — pipe-separated list of effect names
- `min_mireds=153` — minimum color temperature in mireds
- `max_mireds=500` — maximum color temperature in mireds

### Step 2.1: Create `light.py`

```python
from __future__ import annotations

import json
from homeassistant.components.light import (
    LightEntity,
    ColorMode,
    ATTR_BRIGHTNESS,
    ATTR_COLOR_MODE,
    ATTR_COLOR_TEMP,
    ATTR_EFFECT,
    ATTR_RGB_COLOR,
    ATTR_WHITE,
    ATTR_TRANSITION,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.util.color import color_temperature_mired_to_kelvin

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity

_COLOR_MODE_MAP = {
    "onoff": ColorMode.ONOFF,
    "brightness": ColorMode.BRIGHTNESS,
    "white": ColorMode.WHITE,
    "color_temp": ColorMode.COLOR_TEMP,
    "rgb": ColorMode.RGB,
    "rgbw": ColorMode.RGBW,
    "rgbww": ColorMode.RGBWW,
    "xy": ColorMode.XY,
}

def _parse_options(raw: str) -> dict:
    result = {"color_modes": [], "effects": [], "min_mireds": None, "max_mireds": None}
    for part in raw.split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        if k == "color_modes":
            result["color_modes"] = [m.strip() for m in v.replace(",", "|").split("|") if m.strip()]
        elif k == "effects":
            result["effects"] = [e.strip() for e in v.replace(",", "|").split("|") if e.strip()]
        elif k == "min_mireds":
            try: result["min_mireds"] = int(v)
            except ValueError: pass
        elif k == "max_mireds":
            try: result["max_mireds"] = int(v)
            except ValueError: pass
    return result

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    seen: set[str] = set()
    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeLight(model)])
    get_runtime(hass).register_platform("light", add, entry.entry_id if entry.data.get("type") == "remote" else None)

class EspTreeLight(EspTreeEntity, LightEntity):
    def __init__(self, model: EntityModel) -> None:
        super().__init__(model)
        opts = _parse_options(model.options_json)
        self._color_modes = [_COLOR_MODE_MAP.get(m, ColorMode.ONOFF) for m in opts["color_modes"]]
        self._effect_list = opts["effects"] + ["None"] if opts["effects"] else []
        self._min_mireds = opts["min_mireds"]
        self._max_mireds = opts["max_mireds"]
        self._state = False
        self._brightness = 0
        self._color_mode = None
        self._rgb = None
        self._color_temp = None
        self._white = None
        self._effect = "None"

    @property
    def is_on(self) -> bool:
        return self._state

    @property
    def brightness(self):
        return self._brightness

    @property
    def color_mode(self):
        return self._color_mode

    @property
    def supported_color_modes(self) -> set[ColorMode]:
        return set(self._color_modes) if self._color_modes else {ColorMode.ONOFF}

    @property
    def rgb_color(self):
        return self._rgb

    @property
    def color_temp(self):
        return self._color_temp

    @property
    def min_mireds(self):
        return self._min_mireds or 153

    @property
    def max_mireds(self):
        return self._max_mireds or 500

    @property
    def effect(self):
        return self._effect

    @property
    def effect_list(self):
        return self._effect_list or None

    @property
    def _handle_state_update(self):
        # Called via subscribe_entity → async_write_ha_state
        # Parse model.value (string_value = JSON from state_value_json)
        pass

    async def async_added_to_hass(self) -> None:
        runtime = get_runtime(self.hass)
        self.async_on_remove(
            runtime.subscribe_entity(
                self.model.remote_mac, self.model.object_id, self._process_state
            )
        )

    def _process_state(self) -> None:
        raw = self.model.value
        if isinstance(raw, str):
            try:
                data = json.loads(raw)
                self._state = data.get("state", False)
                cm = data.get("color_mode")
                self._color_mode = _COLOR_MODE_MAP.get(cm) if cm else None
                self._brightness = data.get("brightness", 0)
                color = data.get("color")
                self._rgb = (color["r"], color["g"], color["b"]) if color else None
                self._color_temp = data.get("color_temp")
                self._white = data.get("white")
                self._effect = data.get("effect", "None")
            except (json.JSONDecodeError, KeyError):
                self._state = bool(raw)
        elif isinstance(raw, bool):
            self._state = raw
        self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        payload = {"state": "ON"}
        if ATTR_BRIGHTNESS in kwargs:
            payload["brightness"] = kwargs[ATTR_BRIGHTNESS]
        if ATTR_COLOR_MODE in kwargs:
            payload["color_mode"] = kwargs[ATTR_COLOR_MODE]
        if ATTR_RGB_COLOR in kwargs:
            r, g, b = kwargs[ATTR_RGB_COLOR]
            payload["color"] = {"r": r, "g": g, "b": b}
        if ATTR_COLOR_TEMP in kwargs:
            payload["color_temp"] = kwargs[ATTR_COLOR_TEMP]
        if ATTR_WHITE in kwargs:
            payload["white"] = kwargs[ATTR_WHITE]
        if ATTR_EFFECT in kwargs:
            payload["effect"] = kwargs[ATTR_EFFECT]
        if ATTR_TRANSITION in kwargs:
            payload["transition"] = kwargs[ATTR_TRANSITION]
        import json as _json
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "turn_on",
            payload=_json.dumps(payload),
        )

    async def async_turn_off(self, **kwargs) -> None:
        payload = {"state": "OFF"}
        if ATTR_TRANSITION in kwargs:
            payload["transition"] = kwargs[ATTR_TRANSITION]
        import json as _json
        await get_runtime(self.hass).send_command(
            self.model.remote_mac, self.model.object_id, "turn_off",
            payload=_json.dumps(payload),
        )
```

### Key Design Points

- **State parsing**: `_process_state()` parses JSON from `model.value` (which is `string_value` from proto). For entities where `model.value` is a simple bool (e.g., if bridge sends `bool_value` by mistake), handle that gracefully.
- **Command construction**: `async_turn_on` builds a JSON dict matching `decode_command_payload_` input format and passes it as a `string_value` arg named `"payload"`. This arrives at the bridge as `request.args[0].value` which, with Phase 0's change, overrides the simple `"ON"` mapping.
- **Color modes**: Parsed from `options_json` `color_modes=brightness|rgb|color_temp`.
- **Effects**: Parsed from `options_json` `effects=effect1|effect2`.
- **Color temp range**: Parsed from `options_json` `min_mireds`, `max_mireds`.

---

## Phase 3: Fan Entity

**File to create:** `esp-tree-ha/ha_integration/custom_components/esp_tree/fan.py`

### Bridge Reference

**State JSON** (from `build_fan_state_json`):
```json
{
  "state": true,
  "speed_level": 2,
  "oscillating": false,
  "direction": "forward"
}
```

**Command format** (4-byte wire): `[state, level, oscillation, direction]`
MQTT command path uses separate sub-topics for speed/oscillation/direction. For proto, we send JSON.

**Entity options**:
- `speed_count=N` — enables percentage-based speed (N discrete speeds)
- `oscillation=1` — enables oscillation
- `direction=1` — enables direction control

### Step 3.1: Create `fan.py`

Follow same pattern as light. Key properties:
- `supported_features`: `SUPPORT_SET_SPEED` if `speed_count > 0`, `SUPPORT_OSCILLATE` if oscillation, `SUPPORT_DIRECTION` if direction
- `percentage`: derived from `speed_level * 100 / speed_count`
- `oscillating`: from state JSON
- `current_direction`: from state JSON
- Commands: `async_turn_on`, `async_turn_off`, `async_set_percentage`, `async_oscillate`, `async_set_direction`

Send commands as JSON matching bridge's expected format:
```json
{"state": "ON", "speed_level": 2, "oscillating": false, "direction": "forward"}
```

---

## Phase 4: Lock Entity

**File to create:** `esp-tree-ha/ha_integration/custom_components/esp_tree/lock.py`

### Bridge Reference

**State**: `bool_value` from proto — `True` = LOCKED, `False` = UNLOCKED
Note: bridge's JAMMED state (value=2) maps to `bool_value=True` in proto (value != 0). We lose the JAMMED distinction in the proto path. Need to track this.

**Command**: `send_command(mac, id, "lock")` / `send_command(mac, id, "unlock")`

### Step 4.1: Create `lock.py`

Key considerations:
- The proto `bool_value` encodes both LOCKED and JAMMED as `True`. To distinguish JAMMED, we need the string_value JSON path (alarm uses this pattern). Check if bridge sends lock as `string_value` JSON or `bool_value` for the runtime API.
- Actually, re-checking: `runtime_write_entity_state_` explicitly puts LOCK in the `bool_value` path: `w.boolean(10, !value.empty() && value[0] != 0)`. This means value[0]=1 (LOCKED) and value[0]=2 (JAMMED) both map to `True`.
- **Decision**: For V1, treat `bool_value=True` as LOCKED. JAMMED distinction is lost in proto path — document as known limitation. If needed later, extend proto or use string_value.

Commands are simple — use existing string command mapping:
```python
async def async_lock(self, **kwargs):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "lock")

async def async_unlock(self, **kwargs):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "unlock")
```

---

## Phase 5: Cover Entity

**File to create:** `esp-tree-ha/ha_integration/custom_components/esp_tree/cover.py`

### Bridge Reference

**State**: `int_value` from proto — position 0-100

**Command** (2-byte wire): `[command, position]`
- `open` → `[1, 100]`
- `close` → `[2, 0]`
- `stop` → `[3, 0]`
- `set_position` → `[0, N]`

Proto command path: use simple command names for open/close/stop, value=position for set_position.

### Step 5.1: Create `cover.py`

Key properties:
- `current_cover_position`: `self.model.value` (int 0-100)
- `is_opening` / `is_closing`: not directly available from bridge state (would need previous position comparison — defer for V1, set both False)
- `is_closed`: `position == 0`

Commands:
```python
async def async_open_cover(self, **kwargs):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "open")

async def async_close_cover(self, **kwargs):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "close")

async def async_stop_cover(self, **kwargs):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "stop")

async def async_set_cover_position(self, position: int):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "set_value", value=position)
```

---

## Phase 6: Valve Entity

**File to create:** `esp-tree-ha/ha_integration/custom_components/esp_tree/valve.py`

### Bridge Reference

Identical to cover in state/command format. Only difference: HA `ValveEntity` (2024.7+) vs `CoverEntity`.

**State**: `int_value` from proto — position 0-100
**Command**: Same 2-byte wire format as cover: open/close/stop/set_position.

### Step 6.1: Create `valve.py`

Nearly identical to cover.py but subclass `ValveEntity`. Key properties:
- `current_valve_position`: `self.model.value` (int 0-100)
- `is_closed`: `position == 0`
- `is_opening` / `is_closing`: defer for V1

Commands: same as cover — `open`, `close`, `stop`, `set_value` with position.

---

## Phase 7: Alarm Control Panel Entity

**File to create:** `esp-tree-ha/ha_integration/custom_components/esp_tree/alarm_control_panel.py`

### Bridge Reference

**State**: `string_value` from proto (JSON from `state_value_json`)

For alarm, `state_value_json` outputs just a plain state string (not a JSON object):
```
"disarmed" | "armed_home" | "armed_away" | "armed_night" | "armed_vacation" | "armed_custom_bypass" | "triggered" | "pending" | "arming" | "disarming"
```

**Command**: JSON payload `{"state": "ARM_HOME"}` or plain string `"ARM_HOME"` etc.

**Entity options**:
- `features=N` — uint32 bitmask: 0x01=arm_home, 0x02=arm_away, 0x04=arm_night, 0x08=trigger, 0x10=arm_custom_bypass, 0x20=arm_vacation
- `requires_code=1` — requires code to disarm (V1: ignored, no code support)
- `requires_code_to_arm=1` — requires code to arm (V1: ignored)

### Step 7.1: Create `alarm_control_panel.py`

Key properties:
- `state`: map from bridge state string to HA `AlarmControlPanelState`
- `supported_features`: parsed from `features` bitmask option
- `code_arm_required`: from `requires_code_to_arm` option (but no code handling in V1)

Commands:
```python
async def async_alarm_arm_home(self, code=None):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_home")

async def async_alarm_arm_away(self, code=None):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_away")

async def async_alarm_arm_night(self, code=None):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_night")

async def async_alarm_arm_vacation(self, code=None):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "arm_vacation")

async def async_alarm_trigger(self, code=None):
    await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "trigger")
```

For disarm (V2), would send JSON: `{"state": "DISARM", "code": "1234"}`.

---

## Phase 8: Event Entity

**File to create:** `esp-tree-ha/ha_integration/custom_components/esp_tree/event.py`

### Bridge Reference

**State**: `string_value` from proto — event type as plain string (e.g., `"button_pressed"`)
MQTT publishes JSON: `{"event_type": "button_pressed"}` but proto just gives the raw string.

**Command**: None (read-only entity)

**Entity options**:
- `options=type1|type2|type3` — pipe-separated list of valid event types

### Step 8.1: Create `event.py`

Key properties:
- `event_types`: parsed from `options_json` `options=...`
- `_trigger_event`: called on state update when event type changes

The entity should fire a HA event when a new event type is received from the bridge. Override state subscription to detect event type changes:

```python
class EspTreeEvent(EspTreeEntity, EventEntity):
    def __init__(self, model: EntityModel) -> None:
        super().__init__(model)
        self._last_event_type = None

    @property
    def event_types(self) -> list[str]:
        # parse from options_json
        ...

    async def async_added_to_hass(self) -> None:
        runtime = get_runtime(self.hass)
        self.async_on_remove(
            runtime.subscribe_entity(self.model.remote_mac, self.model.object_id, self._process_event)
        )

    def _process_event(self) -> None:
        event_type = self.model.value  # string_value from proto
        if event_type and event_type != self._last_event_type:
            self._last_event_type = event_type
            self._trigger_event(event_type)
        self.async_write_ha_state()
```

---

## Phase 9: State Update Handling — Edge Cases

### Problem: Current `async_write_ha_state` doesn't parse JSON

The existing entity base class subscribes to `subscribe_entity` with `self.async_write_ha_state` as callback. This works for scalar types where HA reads `self.model.value` directly in properties. For complex types (light, fan, alarm), the entity needs to parse JSON from `model.value` before HA reads the properties.

**Two approaches currently in use:**
1. Simple entities (switch, sensor): `subscribe_entity(..., self.async_write_ha_state)` — HA reads `model.value` in property getters
2. Complex entities (light, fan): Need custom callback that parses JSON first, then calls `async_write_ha_state`

**Decision**: Each complex entity overrides `async_added_to_hass` to use a custom callback (like `_process_state` / `_process_event` above) that parses the JSON, updates internal state variables, then calls `self.async_write_ha_state`.

Simple entities (lock, cover, valve) can use the default subscription since `model.value` is a scalar.

### Proto Encoding Mismatch Documentation

| Entity Type | `native_type_for_type` | Actual proto field | HA should read |
|---|---|---|---|
| light | "int" | `string_value` (JSON) | Parse JSON from `model.value` |
| fan | "int" | `string_value` (JSON) | Parse JSON from `model.value` |
| cover | "int" | `int_value` (0-100) | Read `model.value` as int |
| valve | "int" | `int_value` (0-100) | Read `model.value` as int |
| lock | "int" | `bool_value` | Read `model.value` as bool |
| alarm | "int" | `string_value` (JSON) | Parse state string from `model.value` |
| event | "int" | `string_value` | Read `model.value` as string |

Note: `native_type_for_type` is inaccurate for these types. The bridge's `runtime_write_entity_state_` is the source of truth for actual proto encoding, not `native_type_for_type`.

---

## Phase 10: Unit Tests

### Test Structure

Create `tests/` directory (or add to existing) with one test file per entity type.

### Step 10.1: Test helpers

Create shared test utilities:
- Mock `EntityModel` with configurable `platform`, `options_json`, `value`, `available`
- Mock `bridge_runtime` with `send_command` capture
- Mock `HomeAssistant` instance

### Step 10.2: Per-entity tests

**`test_light.py`**:
- options_json parsing: color_modes, effects, mireds range
- State JSON parsing: brightness, color_mode, RGB, color_temp, effect
- Command construction: turn_on with brightness/color, turn_off
- Supported color modes mapping

**`test_fan.py`**:
- options_json parsing: speed_count, oscillation, direction
- State JSON parsing: state, speed_level, oscillating, direction
- Command construction: turn_on, set_percentage, oscillate, set_direction

**`test_lock.py`**:
- State from bool_value: True=LOCKED, False=UNLOCKED
- Commands: lock, unlock

**`test_cover.py`**:
- State from int_value: position 0-100
- Commands: open, close, stop, set_value
- is_closed when position==0

**`test_valve.py`**:
- Same as cover but ValveEntity

**`test_alarm_control_panel.py`**:
- options_json parsing: features bitmask
- State parsing: alarm state strings
- Commands: arm_home, arm_away, arm_night, arm_vacation, trigger
- supported_features mapping

**`test_event.py`**:
- options_json parsing: event_types list
- Event firing on state change
- No commands

---

## Phase 11: Integration Verification

### Step 11.1: Verify platform forwarding

After all files are created and `const.py` is updated:
1. Restart HA
2. Check that all 7 new entity types appear in the entity registry for a remote that declares those types
3. Verify entity capabilities are set correctly from options_json

### Step 11.2: Verify state updates

For each entity type:
1. Confirm state arrives from bridge via proto and entity updates in HA
2. Check light: brightness, color, color_temp, effect all display correctly
3. Check fan: speed, oscillation, direction
4. Check cover/valve: position 0-100
5. Check lock: locked/unlocked
6. Check alarm: state transitions
7. Check event: events fire

### Step 11.3: Verify commands

For each writable entity type:
1. Send command from HA UI
2. Verify `send_command` is called with correct args
3. Verify bridge receives and forwards to remote
4. Verify remote executes command and state updates back

---

## Known Limitations (V1)

| Limitation | Reason | Follow-up |
|---|---|---|
| Lock JAMMED state lost in proto path | `bool_value` can't distinguish LOCKED(1) from JAMMED(2) | Extend proto with per-type state or use string_value |
| Cover/Valve opening/closing state not available | Bridge only sends position, not movement direction | Track position changes over time |
| Alarm code/disarm not implemented | V1 is arm+trigger only | Add JSON command with code field |
| Climate/humidifier/dehumidifier/time/datetime | Bridge MQTT treats these as generic sensors | Requires bridge schema work first |
| `native_type_for_type` inaccuracy | Declares "int" for types that actually use string/bool | Document; fix in follow-up |
| light color_mode inference | Bridge may not always send color_mode in JSON | Infer from brightness/RGB/color_temp presence |

---

## Implementation Priority & Effort Estimate

| Phase | Entity | Effort | Dependencies |
|---|---|---|---|
| 0 | Bridge command handler | S | None |
| 1 | Platform wiring | S | None |
| 2 | Light | L | Phase 0, 1 |
| 3 | Fan | M | Phase 0, 1 |
| 4 | Lock | S | Phase 1 |
| 5 | Cover | S | Phase 1 |
| 6 | Valve | S | Phase 1 |
| 7 | Alarm | M | Phase 0, 1 |
| 8 | Event | S | Phase 1 |
| 9 | Edge cases | M | Phase 2-8 |
| 10 | Unit tests | L | Phase 2-8 |
| 11 | Integration verification | M | All |

S=Small (<1hr), M=Medium (1-3hr), L=Large (3-5hr)

**Total estimated effort**: ~15-20 hours

---

## File Impact Summary

### New Files (HA Integration)
- `esp-tree-ha/ha_integration/custom_components/esp_tree/light.py`
- `esp-tree-ha/ha_integration/custom_components/esp_tree/fan.py`
- `esp-tree-ha/ha_integration/custom_components/esp_tree/lock.py`
- `esp-tree-ha/ha_integration/custom_components/esp_tree/cover.py`
- `esp-tree-ha/ha_integration/custom_components/esp_tree/valve.py`
- `esp-tree-ha/ha_integration/custom_components/esp_tree/alarm_control_panel.py`
- `esp-tree-ha/ha_integration/custom_components/esp_tree/event.py`

### Modified Files (HA Integration)
- `esp-tree-ha/ha_integration/custom_components/esp_tree/const.py` — add 7 platforms to PLATFORMS

### Modified Files (Bridge Firmware)
- `ESPLR_V2/components/esp_tree_bridge/esp_tree_bridge.cpp` — modify `api_runtime_handle_command` for JSON arg passthrough

### No Changes
- `__init__.py` — platform forwarding is automatic via PLATFORMS list
- `bridge_runtime.py` — entity dispatch is already generic via `register_platform`
- `%AUTO` proto files — no schema changes needed
- `integration_client.py` — command sending already supports typed args
- `manifest.json` — no additional dependencies needed