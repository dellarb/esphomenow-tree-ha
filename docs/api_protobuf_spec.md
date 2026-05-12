# Protobuf API Specification — ESP Tree Runtime v2

> **Package:** `esp.tree.runtime.v2`
> **Transport:** Binary WebSocket (not gRPC)
> **Serialization:** Protobuf `Envelope` wrapping all message types via `oneof msg`

---

## 1. Architecture

```
┌─────────────────────────────┐
│  HA Integration             │
│  (EspTreeRuntime)           │
│  bridge_runtime.py          │
│         │                   │
│  IntegrationWSClient        │
│  integration_client.py      │
│         │                   │
├─── WebSocket binary protobuf│
│   /esp-tree/integration/v1/pb
│         │                   │
│  Add-on Server              │
│  (ws_integration_pb)        │
│  server.py                  │
│         │                   │
│  BridgeV2Manager            │
│  BridgeV2Client (per-bridge)│
│  bridge_v2_client.py        │
│         │                   │
├─── WebSocket binary protobuf│
│   /esp-tree/v2/pb           │
│   subprotocol: esp-tree-pb  │
│         │                   │
│  ESP32 Bridge Firmware      │
└─────────────────────────────┘
```

Two distinct WebSocket connections carry protobuf messages:

| Connection | Path | Auth | Purpose |
|---|---|---|---|
| Bridge → Add-on | `/esp-tree/v2/pb` | Binary protobuf HMAC handshake | Bridge firmware to add-on backend |
| Add-on → HA Integration | `/esp-tree/integration/v1/pb` | JSON token handshake, then binary protobuf relay | Add-on to Home Assistant integration |

The add-on acts as a **transparent relay** between bridge and integration. It does not modify protobuf payloads — it forwards them bidirectionally while maintaining route tables for command dispatch.

---

## 2. Connection & Authentication

### 2.1 Bridge-to-Addon (`/esp-tree/v2/pb`)

**Subprotocol:** `esp-tree-pb`

**Constants:**
- `API_VERSION = 2`
- `CLIENT_KIND = "ha_integration"`
- `PROTOCOL = "esp-tree-pb"`

**Auth flow:**

```
Client                                       Bridge
  │                                            │
  │── WebSocket connect (subprotocol) ────────►│
  │                                            │
  │◄── AuthChallenge (Envelope) ───────────────│
  │    { server_nonce, min_version,             │
  │      max_version, protocol, bridge_mac }    │
  │                                            │
  │── AuthResponse ───────────────────────────►│
  │    { client_kind, client_name,              │
  │      client_nonce, hmac_sha256 }            │
  │                                            │
  │◄── AuthOk ─────────────────────────────────│
  │    { negotiated_version, server_name,       │
  │      bridge: BridgeIdentity,                │
  │      capabilities: BridgeCapabilities }     │
  │  OR                                         │
  │◄── AuthFailed ─────────────────────────────│
  │    { code, message }                        │
  │                                            │
  │── ClientHello ────────────────────────────►│
  │    { request_full_snapshot: true,            │
  │      integration_version }                   │
  │                                            │
  │◄── FullSnapshot ───────────────────────────│
  │  OR ◄── EventBatch (streaming) ────────────│
  │                                            │
```

**HMAC computation:**
```
digest_input = f"{PROTOCOL}|v2|{CLIENT_KIND}|{server_nonce.hex()}|{client_nonce.hex()}"
digest = HMAC-SHA256(api_key, digest_input)
```

**Backoff strategy:** `[1s, 2s, 5s, 10s]` — resets to 1s after 60s of successful connection.

### 2.2 Integration-to-Addon (`/esp-tree/integration/v1/pb`)

**Auth: JSON handshake, then binary protobuf.**

```
Integration                              Add-on Server
  │                                            │
  │── WebSocket connect ──────────────────────►│
  │                                            │
  │── { "type": "auth", "token": "..." } ─────►│
  │◄── { "type": "auth_ok" } ─────────────────│
  │                                            │
  │  (binary protobuf stream begins)            │
  │◄── FullSnapshot (replayed from cache) ─────│
  │◄── EventBatch (live streaming) ────────────│
  │── CommandRequest ─────────────────────────►│
  │◄── CommandResult ─────────────────────────│
```

