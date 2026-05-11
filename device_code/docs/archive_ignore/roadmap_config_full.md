# Config Channel: PKT_CONFIG Specification & Implementation

## Goal

Implement the bridge→remote management channel (`PKT_CONFIG`) for config operations that are not ESPHome entity control. Enables the bridge to direct remotes to reboot, change heartbeat interval, force re-auth, switch parent nodes, and toggle relay mode — without requiring pre-existing WiFi on the remote.

**In scope:** PKT_CONFIG packet type, espnow_config_t struct, all command/result defines; remote-side config handler for 5 commands (REBOOT, HEARTBEAT_INTERVAL, FORCE_REDISCOVER, SET_PARENT_MAC, RELAY); bridge-side config sender with retry queue and ACK correlation. OTA_ENABLE and WIFI_CONNECT are defined in protocol but stubbed as `CFG_RESULT_UNSUPPORTED`.

**Out of scope (deferred):** OTA captive portal, WiFi connect, bridge ESPHome entities, NVS persistence, proactive DEAUTH to children on relay disable.

## Principles

1. **One packet type, many commands.** `PKT_CONFIG` carries a `command` byte. Adding new commands requires zero protocol changes.

2. **ACK via existing PKT_ACK.** Config ACKs use `PKT_ACK` with `ack_type = PKT_CONFIG (0x07)`, following the unified ACK pattern.

3. **Ack immediately, execute after.** Every config command ACKs on receipt before executing. Priority is confirming delivery to the bridge — especially for disruptive commands (reboot, FORCE_REDISCOVER) where the radio session may break.

4. **Session-encrypted.** All config commands require session encryption (post-join).

5. **No fragmentation.** All config payloads fit within the 220-byte entity fragment limit.

6. **NORMAL-only.** Config commands are only accepted when the remote is in NORMAL state. Reply with `CFG_RESULT_BUSY` otherwise.

## Naming

| Original | Current | Reason |
|----------|---------|--------|
| `CFG_CMD_DEAUTH` | `CFG_CMD_FORCE_REDISCOVER` | Avoid confusion with WiFi DEAUTH frames; explicitly describes behavior |
| `CFG_CMD_USE_PARENT` | `CFG_CMD_SET_PARENT_MAC` | More precise — sets the parent MAC address |
| (new) | `SET_PARENT_MAC_FLAG_CLEAR (0x01)` | Clear existing preferred_parents before adding |

## Resolved Design Decisions

| # | Question | Decision |
|---|---------|----------|
| 1 | OTA captive portal | Deferred — OTA_ENABLE stubbed as CFG_RESULT_UNSUPPORTED |
| 2 | WiFi connect | Deferred — WIFI_CONNECT stubbed as CFG_RESULT_UNSUPPORTED |
| 3 | Heartbeat persistence | **Runtime only** — resets to YAML default on reboot. No NVS writes. |
| 4 | Config during STATE_SYNC | **NORMAL only** — remote rejects config with `CFG_RESULT_BUSY` during join stages. |
| 5 | Relay DEAUTH children | **Natural timeout** — children re-discover via route TTL expiry. Future improvement: proactive DEAUTH. |
| 6 | SET_PARENT_MAC fallback | **Heartbeat detection** — bridge confirms switch by checking `parent_mac` in next heartbeat. |
| 7 | SET_PARENT_MAC path gap | **Send heartbeat immediately** — remote sends heartbeat right after parent switch to establish reverse path. |

---

## Wire Protocol

### Packet Type

| Type | Value | Direction | Encrypted | PSK Auth |
|------|-------|-----------|-----------|----------|
| `PKT_CONFIG` | 0x07 | Bridge → Remote (downstream) | Session | Yes |

Relay forwarding uses `ESPNOW_HOPS_DIR_DOWN` direction bit. No relay code changes needed.

### ACK Discriminator

