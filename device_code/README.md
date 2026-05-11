# ESP-NOW LR + ESPHome Integration Spec

## Status: Packaging Ready, Protocol In Progress

Current implementation status as of April 16, 2026:
- `esp_tree_bridge` is packaged as a GitHub-consumable ESPHome external component and builds cleanly.
- Bridge diagnostics now appear on the ESPHome device when the example YAML is used.
- The full ESP-NOW radio transport and the `esp_tree_remote` external component are not production-ready yet.
- MQTT-backed remote entities will not appear until the transport and remote side are completed.

---

## Overview

An ESPHome external component that enables remote ESP32 nodes to communicate over ESP-NOW Long Range (LR) to a bridge node, which then connects to Home Assistant via MQTT.

**Goal:** User-friendly remote sensors some distance from WiFi, using ESP-NOW LR for comms, with full ESPHome YAML syntax for declaring sensors, switches, and other entities. Provides Home Assistant users with ESPHome-style YAML authoring for remote nodes, surfaced in Home Assistant through MQTT discovery with behavior closely matching native ESPHome where practical.

### Target Deployment Patterns

All remotes are deployed **beyond Wi-Fi range** — they cannot reach the home WiFi network directly. ESP-NOW LR provides the long-range backhaul to the bridge.

**v1 — Always-on remotes:**
- Remote ESP32 powered continuously (mains or solar)
- Examples: shed/outbuilding sensors, outdoor environmental monitors, garage door controllers
- Bridge and remotes stay synchronized continuously

**v2 — Battery deep-sleep remotes (Future Roadmap):**
- Remote ESP32 runs on battery with deep-sleep cycles
- Sensor reading → ESP-NOW transmit → deep sleep
- Commands queued at bridge for delivery on next wake (Future Roadmap)

**Single bridge topology:** One bridge per Home Assistant instance. Multiple bridges for failover are supported only as passive standby (not simultaneous active publishing to MQTT).

**Not a fork of espnow-network.** This is a clean, new project built from scratch with the benefit of learnings from espnow-network. Protocol details may differ.

---

## Project Structure

```
esp_tree_esphome/
├── espnow_types.h              ← shared protocol definitions (single source of truth)
├── espnow_crypto.cpp/h         ← HMAC-SHA256 + HKDF-XOR (shared)
│
├── components/                ← ESPHome external components
│   ├── esp_tree_bridge/       ← bridge component (WiFi + MQTT + ESP-NOW LR)
│   ├── esp_tree_remote/       ← remote component (ESP-NOW LR only)
│   └── include/                ← shared headers (espnow_types.h, espnow_crypto.*)
│
├── demos/                     ← example configurations
│   ├── espnow-bridge.yml      ← bridge YAML
│   ├── espnow-remote.yml      ← remote YAML
│   └── README.md
│
└── docs/
    └── espnow-lr-esphome-spec.md  ← this file
```

---

## Architecture

```
Remote ESP32 (esp_tree_remote)
  ├── No WiFi — ESP-NOW LR only
  ├── ESPHome YAML: sensors, switches, binary_sensors, buttons
  └── ESP-NOW LR → bridge

Bridge ESP32 (esp_tree_bridge)
  ├── WiFi connected (Wi-Fi channel determines ESP-NOW LR channel)
  ├── MQTT connected to broker
  └── ESP-NOW LR ← remotes (same channel as Wi-Fi station)
                └── MQTT → Home Assistant
```

### Two Node Types

| | `esp_tree_bridge` | `esp_tree_remote` |
|--|--|--|
| WiFi | Yes (station) | No |
| MQTT | Yes (client) | No |
| ESP-NOW LR | Yes (receiver) | Yes (transmitter) |
| Built via | ESPHome YAML | ESPHome YAML |

**v2 — Full channel scan + best bridge selection:**
2. Send discoverBroadcast DISCOVER (one per channel per round)
   Start short collection window
   Wait for responses
3. Collect candidates
   For each response received, store:
     parent MAC (sender)
     hop count to bridge
     RSSI
   Maintain a list of candidate parents during the window.
