# ESPNow Tree: Integration Roadmap & Protobuf API v2 Specification

> Status: Draft — ready for implementation
> Date: 2026-05-05

---

## 1. Overview

### Goal

A custom Home Assistant integration (`espnow_tree`) that creates proper HA devices and entities from ESP-NOW LR remote nodes, with real-time state updates and bidirectional entity control, communicating with the bridge via a new protobuf-based WebSocket API (v2).

### Key Decisions

| Decision | Choice |
|---|---|
| Integration↔bridge transport | 100% protobuf over WebSocket (`/espnow-tree/v2/ws`) |
| Add-on↔bridge transport | Unchanged — existing JSON WS (`/espnow-tree/v1/ws`) |
| Bridge concurrent clients | Two slots: v1 JSON (add-on) + v2 protobuf (integration) |
| Entity control | New `EntityCommand` protobuf message; bridge maps `entity_key` → `entity_index` → `send_command_to_leaf()` |
| OTA | Stays on v1 WS (add-on); not in protobuf API |
| Integration reads HA state | Yes — add-on can read integration's entities via Supervisor API |
| Remote firmware changes | None — command wire format unchanged |

### Architecture

```
┌──────────────────────┐    ┌──────────────────────────┐
│  Custom Integration   │    │  Add-on Container          │
│  (HA Core Python)    │    │  (FastAPI + Lit UI)        │
│                      │    │                            │
│  protobuf WS ─────────┼──>│  (reads HA state via     │
│  /espnow-tree/v2/ws   │    │   Supervisor API for      │
│                      │    │   topology info)           │
│  - Auth, topology     │    │                            │
│  - Schema, state      │    │  JSON WS ─────────────────┼──>
│  - Entity commands    │    │  /espnow-tree/v1/ws        │    │
│  - Config commands    │    │  - Auth, topology          │    │
│  - Real-time events   │    │  - OTA (binary chunks)     │    │
│                      │    │  - Config commands         │    │
└──────────────────────┘    └────────────────────────────┘
                    │                    │
                    ▼                    ▼
            ┌──────────────────────────────────────────┐
            │         Bridge ESP32                     │
            │                                          │
            │  v2 WS: protobuf (integration)           │
            │  v1 WS: JSON (add-on)                    │
            │  Both receive state/availability events  │
            │  v2 WS receives entity commands           │
            │  v1 WS retains OTA exclusivity           │
            │                                          │
            │  ESP-NOW radio ←→ Remote devices        │
            └──────────────────────────────────────────┘
```

### Data Flow Summary

| Data | Source | Path to HA |
|---|---|---|
| Topology | Bridge v2 WS → integration → HA device registry | Direct |
| Schema | Bridge v2 WS → integration → HA entity creation | Direct |
| Entity state | Bridge → `RemoteStateEvent` protobuf → integration → `async_write_ha_state()` | Direct, push |
| Availability | Bridge → `RemoteAvailabilityEvent` → integration → entity available/unavailable | Direct, push |
| Entity control | HA entity `async_turn_on()` → integration → `EntityCommand` protobuf → bridge → `send_command_to_leaf()` → ESP-NOW → remote | Direct |
| Config commands | HA service call → integration → `ConfigCommand` protobuf → bridge → remote | Direct |
| OTA | Add-on v1 WS → bridge → remote | Unchanged |
| Add-on UI topology | Add-on reads HA device/entity state via Supervisor API | Via HA |

---

## 2. Repository Structure

The integration lives alongside the add-on in this repo:

```
esphomenow-tree-ha/
├── repository.yaml                    # Add-on repository config
├── esphome-espnow-tree-ha/            # Add-on (unchanged)
│   ├── app/
│   ├── ui/
│   ├── config.yaml
│   └── ...
├── custom_components/                  # NEW — HA custom integration
│   └── espnow_tree/
│       ├── __init__.py
│       ├── manifest.json
│       ├── config_flow.py
│       ├── strings.json
│       ├── const.py
│       ├── coordinator.py
│       ├── proto/
│       │   ├── espnow_tree_v2.proto
│       │   └── espnow_tree_v2_pb2.py   # generated
│       ├── entity.py
│       ├── device.py
│       ├── sensor.py
│       ├── binary_sensor.py
│       ├── switch.py
│       ├── light.py
│       ├── fan.py
│       ├── number.py
│       ├── button.py
│       ├── cover.py
│       ├── valve.py
│       ├── lock.py
│       ├── select.py
│       ├── text.py
│       ├── alarm_control_panel.py
│       ├── event.py
│       └── services.yaml
├── docs/
│   └── ...
└── hacs.json                          # HACS repository config
```

HACS installation: users add this repo as a custom repository in HACS. The add-on is installed via the HA Add-on Store (separate). Both are in the same GitHub repo.

---

## 3. Protobuf API v2 Specification

### 3.1 Transport

- **Endpoint:** `ws://<bridge_host>:<bridge_port>/espnow-tree/v2/ws`
- **Protocol:** WebSocket with binary frames only (opcode 0x2). No text frames.
- **Envelope:** Every frame is a serialized `BridgeMessageV2` protobuf message.
- **Version field:** `v = 2` for all messages.
- **Max frame size:** 65536 bytes (matches v1).

### 3.2 Authentication

Same HMAC-SHA256 challenge-response as v1, but encoded as protobuf messages.

**Flow:**

1. Client opens WebSocket to `/espnow-tree/v2/ws`
2. Bridge sends `AuthChallenge` (no `id` field, unsolicited)
3. Client sends `AuthResponse` (no `id` field needed for auth)
4. Bridge sends `AuthOk` on success, or `Error` with code `auth_failed` on failure, then closes

**HMAC computation (identical to v1):**

```
hmac_input = "espnow-tree-ws|v2|<client>|<server_nonce>|<client_nonce>"
hmac = HMAC-SHA256(api_key_bytes, hmac_input_bytes).hexdigest()
```

The only difference from v1: the version string in the HMAC input is `v2` instead of `v1`.

**Client identifier:** `ha-integration` (distinguishes from `ha-addon` on v1).

After successful auth, the v2 client is in `AUTHENTICATED` state and may send requests and receive events.

### 3.3 Message Envelope