All config ACKs use `PKT_ACK` with `ack_type = PKT_CONFIG (0x07)`. Config responses follow the same unified ACK pattern as PKT_STATE (0x04) and PKT_COMMAND (0x06).

### Common Header + Command Payload

```
[espnow_config_t: 3 bytes] [payload[payload_len]: 0..217 bytes]
```

| Field | Offset | Size | Description |
|-------|--------|------|-------------|
| `command` | 0 | 1 | `espnow_config_command_t` — which config operation |
| `flags` | 1 | 1 | Bit flags (reserved, send as 0) |
| `payload_len` | 2 | 1 | Length of variable payload that follows |

Max `payload_len` = 220 − 3 = 217 bytes (within single fragment, no fragmentation needed).

### Config Command Codes

| Command | Value | ACK Policy | Payload | ACK Payload | Behavior after ACK |
|---------|-------|------------|---------|-------------|-------------------|
| `CFG_CMD_REBOOT` | 0x01 | Immediate | (empty) | `command_echo(1)` | `App.safe_reboot()` |
| `CFG_CMD_OTA_ENABLE` | 0x02 | N/A | — | — | **Stub: CFG_RESULT_UNSUPPORTED** |
| `CFG_CMD_WIFI_CONNECT` | 0x03 | N/A | — | — | **Stub: CFG_RESULT_UNSUPPORTED** |
| `CFG_CMD_HEARTBEAT_INTERVAL` | 0x04 | Immediate | `uint32_t interval_seconds` | `command_echo(1)` | Update heartbeat timer (runtime only) |
| `CFG_CMD_FORCE_REDISCOVER` | 0x05 | Immediate | (empty) | `command_echo(1)` | Full multi-channel discovery sweep |
| `CFG_CMD_SET_PARENT_MAC` | 0x06 | Immediate | `uint8_t flags(1)` + `uint8_t parent_mac[6]` | `command_echo(1)` | Replace/add preferred_parents, trigger discovery |
| `CFG_CMD_RELAY` | 0x07 | Immediate | `uint8_t enable` (0/1) | `command_echo(1)` | Enable/disable relay mode (runtime only) |

### Command-Specific Payload Layouts

**CFG_CMD_REBOOT (0x01)**
```
No variable payload. payload_len = 0.
```

**CFG_CMD_HEARTBEAT_INTERVAL (0x04)**
```
Offset  Size  Field
0       4     interval_seconds   New heartbeat interval in seconds (uint32 LE)
```

Runtime-only change — resets to YAML default on reboot. No NVS persistence.

**CFG_CMD_FORCE_REDISCOVER (0x05)**
```
No variable payload. payload_len = 0.
```

Unlike `PKT_DEAUTH` (which triggers fast rejoin on current channel), `CFG_CMD_FORCE_REDISCOVER` triggers a **full multi-channel discovery sweep**:

1. ACK immediately with `CFG_RESULT_OK`
2. `clear_session_state_(false, true)` — tear down session
3. Roll new `remote_nonce_`
4. `discovering_ = true`, `sweep_complete_ = false`, `fast_rejoin_ = false`, `discovery_resume_normal_after_success_ = false`, `discovery_current_channel_only_ = false`
5. `start_discovery_cycle_()` — full sweep across all channels

**CFG_CMD_SET_PARENT_MAC (0x06)**
```
Offset  Size  Field
0       1     flags         0x01 = SET_PARENT_MAC_FLAG_CLEAR (clear existing preferred_parents before adding)
1       6     parent_mac    MAC address of desired parent node (appended to preferred_parents list)
```

**CFG_CMD_RELAY (0x07)**
```
Offset  Size  Field
0       1     enable        0 = disable relay, 1 = enable relay
```

### Config ACK Result Codes

| Result | Value | Description |
|--------|-------|-------------|
| CFG_RESULT_OK | 0 | Command accepted |
| CFG_RESULT_REJECTED | 1 | Remote refused the command |
| CFG_RESULT_UNSUPPORTED | 2 | Unknown/unsupported command code |
| CFG_RESULT_INVALID_PAYLOAD | 3 | Payload_len or content invalid |
| CFG_RESULT_BUSY | 4 | Remote is busy (not in NORMAL state) |