4. Select parent
   Choose best candidate using:
     Lowest hop count (primary)
     Strongest RSSI (secondary)
   Set:
     parent_mac
     hops_to_bridge

---

## Protocol Design

### Security: Key Derivation on Re-Join

When a remote loses contact with the bridge and re-connects:
1. Remote sends fresh DISCOVER request
2. Bridge responds with fresh nonce
3. New session key derived from PSK + both nonces
4. Old captured packets cannot pass authentication — session key changed
5. Counter resets to 0

**Rule:** No STATE/COMMAND/HEARTBEAT packets accepted from a remote until JOIN is complete in the current session.

**Security Note:** The PSK authentication tag is 4 bytes (32 bits), providing a birthday attack threshold of approximately 65,000 frames. In a dense RF environment where an attacker can observe traffic and craft frames, relay-forwarding capability could theoretically be gained. For a home automation context this is generally acceptable. The session key is refreshed on each rejoin, limiting exposure.

### Packet Types

| Packet | Direction | Purpose |
|--------|-----------|---------|
| `PKT_DISCOVER` | Remote → Bridge (broadcast) | "I want to join network_id" |
| `PKT_DISCOVER_ACK` | Bridge → Remote (unicast) | "I'm here, bridge nonce" |
| `PKT_JOIN` | Remote → Bridge (unicast) | "Please join me" + node_label |
| `PKT_JOIN_ACK` | Bridge → Remote (unicast) | "You're in" |
| `PKT_STATE` | Remote → Bridge (unicast) | "Entity values changed" |
| `PKT_ACK` | Bidirectional (unicast) | "ACK — ack_type + result + ref_tx_counter" |
| `PKT_COMMAND` | Bridge → Remote (unicast) | "Set field to value" |
| `PKT_SCHEMA_REQUEST` | Bridge → Remote (unicast) | "Send entity N" — carries `requested_index` |
| `PKT_SCHEMA_PUSH` | Remote → Bridge (unicast) | "Here's entity N" — carries `entity_index`, `total_entities`, entity data |
| `PKT_NACK` | Bridge → Remote (unicast) | "Invalid packet / not joined" |
| `PKT_HEARTBEAT` | Remote → Bridge (unicast) | "I'm still alive" |

**Schema flow:** Bridge iterates `requested_index = 0, 1, 2...`. Remote responds with SCHEMA_PUSH for each index, including `total_entities`. When bridge receives `entity_index == total_entities`, schema is complete.

**Zero entities:** If remote has no entities, it sends SCHEMA_PUSH with `entity_index = 0` and `total_entities = 0`. Since `entity_index == total_entities`, bridge immediately knows schema is complete and stops requesting.

### Packet Structures

**Common header (all packets):**
```c
// NOTE: protocol_version is THIS APPLICATION's protocol version (frame format, key derivation,
// session management, packet types, etc.). It is NOT the ESP-NOW protocol version per ESP IDF docs.
// Our application protocol version is independent from the ESP-NOW protocol version.
typedef struct __attribute__((packed)) {
    uint8_t  packet_type;
    uint8_t  protocol_version;
    uint32_t tx_counter;    // increments per packet from sender
    // --- payload starts here ---
    // --- auth_tag[8] at end ---
} espnow_header_t;

#define ESPNOW_LR_HEADER_LEN     6
#define ESPNOW_LR_AUTH_TAG_LEN   8
```

**Note:** DISCOVER packets use zeroed auth_tag (pre-join, no session key to derive). All other packets carry a valid HMAC-SHA256 auth_tag. Receiver skips auth verification for DISCOVER packet type. The bridge identifies remotes by MAC address (received with each ESP-NOW frame) — no node_id field is needed in the protocol.

**DISCOVER — Remote → Bridge (broadcast):**
```c
// tx_counter = 0 (pre-join, no session yet)
// Remote MAC is read from ESP-NOW frame metadata (sender MAC), not embedded in payload
typedef struct __attribute__((packed)) {
    uint8_t  network_id[32];
    uint8_t  network_id_len;
    uint8_t  remote_nonce[16];
} espnow_discover_t;
```

