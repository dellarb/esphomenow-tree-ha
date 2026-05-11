# Config Channel: WS API + HA Add-on Implementation Plan

## Overview

Extend the PKT_CONFIG protocol (defined in `roadmap_config_full.md`) through the WS API and HA add-on, enabling remote management from Home Assistant.

**Active commands:** REBOOT, HEARTBEAT_INTERVAL, FORCE_REDISCOVER, SET_PARENT_MAC, RELAY (5 total; OTA_ENABLE and WIFI_CONNECT stubbed at wire level only).

---

## Architecture

```
HA UI  ──REST──>  Add-on  ──WS──>  Bridge  ──ESPNOW──>  Remote
  |                  |              |                     |
  |  POST /reboot    |  node.config |  PKT_CONFIG        |  handle_config_()
  |  POST /relay     |  request/    |  downstream        |  → send_config_ack_()
  |  etc.            |  response    |  + retry           |  → execute command
  |                  |              |                     |
  |  <── result ──── |  <── ACK ── |  <── PKT_ACK ────── |
```

**Layer responsibilities:**
- **UI:** Renders controls, handles confirmation, shows toast feedback
- **Add-on REST:** Validates params, translates to WS `node.config` message
- **Bridge WS router:** Validates session, builds `espnow_config_t` payload, calls `send_config_to_leaf()`
- **Bridge sender:** Encrypts, sends PKT_CONFIG, manages retry queue, correlates ACKs
- **Remote handler:** Validates, ACKs immediately, executes command

---

## Phase 1: Protocol Types (`espnow_types.h`)

Per `roadmap_config_full.md` Phase 1. No changes here — follow the roadmap exactly.

**File:** `components/esp_tree_common/espnow_types.h`

1. Add `PKT_CONFIG = 0x07` to `espnow_packet_type_t` enum
2. Add `case PKT_CONFIG: return "CONFIG";` to `packet_type_name()`
3. Add `case PKT_CONFIG: return true;` to `is_encrypted_packet()`
4. Add `case PKT_CONFIG: return true;` to `is_valid_packet_type()`
5. Add config command defines: `CFG_CMD_REBOOT` through `CFG_CMD_RELAY`
6. Add `SET_PARENT_MAC_FLAG_CLEAR = 0x01`
7. Add config ACK result defines: `CFG_RESULT_OK` through `CFG_RESULT_BUSY`
8. Add `espnow_config_t` packed struct with `static_assert(sizeof == 3)`
9. Add comment: `ack_type` for PKT_CONFIG ACKs = `PKT_CONFIG (0x07)`

**Verify:** `./compile.sh espnow-remote b && ./compile.sh espnow-bridge b`

---

## Phase 2: Remote Config Handler

Per `roadmap_config_full.md` Phase 2.

**File:** `components/esp_tree_remote/remote_protocol.h`
- Add `handle_config_()` private method
- Add `send_config_ack_()` private method
- Add `set_relay_enabled_runtime()` public accessor

**File:** `components/esp_tree_remote/remote_protocol.cpp`
- Add `case PKT_CONFIG:` in `on_espnow_frame()` switch
- Add `PKT_CONFIG` handling in `handle_downstream_()` for relay
- Implement `handle_config_()` — 5 commands + 2 stubs
- Implement `send_config_ack_()` — builds `espnow_ack_t` + command_echo byte, sends via `send_ack_()`

**Config ACK format:** `espnow_ack_t` (6 bytes) + 1 byte `command_echo` = 7 bytes total, sent via `send_ack_()` with `ack_type = PKT_CONFIG`.

**Validate:** NORMAL state check (`!normal_` → `CFG_RESULT_BUSY`), payload length validation.

**Verify:** `./compile.sh espnow-remote b`

---

## Phase 3: Bridge Config Sender

Per `roadmap_config_full.md` Phase 3.

**File:** `components/esp_tree_bridge/bridge_protocol.h`
- Add `PendingConfig` struct (leaf_mac, command, payload, tx_base, retry_count, next_retry_ms, ack_timeout_ms)
- Add `pending_configs_` vector
- Add `send_config_to_leaf()` public method

