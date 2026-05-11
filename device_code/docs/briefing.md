# ESP-NOW LR + ESPHome Project Briefing

## Overview

This project delivers a complete end-to-end system for managing battery-powered ESP32 remote sensors over ESP-NOW Long Range (LR), surfaced into Home Assistant as native entities. It consists of two repositories:

| Repository | Role |
|------------|------|
| `ESPLR_V2` (this repo) | ESPHome external components (`esp_tree_bridge`, `esp_tree_remote`) + protocol definitions (`espnow_types.h`) |
| `esphomenow-tree-ha` | Home Assistant add-on ("ESPHome ESPNow Tree") — topology UI, OTA management, bridge communication |

**Relationship:** The HA add-on is the management plane for the ESP-NOW LR network running on ESPLR_V2 firmware. The add-on communicates with the bridge via HTTP or WebSocket (Bridge API v1), while the bridge speaks ESP-NOW LR to remotes and MQTT to Home Assistant.

---

## Purpose

**Goal:** Enable ESPHome users to deploy remote ESP32 nodes beyond Wi-Fi range, using ESP-NOW LR as the long-range radio backhaul to a WiFi-connected bridge node. Remote configuration and entity management mirror native ESPHome YAML syntax, surfaced in Home Assistant through MQTT discovery.

### Target Deployment

- Remotes are always beyond Wi-Fi range — they cannot reach the home WiFi network directly.
- Single bridge topology: one bridge per Home Assistant instance.
- v1: always-on remotes (mains or solar). v2: battery deep-sleep remotes (roadmap).
- Not a fork of espnow-network. Built from scratch with learnings from that project.

---

## Spec Summary

### Protocol

The radio protocol is defined in `espnow_types.h` as the single source of truth. Key elements:

| Packet | Value | Direction | Encrypted | Purpose |
|--------|-------|-----------|----------|---------|
| `PKT_DISCOVER` | 0x00 | Remote → Bridge (broadcast) | No | Join request with network ID + nonce |
| `PKT_DISCOVER_ANNOUNCE` | 0x01 | Bridge/Relay → Remote (unicast) | No | Parent candidate announcement |
| `PKT_JOIN` | 0x02 | Remote → Bridge (unicast) | No (PSK auth) | Session establishment + schema hash |
| `PKT_JOIN_ACK` | 0x03 | Bridge → Remote (unicast) | No (PSK auth) | Join confirmation / stage gate |
| `PKT_STATE` | 0x04 | Remote → Bridge (unicast) | Yes | Entity value updates |
| `PKT_ACK` | 0x05 | Bidirectional (unicast) | Yes | Unified ACK — `ack_type` matches packet being acked |
| `PKT_COMMAND` | 0x06 | Bridge → Remote (unicast) | Yes | HA command delivery |
| `PKT_CONFIG` | 0x07 | Bridge → Remote (unicast) | Yes | Management commands (roadmap) |
| `PKT_SCHEMA_REQUEST` | 0x08 | Bridge → Remote (unicast) | Yes | Request entity schema |
| `PKT_SCHEMA_PUSH` | 0x09 | Remote → Bridge (unicast) | Yes | Entity schema delivery |
| `PKT_HEARTBEAT` | 0x10 | Remote → Bridge (unicast) | Yes | Liveness + route TTL refresh |
| `PKT_DEAUTH` | 0x11 | Bridge → Remote (unicast) | No (PSK auth) | Out-of-session rejoin signal |
| `PKT_FILE_TRANSFER` | 0x12 | Bridge → Remote (unicast) | Yes | OTA file control (ANNOUNCE/END/ABORT) |
| `PKT_FILE_DATA` | 0x13 | Bridge → Remote (unicast) | Yes | OTA chunked file data |

### Security

- **Two-layer auth:** PSK tag (4 bytes HMAC-SHA256) on all packets + session tag (8 bytes) on encrypted packets.
- **Key derivation:** `session_key = HKDF-SHA256(PSK, bridge_nonce || remote_nonce)` — refreshed on each rejoin.
- **Per-packet encryption:** AES-CTR with tx_counter as nonce. `(session_key, tx_counter)` pair never reused.
- **Session freshness:** Counter resets to 0 on rejoin; captured packets cannot pass auth after rejoin.
- **Not-Joined Policy:** Bridge responds to unexpected packets with DEAUTH (not NACK), bound to triggering packet's tx_counter + fingerprint.