### Processing Rules

All commands follow the same flow:

1. Remote receives `PKT_CONFIG`
2. Remote validates command code and payload
3. Remote sends `PKT_ACK {ack_type=PKT_CONFIG, result=..., ref_tx_counter=..., command_echo}`
4. Remote executes the command

For disruptive commands (reboot, FORCE_REDISCOVER), step 4 may break the radio session. The bridge considers the command delivered as soon as it receives the ACK.

If the remote is not in NORMAL state, it replies with `CFG_RESULT_BUSY` and does not execute.

### Bridge Retry Table

| Command | First ACK Timeout | Retry Interval | Max Retries |
|---------|-------------------|---------------|-------------|
| REBOOT | 500ms | 500ms | 3 |
| HEARTBEAT_INTERVAL | 500ms | 500ms | 3 |
| FORCE_REDISCOVER | 500ms | 500ms | 3 |
| RELAY | 500ms | 500ms | 3 |
| SET_PARENT_MAC | 500ms | 500ms | 3 |

### Relay Forwarding

PKT_CONFIG uses `ESPNOW_HOPS_DIR_DOWN` direction bit. Relay nodes forward config packets downstream when `leaf_mac != self`. When `leaf_mac == self`, the relay handles the config command locally. Add `PKT_CONFIG` to the downstream forward path in `handle_downstream_()`.

---

## SET_PARENT_MAC Detail

### Motivation

Allows the bridge (or HA automation) to steer topology. Use cases:

- Move a leaf from a slow relay to a direct bridge link
- Load-balance children across relays
- Rebuild topology after a relay goes offline (preemptive redirect before timeout)

### Flags

| Flag | Value | Description |
|------|-------|-------------|
| `SET_PARENT_MAC_FLAG_CLEAR` | 0x01 | Clear existing `preferred_parents_` before adding the new MAC |

### Behavior

1. ACK immediately with `CFG_RESULT_OK`
2. If `flags & SET_PARENT_MAC_FLAG_CLEAR`: clear `preferred_parents_` vector
3. Append the provided `parent_mac` to `preferred_parents_`
4. Trigger `start_discovery_cycle_()` — standard broadcast discovery, preferred parent auto-wins per RSSI threshold rule

The result of the discovery (parent adoption success or failure) is reflected in normal link state — no separate result ACK.

### Notes

- `SET_PARENT_MAC_FLAG_CLEAR = 0x01` — only this flag defined currently
- `preferred_parents_` is ordered; the first entry has the highest preference (index 0)
- A preferred parent with RSSI ≥ -85 dBm auto-wins selection immediately
- A preferred parent with RSSI < -85 dBm participates in normal selection but does not auto-win
- If no preferred parent has adequate signal, normal selection runs among all responders

### Flow

```
Bridge                     Remote                New Parent
  |                          |                       |
  |-- PKT_CONFIG ---------->|                       |
  |  (SET_PARENT_MAC, flags=0x01, mac=NP)            |
  |                          |                       |
  |<-- PKT_ACK (CFG_RESULT_OK) -|                    |
  |                          |                       |
  |                          |-- DISCOVER (broadcast)|
  |                          |   (preferred NP auto-wins if RSSI >= -85)  |
  |                          |                       |
  |                          |-- HEARTBEAT --------->|
  |                          |  (establishes reverse path at new parent) |
  |                          |                       |
  |         (subsequent traffic routes through NP)   |
```

If no announce is received within the discover timeout, the remote stays on its current parent. The bridge detects this by checking the `parent_mac` field in the next heartbeat.

---

## RELAY Enable/Disable Detail

**Enable (0x01):** `relay_enabled_ = true`, call `refresh_can_relay_()`
**Disable (0x00):** `relay_enabled_ = false`, call `refresh_can_relay_()`