**DISCOVER_ACK — Bridge → Remote (unicast):**
```c
// tx_counter = 0 (pre-join)
// Remote MAC is read from ESP-NOW frame metadata
typedef struct __attribute__((packed)) {
    uint8_t  network_id[32];
    uint8_t  network_id_len;
    uint8_t  bridge_mac[6];
    uint8_t  bridge_nonce[16];
} espnow_discover_ack_t;
```

**JOIN — Remote → Bridge (unicast):**
```c
// tx_counter starts at 1
typedef struct __attribute__((packed)) {
    uint8_t  remote_nonce[16];
    uint8_t  node_label[64];
    uint8_t  schema_hash[8];   // First 8 bytes of SHA256 of all concatenated SCHEMA_PUSH
                               // payload bytes for all entities. Deterministically captures
                               // entity_index, entity_type, entity_name, entity_unit.
                               // Any change to any entity produces a different hash.
} espnow_join_t;
```

**JOIN_ACK — Bridge → Remote (unicast):**
```c
typedef struct __attribute__((packed)) {
    uint8_t  accepted;    // 1 = accepted, 0 = rejected
    uint8_t  reason;     // 0 = ok, 1 = rejected, 2 = protocol mismatch
} espnow_join_ack_t;
```

**SCHEMA_REQUEST — Bridge → Remote (unicast):**
```c
typedef struct __attribute__((packed)) {
    uint8_t  requested_index;   // which entity index to send (0-based)
} espnow_schema_request_t;
```

**SCHEMA_PUSH — Remote → Bridge (unicast):**
```c
typedef struct __attribute__((packed)) {
    uint8_t  entity_index;    // this entity's index (0-based)
    uint8_t  total_entities;  // total count of entities on this remote
    uint8_t  entity_type;     // espnow_field_type_t
    uint8_t  entity_name[32];
    uint8_t  entity_unit[8];
} espnow_schema_push_t;
```

**STATE — Remote → Bridge (unicast):**
```c
typedef struct __attribute__((packed)) {
    uint8_t  field_count;      // number of fields in this packet (always 1 for v1)
    // followed by field_count × (field_index[1] + value[4])
} espnow_state_t;
```

**Note:** For v1, one entity per STATE packet. Value is raw binary:

| Entity type | Value format |
|-------------|--------------|
| SENSOR | float (4 bytes) |
| SWITCH | uint8_t (0=OFF, 1=ON) |
| BINARY | uint8_t (0=OFF, 1=ON) |
| BUTTON | uint8_t (trigger, always 1) |
| NUMBER | float (4 bytes) |

Bridge converts to ESPHome MQTT string format for HA:
- SENSOR: `"<float>"` e.g. `"22.5"`
- SWITCH: `"ON"` or `"OFF"`
- BINARY: `"ON"` or `"OFF"`
- BUTTON: `"press"` (or empty string)
- NUMBER: `"<float>"` e.g. `"0.5"`

If multiple fields need to be sent, remote sends multiple STATE packets sequentially.

**PKT_ACK — Bidirectional (unicast, encrypted):**

```c
#define ACK_STATE    0x04
#define ACK_COMMAND  0x06

typedef struct __attribute__((packed)) {
    uint8_t ack_type;        // packet type being acked (e.g. PKT_STATE=0x04, PKT_COMMAND=0x06)
    uint8_t result;          // 0=success, 1=fail, 2=invalid, 3=busy
    uint32_t ref_tx_counter; // tx_counter of the message being acked
} espnow_ack_t;
```

**COMMAND — Bridge → Remote (unicast):**
```c
typedef struct __attribute__((packed)) {
    uint8_t  field_index;
    uint8_t  value[4];    // generic 4-byte value
} espnow_command_t;
```

**NACK — Bridge → Remote (unicast):**
```c
typedef struct __attribute__((packed)) {
    uint8_t  reason;     // 0 = unknown, 1 = not_joined, 2 = bad_counter
} espnow_nack_t;
```

**HEARTBEAT — Remote → Bridge (unicast):**
```c
typedef struct __attribute__((packed)) {
    uint32_t uptime_seconds;
} espnow_heartbeat_t;
```