### Radio Frame Format

Every ESP-NOW LR frame layout (bytes from start of ESP-NOW payload):

| Bytes | Field | Auth | Notes |
|-------|-------|------|-------|
| 0 | protocol_version (uint8) | EXCLUDED | Must equal 3. Allows version mismatch detection. |
| 1 | hop_count (uint8) | EXCLUDED | bit 7=direction (0=upstream, 1=downstream), bit 6=V2_MTU path flag, bits 3-0=hop count |
| 2 | packet_type (uint8) | PSK + session | See packet type table |
| 3-8 | leaf_mac[6] | PSK + session | Canonical leaf identity — never relay MAC |
| 9-12 | tx_counter (uint32 LE) | PSK + session | Sender's monotonic counter |
| 13-16 | psk_tag[4] | N/A | HMAC-SHA256(PSK, bytes[2..12] + payload)[0:4] |
| 17+ | payload | session tag | Encrypted packets only |
| last 8 | session_tag[8] | N/A | HMAC-SHA256(session_key, bytes[2..12] + ciphertext)[0:8] |

**Max payload by radio version:**

| Radio | Max ESP-NOW Payload | Encrypted payload | Max entity fragment |
|-------|---------------------|-------------------|---------------------|
| V1 (ESP32) | 250 bytes | 225 bytes | 220 bytes |
| V2 (ESP32-C5/C6/C3) | 1470 bytes | 1445 bytes | 1440 bytes |

V2_MTU bit is set by V2-capable senders and preserved by V2 relays; V1 relays naturally strip it.

### Fragmentation

STATE, COMMAND, SCHEMA_PUSH use a 5-byte fragment envelope:

| Field | Size | Description |
|-------|------|-------------|
| entity_index | 1 | Entity index for STATE/COMMAND; descriptor_index for SCHEMA_PUSH |
| flags | 1 | bit 0=MORE_FRAGMENTS, bit 1=MORE_DIRTY (initial state sync only) |
| fragment_index | 1 | Zero-based index within logical message |
| fragment_count | 1 | Total fragments for this logical message |
| value_len | 1 | Number of payload bytes in this fragment |

During initial state sync (JOIN_ACK stage=2), sender sets `MORE_DIRTY` on the last fragment of each STATE message to indicate more dirty entities remain.

### State and Schema

- Schema exchange driven by bridge: `SCHEMA_REQUEST(index=N)` → remote `SCHEMA_PUSH(index=N, total, data)`, until `entity_index == total_entities`.
- Identity descriptor sent first (index 0), followed by entity descriptors starting at index 1.
- Schema hash (SHA-256 over identity fields + all entity schema structs) enables cache hits — skip exchange if hash matches bridge cache.
- `espnow_identity_push_t` (205 bytes): esphome_name, node_label, firmware_epoch, project_name, project_version, total_entities, max_frame_payload, chip_model, build_date, build_time, firmware_md5.
- `espnow_schema_push_t` (222 bytes): entity_index, total_entities, entity_type, entity_name[32], entity_unit[8], entity_id[32], entity_options[145].

### Entity Types

| ESPHome Entity | Field Type | HA Component |
|---------------|------------|-------------|
| `sensor:` | 0x01 | sensor |
| `switch:` | 0x02 | switch |
| `binary_sensor:` | 0x03 | binary_sensor |
| `button:` | 0x04 | button |
| `number:` | 0x05 | number |
| `text` | 0x06 | text_sensor |
| `climate` | 0x07 | climate |
| `cover` | 0x08 | cover |
| `light` | 0x09 | light |
| `fan` | 0x0A | fan |
| `lock` | 0x0B | lock |
| `alarm_control_panel` | 0x0C | alarm_control_panel |
| `select` | 0x0D | select |
| `event` | 0x0E | event |
| `humidifier` | 0x0F |humidifier (silently ignored) |
| `dehumidifier` | 0x10 | dehumidifier (silently ignored) |
| `valve` | 0x11 | valve |
| `time` | 0x12 | time |
| `datetime` | 0x13 | datetime |