Runtime only — resets to YAML default on reboot. No NVS writes.

When disabling, existing children orphan naturally via route TTL expiry. No proactive DEAUTH to children (deferred).

---

## Bridge ESPHome Entities

> **Deferred.** Implementation of ESPHome entities for config commands is Phase 4 work, deferred to a future pass.

### Per-Remote Entities (planned)

| Entity | MQTT Topic Suffix | Type | Config Command |
|--------|-------------------|------|----------------|
| Reboot | `.../reboot/set` | button | `CFG_CMD_REBOOT` |
| Enter OTA | `.../ota_enable/set` | button | `CFG_CMD_OTA_ENABLE` (stub) |
| Heartbeat Interval | `.../heartbeat_interval/set` | number (min=5, max=3600, step=1) | `CFG_CMD_HEARTBEAT_INTERVAL` |
| Force Rediscover | `.../force_rediscover/set` | button | `CFG_CMD_FORCE_REDISCOVER` |
| Set Parent MAC | `.../set_parent_mac/set` | select (populated with known relay MACs) | `CFG_CMD_SET_PARENT_MAC` |
| Relay Enable | `.../relay/set` | switch | `CFG_CMD_RELAY` |

### Bridge-Level Service (planned)

| Service | MQTT Topic Suffix | Payload | Config Command |
|---------|-------------------|---------|----------------|
| WiFi Connect | `.../wifi_connect/set` | JSON: `{"ssid":"...", "password":"..."}` | `CFG_CMD_WIFI_CONNECT` (stub) |

---

## C Defines Summary

```c
/* Packet type */
#define PKT_CONFIG  0x07

/* ack_type for PKT_CONFIG ACKs = PKT_CONFIG (0x07) — unified ACK */

/* Config commands */
#define CFG_CMD_REBOOT              0x01
#define CFG_CMD_OTA_ENABLE          0x02  /* stub: returns CFG_RESULT_UNSUPPORTED */
#define CFG_CMD_WIFI_CONNECT        0x03  /* stub: returns CFG_RESULT_UNSUPPORTED */
#define CFG_CMD_HEARTBEAT_INTERVAL  0x04
#define CFG_CMD_FORCE_REDISCOVER    0x05
#define CFG_CMD_SET_PARENT_MAC      0x06
#define CFG_CMD_RELAY               0x07

/* SET_PARENT_MAC flags */
#define SET_PARENT_MAC_FLAG_CLEAR   0x01  /* Clear existing preferred_parents_ before adding */

/* Config ACK result codes (in espnow_ack_t.result when ack_type=PKT_CONFIG) */
#define CFG_RESULT_OK              0
#define CFG_RESULT_REJECTED        1
#define CFG_RESULT_UNSUPPORTED     2
#define CFG_RESULT_INVALID_PAYLOAD 3
#define CFG_RESULT_BUSY            4

/* Struct */
typedef struct __attribute__((packed)) {
    uint8_t command;       // CFG_CMD_* value
    uint8_t flags;         // reserved, send 0
    uint8_t payload_len;   // length of variable payload
    // payload[payload_len] follows
} espnow_config_t;
static_assert(sizeof(espnow_config_t) == 3, "espnow_config_t must be 3 bytes");
```

---

## Implementation Phases

### Phase 1: Protocol Types & ACK Discriminator

**Goal:** Add `PKT_CONFIG` and all config defines/structs to `espnow_types.h`. Confirm both bridge and remote compile.

**File:** `components/esp_tree_common/espnow_types.h`

**Tasks:**