**Field types (referenced in SCHEMA_PUSH):**
```c
typedef enum {
    FIELD_TYPE_SENSOR  = 0x01,
    FIELD_TYPE_SWITCH  = 0x02,
    FIELD_TYPE_BINARY  = 0x03,
    FIELD_TYPE_BUTTON  = 0x04,
    FIELD_TYPE_NUMBER  = 0x05,
} espnow_field_type_t;
```

**Note:** `FIELD_TYPE_HUMIDIFIER` (0x0F) and `FIELD_TYPE_DEHUMIDIFIER` (0x10) are enumerated in the protocol but **not currently supported** by the bridge. These entity types will be silently ignored if configured on a remote — discovery and state will not be published for them.

### Encryption

**Session key derivation (on each fresh DISCOVER cycle):**
```
session_key = HKDF-SHA256(PSK, bridge_nonce || remote_nonce)
```

Both bridge and remote derive the same session key independently using the nonces exchanged in DISCOVER/DISCOVER_ACK. After bridge reboot, a new bridge_nonce is generated, so the session key is completely different.

**Per-packet authentication (HMAC):**
```
auth_tag = first_8_bytes(HMAC-SHA256(session_key, header || payload))
```

The auth_tag is computed over the full header (6 bytes) and payload. It is appended to the packet (last 8 bytes after payload).

**Per-packet encryption (XOR keystream):**
```
keystream = HKDF-SHA256(session_key, "espnow" || tx_counter_as_4_bytes, payload_len)
ciphertext = payload XOR keystream
```

Decryption is identical — receiver derives the same keystream and XORs again.

**Counter:** `tx_counter` increments per packet from the sender (0 at rejoin, max 2^32-1). The combination `(session_key, tx_counter)` is never reused, ensuring each keystream is unique.

**DISCOVER packets:** No session key exists yet, so auth_tag is zeroed and HMAC verification is skipped for packet_type = DISCOVER only.

---

## Bridge Node (`esp_tree_bridge`)

### ESPHome YAML Config

```yaml
esphome:
  name: espnow-bridge

external_components:
  - source:
      type: git
      url: https://github.com/your-org/esp_tree_esphome.git
      ref: main
    components: [esp_tree_bridge]

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

mqtt:
  broker: !secret mqtt_host
  username: !secret mqtt_user
  password: !secret mqtt_pass

esp_tree_bridge:
  id: bridge_component
  network_id: "myhouse"
  psk: "a1b2c3d4e5f6..."
```

For a local checkout instead of GitHub:

```yaml
external_components:
  - source:
      type: local
      path: /config/esphome/esp_tree_esphome/components
    components: [esp_tree_bridge]
```

**Bridge Responsibilities**

1. **Discovery responder:** Listen for `PKT_DISCOVER`, respond with nonce. Remote picks this bridge based on signal strength and locks to it.
2. **Join manager:** Receive `PKT_JOIN`, check schema_hash for cache hit.
3. **Schema handler:** If schema_hash not cached → iterate `SCHEMA_REQUEST` → receive `SCHEMA_PUSH`, publish MQTT discovery. Track previously published entities per MAC.
4. **State forwarding:** Receive `PKT_STATE`, decrypt, publish to MQTT state topics, send `PKT_ACK(ACK_STATE)`
5. **Command delivery:** Receive HA commands from MQTT, deliver via `PKT_COMMAND`, receive `PKT_ACK(ACK_COMMAND)`
6. **Diagnostics:** Expose bridge uptime, connected node count via HA entities
7. **Entity cleanup on schema change:** When a new schema arrives for a known MAC, bridge publishes empty retained message to previously published entity topics to clear stale HA entities, then publishes new discovery.

**Note on bridge reboot:** Bridge is stateless (no NVS). After reboot, it has no memory of previously published entities. Stale HA entities from prior sessions must be manually deleted in Home Assistant. This is acceptable for v1 — schema changes are infrequent and manual cleanup is rare.

**Web Server Topology Endpoint:** The bridge exposes a web-based topology view at `/topology` and `/topology.json`. This endpoint has **no authentication** and exposes full network topology including MAC addresses, hop counts, and online/offline status. Do not expose the bridge's web interface on untrusted networks.