The add-on server handler:
1. Accepts the WebSocket connection
2. Waits up to 10s for JSON auth `{"type": "auth", "token": "<integration_token>"}`
3. On success, sends `{"type": "auth_ok"}` and registers the client on `BridgeV2Manager`
4. Replays cached `FullSnapshot` messages from all known bridges
5. Starts a sender task that broadcasts bridge-originated snapshots/events to the integration
6. Receives binary frames from the integration, passes them to `handle_integration_frame()` for routing, and sends the response back

**Candidate URLs (attempted in order):**
1. Derived from `addon_url` config parameter
2. `ws://127.0.0.1:8099/esp-tree/integration/v1/pb` (local fallback)

---

## 3. Message Catalog

All messages are wrapped in a single `Envelope`:

```protobuf
message Envelope {
  string request_id = 1;     // UUID for request-response matching
  uint32 api_version = 2;    // Always 2
  oneof msg { ... }
}
```

### 3.1 Auth Messages (field numbers 10–14)

| Field | Message | Direction | Purpose |
|---|---|---|---|
| 10 | `AuthChallenge` | Bridge → Client | Initial challenge with nonce and version negotiation |
| 11 | `AuthResponse` | Client → Bridge | HMAC proof of API key possession |
| 12 | `AuthOk` | Bridge → Client | Authentication success with bridge identity |
| 13 | `AuthFailed` | Bridge → Client | Authentication failure |
| 14 | `ClientHello` | Client → Bridge | Post-auth handshake, optionally requests full state |

**AuthChallenge:**
| Field | Type | Description |
|---|---|---|
| `server_nonce` | `bytes` | Random 16-byte challenge |
| `min_version` | `uint32` | Minimum supported API version |
| `max_version` | `uint32` | Maximum supported API version |
| `protocol` | `string` | Protocol identifier (`"esp-tree-pb"`) |
| `bridge_mac` | `string` | Bridge MAC address (colon-separated) |

**AuthResponse:**
| Field | Type | Description |
|---|---|---|
| `client_kind` | `string` | Client type identifier (`"ha_integration"`) |
| `client_name` | `string` | Human-readable client name |
| `client_nonce` | `bytes` | Random 16-byte client nonce |
| `hmac_sha256` | `bytes` | HMAC-SHA256 digest over protocol material |

**AuthOk:**
| Field | Type | Description |
|---|---|---|
| `negotiated_version` | `uint32` | Agreed API version |
| `server_name` | `string` | Server name |
| `bridge` | `BridgeIdentity` | Bridge identity information |
| `capabilities` | `BridgeCapabilities` | Bridge capability flags |

**AuthFailed:**
| Field | Type | Description |
|---|---|---|
| `code` | `string` | Machine-readable error code |
| `message` | `string` | Human-readable error description |

**ClientHello:**
| Field | Type | Description |
|---|---|---|
| `request_full_snapshot` | `bool` | If true, bridge sends FullSnapshot immediately |
| `integration_version` | `string` | Version string of the integrating client |
| `known_remote_schemas[]` | `repeated KnownRemoteSchema` | Schemas the client already knows (optimization) |

### 3.2 State Messages (field numbers 15–22)

#### FullSnapshot (15) — Bridge → Client

Complete state of the bridge and all its remotes. Sent once on initial connection and on demand via `ClientHello`.

| Field | Type | Description |
|---|---|---|
| `bridge` | `BridgeIdentity` | Bridge identity |
| `bridge_runtime` | `BridgeRuntime` | Bridge runtime metrics |
| `remotes[]` | `repeated RemoteSnapshot` | All known remote devices |
| `snapshot_unix_ms` | `uint64` | Timestamp of snapshot creation (millisecond epoch) |

**BridgeIdentity:**
| Field | Type | Description |
|---|---|---|
| `bridge_mac` | `string` | Bridge MAC address |
| `bridge_name` | `string` | Short name |
| `friendly_name` | `string` | Human-readable name |
| `network_id` | `string` | Network identifier |
| `manufacturer` | `string` | Manufacturer (e.g. "ESPHome") |
| `model` | `string` | Hardware model |
| `project_name` | `string` | ESPHome project name |
| `project_version` | `string` | Firmware version |
| `firmware_build_date` | `string` | Build date string |
| `api_server` | `string` | API server URL |
| `chip_name` | `string` | Chip description (e.g. "ESP32-C5") |