1. Add `PKT_CONFIG = 0x07` to `espnow_packet_type_t` enum
2. Update `packet_type_name()` — add `case PKT_CONFIG: return "CONFIG";`
3. Update `is_encrypted_packet()` — add `case PKT_CONFIG: return true;`
4. Update `is_valid_packet_type()` — add `case PKT_CONFIG: return true;`
5. Add config command `#define`s (`CFG_CMD_REBOOT` through `CFG_CMD_RELAY`)
6. Add `SET_PARENT_MAC_FLAG_CLEAR` flag `#define`
7. Add config ACK result `#define`s (`CFG_RESULT_OK` through `CFG_RESULT_BUSY`)
8. Add `espnow_config_t` packed struct with `static_assert(sizeof == 3)`
9. Add comment: `ack_type` for PKT_CONFIG ACKs = `PKT_CONFIG (0x07)` — unified ACK pattern

**Verification:** `./compile.sh espnow-remote b` and `./compile.sh espnow-bridge b`

---

### Phase 2: Remote Config Handler

**Goal:** Implement `handle_config_()` on the remote — dispatch incoming config commands, ACK immediately, execute.

**Files modified:**

#### `components/esp_tree_remote/remote_protocol.h`

1. Add `handle_config_()` private method:
   ```cpp
   bool handle_config_(const uint8_t *sender_mac, const espnow_frame_header_t &header,
                       const uint8_t *payload, size_t payload_len, int8_t rssi);
   ```
2. Add `send_config_ack_()` private method:
   ```cpp
   bool send_config_ack_(const uint8_t *leaf_mac, uint8_t command, uint8_t result,
                          const uint8_t *trailing_payload, size_t trailing_len);
   ```
3. Add runtime relay state accessor:
   ```cpp
   void set_relay_enabled_runtime(bool enabled) { relay_enabled_ = enabled; refresh_can_relay_(); }
   ```

#### `components/esp_tree_remote/remote_protocol.cpp`

1. **Packet dispatch:** In `on_espnow_frame()` switch, add:
   ```cpp
   case PKT_CONFIG: return handle_config_(sender_mac, header, payload, payload_len, rssi);
   ```

2. **Local handling:** PKT_CONFIG with `leaf_mac == self` is handled locally — no change to `should_handle_locally_()` needed.

3. **Relay forwarding:** In `handle_downstream_()`, add:
   ```cpp
   if (packet_type == PKT_CONFIG) return handle_config_(nullptr, header, payload, payload_len, 0);
   ```