### Node Identity

Nodes are identified by their **MAC address** — globally unique per ESP32, stable across reboots, PSK changes, and bridge replacement.

- Remote MAC is sent in DISCOVER. Bridge uses MAC directly for session tracking and MQTT topics.
- MQTT topics and HA entity names use the MAC address directly
- No NVS storage required — bridge is stateless, remotes rejoin and entities re-appear automatically after reboot

**Example MQTT topics for a remote with MAC `AABBCCDDEEFF`:**
```
homeassistant/sensor/AABBCCDDEEFF_temperature/config
homeassistant/sensor/AABBCCDDEEFF_temperature/state
homeassistant/switch/AABBCCDDEEFF_garden_light/config
homeassistant/switch/AABBCCDDEEFF_garden_light/state
```

If a remote's bridge disappears and it reconnects to a different bridge, the MQTT topics are the same — HA entities remain stable.

### HA Entities Created by Bridge

**Per joined node (diagnostic — do not put on dashboards):**

| Entity | Type | Purpose |
|--------|------|---------|
| `<mac>_last_seen` | sensor | Timestamp of last STATE |
| `<mac>_signal` | sensor | RSSI of last packet |
| `<mac>_uptime` | sensor | Remote uptime (seconds) |

**Per field on a node:**

| Entity | Type | Purpose |
|--------|------|---------|
| `<mac>_<field_name>` | sensor/switch/binary_sensor/button | Field value / control |

**Bridge own entities (diagnostic):**

| Entity | Type |
|--------|------|
| `espnow_bridge_uptime` | sensor (seconds) |
| `espnow_bridge_nodes_joined` | sensor (count) |

### MQTT Topics

Bridge acts as MQTT client. Remotes never touch MQTT directly.

All topics use the remote's MAC address for stable entity naming across bridge reboots and roaming.

**Discovery (retained):**
```
homeassistant/<component>/<mac>_<field_name>/config
```
e.g. `homeassistant/sensor/AABBCCDDEEFF_temperature/config`

**State:**
```
homeassistant/<component>/<mac>_<field_name>/state
```
e.g. `homeassistant/sensor/AABBCCDDEEFF_temperature/state`

**Command (for commandable entities):**
```
homeassistant/<component>/<mac>_<field_name>/command
```
e.g. `homeassistant/switch/AABBCCDDEEFF_garden_light/command`

**Component types:**

| Entity type | HA component |
|------------|-------------|
| FIELD_TYPE_SENSOR | `sensor` |
| FIELD_TYPE_SWITCH | `switch` |
| FIELD_TYPE_BINARY | `binary_sensor` |
| FIELD_TYPE_BUTTON | `button` |
| FIELD_TYPE_NUMBER | `number` |

**Discovery payload schema (per entity):**
```json
{
  "name": "<node_label> <field_name>",
  "unique_id": "<mac>_<field_name>",
  "object_id": "<mac>_<field_name>",
  "state_topic": "homeassistant/<component>/<mac>_<field_name>/state",
  "command_topic": "homeassistant/<component>/<mac>_<field_name>/command",
  "device": {
    "identifiers": ["<mac>"],
    "name": "<node_label>",
    "manufacturer": "ESPHome",
    "model": "esp_tree_remote"
  },
  "origin": {
    "name": "esp_tree_bridge",
    "sw_version": "1.0"
  },
  "entity_category": "<diagnostic or null>",
  "device_class": "<if applicable>",
  "state_class": "<if applicable>",
  "unit_of_measurement": "<if applicable>"
}
```

**Retain behavior:**
- Discovery config: **retained** (so HA picks up entity immediately on reboot)
- State: **not retained** (continuous stream from remote)

**Availability:**
- For always-on remotes: offline if no STATE or HEARTBEAT received for 3 × heartbeat_interval
- Remote sets `availability` payload (online/offline) on a per-entity availability topic
- Deep-sleep remotes: availability handled in v2 (Future Roadmap)