Entity options blob (145 bytes) carries capability strings: `FAN:speed_count=<n>;oscillation=0|1;direction=0|1;presets=name|name|...` and `LIGHT:color_modes=onoff|brightness|white|color_temp|rgb|rgbw|rgbww;min_mireds=<f>;max_mireds=<f>;effects=name|name|...`.

### Heartbeat and Availability

- Default 60s, configurable per-remote.
- Offline after 3 × heartbeat_interval with no STATE or HEARTBEAT.
- Heartbeat carries: uptime_seconds, expected_contact_interval_seconds, parent_mac, direct_child_count, total_child_count, remote_rssi_dbm.
- Heartbeat is session-encrypted; relays forward ciphertext opaquely without decryption.

### Routing

- Tree topology rooted at bridge. Each node has exactly one parent.
- Route TTL: flat 172800s (48h) refreshed on any valid upstream packet.
- Downstream: look up leaf_mac → forward to next_hop_mac. If not found: DROP.
- Relay increments hop_count and preserves V2_MTU bit when forwarding.
- Relay does NOT terminate sessions — forwards encrypted blobs only.
- Route creation only on JOIN; DISCOVER never forwarded.

---

## Architecture

```
Remote ESP32 (esp_tree_remote)
  ├── No WiFi — ESP-NOW LR only
  ├── May act as relay if enabled and selected by children
  ├── ESPHome YAML: sensors, switches, lights, fans, covers, etc.
  └── ESP-NOW LR → bridge (direct or via relay chain)

Bridge ESP32 (esp_tree_bridge)
  ├── WiFi connected (station mode)
  ├── MQTT connected to broker → Home Assistant
  ├── ESP-NOW LR ← remotes / relays
  ├── HTTP endpoints: /topology.json, /api/ota/*
  └── WebSocket endpoint: /esp-tree/v1/ws (Bridge API v1)

Home Assistant Add-on (esphomenow-tree-ha)
  ├── Ingress UI panel for topology view
  ├── OTA firmware upload and flash management
  ├── HTTP mode: polling /topology.json and /api/ota/*
  └── WebSocket mode: live events via Bridge API v1
```

### MQTT Architecture

Bridge acts as MQTT client. Remotes never touch MQTT directly.

**Discovery topics (retained):**
```
homeassistant/<component>/<mac>_<field_name>/config
```

**State topics (not retained):**
```
homeassistant/<component>/<mac>_<field_name>/state
```

**Command topics:**
```
homeassistant/<component>/<mac>_<field_name>/command
```

**Per-joined-node diagnostic entities:**
- `<mac>_last_seen` (sensor) — timestamp of last STATE
- `<mac>_signal` (sensor) — RSSI of last packet
- `<mac>_uptime` (sensor) — remote uptime in seconds

**Bridge-level diagnostic entities:**
- `espnow_bridge_uptime` (sensor, seconds)
- `espnow_bridge_nodes_joined` (sensor, count)

**Discovery payload schema:**
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
  "entity_category": "diagnostic or null",
  "device_class": "<if applicable>",
  "state_class": "<if applicable>",
  "unit_of_measurement": "<if applicable>"
}
```

---

## Bridge HTTP Interface (Legacy)

The bridge exposes HTTP endpoints for the add-on's HTTP transport mode:

### `GET /topology.json`

Returns the current network topology as JSON.

Response shape:
```json
{
  "bridge": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "name": "espnow-bridge-c5",
    "uptime_s": 12345
  },
  "remotes": [
    {
      "mac": "11:22:33:44:55:66",
      "name": "kitchen_sensor",
      "parent_mac": "AA:BB:CC:DD:EE:FF",
      "hop_count": 1,
      "rssi": -61,
      "online": true,
      "last_seen_s": 30,
      "uptime_s": 86400,
      "chip_type": "esp32c3",
      "schema_hash": "sha256:..."
    }
  ]
}
```

### `POST /api/ota/start`

Initiates an OTA job. Body: `target_mac`, `size`, `md5`, `filename`.

### `GET /api/ota/status`

Returns current OTA job status: `active`, `job_id`, `target_mac`, `state`, `bytes_received`, `size`, `percent`, `next_sequence`, `window_size`, `max_chunk_size`.

### `POST /api/ota/chunk`

Sends a firmware chunk. Body: `job_id`, `sequence`, `offset`, `data` (base64). Max chunk size ~750 bytes due to 1024-byte POST body limit with base64 overhead.

### `POST /api/ota/abort`

Aborts the active OTA job.

---

## Bridge WebSocket API (Bridge API v1)

Full protocol spec in `docs/bridge_api/bridge_api_v1.md`. Transport profile: WebSocket at `ws://<bridge_host>:<port>/esp-tree/v1/ws`.