4. **Implement `handle_config_()`:**

   ```cpp
   bool RemoteProtocol::handle_config_(const uint8_t *sender_mac,
                                         const espnow_frame_header_t &header,
                                         const uint8_t *payload,
                                         size_t payload_len,
                                         int8_t rssi) {
     if (!normal_) {
       send_config_ack_(header.leaf_mac, 0, CFG_RESULT_BUSY, nullptr, 0);
       return true;
     }
     if (payload_len < sizeof(espnow_config_t)) {
       send_config_ack_(header.leaf_mac, 0, CFG_RESULT_INVALID_PAYLOAD, nullptr, 0);
       return true;
     }
     const auto *cfg = reinterpret_cast<const espnow_config_t *>(payload);
     const uint8_t *cmd_payload = payload + sizeof(espnow_config_t);
     size_t cmd_payload_len = payload_len - sizeof(espnow_config_t);

     if (cfg->payload_len != cmd_payload_len) {
       send_config_ack_(header.leaf_mac, cfg->command, CFG_RESULT_INVALID_PAYLOAD, nullptr, 0);
       return true;
     }

     switch (cfg->command) {
       case CFG_CMD_REBOOT:
         send_config_ack_(header.leaf_mac, CFG_CMD_REBOOT, CFG_RESULT_OK, nullptr, 0);
         App.safe_reboot();
         return true;

       case CFG_CMD_HEARTBEAT_INTERVAL:
         if (cmd_payload_len < 4) {
           send_config_ack_(header.leaf_mac, cfg->command, CFG_RESULT_INVALID_PAYLOAD, nullptr, 0);
           return true;
         }
         heartbeat_interval_ = *reinterpret_cast<const uint32_t *>(cmd_payload);
         send_config_ack_(header.leaf_mac, CFG_CMD_HEARTBEAT_INTERVAL, CFG_RESULT_OK, nullptr, 0);
         return true;

       case CFG_CMD_OTA_ENABLE:
         send_config_ack_(header.leaf_mac, CFG_CMD_OTA_ENABLE, CFG_RESULT_UNSUPPORTED, nullptr, 0);
         return true;

       case CFG_CMD_WIFI_CONNECT:
         send_config_ack_(header.leaf_mac, CFG_CMD_WIFI_CONNECT, CFG_RESULT_UNSUPPORTED, nullptr, 0);
         return true;

       case CFG_CMD_FORCE_REDISCOVER:
         send_config_ack_(header.leaf_mac, CFG_CMD_FORCE_REDISCOVER, CFG_RESULT_OK, nullptr, 0);
         clear_session_state_(false, true);
         discovering_ = true;
         sweep_complete_ = false;
         fast_rejoin_ = false;
         discovery_resume_normal_after_success_ = false;
         discovery_current_channel_only_ = false;
         fill_random_bytes(remote_nonce_.data(), remote_nonce_.size());
         start_discovery_cycle_();
         return true;

      case CFG_CMD_SET_PARENT_MAC:
         if (cmd_payload_len < 7) {
           send_config_ack_(header.leaf_mac, cfg->command, CFG_RESULT_INVALID_PAYLOAD, nullptr, 0);
           return true;
         }
         if (cmd_payload[0] & SET_PARENT_MAC_FLAG_CLEAR) {
           preferred_parents_.clear();
         }
         std::array<uint8_t, 6> mac{};
         memcpy(mac.data(), cmd_payload + 1, 6);
         preferred_parents_.push_back(mac);
         send_config_ack_(header.leaf_mac, CFG_CMD_SET_PARENT_MAC, CFG_RESULT_OK, nullptr, 0);
         start_discovery_cycle_();
         return true;

      case CFG_CMD_RELAY:
         if (cmd_payload_len < 1) {
           send_config_ack_(header.leaf_mac, cfg->command, CFG_RESULT_INVALID_PAYLOAD, nullptr, 0);
           return true;
         }
         relay_enabled_ = (cmd_payload[0] != 0);
         refresh_can_relay_();
         send_config_ack_(header.leaf_mac, CFG_CMD_RELAY, CFG_RESULT_OK, nullptr, 0);
         return true;

      default:
         send_config_ack_(header.leaf_mac, cfg->command, CFG_RESULT_UNSUPPORTED, nullptr, 0);
         return true;
     }
   }
   ```

5. **Implement `send_config_ack_()`:**

   ```cpp
   bool RemoteProtocol::send_config_ack_(const uint8_t *leaf_mac, uint8_t command,
                                          uint8_t result,
                                          const uint8_t *trailing_payload,
                                          size_t trailing_len) {
     uint8_t buf[sizeof(espnow_ack_t) + 1 + trailing_len];
     auto *ack = reinterpret_cast<espnow_ack_t *>(buf);
     memset(buf, 0, sizeof(buf));
     ack->ack_type = PKT_CONFIG;
     ack->result = result;
     buf[sizeof(espnow_ack_t)] = command;  // command_echo
     if (trailing_payload && trailing_len > 0) {
       memcpy(buf + sizeof(espnow_ack_t) + 1, trailing_payload, trailing_len);
     }
     return send_ack_upstream_(ack, sizeof(buf));
   }
   ```

**Verification:** `./compile.sh espnow-remote b`

---

### Phase 3: Bridge Config Sender

**Goal:** Implement config sending on the bridge — build PKT_CONFIG, encrypt, send, retry on ACK timeout, process config ACKs.

**Files modified:**

#### `components/esp_tree_bridge/bridge_protocol.h`

1. Add `send_config_to_leaf()` public method:
   ```cpp
   bool send_config_to_leaf(const uint8_t *leaf_mac, uint8_t command,
                             const uint8_t *payload, size_t payload_len);
   ```