**Diagnostic entities** (`<mac>_last_seen`, `<mac>_signal`, `<mac>_uptime`):
- `entity_category: "diagnostic"`
- `entity_registry_visible: false` (hidden from UI dashboards)

---

## Remote Node (`esp_tree_remote`)

### ESPHome YAML Config

```yaml
esphome:
  name: outdoor-temp-sensor

external_components:
  - source:
      type: local
      path: /config/components
    components: [esp_tree]

esp_tree_remote:
  network_id: "myhouse"
  psk: "a1b2c3d4e5f6..."
  sleep_duration: 300      # 0 = always-on
  node_label: "Backyard Sensor"
  heartbeat_interval_seconds: 60  # optional, default 60

sensor:
  - platform: dht
    pin: GPIO4
    temperature:
      name: "Backyard Temperature"
    humidity:
      name: "Backyard Humidity"

switch:
  - platform: gpio
    pin: GPIO5
    name: "Garden Light"
    id: garden_light

binary_sensor:
  - platform: gpio
    pin: GPIO12
    name: "Motion Detected"
    id: motion
```

### How ESPHome Entities Map to ESP-NOW Fields

Field mapping is automatic — the `esp_tree_remote` component captures ESPHome entity setup and registers fields with the bridge via SCHEMA_PUSH.

| ESPHome entity type | ESP-NOW field type | HA entity created |
|---------------------|--------------------|-------------------|
| `sensor:` | `FIELD_TYPE_SENSOR` | `sensor:` |
| `switch:` | `FIELD_TYPE_SWITCH` | `switch:` |
| `binary_sensor:` | `FIELD_TYPE_BINARY` | `binary_sensor:` |
| `button:` | `FIELD_TYPE_BUTTON` | `button:` |
| `number:` | `FIELD_TYPE_NUMBER` | `number:` |

### State Transmission Model

1. **After JOIN:** Remote sends **full snapshot** of all entity values
2. **Normal operation:** Remote sends **delta updates only** (only entities that changed)
3. **No changes:** Remote sends HEARTBEAT at heartbeat interval (only if no other packet sent in that interval)
4. Bridge updates entity state from received STATE packets

### Lifecycle (Always-On)

```
Power on
    │
    ▼
ESPHome setup(): register all entities
    │
    ▼
esp_tree_remote::setup():
    ├── Initialize ESP-NOW LR
    ├── Send PKT_DISCOVER (broadcast)
    ├── Wait for PKT_DISCOVER_ACK
    ├── Send PKT_JOIN
    │
    ▼
PKT_JOIN_ACK received
    │
    ▼
Bridge checks schema cache:
    │  schema_hash matches cached? → skip schema exchange
    │  otherwise → full schema exchange
    │
    ▼
Normal loop:
    ├── Entity state change → PKT_STATE → bridge
    ├── Bridge → PKT_ACK(ACK_STATE)
    ├── Heartbeat: only sent if heartbeat interval has expired with no outbound packet to bridge
    │                (i.e. if no STATE sent for heartbeat_interval_seconds, send HEARTBEAT)
    └── PKT_COMMAND from bridge → apply → PKT_ACK(ACK_COMMAND)
```

### Lifecycle (Deep-Sleep)

```
Wake from deep sleep
    │
    ▼
esp_tree_remote::setup():
    ├── Initialize ESP-NOW LR immediately
    ├── Send PKT_DISCOVER → PKT_DISCOVER_ACK
    ├── Send PKT_JOIN → wait for JOIN_ACK
    │
    ▼
Bridge checks schema cache:
    │  schema_hash matches cached? → skip schema exchange
    │  otherwise → full schema exchange
    │
    ▼
Read sensor states
    │
    ▼
For each field that changed (or all fields if first wake):
    └── Transmit PKT_STATE (one field per packet)
    │
    ▼
Go back to deep sleep for sleep_duration seconds
```

### Minimal Config

```yaml
esp_tree_remote:
  network_id: "myhouse"
  psk: "a1b2c3d4e5f6..."
  sleep_duration: 300
  node_label: "Workshop Sensor"

dht:
  pin: GPIO4
  update_interval: 5s
```

### Command Handling