**BridgeCapabilities:**
| Field | Type | Description |
|---|---|---|
| `supports_runtime_v2` | `bool` | Supports v2 runtime protocol |
| `supports_commands` | `bool` | Supports remote commands |
| `supports_schema_push` | `bool` | Supports schema push (unsolicited schema changes) |
| `supports_state_push` | `bool` | Supports unsolicited state push |
| `supports_topology` | `bool` | Supports topology reporting |
| `supports_config_commands` | `bool` | Supports config commands |

**BridgeRuntime:**
| Field | Type | Description |
|---|---|---|
| `online` | `bool` | Bridge online status |
| `wifi_rssi` | `sint32` | WiFi RSSI in dBm |
| `uptime_s` | `uint32` | Uptime in seconds |
| `remote_count` | `uint32` | Number of known remotes |

**RemoteSnapshot:**
| Field | Type | Description |
|---|---|---|
| `identity` | `RemoteIdentity` | Remote device identity |
| `runtime` | `RemoteRuntime` | Remote device runtime metrics |
| `descriptor_set` | `RemoteDescriptorSet` | Entity schema descriptors |
| `states[]` | `repeated EntityState` | Current entity state values |

**RemoteIdentity:**
| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Remote MAC address |
| `esphome_name` | `string` | ESPHome node name |
| `friendly_name` | `string` | Human-readable name |
| `manufacturer` | `string` | Manufacturer |
| `model` | `string` | Hardware model |
| `project_name` | `string` | ESPHome project name |
| `project_version` | `string` | Firmware version |
| `firmware_build_date` | `string` | Build date |
| `firmware_md5` | `string` | Firmware MD5 hash |
| `schema_hash` | `string` | Schema content hash |
| `entity_count` | `uint32` | Number of entities reported |
| `chip_name` | `string` | Chip model (e.g. "ESP32-C6") |
| `can_relay` | `bool` | Device supports relay functionality |
| `relay_enabled` | `bool` | Relay is currently enabled |

**RemoteRuntime:**
| Field | Type | Description |
|---|---|---|
| `online` | `bool` | Remote online status |
| `bridge_mac` | `string` | Bridge MAC this remote is connected through |
| `parent_mac` | `string` | Parent node MAC (for multi-hop topology) |
| `hops_to_bridge` | `uint32` | Number of hops to reach bridge |
| `rssi` | `sint32` | Signal strength in dBm |
| `last_seen_bridge_uptime_s` | `int32` | Bridge uptime when last seen (for offline calculation) |
| `session_id` | `string` | Current session identifier |
| `last_tx_counter` | `uint32` | Last transmission counter (for ordering) |
| `uptime_s` | `uint32` | Remote uptime in seconds |

**RemoteDescriptorSet:**
| Field | Type | Description |
|---|---|---|
| `schema_hash` | `string` | Hash of this descriptor set |
| `entities[]` | `repeated EntityDescriptor` | Entity descriptors |

**EntityDescriptor:**
| Field | Type | Description |
|---|---|---|
| `object_id` | `string` | Unique entity ID within the remote |
| `platform` | `string` | Home Assistant platform (e.g. "sensor", "switch", "binary_sensor") |
| `friendly_name` | `string` | Human-readable name |
| `icon` | `string` | Material Design icon |
| `device_class` | `string` | HA device class |
| `state_class` | `string` | HA state class |
| `unit_of_measurement` | `string` | Unit string |
| `entity_category` | `string` | HA entity category |
| `disabled_by_default` | `bool` | Entity is disabled by default |
| `diagnostic` | `bool` | Entity is diagnostic |
| `writable` | `bool` | Entity supports write/command |
| `native_type` | `string` | Native value type (e.g. "float", "int", "bool", "string") |
| `options_json` | `string` | JSON-encoded options (for select entities) |
| `options[]` | `repeated Option` | Structured options (key/label pairs) |
| `command` | `CommandDescriptor` | Command descriptor (for writable entities) |

**Option:**
| Field | Type | Description |
|---|---|---|
| `key` | `string` | Option value key |
| `label` | `string` | Human-readable label |

**CommandDescriptor:**
| Field | Type | Description |
|---|---|---|
| `supported_commands[]` | `repeated string` | List of supported command names |
| `arguments[]` | `repeated ArgumentDescriptor` | Command argument definitions |