### Authentication

HMAC-SHA256 challenge-response, API key never sent directly.

1. Client opens WebSocket
2. Bridge sends `auth.challenge` with `server_nonce`, protocol name, version range
3. Client replies with `auth.response` containing `client_nonce` and `hmac` of `esp-tree-ws|v1|<client>|<server_nonce>|<client_nonce>` using API key
4. Bridge replies with `auth.ok` or closes socket on failure

### Message Envelope

All messages after auth are JSON:
```json
{
  "v": 1,
  "id": "request-id",    // omitted for unsolicited bridge events
  "type": "message.type",
  "payload": {}
}
```

### Core Messages

**`bridge.info`** — Bridge metadata, capabilities, limits.
```json
{
  "api_version": 1,
  "name": "espnow-bridge-c5",
  "mac": "AA:BB:CC:DD:EE:FF",
  "firmware": { "name": "...", "version": "2026.5.1", "esphome_version": "..." },
  "features": { "topology": true, "events": true, "ota_ws": true, "mqtt_export": true, "legacy_http": true },
  "limits": { "max_json_bytes": 8192, "max_ws_chunk_size": 2048, "ota_window_size": 4 }
}
```

**`topology.get`** — Request topology snapshot.
```json
{
  "type": "topology.get",
  "payload": {}
}
```

**`topology.snapshot`** — Full topology response including bridge and nodes with identity, session, radio, and diagnostics blocks. Schema and state are fetched on-demand per node.

### Events (Bridge → Client, no `id`)

- `bridge.heartbeat` — sent ~every 30s for connection liveness
- `topology.changed` — node joined, left, or route changed
- `remote.availability` — online/offline transition
- `remote.state` — entity value update
- `remote.schema_changed` — remote's schema hash changed

### OTA Over WebSocket

1. Client sends `ota.start`: target_mac, size, md5, sha256, filename, preferred_chunk_size
2. Bridge sends FILE_ANNOUNCE to remote over ESP-NOW
3. Remote responds with FILE_ACCEPT (or FILE_REJECT)
4. Bridge sends `ota.accepted` (deferred) with job_id, max_chunk_size, window_size, next_sequence
5. Client sends binary WebSocket frames — each frame has 24-byte header + payload:
   ```
   magic(2) + version(1) + header_length(1) + job_id_u32(4) + sequence(4)
   + firmware_offset(4) + payload_length(2) + flags(2) + crc32(4) + payload(N)
   ```
6. Client polls `ota.status` to track progress; next_sequence advances as bridge acks
7. `ota.abort` aborts job; bridge aborts on WebSocket disconnect (no resume in v1)

---

## Code Structure

### ESPLR_V2