```
HA (switch.flip) → MQTT command topic
    │
    ▼
Bridge receives → queues command for node
    │
    ▼
Next PKT_STATE from remote arrives
    │
    ▼
Bridge sends PKT_COMMAND to remote
    │
    ▼
Remote applies command → PKT_ACK(ACK_COMMAND)
    │
    ▼
ESPHome entity updates → new state in next PKT_STATE
```

---

## Bridge Reboot / Session Loss

Remote detects bridge loss in two ways:

**1. NACK with reason = not_joined (reason=1):**
→ Immediate re-DISCOVER. Bridge has rebooted and forgotten this remote.

**2. NACK with reason = unknown (0) or bad_counter (2), or no response at all:**
→ Full retry loop. After all retries exhausted, increment packet_fail_count.
If packet_fail_count >= 3: re-DISCOVER.

```
Packet failure handling:
    │
    ▼
NACK (reason=1 not_joined)?
    │ Yes → re-DISCOVER immediately
    ▼ No
NACK (reason=0 or 2) OR no response?
    │ No → normal loop
    ▼ Yes
Retry 1 → fail
Retry 2 → fail
Retry 3 → fail
    │
    ▼
packet_fail_count++
if packet_fail_count >= 3:
    re-DISCOVER
else:
    wait for next heartbeat interval, try again
```

**packet_fail_count resets to 0** on any successful STATE exchange. One successful packet clears the counter.

---

## Join Flow

```
Remote wakes / powers on
    │
    ▼
PKT_DISCOVER (broadcast)
    │
    ▼
Bridge receives
    │  Validates NETWORK_ID, PROTOCOL_VERSION
    │  Sends PKT_DISCOVER_ACK (unicast) with bridge_nonce
    │
    ▼
Remote derives session key from PSK + bridge_nonce + remote_nonce
    │
    ▼
Remote sends PKT_JOIN (unicast) with node_label and schema_hash
    │
    ▼
Bridge looks up session_key for this MAC
Bridge checks schema cache for this MAC:
    │  If schema_hash matches cached → schema unchanged → skip schema exchange
    │  If no match or no cache → full schema exchange
    │
    ▼
Bridge sends PKT_JOIN_ACK
    │
    ▼
Bridge iterates schema:
    │  Bridge → Remote: SCHEMA_REQUEST (index = 0)
    │  Remote → Bridge: SCHEMA_PUSH (index=0, total=N, data...)
    │  Bridge → Remote: SCHEMA_REQUEST (index = 1)
    │  Remote → Bridge: SCHEMA_PUSH (index=1, total=N, data...)
    │  ... repeat until entity_index == total_entities
    │
    ▼
Bridge publishes MQTT discovery for each field
    │
    ▼
Normal operation: PKT_STATE ↔ MQTT state topics
```

---

## v1 Scope

**In scope:**
- `components/esp_tree_bridge/` external component
- `esp_tree_bridge` YAML component
- `esp_tree_remote` YAML component with full ESPHome entity support (sensor, switch, binary_sensor, button)
- Protocol layer: discovery, join, schema push, crypto, state forwarding, command delivery
- MQTT discovery for all entity types
- HA diagnostics: last_seen, signal strength, uptime
- Bridge diagnostics entities

**Out of scope for v1:**
- OTA for remotes (physical flash only)
- Web UI for node management
- ESPHome native API (MQTT only)
- Changing the protocol after v1

---

## Future Roadmap

### Command Delivery to Deep-Sleep Remotes

When a command arrives at the bridge while a deep-sleep remote is offline:
- Bridge queues the command in memory (not NVS)
- When remote wakes and sends STATE, bridge delivers queued COMMAND packets
- Commands have a TTL (e.g., 5 minutes). If remote doesn't wake within TTL, command is dropped
- Multiple commands for same field are collapsed — only latest value is sent
- If no commands queued, bridge sends nothing extra (remote just sends STATE as normal)

**Open questions:**
- Should commands be persisted across bridge reboot? (Would require NVS.)
- What's a sensible TTL? Trade-off between responsiveness and stale command delivery.

---

### Session Offloading to Persistent MQTT (Sneaky Storage)