```protobuf
message BridgeMessageV2 {
  uint32 v = 1;           // Always 2
  string id = 2;          // Client-set request ID; required for requests, absent for unsolicited events
  oneof payload {
    // Auth (3 messages)
    AuthChallenge auth_challenge = 10;
    AuthResponse auth_response = 11;
    AuthOk auth_ok = 12;

    // Bridge info (2 messages)
    BridgeInfoRequest bridge_info = 20;
    BridgeInfoResult bridge_info_result = 21;

    // Topology (2 messages)
    TopologyRequest topology_get = 22;
    TopologySnapshot topology_snapshot = 23;

    // Schema (2 messages)
    SchemaRequest schema_get = 30;
    SchemaResult schema_result = 31;

    // State (6 messages)
    StateRequest state_get = 40;
    StateResult state_result = 41;
    StateSubscribe state_subscribe = 42;
    StateUnsubscribe state_unsubscribe = 43;
    StateSubscribed state_subscribed = 44;
    StateUnsubscribed state_unsubscribed = 45;

    // Command (4 messages)
    EntityCommand entity_command = 60;
    EntityCommandResult entity_command_result = 61;
    ConfigCommand config_command = 62;
    ConfigCommandResult config_command_result = 63;

    // Events — bridge → client, no id field (6 messages)
    RemoteStateEvent remote_state = 50;
    RemoteAvailabilityEvent remote_availability = 51;
    TopologyChangedEvent topology_changed = 52;
    SchemaChangedEvent schema_changed = 53;
    BridgeHeartbeat bridge_heartbeat = 54;
    MetadataChangedEvent metadata_changed = 55;

    // Error
    Error error = 99;
  }
}
```

### 3.4 Full Proto Messages

```protobuf
syntax = "proto3";
package espnow_tree.v2;

// ── Error ──

message Error {
  string code = 1;     // e.g. "auth_failed", "unknown_type", "node_not_found"
  string message = 2;  // Human-readable detail
}

// ── Auth ──

message AuthChallenge {
  string server_nonce = 1;
  uint32 min_version = 2;   // Minimum protocol version (2)
  uint32 max_version = 3;   // Maximum protocol version (2)
}

message AuthResponse {
  string client = 1;        // "ha-integration"
  string client_nonce = 2;  // Random hex string
  string hmac = 3;           // HMAC-SHA256 hex
}

message AuthOk {
  string name = 1;
  string mac = 2;
  string firmware_version = 3;
  string esphome_version = 4;
  uint32 api_version = 5;
}

// ── Bridge Info ──

message BridgeInfoRequest {}

message BridgeInfoResult {
  string name = 1;
  string mac = 2;
  string firmware_version = 3;
  string esphome_version = 4;
  uint32 api_version = 5;
  uint32 max_ws_chunk_size = 6;
}

// ── Topology ──

message TopologyRequest {
  map<string, string> known_schema_hashes = 1;  // mac → sha256:hex; omit unchanged nodes
}

message NodeInfo {
  string mac = 1;
  string node_key = 2;
  string device_unique_id = 3;
  string name = 4;
  string friendly_name = 5;
  string label = 6;
  bool online = 7;
  int32 rssi = 8;
  uint32 hops = 9;
  uint32 uptime_s = 10;
  string parent_mac = 11;
  bool can_relay = 12;
  bool relay_enabled = 13;
  uint32 direct_child_count = 14;
  uint32 total_child_count = 15;

  // Identity fields
  string esphome_name = 16;
  string manufacturer = 17;
  string model = 18;
  string sw_version = 19;
  string project_name = 20;
  string firmware_build_date = 21;
  string firmware_md5 = 22;
  string schema_hash = 23;
  uint32 chip_model = 24;     // espnow_field_type_t CHIP_TYPE_* value
  string network_id = 25;
  uint32 entity_count = 26;

  // Session fields
  bool route_v2_capable = 27;

  // Radio
  int32 parent_rssi = 28;
  uint32 last_seen_s = 29;
  uint32 offline_s = 30;
  string offline_reason = 31;
}

message TopologySnapshot {
  NodeInfo bridge = 1;
  repeated NodeInfo nodes = 2;
}

// ── Schema ──

message SchemaRequest {
  string mac = 1;
}

message EntityDescriptor {
  string key = 1;            // Persistent entity key (= entity_id if non-empty, else name slug)
  string entity_id = 2;      // Firmware-reported entity ID (may be empty for old remotes)
  string unique_id = 3;      // Constructed: "espnow_lr_<mac_key>_<object_id>"
  uint32 entity_index = 4;   // Transport-only index; do not use as persistent ID
  bool stable_identity = 5;  // true if entity_id is non-empty
  string platform = 6;       // "sensor", "switch", "light", "fan", etc.
  string name = 7;           // Human-readable name
  string unit = 8;           // Unit of measurement (may be empty)
  string native_type = 9;    // "float", "bool", "string", "int"
  string device_class = 10;  // HA device class hint (may be empty)
  string state_class = 11;   // HA state class hint (may be empty)
  string options = 12;       // JSON string: color_modes, effects, min/max, select options, etc.
}

message SchemaResult {
  string mac = 1;
  oneof schema_status {
    bool schema_null = 2;     // true if schema unavailable (node unknown or not yet sent)
  }
  string schema_hash = 3;
  bool complete = 4;
  uint32 total_entities = 5;
  repeated EntityDescriptor entities = 6;
}

// ── State ──

// State values are encoded as `bytes` fields. The encoding depends on the entity's `native_type`
// and `platform`, matching the bridge's existing wire format. See Section 4 for encoding details.

message StateRequest {
  string mac = 1;
}

message StateResult {
  string mac = 1;
  map<string, bytes> state = 2;  // entity_key → encoded value bytes
}

message StateSubscribe {
  string mac = 1;
}

message StateUnsubscribe {
  string mac = 1;
}

message StateSubscribed {
  string mac = 1;
}

message StateUnsubscribed {
  string mac = 1;
}

// ── Entity Command (NEW — bidirectional control) ──

// Client sends EntityCommand to change a remote entity's state.
// Value encoding matches the bridge's existing internal command wire format.
// See Section 4 for encoding details per platform.

message EntityCommand {
  string mac = 1;
  string entity_key = 2;   // Matches EntityDescriptor.key from schema
  bytes value = 3;           // Platform-specific encoded value
}

message EntityCommandResult {
  string mac = 1;
  string entity_key = 2;
  string result = 3;   // "ok", "busy", "rejected", "unsupported", "invalid_payload",
                        // "timeout", "no_session", "not_found"
}

// ── Config Command ──

message ConfigCommand {
  string mac = 1;
  string command = 2;           // "reboot", "heartbeat_interval", "force_rediscover",
                                  // "set_parent_mac", "relay"
  uint32 interval_seconds = 3;   // For heartbeat_interval (5-3600)
  string parent_mac = 4;         // For set_parent_mac
  bool clear_parent = 5;         // For set_parent_mac
  bool relay_enable = 6;         // For relay
}

message ConfigCommandResult {
  string mac = 1;
  string command = 2;
  string result = 3;   // "ok", "busy", "rejected", "unsupported", "invalid_payload",
                         // "timeout", "no_session", "not_remote"
}

// ── Events (bridge → client, unsolicited, no `id` field) ──

message RemoteStateEvent {
  string mac = 1;
  map<string, bytes> state = 2;  // entity_key → encoded value; delta (only changed keys)
}

message RemoteAvailabilityEvent {
  string mac = 1;
  bool online = 2;
  string reason = 3;       // "joined", "rejoined", "timeout", "evicted", "manual"
  int32 rssi = 4;
  uint32 hop_count = 5;
  uint32 offline_s = 6;
  string parent_mac = 7;
}

message TopologyChangedEvent {
  string reason = 1;       // "node_joined", "node_offline", "route_changed", "node_removed"
}

message SchemaChangedEvent {
  string mac = 1;
  string schema_hash = 2;  // New schema hash; empty/null if schema was invalidated
}

message MetadataChangedEvent {
  string mac = 1;
  // Future: name, label, firmware version changes
}

message BridgeHeartbeat {
  uint64 uptime_ms = 1;
}
```