```
ESPLR_V2/
├── espnow_types.h              # Protocol source of truth — all packet types, structs, defines
├── espnow_crypto.cpp/h         # HMAC-SHA256 + HKDF-SHA256 + AES-CTR (shared, mbedTLS + BearSSL for ESP8266)
│
├── components/
│   ├── esp_tree_bridge/       # Bridge ESPHome external component
│   │   ├── __init__.py
│   │   ├── bridge_protocol.cpp/h  # ESP-NOW LR receive, packet dispatch, session management, ACK handling
│   │   ├── esp_tree_bridge.cpp/h  # MQTT publish/subscribe, entity discovery, config commands
│   │   ├── bridge_api_router.cpp/h # WebSocket API v1 handler (topology, cache, OTA)
│   │   ├── ota_web_page.h        # Embedded HTML/JS for legacy OTA dashboard
│   │   └── ...
│   ├── esp_tree_remote/       # Remote ESPHome external component
│   │   ├── __init__.py
│   │   ├── remote_protocol.cpp/h  # State machine, join, heartbeat, relay forwarding, config handler
│   │   └── ...
│   ├── esp_tree_common/        # Shared includes (espnow_types.h, espnow_crypto.*)
│   └── esp_tree_shared/
│
├── demos/                      # Example YAML configurations
│   ├── espnow-bridge.yml
│   ├── espnow-remote.yml
│   └── README.md
│
├── docs/
│   ├── espnow_v3_spec.md        # Full protocol specification (1480 lines)
│   ├── bridge_api/bridge_api_v1.md # WebSocket API v1 spec (1137 lines)
│   ├── roadmap_config.md        # PKT_CONFIG management channel spec (535 lines)
│   └── ...
│
└── compile.sh                  # Build interface (Docker-based, interactive menu)
```

### esphomenow-tree-ha (HA Add-on)

```
esphomenow-tree-ha/
├── esphome-esp-tree-ha/
│   ├── config.yaml              # Add-on metadata: name, version 0.1.39, ingress:8099
│   ├── Dockerfile
│   ├── DOCS.md
│   ├── CHANGELOG.md
│   │
│   ├── app/
│   │   ├── server.py            # FastAPI server (port 8099, ingress)
│   │   ├── bridge_client.py     # HTTP transport: BridgeClient, BridgeManager
│   │   ├── bridge_ws_client.py # WebSocket transport: BridgeWsClient, BridgeWsManager (800+ lines)
│   │   ├── bridge_ws_ota.py    # OTA over WebSocket
│   │   ├── ota_worker.py        # Background OTA job runner
│   │   ├── compile_worker.py    # YAML → .bin compilation
│   │   ├── bin_parser.py        # Firmware metadata extraction from .bin
│   │   ├── db.py                # SQLite log/history (7-day retention)
│   │   ├── models.py            # Pydantic request/response models
│   │   ├── config.py            # Add-on config management
│   │   ├── firmware_store.py    # Firmware binary storage
│   │   ├── yaml_store.py        # YAML configuration storage
│   │   ├── yaml_scaffold.py     # YAML template generation
│   │   └── ...
│   │
│   ├── ui/                      # Lovelace/inert panel assets
│   └── rootfs/                  # HA add-on filesystem overlays
│
└── repository.yaml              # HA add-on repository manifest
```

---

## External Review Checklist

### Protocol Correctness
- [ ] All packet types (0x00–0x13, excluding 0x07) have matching dispatch in both bridge and remote
- [ ] V2_MTU bit propagation: bridge sets per session route state; remote requires own V2 capability before advertising
- [ ] PSK tag excludes bytes 0-1 (protocol_version, hop_count); session tag covers bytes 2-12
- [ ] DEAUTH validation: leaf matches response_to_packet_type, response_to_tx_counter, request_fingerprint
- [ ] Fragment reassembly: MORE_FRAGMENTS flag, MORE_DIRTY on last fragment during state sync
- [ ] JOIN_ACK stage=1 (schema refresh), stage=2 (send state), stage=100 (complete)

### Security
- [ ] DISCOVER/ANNOUNCE/JOIN/JOIN_ACK/DEAUTH are PSK-authenticated only (no session encryption)
- [ ] Session key derived identically: HKDF-SHA256(PSK, bridge_nonce || remote_nonce)
- [ ] tx_counter never wraps without rejoin (2^32-1 max)
- [ ] Replay protection: drop packets with counter <= last_seen_counter

### Bridge Statelessness
- [ ] Bridge is stateless (no NVS); schema/session cache is RAM-only
- [ ] Schema hash cache hit skips schema exchange
- [ ] On schema change: bridge publishes empty retained MQTT message to clear stale HA entities