**File:** `components/esp_tree_bridge/bridge_protocol.cpp`
- Implement `send_config_to_leaf()` — build `espnow_config_t`, encrypt via `send_encrypted_()`, add to `pending_configs_`
- Extend `handle_ack_()` — when `ack_type == PKT_CONFIG`, find matching pending config by `ref_tx_counter` + leaf MAC, extract `command_echo` and result, remove from queue
- Add retry processing in `loop()` — 500ms interval, max 3 retries

**Retry params:** All commands: first ACK timeout 500ms, retry interval 500ms, max 3 retries.

**Verify:** `./compile.sh espnow-bridge b`

---

## Phase 4: Bridge WS API

### Message Type: `node.config`

**Request envelope:**
```json
{
  "v": 1,
  "id": "<request_id>",
  "type": "node.config",
  "payload": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "command": "<command_name>",
    ...command-specific fields
  }
}
```

**Response envelope:**
```json
{
  "v": 1,
  "id": "<request_id>",
  "type": "node.config.result",
  "payload": {
    "result": "ok|busy|rejected|unsupported|invalid_payload|timeout|no_session|not_remote",
    "command": "<command_name>"
  }
}
```

### Command Payloads

| Command | `command` value | Additional payload fields |
|---|---|---|
| REBOOT | `"reboot"` | none |
| HEARTBEAT_INTERVAL | `"heartbeat_interval"` | `"interval_seconds": <int>` |
| FORCE_REDISCOVER | `"force_rediscover"` | none |
| SET_PARENT_MAC | `"set_parent_mac"` | `"parent_mac": "AA:BB:CC:DD:EE:FF"`, `"clear": <bool>` |
| RELAY | `"relay"` | `"enable": <bool>` |

### Processing Flow

1. Router receives `node.config` request
2. Validate: session exists, device is online, MAC is a remote (not bridge)
3. Build `espnow_config_t` + command payload
4. Call `send_config_to_leaf()`
5. Wait for ACK via `pending_configs_` — timeout 3 seconds
6. Return `node.config.result` with mapped result

### Error Cases

| Condition | Result string |
|---|---|
| Remote ACK received: OK | `"ok"` |
| Remote ACK received: BUSY | `"busy"` |
| Remote ACK received: REJECTED | `"rejected"` |
| Remote ACK received: UNSUPPORTED | `"unsupported"` |
| Remote ACK received: INVALID_PAYLOAD | `"invalid_payload"` |
| No session found for MAC | `"no_session"` |
| MAC is the bridge itself | `"not_remote"` |
| Timeout (no ACK after 3s) | `"timeout"` |
| WS request validation fail | HTTP 400 |

### Validation

- **heartbeat_interval:** Must be integer 5–3600. Return 400 if out of range.
- **parent_mac:** Must be valid MAC format. Return 400 if invalid.
- **relay enable:** Must be boolean. Return 400 if invalid.
- **mac:** Must be online remote with valid session. Return result `"no_session"` or `"not_remote"`.

### Router Implementation

**File:** `components/esp_tree_bridge/bridge_api_types.h`
- Add `kTypeNodeConfig` and `kTypeNodeConfigResult` string constants
- Add result string constants

**File:** `components/esp_tree_bridge/bridge_api_router.h`
- Add `handle_node_config_()` private method

**File:** `components/esp_tree_bridge/bridge_api_router.cpp`
- Add `node.config` case in `route_request_()` dispatch
- Implement `handle_node_config_()`:
  - Parse `mac`, `command`, command-specific fields
  - Validate fields per command type
  - Convert string command to `CFG_CMD_*` constant
  - Build payload bytes
  - Call `protocol_.send_config_to_leaf()`
  - Await ACK (block WS request context with condition variable / future)
  - Return result

**File:** `components/esp_tree_bridge/bridge_api_messages.h/.cpp`
- Add `make_node_config_result()` message builder

### ACK Correlation Mechanism

The WS request must block until the ACK arrives or timeout. Implementation approach:

1. `handle_node_config_()` calls `send_config_to_leaf()` which registers in `pending_configs_` with a `std::promise<ConfigResult>`
2. When `handle_ack_()` processes a config ACK, it resolves the promise
3. `handle_node_config_()` waits on the future with 3s timeout
4. On timeout, removes from `pending_configs_` and returns `"timeout"`

**File:** `components/esp_tree_bridge/bridge_protocol.h`
- Add `std::promise<ConfigAckResult>` / completion callback to `PendingConfig` struct

**Alternative (simpler):** Use `std::function<void(uint8_t result)>` callback in `PendingConfig` that the router sets before calling `send_config_to_leaf()`. When ACK arrives, bridge calls the callback. Router tracks pending WS requests by request ID.

---

## Phase 5: HA Add-on REST API

### Endpoints

| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/api/devices/{mac}/reboot` | none | `{"result":"ok","command":"reboot"}` |
| POST | `/api/devices/{mac}/heartbeat` | `{"interval_seconds": 30}` | `{"result":"ok","command":"heartbeat_interval"}` |
| POST | `/api/devices/{mac}/rediscover` | none | `{"result":"ok","command":"force_rediscover"}` |
| POST | `/api/devices/{mac}/parent` | `{"parent_mac":"AA:BB:CC:DD:EE:FF","clear":true}` | `{"result":"ok","command":"set_parent_mac"}` |
| POST | `/api/devices/{mac}/relay` | `{"enable": true}` | `{"result":"ok","command":"relay"}` |

### Error Responses

- **404** — Device MAC not found in topology
- **409** — Device is offline or is the bridge (not a remote)
- **400** — Invalid request body (bad interval, bad MAC format, etc.)
- **503** — WS connection to bridge not established
- **504** — Timeout waiting for remote ACK
- **200 with result field** — Command was sent and remote responded with a non-ok result (busy, rejected, etc.)

### Validation Rules

- `heartbeat_interval`: integer, 5–3600 seconds
- `parent_mac`: valid MAC format (XX:XX:XX:XX:XX:XX or XXXXXXXXXXXX)
- `enable`: boolean
- `clear`: boolean, defaults to `true` if omitted for `/parent`
- MAC must be a remote node (not the bridge), must be online

### WS Client Method

**File:** `esphome-esp-tree-ha/app/bridge_ws_client.py`

Add `send_config(mac, command, params)` method:
- Sends `node.config` WS request with payload
- Waits for `node.config.result` response (3s timeout)
- Returns result dict or raises `ConfigTimeoutError`

**File:** `esphome-esp-tree-ha/app/server.py`

Add 5 endpoint handlers that:
1. Validate request body
2. Call `ws_manager.client.send_config(mac, command, params)`
3. Return result dict with appropriate HTTP status

---

## Phase 6: HA Add-on UI

### New Component: `<esp-device-config>`

**File:** `esphome-esp-tree-ha/ui/src/components/device-config.ts`

**Properties:**
- `mac: string` — device MAC
- `online: boolean` — device online status
- `isRemote: boolean` — true if hops > 0
- `relayNodes: TopologyNode[]` — relay-capable nodes from topology for parent MAC picker

**Layout (card-style):**

```
┌─────────────────────────────────────┐
│  Device Controls                     │
├─────────────────────────────────────┤
│                                      │
│  [  Reboot  ] [ Force Rediscover ]   │  ← buttons, confirmation on both
│                                      │
│  Heartbeat Interval                  │
│  [____30____] seconds  [ Apply ]     │  ← number input, 5-3600, confirmation
│                                      │
│  Set Parent MAC                      │
│  ┌─────────────────────────────┐     │
│  │ Relay1 (AA:BB:CC:...)     ▼ │     │  ← dropdown of relay nodes
│  └─────────────────────────────┘     │
│  Or enter MAC: [____________]         │  ← free-form text input
│  [x] Clear existing parents           │  ← checkbox, default checked
│  [ Apply ]                           │  ← confirmation dialog
│                                      │
│  Relay Mode                          │
│  [Toggle: ON / OFF]                  │  ← switch toggle, confirmation
│                                      │
└─────────────────────────────────────┘
```

**Behavior:**
- All controls disabled when `online === false`; show "Device offline" banner
- Entire component hidden when `isRemote === false` (bridge node)
- Confirmation dialog on ALL 5 commands before sending
- Toast notification after result: green "OK" for success, red with result code for errors
- Loading state while awaiting response (3s timeout)

### Integration into `<esp-device-detail>`

**File:** `esphome-esp-tree-ha/ui/src/components/device-detail.ts`

**Context — current layout (2-column grid):**
```
[Hero section — online pill, name, MAC, hops, uptime, RSSI, "Edit Config" button]
[Diagnostics (left)] [OTA Box (right)]
[Flash History] [Compile History]
```

**Layout change — config replaces the OTA box position:**
Config controls are more commonly used than firmware updates, so they take the prominent right-column spot where OTA was. OTA box moves down.

```
After (remote device — 2-col grid + 2-row):
[Hero section — online pill, name, MAC, hops, uptime, RSSI, "Edit Config" button]
[Diagnostics (left)]       [Config Controls (right)]    ← config takes OTA's former spot
[OTA Box (left)]           [empty (right)]              ← OTA moves below left, 4th panel intentionally blank
[Flash History]
[Compile History]
```

```
After (bridge device — config hidden, reverts to current layout):
[Hero section]
[Diagnostics (left)] [OTA Box (right)]    ← same as before, no config controls
[Flash History]
[Compile History]
```

**Placement rules:**
- Config controls appear on the device detail screen when navigating to a device
- `<esp-device-config>` rendered in the right column (replacing OTA box's former position)
- `<esp-device-diagnostics>` stays in left column
- `<esp-ota-box>` moves to left column, second row (below diagnostics)
- Right column second row left empty for future expansion — do not fill it
- When device is the bridge (`isRemote === false`), entire config section hidden; layout reverts to current 2-column layout (diagnostics left + OTA right)

**Data flow:**
- `mac`, `online`, `isRemote` passed from device-detail's topology query
- `relayNodes` derived from full topology: filter nodes where `can_relay === true` or `hops_to_bridge > 0`
- Current `relay_enabled` state comes from topology node data (bridge exposes relay status in topology)

### API Client Methods

**File:** `esphome-esp-tree-ha/ui/src/api/client.ts`

Add 5 methods:

```typescript
async rebootDevice(mac: string): Promise<ConfigResult> {
  return this.fetch('POST', `/api/devices/${mac}/reboot`);
}