### 3.5 Request-Response Pattern

Client-initiated requests include an `id` field. The bridge responds with a message whose type corresponds to the request, echoing the same `id`. If the bridge cannot process the request, it returns an `Error` message with the request's `id`.

Unsolicited events (heartbeat, remote_state, remote_availability, topology_changed, schema_changed) never have an `id` field.

**Request → Response mapping:**

| Request | Response |
|---|---|
| `bridge_info` | `bridge_info_result` |
| `topology_get` | `topology_snapshot` |
| `schema_get` | `schema_result` |
| `state_get` | `state_result` |
| `state_subscribe` | `state_subscribed` |
| `state_unsubscribe` | `state_unsubscribed` |
| `entity_command` | `entity_command_result` |
| `config_command` | `config_command_result` |

### 3.6 State Subscription Model

Identical to v1 semantics:

- `StateSubscribe` requests push events for a specific MAC. Idempotent.
- `RemoteStateEvent` is only sent for subscribed MACs.
- `RemoteAvailabilityEvent`, `TopologyChangedEvent`, `SchemaChangedEvent`, `BridgeHeartbeat` are sent to all authenticated clients regardless of subscription.
- Subscriptions are cleared on disconnect.
- Subscribing to an unknown or offline MAC is accepted silently; events will flow when the node appears.

**Reconnection workflow for the integration:**

1. Connect to `/espnow-tree/v2/ws`
2. Authenticate
3. Send `bridge_info` (verify version)
4. Send `topology_get` (with `known_schema_hashes` if available)
5. For each online node: send `schema_get`, then `state_subscribe`
6. Event loop: handle `remote_state`, `remote_availability`, `topology_changed`, `schema_changed`
7. On `topology_changed`: send `topology_get` after 500ms debounce
8. On `schema_changed`: send `schema_get` for that MAC, update entities
9. On `remote_availability` with `online=true` for new node: send `schema_get`, then `state_subscribe`
10. On `remote_availability` with `online=false`: mark entities unavailable (keep subscribed)

### 3.7 Error Codes

Same set as v1:

| Code | Meaning |
|---|---|
| `auth_failed` | HMAC verification failed |
| `invalid_envelope` | Protobuf parse error or missing required field |
| `unsupported_version` | Client version not in bridge's supported range |
| `unknown_type` | Unrecognized payload variant in oneof |
| `invalid_payload` | Valid protobuf but invalid field values |
| `bridge_not_ready` | Bridge not available |
| `node_not_found` | MAC not in topology |
| `remote_not_found` | MAC known but no active session |
| `ota_busy` | Not applicable in v2 (OTA is v1 only) |
| `client_already_connected` | v2 slot already occupied |

---

## 4. Entity Command Value Encoding

The `EntityCommand.value` bytes field uses the same binary encoding the bridge uses internally for MQTT commands. The bridge's `decode_command_payload_()` function already handles this format; the v2 handler will do the same lookup and then call `send_command_to_leaf()`.

### Encoding by Platform

| Platform | `value` bytes | Example |
|---|---|---|
| **sensor** | Not commandable; EntityCommand returns `unsupported` | — |
| **binary_sensor** | Not commandable | — |
| **switch** | 1 byte: `1` = on, `0` = off | `\x01` |
| **button** | 1 byte: `\x01` (trigger) | `\x01` |
| **number** | 4 bytes: IEEE 754 float LE | `\xcd\xcc\x8c\x3f` = 1.1 |
| **text** | Raw UTF-8 bytes | `hello` |
| **text_sensor** | Not commandable | — |
| **light** | 9 bytes: `[state, brightness, hue, saturation, effect_idx, color_mode_lo, color_mode_hi, color_temp_lo, color_temp_hi, white]` | `\x01\xff\x00\xff\x00\x00\x00\x00\x00\x00` = on, brightness 255, hue 0, sat 255 |
| **fan** | 4 bytes: `[state, speed_level, oscillating, direction]` | `\x01\x02\x00\x00` = on, speed 2, no oscillation, forward |
| **cover** | 2 bytes: `[command, position]` where command: 0=set_position, 1=open, 2=close, 3=stop; position: 0-100 | `\x00\x4b` = set position 75% |
| **valve** | Same as cover | `\x01\x00` = open |
| **lock** | 1 byte: `1` = lock, `0` = unlock | `\x01` |
| **select** | 1 byte: option index (0-based) | `\x02` = third option |
| **alarm_control_panel** | 1+ bytes: `[command_code, optional_pin_bytes...]` where command: 0=disarm, 1=arm_home, 2=arm_away, 3=arm_night, 4=arm_vacation, 5=arm_custom_bypass, 6=triggered, 7=pending, 8=arming | `\x01` = arm_home |
| **event** | Not commandable | — |