### HA Add-on
- [ ] Only one active OTA job at a time; job aborts on WebSocket disconnect
- [ ] WebSocket reconnect backoff: 1s → 2s → 5s → 10s (capped)
- [ ] Version bump in both `config.yaml` and `server.py` version kwarg on every change
- [ ] HTTP OTA chunk capped at 750 bytes (1024 POST body limit with base64 overhead)
- [ ] WebSocket mode returns 501 for HTTP OTA endpoints

### Build
- [ ] `./compile.sh` produces clean builds for bridge, remote, espnow_82xx_remote, bridge_lite
- [ ] BearSSL path for ESP8266 uses correct vtable symbol name (`br_sha256_vtable`)

---

## Roadmap

### Phase 1 — In Progress (Current)
- [x] `esp_tree_bridge` packaged as ESPHome external component (builds cleanly)
- [x] Bridge diagnostics in ESPHome device
- [x] Protocol types and structures in `espnow_types.h` (v3)
- [x] Bridge API v1 WebSocket endpoint (Phase 1-2 complete)
- [x] V2 packet size support (1470-byte payloads for ESP32-C5/C6/C3)
- [x] OTA implementation across multi-hop relay chain
- [x] Light, fan, cover, lock, alarm, select, event entity support

### Phase 2 — Remote component completion
- [ ] Full `esp_tree_remote` external component
- [ ] State forwarding, command delivery, heartbeat
- [ ] MQTT discovery for all entity types

### Phase 3 — Config Channel (PKT_CONFIG)
- [ ] Remote config handler: REBOOT, OTA_ENABLE (captive portal), WIFI_CONNECT, HEARTBEAT_INTERVAL, DEAUTH, USE_PARENT, RELAY
- [ ] Bridge ESPHome entities for config commands
- [ ] Bridge-level WiFi connect as MQTT service call

### Phase 4 — OTA Captive Portal
- [ ] Remote soft-AP + captive portal on current ESP-NOW channel
- [ ] HTTP upload endpoint `/update`
- [ ] `esp_ota_*` API flash + reboot

### Phase 5 — HA Add-on Features
- [ ] WebSocket transport replaces HTTP for bridge communication
- [ ] Firmware retention (7-day rolling)
- [ ] Manual bridge host override + HA state auto-discovery
- [ ] Add-on API for future HA integration

### Future (v2)
- Battery deep-sleep remotes with command queuing at bridge
- Session offloading to persistent MQTT topics ("sneaky storage")
- Multi-bridge failover (passive standby only)

---

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `ESPLR_V2/espnow_types.h` | ~600 | Protocol source of truth: all packet types, structs, defines, constants |
| `ESPLR_V2/docs/espnow_v3_spec.md` | 1480 | Full radio protocol spec: frame format, fragmentation, security, routing, OTA |
| `ESPLR_V2/docs/bridge_api/bridge_api_v1.md` | 1137 | WebSocket API v1: auth, topology, events, cache, OTA |
| `ESPLR_V2/docs/roadmap_config.md` | 535 | PKT_CONFIG management channel spec |
| `ESPLR_V2/components/esp_tree_bridge/bridge_protocol.cpp` | ~800 | ESP-NOW LR receive, packet dispatch, session management |
| `ESPLR_V2/components/esp_tree_bridge/esp_tree_bridge.cpp` | ~900 | MQTT discovery/state, entity registry, config command dispatch |
| `esphomenow-tree-ha/esphome-esp-tree-ha/app/bridge_ws_client.py` | ~900 | WebSocket bridge client with HMAC auth and event handling |
| `esphomenow-tree-ha/esphome-esp-tree-ha/app/ota_worker.py` | ~600 | Background OTA job state machine |
| `esphomenow-tree-ha/esphome-esp-tree-ha/config.yaml` | 31 | Add-on config schema (version 0.1.39) |

---

## Code Evolution (Git Commit History)