2. Add pending config tracking:
   ```cpp
   struct PendingConfig {
     uint8_t leaf_mac[6];
     uint8_t command;
     std::vector<uint8_t> payload;
     uint32_t tx_base;
     uint8_t retry_count{0};
     uint32_t next_retry_ms{0};
     uint32_t ack_timeout_ms;
   };
   std::vector<PendingConfig> pending_configs_;
   ```
3. Extend `handle_ack_()` to dispatch `PKT_CONFIG` ACKs

#### `components/esp_tree_bridge/bridge_protocol.cpp`

1. **Implement `send_config_to_leaf()`:**
   ```cpp
   bool BridgeProtocol::send_config_to_leaf(const uint8_t *leaf_mac, uint8_t command,
                                             const uint8_t *payload, size_t payload_len) {
     auto *session = get_session_(leaf_mac);
     if (!session) {
       ESP_LOGW(TAG, "Cannot send config to %s: no session", format_mac_(leaf_mac).c_str());
       return false;
     }
     uint8_t buf[sizeof(espnow_config_t) + payload_len];
     auto *cfg = reinterpret_cast<espnow_config_t *>(buf);
     cfg->command = command;
     cfg->flags = 0;
     cfg->payload_len = payload_len;
     if (payload && payload_len > 0) {
       memcpy(buf + sizeof(espnow_config_t), payload, payload_len);
     }
     uint32_t ack_timeout = 500;
     if (!send_encrypted_(session, PKT_CONFIG, buf, sizeof(buf), ESPNOW_HOPS_DIR_DOWN)) {
       return false;
     }
     PendingConfig pending;
     memcpy(pending.leaf_mac, leaf_mac, 6);
     pending.command = command;
     pending.payload.assign(payload, payload + payload_len);
     pending.tx_base = session->tx_counter;
     pending.retry_count = 0;
     pending.next_retry_ms = millis() + ack_timeout;
     pending.ack_timeout_ms = ack_timeout;
     pending_configs_.push_back(pending);
     return true;
   }
   ```

2. **Extend `handle_ack_()`:** When `ack_type == PKT_CONFIG`, look up pending config by `ref_tx_counter`, extract `command_echo` and result, remove from `pending_configs_`. Log result.

3. **Retry queue in `loop()`:** Service `pending_configs_` — if `millis() > next_retry_ms` and `retry_count < 3`, resend and increment retry.

4. **Config retry parameters:** All commands: 500ms × 3 retries.

**Verification:** `./compile.sh espnow-bridge b`

---

### Phase 4: (Deferred)

Bridge ESPHome entities, MQTT topics, HA discovery — fully deferred to next pass.

---

### Phase 5: Spec Update & Build Verification

**Goal:** Update `espnow_v3_spec.md` with PKT_CONFIG protocol details and verify all builds pass.

**Files modified:**

- `docs/espnow_v3_spec.md`: Add PKT_CONFIG section, update packet type table, add config payload structures, update ACK type table

**Verification:**

- `./compile.sh espnow-remote b`
- `./compile.sh espnow-bridge b`
- All ctest tests pass
- No `static_assert` failures

---

## Open Questions (For Future Passes)

1. **OTA portal implementation** — captive AP + DNS + HTTP server for firmware uploads. Significant complexity, deferred.

2. **WiFi connect** — SSID/password injection, WiFi reconnection flow, no auto-rejoin. Deferred.

3. **Proactive DEAUTH to children on relay disable** — speed up topology convergence. Natural timeout is acceptable for now.

4. **Bridge ESPHome entities** — per-remote buttons/numbers/switches for all config commands. Needs SET_PARENT_MAC select with known relay MACs.

5. **SET_PARENT_MAC ACK on new route** — the success ACK travels through the new parent. If the new parent doesn't have a route back to the bridge yet, the ACK may be lost. The bridge's 500ms retry interval (×3) mitigates this — the next retry will find the established route.