### Light Value Fields

| Byte offset | Field | Type | Notes |
|---|---|---|---|
| 0 | state | bool | on/off |
| 1 | brightness | uint8 | 0-255 |
| 2 | hue | uint8 | 0-255 (HSV hue) |
| 3 | saturation | uint8 | 0-255 (HSV saturation) |
| 4 | effect_index | uint8 | 0=None |
| 5-6 | color_mode | uint16 LE | 0=brightness, 1=rgb, 2=color_temp, 3=rgbw, 4=rgbww, 5=white |
| 7-8 | color_temp | uint16 LE | mired |
| 9+ | white | uint8 | 0-255 (optional, present if white channel used) |

The integration can also send partial light commands by setting only the relevant fields and noting that missing fields mean "don't change." The bridge uses `entity_options` from the schema to determine which color modes and features are available.

### State Value Encoding (bridge → integration)

Same binary encoding in `RemoteStateEvent.state` and `StateResult.state` maps. The integration decodes based on the entity's `platform` and `native_type` from its schema:

| Platform | `bytes` decoding |
|---|---|
| sensor (float) | 4-byte IEEE 754 float LE |
| sensor (int) | variable-length integer |
| switch / binary_sensor / button | 1 byte: `\x01` or `\x00` |
| number | 4-byte float LE |
| text / text_sensor / event | raw UTF-8 |
| light | JSON object stringified as bytes (see v1 spec for format) |
| fan | JSON object stringified as bytes |
| cover / valve | 1 byte: integer 0-100 |
| lock | 1 byte: `\x01`=LOCKED, `\x00`=UNLOCKED, `\x02`=JAMMED |
| select | 1 byte: option index |
| alarm_control_panel | ASCII string bytes: "disarmed", "armed_home", etc. |

**Note:** For light, fan, and alarm types, the bridge sends JSON strings in state. The protobuf API sends these JSON strings as `bytes` (raw UTF-8). The integration parses them as JSON on the Python side.

---

## 5. Bridge Firmware Changes

### 5.1 Second WebSocket Endpoint

Add `/espnow-tree/v2/ws` as a second WebSocket handler on the same HTTP server. This is a new `BridgeApiProtoWsTransport` class, modeled after `BridgeApiWsTransport`, but:

- Accepts binary frames only (opcode 0x2). Text frames receive an `Error` and close.
- Serializes/deserializes `BridgeMessageV2` protobuf.
- Uses nanopb for C-side encode/decode.

File changes:
- **New** `bridge_api_proto_ws.h` / `bridge_api_proto_ws.cpp` — WS transport for protobuf
- **New** `bridge_api_proto_router.h` / `bridge_api_proto_router.cpp` — Protobuf message handler
- **New** `bridge_api_proto_messages.h` / `bridge_api_proto_messages.cpp` — Protobuf message builders
- **Modified** `espnow_lr_bridge.cpp` — `register_v2_proto_ws_handlers_()` to register the endpoint

### 5.2 Second Client Session

The bridge needs two client slots:

```cpp
struct BridgeClients {
  ClientSession v1;  // JSON WS (/espnow-tree/v1/ws)
  ClientSession v2;  // Protobuf WS (/espnow-tree/v2/ws)
};
```

- Each slot has independent auth state, subscriptions, and client ID.
- A second client connecting to the same endpoint returns 409 Conflict (existing behavior).
- A v2 client connecting when v1 is active is permitted (separate slot).
- State push events (`remote_state`, `remote_availability`) are sent to both clients according to their individual subscriptions.
- Topology and heartbeat events are sent to both clients.
- `EntityCommand` and `ConfigCommand` are accepted on both endpoints (v1 JSON `node.config`, v2 protobuf).
- OTA is v1-only; v2 client attempting OTA-related messages gets `Error` with code `unsupported`.

### 5.3 EntityCommand Handler

New handler in `bridge_api_proto_router.cpp`:

```cpp
void BridgeApiProtoRouter::handle_entity_command_(uint32_t client_id, const EntityCommand &cmd) {
    // 1. Normalize MAC
    // 2. Look up session for mac → BridgeSession*
    // 3. Look up entity_key in session->schema_entities → find entity_index + entity_type
    // 4. Validate value bytes length for entity_type
    // 5. Call protocol_.send_command_to_leaf(mac, entity_index, value_bytes)
    // 6. Send EntityCommandResult with "ok" (or error: "no_session", "not_found", etc.)
}
```

This reuses the existing `BridgeProtocol::send_command_to_leaf()` path. No changes to radio protocol, encryption, or remote firmware.

### 5.4 Event Broadcasting to v2 Client

When the bridge's `BridgeProtocol` processes incoming ESP-NOW frames and generates events, the existing MQTT publish code already has hooks. The v2 router needs similar hooks:

- **`remote.state`** → When a state fragment is assembled and the MQTT publisher fires, also check v2 client subscriptions and send a `RemoteStateEvent` protobuf if the v2 client is subscribed to that MAC.
- **`remote.availability`** → Same pattern as v1: send `RemoteAvailabilityEvent` to both v1 and v2.
- **`topology.changed`** → Same: send `TopologyChangedEvent` to both.
- **`schema_changed`** → Send `SchemaChangedEvent` to both.
- **`bridge.heartbeat`** → Periodic `BridgeHeartbeat` to v2 client (v1 already has its own).

Implementation: add a `proto_outbound_` callback interface (mirroring `outbound_` for v1) that the bridge calls alongside the MQTT and v1 WS publish paths.

### 5.5 State Value Serialization for Protobuf

For `StateResult` and `RemoteStateEvent`, the bridge needs to serialize entity state values into the protobuf `bytes` format. This reuses the existing `state_value_json()` function's logic but outputs raw bytes instead of JSON:

| Type | Bytes encoding |
|---|---|
| float (sensor, number) | 4 bytes IEEE 754 LE |
| bool (switch, binary, button) | 1 byte `\x01` or `\x00` |
| string (text, text_sensor, event, alarm) | UTF-8 bytes |
| int (cover, valve, select) | 1 byte unsigned |
| light object | JSON UTF-8 bytes (same as v1) |
| fan object | JSON UTF-8 bytes (same as v1) |