**ArgumentDescriptor:**
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Argument name |
| `value_type` | `string` | Value type (e.g. "float", "int", "bool") |
| `required` | `bool` | Whether the argument is required |
| `min_value` | `double` | Minimum allowed value |
| `max_value` | `double` | Maximum allowed value |
| `step` | `double` | Step increment |

**EntityState:**
| Field | Type | Description |
|---|---|---|
| `object_id` | `string` | Entity object ID |
| `available` | `bool` | Entity availability |
| `observed_unix_ms` | `uint64` | Observation timestamp (millisecond epoch) |
| `value` | `oneof` | Entity value (one of: `bool_value`, `int_value`, `float_value`, `string_value`, `bytes_value`) |

#### EventBatch (16) — Bidirectional

Batched stream of events. See [Section 4: Events](#4-events).

#### Ping / Pong (21–22) — Bidirectional

| Field | Type | Description |
|---|---|---|
| `monotonic_ms` | `uint64` | Monotonic clock value for latency measurement |

#### Error (99) — Bidirectional

| Field | Type | Description |
|---|---|---|
| `code` | `string` | Machine-readable error code |
| `message` | `string` | Human-readable error description |

### 3.3 Command Messages (field numbers 17–20)

#### CommandRequest (17) — Client → Bridge

Sends a command to an entity on a remote device.

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Target remote MAC |
| `object_id` | `string` | Target entity object ID |
| `command` | `string` | Command name |
| `args[]` | `repeated CommandArgument` | Command arguments |

**CommandArgument:**
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Argument name |
| `value` | `oneof` | Argument value (one of: `bool_value`, `int_value`, `float_value`, `string_value`) |

#### CommandResult (18) — Bridge → Client

Result of a command execution.

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Target remote MAC |
| `object_id` | `string` | Target entity object ID |
| `command` | `string` | Command name |
| `bridge_mac` | `string` | Bridge that routed the command |
| `session_id` | `string` | Remote session ID at time of execution |
| `status` | `CommandStatus` | Execution status |
| `error_code` | `string` | Machine-readable error code (on failure) |
| `error_message` | `string` | Human-readable error message (on failure) |

**CommandStatus enum:**
| Value | Description |
|---|---|
| `COMMAND_STATUS_UNSPECIFIED (0)` | Default/unknown |
| `COMMAND_STATUS_ACCEPTED (1)` | Command accepted for delivery |
| `COMMAND_STATUS_DELIVERED (2)` | Command delivered to remote |
| `COMMAND_STATUS_FAILED (3)` | Command execution failed |
| `COMMAND_STATUS_UNAVAILABLE (4)` | Remote is unreachable |
| `COMMAND_STATUS_UNSUPPORTED (5)` | Command not supported by entity |
| `COMMAND_STATUS_TIMEOUT (6)` | Command timed out |

#### ConfigCommandRequest (19) — Client → Bridge

Configuration commands for remote devices.

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Target remote MAC |
| `command` | `string` | Config command name |
| `interval_seconds` | `uint32` | Reporting interval (for interval config) |
| `parent_mac` | `string` | Parent MAC for topology configuration |
| `clear_parent` | `bool` | Clear parent assignment |
| `relay_enable` | `bool` | Enable/disable relay functionality |

**Known config commands** (from code analysis):
- `"set_interval"` — Set remote reporting interval
- `"set_parent"` — Set parent node for multi-hop topology
- `"set_relay"` — Enable/disable relay mode

#### ConfigCommandResult (20) — Bridge → Client

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Target remote MAC |
| `command` | `string` | Config command name |
| `bridge_mac` | `string` | Bridge that routed the command |
| `session_id` | `string` | Remote session ID |
| `status` | `CommandStatus` | Execution status |
| `error_code` | `string` | Error code |
| `error_message` | `string` | Error message |

### 3.4 OTA Messages (field numbers 30–36)

The OTA protocol is **bidirectional** — the bridge requests specific chunk sequences from the client (pull model), rather than the client pushing all chunks.

```
Client                              Bridge
  │                                    │
  │── OtaStartRequest ───────────────►│
  │   { target_mac, file_size,         │
  │     md5, sha256, filename,         │
  │     preferred_chunk_size }          │
  │                                    │
  │◄── OtaAccepted ───────────────────│
  │   { job_id, max_chunk_size,        │
  │     total_chunks,                  │
  │     max_chunks_per_batch }          │
  │                                    │
  │◄── OtaChunkRequest ───────────────│
  │   { job_id, sequences[],           │
  │     progress }                      │
  │                                    │
  │── OtaChunkBatch ─────────────────►│
  │   { job_id,                        │
  │     response_request_id,           │
  │     chunks[] }                      │
  │                                    │
  │◄── OtaStatus (progress) ──────────│
  │◄── OtaAborted (on abort) ─────────│
  │── OtaAbortRequest ───────────────►│
  │   { job_id, reason }               │
```

#### OtaStartRequest (30)
| Field | Type | Description |
|---|---|---|
| `target_mac` | `string` | MAC of the remote to flash |
| `file_size` | `uint32` | Firmware file size in bytes |
| `md5` | `string` | MD5 hex digest |
| `sha256` | `string` | SHA-256 hex digest |
| `filename` | `string` | Firmware filename |
| `preferred_chunk_size` | `uint32` | Client's preferred chunk size |

#### OtaAccepted (33)
| Field | Type | Description |
|---|---|---|
| `job_id` | `string` | Unique OTA job identifier |
| `target_mac` | `string` | Target remote MAC |
| `max_chunk_size` | `uint32` | Bridge's max chunk size |
| `total_chunks` | `uint32` | Total number of chunks |
| `max_chunks_per_batch` | `uint32` | Max chunks per OtaChunkBatch |

#### OtaChunkRequest (34)
| Field | Type | Description |
|---|---|---|
| `job_id` | `string` | OTA job identifier |
| `request_id` | `string` | ID for response matching |
| `sequences[]` | `repeated uint32` | Requested chunk sequence numbers |
| `progress` | `OtaProgress` | Current transfer progress |

#### OtaProgress
| Field | Type | Description |
|---|---|---|
| `chunks_sent` | `uint32` | Total chunks sent |
| `chunks_confirmed` | `uint32` | Chunks confirmed received |
| `current_increment` | `uint32` | Current transfer window position |
| `total_increments` | `uint32` | Total transfer windows |
| `retransmit_round` | `uint32` | Current retransmission round |
| `buffer_size_kb` | `uint32` | Bridge buffer size in KB |
| `percent` | `uint32` | Overall transfer progress percentage |

#### OtaChunkBatch (31)
| Field | Type | Description |
|---|---|---|
| `job_id` | `string` | OTA job identifier |
| `response_request_id` | `string` | Matches OtaChunkRequest.request_id |
| `chunks[]` | `repeated OtaChunk` | Firmware chunk data |

#### OtaChunk
| Field | Type | Description |
|---|---|---|
| `sequence` | `uint32` | Chunk sequence number |
| `offset` | `uint32` | Byte offset in firmware file |
| `payload` | `bytes` | Firmware data bytes |
| `flags` | `uint32` | Flags (bit 0x0001 = last chunk) |
| `crc32` | `uint32` | CRC-32 of payload |

#### OtaStatus (35)
| Field | Type | Description |
|---|---|---|
| `job_id` | `string` | OTA job identifier |
| `state` | `OtaState` | Current OTA state |
| `percent` | `uint32` | Completion percentage |
| `bytes_received` | `uint32` | Bytes received by bridge |
| `file_size` | `uint32` | Total file size |
| `error_detail` | `string` | Error details (on failure) |

#### OtaAbortRequest (32)
| Field | Type | Description |
|---|---|---|
| `job_id` | `string` | OTA job to abort |
| `reason` | `string` | Abort reason |

#### OtaAborted (36)
| Field | Type | Description |
|---|---|---|
| `job_id` | `string` | Aborted OTA job |
| `reason` | `string` | Abort reason |

#### OtaState enum
| Value | Description |
|---|---|
| `OTA_STATE_UNSPECIFIED (0)` | Unknown/default |
| `OTA_STATE_IDLE (1)` | No OTA in progress |
| `OTA_STATE_ANNOUNCING (2)` | Bridge announcing OTA to remote |
| `OTA_STATE_TRANSFERRING (3)` | Firmware data transfer in progress |
| `OTA_STATE_VERIFYING (4)` | Verifying transferred firmware |
| `OTA_STATE_SUCCESS (5)` | OTA completed successfully |
| `OTA_STATE_FAILED (6)` | OTA failed |
| `OTA_STATE_ABORTED (7)` | OTA was aborted |

---

## 4. Events

Events are delivered inside `EventBatch` messages. The batch can contain multiple events of different kinds.

```protobuf
message EventBatch {
  repeated Event events = 1;
}
```

Each `Event` uses `oneof kind` to dispatch to one of six event types:

### 4.1 BridgeHeartbeat (field 10)

Periodic heartbeat from the bridge.

| Field | Type | Description |
|---|---|---|
| `bridge_mac` | `string` | Bridge MAC |
| `bridge_unix_ms` | `uint64` | Bridge's current timestamp (millisecond epoch) |
| `uptime_s` | `uint32` | Bridge uptime in seconds |

### 4.2 RemoteAvailabilityEvent (field 11)

Notifies when a remote comes online or goes offline.

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Remote MAC |
| `online` | `bool` | Online status |
| `bridge_mac` | `string` | Bridge MAC |
| `session_id` | `string` | Current session ID |
| `tx_counter` | `uint32` | Transmission counter |
| `observed_unix_ms` | `uint64` | Observation timestamp |
| `rssi` | `sint32` | Signal strength |
| `hops_to_bridge` | `uint32` | Hop count |
| `reason` | `string` | Reason for status change |
| `uptime_s` | `uint32` | Remote uptime |

**Known reason values:** `"bridge_disconnected"` (generated by add-on when bridge goes offline).

### 4.3 RemoteStateEvent (field 12)

Reports state changes for one or more entities on a remote.

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Remote MAC |
| `bridge_mac` | `string` | Bridge MAC |
| `session_id` | `string` | Session ID |
| `tx_counter` | `uint32` | Transmission counter |
| `states[]` | `repeated EntityState` | Changed entity states |
| `observed_unix_ms` | `uint64` | Observation timestamp |
| `uptime_s` | `uint32` | Remote uptime |
| `rssi` | `sint32` | Signal strength |
| `hops_to_bridge` | `uint32` | Hop count |

### 4.4 RemoteSchemaChangedEvent (field 13)

Fired when a remote's entity schema changes (e.g. after OTA).

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Remote MAC |
| `bridge_mac` | `string` | Bridge MAC |
| `session_id` | `string` | Session ID |
| `old_schema_hash` | `string` | Previous schema hash |
| `snapshot` | `RemoteSnapshot` | Complete new remote snapshot |

### 4.5 RemoteMetadataChangedEvent (field 14)

Fired when a remote's metadata changes (name, firmware version, etc.) without a schema change.

| Field | Type | Description |
|---|---|---|
| `identity` | `RemoteIdentity` | Updated identity |
| `runtime` | `RemoteRuntime` | Updated runtime |

### 4.6 TopologyChangedEvent (field 15)

Fired when the network topology changes (parent change, route change, etc.).

| Field | Type | Description |
|---|---|---|
| `remote_mac` | `string` | Remote MAC |
| `bridge_mac` | `string` | Bridge MAC |
| `parent_mac` | `string` | New parent MAC |
| `hops_to_bridge` | `uint32` | Updated hop count |
| `rssi` | `sint32` | Current signal strength |
| `observed_unix_ms` | `uint64` | Observation timestamp |
| `uptime_s` | `uint32` | Remote uptime |

---

## 5. Integration Command Routing

When the integration sends a `CommandRequest` or `ConfigCommandRequest` to the add-on, the `BridgeV2Manager.handle_integration_frame()` routes it to the correct `BridgeV2Client` using an internal route table keyed by remote MAC.

**Route lookup:**
1. Normalize the remote MAC
2. Look up the `RemoteRoute` in `self._routes`
3. Extract `bridge_uuid` from the route
4. Find the connected `BridgeV2Client` for that UUID
5. Forward the command request

**Unknown remote handling:**
If the remote is not in the route table, the add-on returns a `CommandResult` with status `COMMAND_STATUS_UNAVAILABLE` and error code `"unknown_remote"`.

**Supported integration frames:**
- `command_request` → forwarded to bridge, returns `command_result`
- `config_command_request` → forwarded to bridge, returns `config_command_result`
- `ping` → returns `pong` with the same `monotonic_ms`

---

## 6. Connection Lifecycle

### BridgeV2Client (add-on side)

```
                  ┌──────────────────────┐
                  │   _run() loop        │
                  │   backoff: 1,2,5,10s │
                  └─────┬────────────────┘
                        │
                  ┌─────▼────────────────┐
                  │  _connect_once()     │
                  │  WS connect          │
                  │  Auth challenge/     │
                  │  response/ok         │
                  │  ClientHello        │
                  │  Receive loop        │
                  └──────────────────────┘
```

- **Reconnection:** Automatic with exponential backoff (1s, 2s, 5s, 10s)
- **Backoff reset:** After 60s of continuous connection
- **WebSocket:** ping_interval=30s, ping_timeout=10s, max_size=65536, close_timeout=5s
- **Receive loop:** Processes `full_snapshot`, `event_batch`, OTA messages, and request-response matching
- **Pending requests:** Tracked by `request_id` — failed on disconnection with `ConnectionError`

### IntegrationWSClient (HA integration side)

```
                  ┌──────────────────────────┐
                  │   _run() loop            │
                  │   backoff: 1,2,4,8,...30s│
                  └─────┬────────────────────┘
                        │
                  ┌─────▼────────────────────┐
                  │  _connect_once()         │
                  │  Try candidate URLs      │
                  │  JSON auth handshake     │
                  │  Binary protobuf loop    │
                  └──────────────────────────┘
```

- **Backoff:** Starts at 1s, doubles to max 30s, resets after 60s connected
- **URL fallback:** Tries configured URL first, then `ws://127.0.0.1:8099/...`

---

## 7. OTA Client

`BridgeV2OTAClient` wraps `BridgeV2Client` for OTA operations:

```python
client = BridgeV2OTAClient(v2_client)
await client.start(target_mac=mac, file_size=size, md5=md5)
# Bridge sends OtaChunkRequest for specific sequences
await client.send_chunks(request_id, sequences, file_path)
```

**Chunk building:**
- Chunk offset = `sequence * max_chunk_size`
- Last chunk flagged with `flags = 0x0001`
- Each chunk carries a CRC-32 of its payload

**Flow:**
1. `start()` → Bridge returns `OtaAccepted` with `job_id`, `max_chunk_size`, `total_chunks`, `max_chunks_per_batch`
2. Bridge initiates chunk requests via `OtaChunkRequest` (pull model)
3. Client responds with `OtaChunkBatch` containing the requested sequences
4. Bridge sends `OtaStatus` updates during transfer
5. Bridge sends `OtaAborted` if aborted by either side

---

## 8. Message Flow Summary

```
CLIENT (Integration)          ADD-ON (Server)            BRIDGE Firmware
       │                           │                          │
       │                           │──── WS connect ──────────►│
       │                           │◄── AuthChallenge ────────│
       │                           │──── AuthResponse ───────►│
       │                           │◄── AuthOk ───────────────│
       │                           │──── ClientHello ────────►│
       │                           │◄── FullSnapshot ─────────│
       │                           │                          │
       │── WS connect ────────────►│                          │
       │── JSON auth ─────────────►│                          │
       │◄── auth_ok ──────────────│                          │
       │◄── FullSnapshot (replay)─│                          │
       │                           │                          │
       │                           │◄── EventBatch (live) ───│
       │◄── EventBatch (relay) ───│                          │
       │                           │                          │
       │── CommandRequest ────────►│──── CommandRequest ─────►│
       │                           │◄── CommandResult ───────│
       │◄── CommandResult ────────│                          │
       │                           │                          │
       │── Ping ─────────────────►│◄── Ping ────────────────│
       │◄── Pong ────────────────│──── Pong ────────────────►│
```

---

## 9. Enums Reference

### CommandStatus

| Name | Value |
|---|---|
| `COMMAND_STATUS_UNSPECIFIED` | 0 |
| `COMMAND_STATUS_ACCEPTED` | 1 |
| `COMMAND_STATUS_DELIVERED` | 2 |
| `COMMAND_STATUS_FAILED` | 3 |
| `COMMAND_STATUS_UNAVAILABLE` | 4 |
| `COMMAND_STATUS_UNSUPPORTED` | 5 |
| `COMMAND_STATUS_TIMEOUT` | 6 |

### OtaState

| Name | Value |
|---|---|
| `OTA_STATE_UNSPECIFIED` | 0 |
| `OTA_STATE_IDLE` | 1 |
| `OTA_STATE_ANNOUNCING` | 2 |
| `OTA_STATE_TRANSFERRING` | 3 |
| `OTA_STATE_VERIFYING` | 4 |
| `OTA_STATE_SUCCESS` | 5 |
| `OTA_STATE_FAILED` | 6 |
| `OTA_STATE_ABORTED` | 7 |