async setHeartbeatInterval(mac: string, intervalSeconds: number): Promise<ConfigResult> {
  return this.fetch('POST', `/api/devices/${mac}/heartbeat`, { interval_seconds: intervalSeconds });
}

async forceRediscover(mac: string): Promise<ConfigResult> {
  return this.fetch('POST', `/api/devices/${mac}/rediscover`);
}

async setParentMac(mac: string, parentMac: string, clear: boolean = true): Promise<ConfigResult> {
  return this.fetch('POST', `/api/devices/${mac}/parent`, { parent_mac: parentMac, clear });
}

async setRelay(mac: string, enable: boolean): Promise<ConfigResult> {
  return this.fetch('POST', `/api/devices/${mac}/relay`, { enable });
}
```

Add type:
```typescript
interface ConfigResult {
  result: 'ok' | 'busy' | 'rejected' | 'unsupported' | 'invalid_payload' | 'timeout' | 'no_session' | 'not_remote';
  command: string;
}
```

---

## Build & Verify Checklist

1. `./compile.sh espnow-remote b` — remote compiles with config handler
2. `./compile.sh espnow-bridge b` — bridge compiles with config sender + WS API
3. HA add-on: `cd esphome-esp-tree-ha/esphome-esp-tree-ha && python -m pytest` (if tests exist)
4. HA add-on UI: `cd ui && npm run build` — TypeScript compiles
5. Existing ctest tests pass
6. No `static_assert` failures
7. Config commands functional test: send `node.config` via WS, verify ACK round-trip