**Pragmatic decision:** For complex composite types (light, fan), output the same JSON string but as protobuf `bytes` instead of a JSON string value. The integration parses the JSON on the Python side. This avoids duplicating the complex light/fan serialization logic in a new format.

### 5.6 Summary of Bridge File Changes

| File | Change |
|---|---|
| `bridge_api_proto_ws.h/cpp` | **New** — v2 WS transport (connect, auth, read loop, send) |
| `bridge_api_proto_router.h/cpp` | **New** — protobuf message dispatch and handlers |
| `bridge_api_proto_messages.h/cpp` | **New** — protobuf message construction helpers |
| `bridge_api_types.h` | Add `PROTO_WS_PATH`, `kProtoWebSocketPath` constant |
| `espnow_lr_bridge.h` | Add second `ClientSession` slot; add `BridgeApiProtoWsTransport* proto_ws_`; add `register_v2_proto_ws_handlers_()` |
| `espnow_lr_bridge.cpp` | Register v2 WS endpoint; add event broadcast hooks for v2 client; add `handle_v2_entity_command_()` |
| `bridge_protocol.h/cpp` | No changes — `send_command_to_leaf()` is already public |
| `bridge_api_ws.cpp` | Refactor event broadcast to call both v1 and v2 outbound interfaces |
| `espnow_lr_common/` | No changes to protocol, types, or radio code |
| `espnow_lr_remote/` | **No changes** — remote firmware is untouched |

### 5.7 No Remote/Radio Changes

The ESP-NOW radio protocol, frame format, encryption, session management, and remote firmware are all unchanged. The v2 protobuf API is purely a bridge-side WS translation layer. Commands flow through the same `send_command_to_leaf()` path that MQTT already uses. State values are encoded identically on the wire to remotes.

---

## 6. Custom Integration Design

### 6.1 Coordinator

The `EspnowTreeCoordinator` is the central WebSocket client that manages the bridge connection, maintains topology and state caches, and dispatches updates to entity platforms.

```python
class EspnowTreeCoordinator:
    """Manages protobuf WS connection to bridge and dispatches events."""

    def __init__(self, hass, host, port, api_key):
        self.hass = hass
        self.host = host
        self.port = port
        self.api_key = api_key
        self._ws = None  # websockets.WebSocketClientProtocol
        self._connected = False
        self._authenticated = False
        self._request_id = 0
        self._pending_requests: dict[str, asyncio.Future] = {}

        # Caches
        self._topology: dict | None = None        # TopologySnapshot dict
        self._schemas: dict[str, dict] = {}         # mac_key → SchemaResult dict
        self._states: dict[str, dict] = {}           # mac_key → {entity_key: bytes}
        self._devices: dict[str, EspNowDevice] = {}  # mac_key → device info

        # Entity management
        self._entity_platforms: dict[str, Callable] = {}  # platform → async_add_entities
        self._entity_registry: dict[str, EspNowEntity] = {}  # unique_id → entity

    async def start(self):
        """Connect, authenticate, subscribe, enter event loop."""

    async def stop(self):
        """Disconnect and cleanup."""

    async def _auth_flow(self):
        """HMAC-SHA256 challenge-response."""

    async def _message_loop(self):
        """Read protobuf messages, dispatch to handlers."""

    # Request methods
    async def get_topology(self, known_hashes=None) -> dict:
    async def get_schema(self, mac) -> dict:
    async def get_state(self, mac) -> dict:
    async def subscribe_state(self, mac) -> None:
    async def unsubscribe_state(self, mac) -> None:
    async def send_entity_command(self, mac, entity_key, value: bytes) -> str:
    async def send_config_command(self, mac, command, **params) -> str:

    # Event handlers (called from message loop)
    async def _on_remote_state(self, event: RemoteStateEvent):
        """Update state cache, find affected entities, call async_write_ha_state()."""

    async def _on_remote_availability(self, event: RemoteAvailabilityEvent):
        """Update device online/offline status."""

    async def _on_topology_changed(self, event: TopologyChangedEvent):
        """Refresh topology, update devices, create/remove entities."""

    async def _on_schema_changed(self, event: SchemaChangedEvent):
        """Re-fetch schema for MAC, update entities."""

    # Device/entity management
    async def _sync_devices_and_entities(self):
        """Create HA devices and entities from topology + schemas."""

    def get_state(self, mac, entity_key) -> bytes | None:
        """Get cached state value for an entity."""

    def is_available(self, mac) -> bool:
        """Check if device is online."""
```

### 6.2 Config Flow

```python
class EspnowTreeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_hassio(self, discovery_info):
        """Auto-discovered via Supervisor when add-on signals."""
        host = discovery_info["host"]
        port = discovery_info["port"]
        await self.async_set_unique_id(f"{host}:{port}")
        self._abort_if_unique_id_configured()
        return await self.async_step_confirm()

    async def async_step_user(self, user_input=None):
        """Manual host/port/api_key entry."""
        # Validate by connecting + authenticating

    async def async_step_confirm(self, user_input=None):
        """Show discovered bridge info, user confirms."""
```

### 6.3 Device and Entity Creation

**Device creation from topology:**

```python
DeviceInfo(
    identifiers={(DOMAIN, mac_key)},
    name=friendly_name or name or mac_key,
    manufacturer=manufacturer or "ESPHome",
    model=model or "espnow_lr_remote",
    sw_version=project_version,
    via_device=(DOMAIN, bridge_mac_key),  # All remotes linked to bridge device
)
```

The bridge itself is also a device:

```python
DeviceInfo(
    identifiers={(DOMAIN, bridge_mac_key)},
    name=bridge_name,
    manufacturer="ESPHome",
    model="espnow_lr_bridge",
    sw_version=bridge_firmware_version,
)
```

**Entity creation from schema:**

For each `EntityDescriptor` in a node's schema, create the appropriate HA entity:

| Schema `platform` | HA Platform | Entity Class |
|---|---|---|
| `sensor` | `sensor` | `EspNowSensor` |
| `binary_sensor` | `binary_sensor` | `EspNowBinarySensor` |
| `switch` | `switch` | `EspNowSwitch` |
| `light` | `light` | `EspNowLight` |
| `fan` | `fan` | `EspNowFan` |
| `number` | `number` | `EspNowNumber` |
| `button` | `button` | `EspNowButton` |
| `cover` | `cover` | `EspNowCover` |
| `valve` | `valve` | `EspNowValve` |
| `lock` | `lock` | `EspNowLock` |
| `alarm_control_panel` | `alarm_control_panel` | `EspNowAlarm` |
| `select` | `select` | `EspNowSelect` |
| `text` | `text` | `EspNowText` |
| `event` | `event` | `EspNowEvent` |

Plus diagnostic entities for each device (from topology, not schema):

| Entity | HA Platform | Unique ID |
|---|---|---|
| RSSI | `sensor` (diagnostic) | `<mac>_rssi` |
| Signal Hops | `sensor` (diagnostic) | `<mac>_hops` |
| Uptime | `sensor` (diagnostic) | `<mac>_uptime` |
| Online | `binary_sensor` (diagnostic) | `<mac>_online` |

**Entity base class:**

```python
class EspNowEntity(Entity):
    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, coordinator, mac, entity_desc):
        self._coordinator = coordinator
        self._mac = mac
        self._entity_key = entity_desc["key"]
        self._attr_unique_id = entity_desc["unique_id"]
        self._attr_name = entity_desc["name"]
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, mac_key(mac))},
            via_device=(DOMAIN, coordinator.bridge_mac_key),
        )

    @property
    def available(self):
        return self._coordinator.is_available(self._mac)

    async def async_added_to_hass(self):
        self._coordinator.register_entity(self._mac, self._entity_key, self)

    async def async_will_remove_from_hass(self):
        self._coordinator.unregister_entity(self._mac, self._entity_key, self)
```

**Command-capable entity example (switch):**

```python
class EspNowSwitch(SwitchEntity, EspNowEntity):
    @property
    def is_on(self):
        value = self._coordinator.get_state(self._mac, self._entity_key)
        return value is not None and value[0] == 1

    async def async_turn_on(self, **kwargs):
        await self._coordinator.send_entity_command(
            self._mac, self._entity_key, bytes([1])
        )

    async def async_turn_off(self, **kwargs):
        await self._coordinator.send_entity_command(
            self._mac, self._entity_key, bytes([0])
        )
```

### 6.4 HA Services

```yaml
# services.yaml
reboot:
  name: Reboot device
  target:
    device:
      integration: espnow_tree
  fields:
    mac:
      name: MAC address
      description: Device MAC address (optional if targeting device)
      example: "AA:BB:CC:DD:EE:FF"

set_heartbeat:
  name: Set heartbeat interval
  target:
    device:
      integration: espnow_tree
  fields:
    interval_seconds:
      name: Interval
      description: Heartbeat interval in seconds (5-3600)
      required: true
      selector:
        number:
          min: 5
          max: 3600

force_rediscover:
  name: Force rediscover device
  target:
    device:
      integration: espnow_tree

set_parent:
  name: Set parent node
  target:
    device:
      integration: espnow_tree
  fields:
    parent_mac:
      name: Parent MAC
      description: MAC address of parent node
      example: "AA:BB:CC:DD:EE:FF"
    clear:
      name: Clear parent
      description: Clear parent assignment

set_relay:
  name: Enable/disable relay
  target:
    device:
      integration: espnow_tree
  fields:
    enable:
      name: Enable
      required: true
      selector:
        boolean:
```

### 6.5 Supervisor Discovery

When the add-on starts, it signals the Supervisor to trigger integration discovery:

```python
# In add-on startup (app/server.py)
import requests
requests.post("http://supervisor/discovery", json={
    "service": "espnow_tree",
    "config": {
        "host": bridge_host,
        "port": bridge_port,
        "api_key": bridge_api_key
    }
}, headers={"Authorization": f"Bearer {SUPERVISOR_TOKEN}"})
```

The integration's `async_step_hassio` is triggered by this discovery, auto-configuring the connection.

### 6.6 Requirements

`manifest.json`:

```json
{
    "domain": "espnow_tree",
    "name": "ESPNow Tree",
    "version": "0.1.0",
    "integration_type": "hub",
    "iot_class": "local_push",
    "config_flow": true,
    "dependencies": [],
    "codeowners": ["@ben"],
    "documentation": "https://github.com/local/esphome-espnow-tree-ha",
    "requirements": ["protobuf>=5.0.0", "websockets>=12.0"]
}
```

---

## 7. Implementation Phases

### Phase 1: Protobuf Schema & Codegen

**Steps:**
1. Create `custom_components/espnow_tree/proto/espnow_tree_v2.proto` with the full schema from Section 3
2. Create `ESPLR_V2/components/espnow_lr_bridge/proto/espnow_tree_v2.proto` (same file, shared)
3. Generate Python bindings: `protoc --python_out=custom_components/espnow_tree/proto/ espnow_tree_v2.proto`
4. Generate nanopb C bindings for the bridge: `protoc --nanopb_out=ESPLR_V2/components/espnow_lr_bridge/proto/ espnow_tree_v2.proto`
5. Verify both Python and C generated code compiles
6. Write unit tests for serialization/deserialization round-trips

**Deliverable:** `.proto` file + generated `_pb2.py` + generated `.pb.h`/`.pb.c` that compile.

### Phase 2: Bridge — v2 WS Transport

**Steps:**
1. Create `bridge_api_proto_ws.h` and `bridge_api_proto_ws.cpp` modeling `BridgeApiWsTransport`
   - `register_with_web_server()` registers `/espnow-tree/v2/ws` endpoint
   - `run_socket_session()` accepts binary WS frames, rejects text frames
   - Read loop: parse `BridgeMessageV2` from received binary frame, dispatch to router
   - `send_proto()` serializes `BridgeMessageV2` and sends as binary WS frame
   - `close_client()` cleanup
2. Refactor `bridge_api_ws.cpp` to extract shared code where practical (auth challenge generation, WS upgrade handshake)
3. Create second `ClientSession` slot in `ESPNowLRBridge` — `v2_session_` alongside `v1_session_`
4. Modify connection acceptance: `/espnow-tree/v1/ws` checks `v1_session_`, `/espnow-tree/v2/ws` checks `v2_session_`
5. Write integration test: connect to v2 WS, send `AuthResponse`, receive `AuthOk`
6. Verify v1 WS still works concurrently