When bridge RAM is constrained, inactive sessions may be offloaded to a persistent MQTT topic as a storage mechanism, allowing the bridge to maintain more than the RAM-limited session count.

**Concept:**
- When a session goes offline and RAM pressure is high, serialize the session state (session_key, schema, entity definitions, routing info) to a JSON payload
- Publish to a dedicated MQTT topic (e.g., `esphome/esp_tree_bridge/sessions/{leaf_mac}`) with MQTT retain flag set
- Clear the session from RAM
- When the leaf rejoins, check for retained MQTT message, deserialize, and restore session

**Why this is "sneaky":**
- MQTT retain on broker == effectively a persistent JSON store without NVS
- Survives bridge reboot (topic retained on broker)
- Can survive across bridge swaps (if same PSK/network_id)
- Session key is already encrypted per-session, so storing it in MQTT retain is no worse than storing in NVS

**Implications:**
- Adds latency on rejoin (MQTT read + parse)
- Requires sufficient MQTT broker storage for retained messages (each session ~2-4KB)
- Session state must be re-derived on every join anyway (HMAC verification still requires session_key in RAM)
- Fallback to normal join if MQTT restore fails or topic absent

**Open questions:**
- Should we store active sessions too (not just offline)? Trade-off RAM vs latency on every TX.
- How to handle schema_hash validation on restore? Schema may have changed since offline.
- Do we want to limit total offloaded sessions to prevent MQTT broker bloat?

See also: `docs/espnow_v2_spec.md` §14.1 Session Management for RAM-based session constraints.

---

## Open Questions

1. **Retry and timeouts** *(resolved for v1 defaults)*:

These defaults are approved for v1 and should be treated as implementation constants unless future testing requires changes.

| Packet | Sender | Interval | Jitter | Retries |
|--------|--------|----------|--------|---------|
| DISCOVER | Remote | Backoff per sweep (100ms → 200ms → 400ms → 800ms → 1000ms cap) | ±50ms | 5 attempts per channel, sweep 13 channels, restart with next interval |
| JOIN | Remote | 1000ms | ±50ms | 3 attempts, then restart from DISCOVER |
| STATE | Remote | 250ms | ±50ms | 3 then wait for next heartbeat |
| SCHEMA_PUSH | Remote | — | — | No retry (bridge drives) |
| SCHEMA_REQUEST | Bridge | 200ms | ±50ms | 3 |
| COMMAND | Bridge | 250ms | ±50ms | 3 then drop |

**No retry:** DISCOVER_ACK, JOIN_ACK, STATE_ACK, COMMAND_ACK, NACK, HEARTBEAT

**Discover backoff:** Interval doubles between sweeps: 100ms → 200ms → 400ms → 800ms → 1000ms (capped). Each sweep sends 5 DISCOVER broadcasts per channel across all 13 Wi-Fi channels, with 100ms collection window between attempts. Full sweep completes before selecting best bridge (lowest hop count, then strongest RSSI).

**Notes:**
- Deep-sleep remotes use same retry values. Battery impact is minimal since retries only occur during brief wake cycles.
- If JOIN fails after 3 attempts (1s apart), remote restarts from DISCOVER.
- If COMMAND fails after retries, command is dropped. HA will resend if needed.
- Heartbeat interval: default 60s, configurable per-remote via YAML (`heartbeat_interval_seconds: 120`)

2. **Max remotes per bridge:** Tested to 20. Each remote sends STATE packets on heartbeat interval (default 60s), plus state changes. Well within ESP-NOW and MQTT capacity. May handle more — not hard limited by protocol.

3. **Multi-bridge with same PSK:** Must not be active simultaneously — both would publish to same MQTT topics. Supported as failover only, not load balancing.

## Deployment Constraints

- A remote has one active bridge at a time; bridge reselection occurs only via re-DISCOVER.
- Home Assistant entity identity is derived from remote MAC-based MQTT topics, not bridge identity.
- For roaming/failover to work predictably, all bridges sharing a PSK/network_id must use the same Wi-Fi/ESP-NOW channel after discovery.
- Remote discovery sweeps all channels before locking to the bridge's channel.

---