| Date | Commit | Description |
|------|--------|-------------|
| 2026-05-03 | fe98972 | Adding autosearch on preferred parent and rsssi threshold and fixing 8266 code |
| 2026-05-03 | 82830c1 | Move to preferred parents from allowed and fix some api bugs bridge side |
| 2026-05-03 | 1716de6 | bridge-lite initial files and doc updates |
| 2026-05-03 | 856cb42 | EON handover to DS to fix api |
| 2026-05-02 | f5a03dd | Fix BearSSL vtable symbol name: br_sha256_VTABLE -> br_sha256_vtable |
| 2026-05-02 | 4b8428a | Add BearSSL/ESP8266 crypto path to shared espnow_crypto module |
| 2026-05-02 | 01cedee | Bridge API: fix WebSocket connection and add rich light/fan state objects |
| 2026-05-02 | 5c97dd3 | Drop loopback DISCOVER to prevent remote selecting itself as parent |
| 2026-05-02 | ffc54eb | Bridge API v1: fix 8 issues from bridge_api_issues.md |
| 2026-05-02 | b80d03a | Fix MQTT discovery: button cmd_topic and RAM sensor device_class |
| 2026-05-02 | 3c1755a | Fix crash and websock |
| 2026-05-02 | 00de242 | fix(bridge): add loop time budget to prevent watchdog resets during WiFi roam |
| 2026-05-01 | c1e4d8f | Fixes to RGB and OTA handling |
| 2026-05-01 | 53b2f85 | Add Bridge API v1 test CLI with HMAC auth, commands, and event monitoring |
| 2026-05-01 | ca4f237 | Fix light entity discovery corruption: ensure null termination in schema_push entity_options |
| 2026-05-01 | d4b9655 | Fix infinite rejoin loop: reset progress timestamps in route recovery and parent adoption |
| 2026-05-01 | 0e897be | Bridge API Phase 1 and 2 done |
| 2026-05-01 | 3442f50 | Fix light entity unavailable in HA: add color_mode, color_temp, white to protocol and MQTT JSON |
| 2026-05-01 | cfbb58d | Bugfix bridge reboot |
| 2026-05-01 | 31bd326 | Fix V2_MTU bit propagation: bridge only sets V2_MTU per session route state; remote requires own V2 capability before upgrading MTU |
| 2026-05-01 | 4da67b7 | ota fixes |
| 2026-04-30 | b950cfc | OTA mark alpha working well including multi-hop OTA |
| 2026-04-30 | a4cd1f6 | Fix OTA firmware date comparison by using raw __DATE__/__TIME__ strings |
| 2026-04-30 | c0db8dc | esp_tree_remote: re-send accept on duplicate announce instead of reject |
| 2026-04-30 | 1761de3 | remote: send OTA complete ACK 5x with 1s gap before restart |
| 2026-04-30 | 9772c6a | Add per-remote last_seen diagnostic (seconds since last packet) |
| 2026-04-30 | 85f04ec | fix infinite loop in total_children_count_ when routes form cycle |
| 2026-04-30 | 310dcbb | Unify schema/JOIN_COMPLETE retry with command retry (exponential backoff + jitter) |
| 2026-04-30 | a209a61 | Clear OTA rollback state on boot to allow OTA after interrupted update |
| 2026-04-30 | 822cb86 | Larger window on ota batch |
| 2026-04-30 | 9742906 | Fix uint8_t type mismatch in std::min for retry backoff |
| 2026-04-29 | 84f985b | EOD OTA implementation gpt5.5 pass - page working now test |
| 2026-04-29 | 8fac983 | OTA Implementation: Stage 8 - Integrated Frontend Dashboard into Bridge |
| 2026-04-29 | e1a984e | OTA Implementation: Stage 5 - Bridge OTA Manager with Sliding Window and Retry Logic |
| 2026-04-29 | 55a1daf | OTA Implementation: Stage 4 - Remote Protocol integration and relay forwarding |
| 2026-04-29 | 32ed5c9 | OTA Implementation: Stage 3 - Remote File Receiver state machine |
| 2026-04-29 | 199221f | OTA Stage 1 and 2 (GPT 5.4 med) |
| 2026-04-29 | 48113cc | Implementing the LR switch LOL |
| 2026-04-29 | 5d90b74 | esp_tree: wire espnow_mode YAML flag to actual ESP-NOW LR hardware mode |
| 2026-04-28 | a928cb3 | refactor(protocol, relay): unify heartbeat encryption, flat route TTL, remove child cap |
| 2026-04-27 | 923bed3 | docs clean up |
| 2026-04-26 | 4285a4b | bridge diagnostics: gate each field individually, skip publish if unchanged |
| 2026-04-25 | 6f6c0f5 | test: update tests for protocol changes |
| 2026-04-24 | 6552bf9 | fix(relay): use > not >= for max_hops depth checks |
| 2026-04-23 | 2bf49db | refactor: tighten airtime log format to match spec |
| 2026-04-22 | a02d32e | Adding relay allowed parent logic and adding parent mac to heartbeat |
| 2026-04-22 | f0ec776 | publish relay topology from heartbeat parent links |
| 2026-04-22 | 849680a | GPT 5.4 update to relay logic to have permitted parent for testing/manual config of networks |
| 2026-04-22 | 2b407b0 | Redefine ESP-NOW entity payloads as variable length |
| 2026-04-22 | 35d25a1 | Align ESP-NOW v2 transport and bridge behavior |
| 2026-04-21 | 2cc90e2 | Basic V2 working |
| 2026-04-20 | baf49b9 | Initial GPT5.4 full model fix getting V2 spec baseline working |
| 2026-04-20 | d76dfcc | Fix mqtt discovery for re flash of remotes & adjust compile to have flash options |
| 2026-04-19 | 691108a | add cover entity support |
| 2026-04-19 | 7b10488 | Cap queued commands on reconnect |
| 2026-04-19 | feea078 | Harden diagnostics and replay handling |
| 2026-04-19 | 11ab995 | Improve discovery retries and bridge session limits |
| 2026-04-19 | 3a68da0 | Tighten schema handling and reset discovery nonce |
| 2026-04-19 | 6f38869 | Harden crypto helpers and MQTT MAC parsing |
| 2026-04-19 | 11961ef | Adding session check on packets and nack to force immediate rejoin as well as discover logic updates |
| 2026-04-18 | 76829a8 | working proof of concept bridge and remote join schema sensor and switch working |
| 2026-04-17 | febe91e | deepseek wip - cleanup build and agents definition etc |
| 2026-04-17 | 60fc85a | deepseek3.2 directory cleanup |
| 2026-04-17 | 7a51d3d | wip remote and bridge baseline code up and talking. no ha remote yet |
| 2026-04-16 | 632cb9e | wip updates from mm2.7 we have remote sending discovers to bridge and bridge seeing them |
| 2026-04-16 | aba4bff | Package bridge external component and diagnostics |
| 2026-04-16 | ab5cbca | fix: add tx_counter increment to all TX paths (remote + bridge) |
| 2026-04-16 | dced511 | fix: RemoteProtocol loop() timing — use real millis(), fix retry fallthrough, track TX for heartbeat throttling |
| 2026-04-16 | 4e66e1e | Initial commit: ESP-NOW LR ESPHome integration spec |

### Key Evolution Themes

- **April 16-17, 2026:** Project init — bridge packaged as ESPHome external component, baseline bridge/remote discover/join working
- **April 18-22, 2026:** Schema exchange, entity discovery (sensor, switch), variable-length payloads, relay logic
- **April 23-28, 2026:** V2 protocol (1470-byte MTU), unified PKT_ACK, heartbeat encryption, flat route TTL, airtime logging, relay depth checks
- **April 29, 2026:** OTA implementation begins (Stages 1-8), ESP-NOW LR mode wiring, chip_type fixes
- **April 30, 2026:** Multi-hop OTA, children count fixes, firmware date comparison, last_seen diagnostics, rollback state handling
- **May 1, 2026:** Light/fan color_mode fixes, V2_MTU bit propagation, bridge API Phase 1-2 complete, RGB handling
- **May 2, 2026:** Bridge API v1 fixes (8 issues), WebSocket connection fixes, MQTT discovery button cmd_topic fix, BearSSL ESP8266 support, WiFi roam watchdog fix
- **May 3, 2026:** Preferred parent autosearch, RSSI threshold, bridge-lite component, EON handover, loopback DISCOVER drop