**Deliverable:** v2 WS endpoint that accepts binary connections, authenticates, and echoes `AuthOk`.

### Phase 3: Bridge — Protobuf Router & Request Handlers

**Steps:**
1. Create `bridge_api_proto_router.h` and `bridge_api_proto_router.cpp`
2. Implement `handle_authenticated_binary()` — decode `BridgeMessageV2`, dispatch by `payload` variant
3. Implement `handle_bridge_info_()` — build `BridgeInfoResult` from bridge state
4. Implement `handle_topology_get_()` — build `TopologySnapshot` from bridge sessions (reuse v1 logic)
5. Implement `handle_schema_get_()` — build `SchemaResult` from session schema entities (reuse v1 logic)
6. Implement `handle_state_get_()` — build `StateResult` from cached entity values (serialize to bytes per Section 4)
7. Implement `handle_state_subscribe_()` / `handle_state_unsubscribe_()` — add/remove MAC from v2 client's subscription set
8. Write tests for each handler with sample protobuf messages

**Deliverable:** v2 WS client can authenticate, request topology, schema, state, and subscribe.

### Phase 4: Bridge — Event Broadcasting to v2 Client

**Steps:**
1. Add `BridgeApiProtoRouter*` pointer to `ESPNowLRBridge`
2. In `ESPNowLRBridge::publish_mqtt_state_()` and `publish_mqtt_discovery_()` paths, add hooks that also push events to the v2 client:
   - `remote.state` → `RemoteStateEvent` protobuf → `send_proto()` to v2 client (if subscribed to MAC)
   - `remote.availability` → `RemoteAvailabilityEvent` to v2 client
   - `topology.changed` → `TopologyChangedEvent` to v2 client
   - `schema_changed` → `SchemaChangedEvent` to v2 client
3. Add heartbeat timer that sends `BridgeHeartbeat` to v2 client every ~30s
4. Test: connect v2 client, subscribe to a node, verify state events arrive when remote values change

**Deliverable:** v2 client receives real-time push events.

### Phase 5: Bridge — EntityCommand Handler

**Steps:**
1. Implement `handle_entity_command_()` in `BridgeApiProtoRouter`
2. Lookup flow: `entity_key` → scan `session.schema_entities` to find `entity_index` and `entity_type`
3. Validate value byte length against entity type (e.g., switch must be 1 byte, number must be 4 bytes)
4. Call `protocol_.send_command_to_leaf(mac, entity_index, value_bytes)`
5. Return `EntityCommandResult` with "ok" or error code
6. Handle edge cases: MAC not found → `not_found`, no session → `no_session`, entity not found → `not_found`
7. Test: send EntityCommand from v2 client, verify remote device receives_command and ACK flows back

**Deliverable:** Bidirectional entity control from integration through bridge to remote.

### Phase 6: Bridge — ConfigCommand Handler

**Steps:**
1. Implement `handle_config_command_()` in `BridgeApiProtoRouter`
2. Map protobuf `ConfigCommand.command` to existing `CFG_CMD_*` constants:
   - "reboot" → `CFG_CMD_REBOOT`
   - "heartbeat_interval" → `CFG_CMD_HEARTBEAT_INTERVAL` with `interval_seconds`
   - "force_rediscover" → `CFG_CMD_FORCE_REDISCOVER`
   - "set_parent_mac" → `CFG_CMD_SET_PARENT_MAC` with `parent_mac` bytes + `clear` flag
   - "relay" → `CFG_CMD_RELAY` with `relay_enable`
3. Reuse existing `send_config_to_leaf()` path
4. Track pending config ACKs and send `ConfigCommandResult` when ACK received (same pattern as v1)
5. Test: send ConfigCommand from v2 client, verify remote receives it and acknowledges

**Deliverable:** Config commands work over v2 protobuf.

### Phase 7: Integration — Coordinator & Protobuf WS Client

**Steps:**
1. Create `custom_components/espnow_tree/const.py` with DOMAIN, defaults
2. Create `coordinator.py` with `EspnowTreeCoordinator` class
3. Implement WS connection lifecycle: connect, reconnect with exponential backoff (1s, 2s, 5s, 10s)
4. Implement HMAC-SHA256 auth flow (v2 variant: `espnow-tree-ws|v2|ha-integration|<server_nonce>|<client_nonce>`)
5. Implement message send/receive with protobuf encode/decode
6. Implement request-response correlation via `id` field
7. Implement topology fetch, schema fetch, state fetch, state subscribe on connect/reconnect
8. Implement state cache and event dispatch to registered entities
9. Write async tests for coordinator lifecycle

**Deliverable:** Integration can connect, authenticate, fetch topology, subscribe to state, and receive events.

### Phase 8: Integration — Config Flow & Device Creation

**Steps:**
1. Create `config_flow.py` with `async_step_hassio`, `async_step_user`, `async_step_confirm`
2. Create `strings.json` with config flow translations
3. Implement `__init__.py` with `async_setup_entry` and `async_unload_entry`
4. Implement topology → device registry creation in coordinator
5. Register Supervisor discovery signal from add-on (`discovery` service for `"espnow_tree"`)
6. Test: add integration via UI, verify device creation in HA

**Deliverable:** Integration shows up in HA Settings → Devices & Services, creates bridge and remote devices.

### Phase 9: Integration — Schema & Entity Creation

**Steps:**
1. Create `entity.py` with `EspNowEntity` base class
2. Create `device.py` with device registry helpers
3. Implement schema fetch on connect and on `schema_changed` events
4. Implement dynamic entity creation: on new schema, create entities via `async_add_entities` callbacks
5. Implement entity removal: on schema change with fewer entities, remove stale entities
6. Create platform files for all supported entity types:
   - `sensor.py`, `binary_sensor.py`, `switch.py`, `light.py`, `fan.py`, `number.py`, `button.py`
   - `cover.py`, `valve.py`, `lock.py`, `select.py`, `text.py`, `alarm_control_panel.py`, `event.py`
7. Each platform entity decodes state bytes based on `platform` + `native_type`
8. Command-capable entities encode value bytes based on `platform` and call `coordinator.send_entity_command()`
9. Test: verify entities appear in HA for a remote with temperature, humidity, switch entities

**Deliverable:** Remote devices appear in HA with correct entities matching their schema.

### Phase 10: Integration — Real-Time State & Availability

**Steps:**
1. Handle `RemoteStateEvent` in coordinator: update state cache, find affected entities, call `entity.async_write_ha_state()`
2. Handle `RemoteAvailabilityEvent`: mark device online/offline, update `available` on all device entities
3. Handle `TopologyChangedEvent`: refresh topology, update device info (firmware version, RSSI, etc.)
4. Handle `BridgeHeartbeat`: update connection status sensor
5. Implement reconnection: on disconnect, clean up entity availability, reconnect with backoff, re-subscribe
6. Test: power cycle remote, verify entities go unavailable and come back

**Deliverable:** Entity state updates in real-time from bridge push events.

### Phase 11: Integration — Entity Command Flow

**Steps:**
1. Implement `coordinator.send_entity_command()` — builds `EntityCommand` protobuf, sends, awaits `EntityCommandResult`
2. Wire up command-capable entities:
   - `SwitchEntity.async_turn_on/off` → `bytes([1])/bytes([0])`
   - `LightEntity.async_turn_on/off` → 9-byte light command
   - `NumberEntity.async_set_value` → `struct.pack("<f", value)`
   - `CoverEntity.async_open/close/stop/set_position` → 2-byte cover command
   - `FanEntity.async_turn_on/off/set_percentage/set_direction` → 4-byte fan command
   - `LockEntity.async_lock/unlock` → `bytes([1])/bytes([0])`
   - `SelectEntity.async_select_option` → `bytes([index])`
   - `AlarmControlPanelEntity.async_alarm_arm/disarm` → alarm command bytes
3. Add optimistic state update: after sending command, update local state immediately, then confirm/adjust when `RemoteStateEvent` arrives
4. Test: toggle a switch entity, verify command reaches remote and state updates

**Deliverable:** Bidirectional control works — HA entities can control remote devices.

### Phase 12: Integration — HA Services & Diagnostics

**Steps:**
1. Create `services.yaml` with all config command services (reboot, set_heartbeat, etc.)
2. Implement service handlers in `__init__.py` that call `coordinator.send_config_command()`
3. Add diagnostic entities (RSSI, hops, uptime, online) for each device
4. Add bridge connection status sensor
5. Add device diagnostic info (firmware, chip, last_seen)
6. Test: call `espnow_tree.reboot` service, verify remote reboots

**Deliverable:** HA services work for config commands, diagnostic entities visible.

### Phase 13: Integration — HACS & Distribution

**Steps:**
1. Create `hacs.json` in repo root
2. Create `custom_components/espnot_tree/manifest.json` with requirements
3. Update `repository.yaml` if needed
4. Write README with installation instructions
5. Test HACS installation from repo URL
6. Test add-on + integration coexistence
7. Test Hassio discovery flow (add-on signals → integration auto-configures)

**Deliverable:** Users can install via HACS, integration auto-configures when add-on is present.

### Phase 14: Add-on Discovery Signal

**Steps:**
1. In add-on's `server.py` startup, call Supervisor discovery API to signal the integration:
   ```python
   import httpx
   await httpx.post("http://supervisor/discovery", json={
       "service": "espnow_tree",
       "config": {"host": bridge_host, "port": bridge_port, "api_key": api_key}
   }, headers={"Authorization": f"Bearer {settings.supervisor_token}"})
   ```
2. In add-on shutdown, call `http://supervisor/discovery/delete` with same service
3. The integration's `async_step_hassio` picks this up and auto-configures
4. Test: start add-on, verify integration auto-configures in HA

**Deliverable:** Seamless add-on → integration auto-configuration.

---

## 8. Testing Strategy

### Bridge Firmware Tests

| Test | Method |
|---|---|
| v2 WS connect + auth | Python test client connects to `/espnow-tree/v2/ws`, completes HMAC auth |
| v1 and v2 concurrent | Connect v1 WS client, then v2 WS client. Verify both authenticate and both receive events. |
| v2 rejects text frames | Send text frame on v2 WS, verify `Error` response and close |
| Topology via v2 | Send `TopologyRequest`, verify `TopologySnapshot` protobuf response |
| Schema via v2 | Send `SchemaRequest`, verify `SchemaResult` protobuf response |
| State subscription | Subscribe to MAC, trigger state change on remote, verify `RemoteStateEvent` received |
| Entity command | Send `EntityCommand` for a switch, verify remote receives command and ACK |
| Config command | Send `ConfigCommand` reboot, verify remote receives config |
| v2 client conflict | Connect two v2 clients, verify second gets `client_already_connected` error |

### Integration Tests

| Test | Method |
|---|---|
| Config flow | Add integration via UI, verify devices appear |
| Entity creation | Verify sensor, switch, light, fan entities match remote schema |
| State updates | Change remote state, verify HA entity state updates within 2 seconds |
| Entity control | Toggle switch in HA, verify remote receives command |
| Reconnection | Disconnect bridge WS, verify entities go unavailable; reconnect, verify entities recover |
| Add-on discovery | Start add-on, verify integration auto-configures |

---

## 9. Open Items & Future Considerations

1. **OTA via integration**: Currently OTA stays on v1 WS (add-on). Future: add `OtaStart`/`OtaChunk`/`OtaStatus` to v2 protobuf so integration can also orchestrate OTA.
2. **Multi-bridge**: Current design assumes one bridge. Multi-bridge support requires multiple config entries.
3. **MQTT coexistence**: The bridge currently publishes MQTT discovery. The integration should suppress or coexist with MQTT-created entities. Option: integration checks for existing MQTT entities and logs a warning; or provides a migration path.
4. **Entity removal**: When a node goes offline permanently or is removed, the integration needs a cleanup strategy (e.g., disable entities after 24h offline, remove after config entry reload).
5. **Light/fan complex state**: The JSON-in-bytes encoding for light and fan state is pragmatic but ugly. Future: consider a structured protobuf sub-message for light/fan state instead of embedding JSON in bytes.
6. **Protobuf code generation in Docker builds**: The bridge's ESPHome build pipeline needs nanopb protoc available. The integration's Python package needs protoc available at build time.