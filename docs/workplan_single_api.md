# Workplan: Migrate OTA to Protobuf, Remove v1 WS API

## Objective

Consolidate all addon ↔ bridge communication onto the v2 protobuf WebSocket protocol (`/esp-tree/v2/pb`), adding OTA support and removing the v1 JSON WebSocket API from both bridge and addon. The addon's REST API to the HA frontend remains unchanged.

## Goals

1. **Add OTA message types** to the v2 protobuf protocol with push-based flow control, pure protobuf chunk encoding, and batched chunk delivery.
2. **Implement OTA on the bridge** side within the existing `BridgeApiProtoWsTransport`, using a callback pattern driven from the main `loop()` to send `OtaAccepted`/`OtaChunkRequest`/`OtaStatus`/`OtaAborted` messages.
3. **Implement OTA on the addon** side by adding a `BridgeV2OTAClient` and rewriting `OTAWorker` to use it instead of `BridgeWsOTAClient`.
4. **Remove v1 JSON WS code** from both bridge and addon after v2 OTA is verified working.
5. **No changes** to the addon ↔ HA frontend REST API surface.

## Scope

### In Scope

- `esp_tree_runtime.proto` — new OTA message definitions and envelope field numbers
- Bridge `bridge_api_proto_messages.h/.cpp` — hand-written protobuf codec for OTA messages
- Bridge `bridge_api_proto_ws.h/.cpp` — OTA message send/receive handling, disconnect cleanup
- Bridge `ESPTreeBridge` — OTA callback wiring to proto transport, refactor `emit_ota_ws_events_()` to use callback interface
- Bridge — deletion of v1 WS transport (`bridge_api_ws.*`, `bridge_api_messages.*`, `bridge_api_router.*`, `bridge_api_ota_frame.*`)
- Addon `bridge_v2_client.py` — OTA message handling (send/receive, async event dispatch)
- Addon `ota_worker.py` — rewrite to use v2 protobuf OTA client with event-driven flow
- New addon `bridge_v2_ota.py` — `BridgeV2OTAClient` wrapper
- Addon — deletion of v1 WS code (`bridge_ws_client.py`, `bridge_ws_ota.py`, `ota_chunks.py`)
- Addon — removal of `bridge_transport` config option (only v2 now)
- Addon `server.py` — remove `BridgeWsManager` references, inject `BridgeV2Manager` into `OTAWorker`
- Python protobuf regeneration (`esp_tree_runtime_pb2.py`)
- Bridge and addon test updates

### Out of Scope

- Any changes to the addon's REST API endpoints (`/api/ota/*`, `/api/bridge/*`, `/ws/topology`, etc.)
- Any changes to the HA custom component integration (`/esp-tree/integration/v1/pb`)
- Bridge HTTP REST endpoints (`/topology.json`, debug pages, v2 auth pages) — these stay
- ESP-NOW radio protocol — unchanged
- Remote firmware OTA receiver — unchanged
- `ESPNowOTAManager` internals on the bridge — only the transport layer to the addon changes
- Multi-bridge OTA routing — single bridge only for initial implementation; routing can be added at the `BridgeV2Manager` API layer later

## Constraints

1. **Bridge uses hand-written protobuf codec** — no protoc code generation for the C++ side. All encode/decode follows the existing `Writer`/`ParsedEnvelope` pattern.
2. **Single WS connection** — OTA shares the same v2 protobuf WS connection (`/esp-tree/v2/pb`). No separate OTA socket.
3. **Same Envelope** — OTA messages are new oneof fields in the existing `Envelope` message, not a separate message type.
4. **Disconnect = auto-abort** — WS disconnect during OTA transfer aborts the job immediately, same as v1 behavior.
5. **No v1 fallback** — hard cutover. Once v2 OTA works, v1 WS code is deleted. No parallel operation in production.
6. **Bridge keeps all HTTP** — only v1 WS is removed from the bridge. HTTP REST handlers, web pages, and the `web_server_base` itself remain.
7. **ESP32 RAM limits** — batch size must be bounded. `max_chunks_per_batch` in `OtaAccepted` constrains memory. Default cap: 6–8 chunks per batch at 2KB each (~12–16KB + overhead per batch). The bridge's protobuf decoder must hold an entire `OtaChunkBatch` in memory for validation; on ESP32 (~200KB heap with concurrent ESP-NOW buffers, WS buffers, and schema tables), keep `max_chunks_per_batch` conservative.
8. **Max WS frame size** — v2 proto WS max frame is 65536 bytes. A batch of 8×2KB chunks = ~16KB, well within limits.
9. **Addon ↔ HA frontend API is frozen** — no URL, method, or response format changes.
10. **Single bridge only** — the OTA worker assumes one active bridge. Multi-bridge routing can be added later at the `BridgeV2Manager` layer (using the existing `_route_for_remote(mac)` mechanism) without changing the OTA protocol.
11. **API version stays at `2`** — adding new oneof field numbers (30–36) to the existing `Envelope` is protobuf-forward-compatible. A client that doesn't understand OTA message types will ignore them via `WhichOneof("msg")` returning empty. No version bump needed.

## Protobuf Schema Design

### Envelope field assignments

Fields 30–36 are reserved for OTA messages in the `Envelope` oneof:

| Field # | Message Type | Direction |
|---------|-------------|-----------|
| 30 | `OtaStartRequest` | Client → Bridge |
| 31 | `OtaChunkBatch` | Client → Bridge |
| 32 | `OtaAbortRequest` | Client → Bridge |
| 33 | `OtaAccepted` | Bridge → Client |
| 34 | `OtaChunkRequest` | Bridge → Client |
| 35 | `OtaStatus` | Bridge → Client |
| 36 | `OtaAborted` | Bridge → Client |

### Connection lifecycle and `request_id` correlation

Two independent `request_id` mechanisms are at play:

1. **Envelope `request_id`** (field 1): Used for request-response correlation on `OtaStartRequest` → `OtaAccepted`/`Error` and `OtaAbortRequest` → `OtaAborted`. The bridge echoes the envelope's `request_id` in the response message.

2. **OTA chunk `request_id`** (field in `OtaChunkRequest`/`OtaChunkBatch`): Used to correlate a specific chunk request with its batch response within the OTA transfer flow. This is a monotonically increasing counter or UUID generated by the bridge per `OtaChunkRequest`.

`OtaAccepted` and `OtaAborted` messages carry no separate `request_id` field — the envelope-level `request_id` handles correlation. `OtaStatus` messages are unsolicited pushes and carry no correlation ID (they carry `job_id` for association).

**Important:** `OtaAccepted` is NOT a direct synchronous response to `OtaStartRequest`. It is sent asynchronously when the remote accepts the file transfer over ESP-NOW. Only immediate failures (remote not found, OTA busy) are returned as `Error` responses to the `OtaStartRequest` envelope.

### Message definitions

```protobuf
enum OtaState {
  OTA_STATE_UNSPECIFIED = 0;
  OTA_STATE_IDLE = 1;
  OTA_STATE_ANNOUNCING = 2;
  OTA_STATE_TRANSFERRING = 3;
  OTA_STATE_VERIFYING = 4;
  OTA_STATE_SUCCESS = 5;
  OTA_STATE_FAILED = 6;
  OTA_STATE_ABORTED = 7;
}

message OtaStartRequest {
  string target_mac = 1;           // colon-separated e.g. "AA:BB:CC:DD:EE:FF"
  uint32 file_size = 2;
  string md5 = 3;                  // hex MD5 (required)
  string sha256 = 4;               // optional, hex SHA-256 (currently unused by bridge)
  string filename = 5;             // optional
  uint32 preferred_chunk_size = 6; // advisory, 0 = use bridge default (2048)
}

message OtaAccepted {
  string job_id = 1;               // bridge-generated hex string (4 digits, e.g. "b7f1")
  string target_mac = 2;
  uint32 max_chunk_size = 3;       // WS chunk size (may differ from ESP-NOW chunk size)
  uint32 total_chunks = 4;         // informational: ceil(file_size / max_chunk_size)
  uint32 max_chunks_per_batch = 5; // addon must not exceed this per OtaChunkBatch
}

message OtaChunkRequest {
  string job_id = 1;
  string request_id = 2;           // correlates with OtaChunkBatch.response_request_id
  repeated uint32 sequences = 3;   // exact chunk sequence numbers requested
  OtaProgress progress = 4;
}

message OtaProgress {
  uint32 chunks_sent = 1;
  uint32 chunks_confirmed = 2;
  uint32 current_increment = 3;
  uint32 total_increments = 4;
  uint32 retransmit_round = 5;     // 0 = first send, 1+ = gap retransmission
  uint32 buffer_size_kb = 6;       // increment buffer size on bridge (typically 8)
  uint32 percent = 7;
}

message OtaChunkBatch {
  string job_id = 1;
  string response_request_id = 2;  // matches the OtaChunkRequest.request_id
  repeated OtaChunk chunks = 3;
}

message OtaChunk {
  uint32 sequence = 1;             // chunk sequence number
  uint32 offset = 2;               // sequence * max_chunk_size (redundant, used for validation)
  bytes payload = 3;               // raw firmware bytes
  uint32 flags = 4;                // bit 0 = final chunk (0x0001)
  uint32 crc32 = 5;                // CRC-32 of payload bytes only (poly 0xEDB88320)
}

message OtaStatus {
  string job_id = 1;
  OtaState state = 2;
  uint32 percent = 3;
  uint32 bytes_received = 4;
  uint32 file_size = 5;
  string error_detail = 6;         // populated for FAILED/ABORTED states
}

message OtaAbortRequest {
  string job_id = 1;
  string reason = 2;               // defaults to "user"
}

message OtaAborted {
  string job_id = 1;
  string reason = 2;
}
```

### Error codes for OTA

OTA start failures and transfer errors use the existing `Error` message (envelope field 99). Error codes for OTA:

| Code | Meaning |
|------|---------|
| `REMOTE_NOT_FOUND` | Target MAC not in topology or offline |
| `OTA_BUSY` | Another OTA transfer already in progress |
| `OTA_REJECTED` | Remote rejected the file transfer |
| `OTA_INVALID_CHUNK` | Chunk failed validation (bad CRC, wrong sequence, stale request_id) |
| `OTA_NOT_ACTIVE` | No active OTA job for the given job_id |
| `OTA_INVALID_SIZE` | File size mismatch |
| `OTA_INVALID_MD5` | MD5 verification failed |

### OtaState enumeration

The `ANNOUNCING` state is new compared to v1. It represents the time when the bridge has sent `FILE_ANNOUNCE` to the remote over ESP-NOW and is waiting for `FILE_ACCEPT` or `FILE_REJECT`. This gives the HA frontend visibility into the "waiting for device to accept" phase.

### Flow control: push-based

The bridge drives chunk requests. The addon does not poll for status.

```
Addon                          Bridge                         Remote (ESP-NOW)
  |                              |                                |
  |-- OtaStartRequest ---------->|                                |
  |<-- Error (immediate fail) ---|  (if remote not found/busy)   |
  |                              |                                |
  |      --- OR ---              |                                |
  |                              |                                |
  |<-- OtaStatus (ANNOUNCING) ---|                                |
  |                              |-- FILE_ANNOUNCE --------------->|
  |                              |<-- FILE_ACCEPT ----------------|
  |<-- OtaAccepted --------------|  } sent in same loop() call   |
  |<-- OtaChunkRequest -----------|  } back-to-back, zero delay   |
  |                              |  (sequences=[0..7])            |
  |-- OtaChunkBatch ------------->|  (chunks for seqs 0..7)       |
  |                              |-- PKT_FILE_DATA --------------->|
  |<-- OtaChunkRequest -----------|  (sequences=[8..15])          |
  |-- OtaChunkBatch ------------->|                                |
  |                              |-- PKT_FILE_DATA --------------->|
  |                              |<-- GAPS/COMPLETE --------------|
  |                              |                                |
  |<-- OtaStatus (TRANSFERRING) -|  (periodic progress)           |
  |<-- OtaChunkRequest -----------|  (gap retransmit, if needed)  |
  |-- OtaChunkBatch ------------->|                                |
  |                              |                                |
  |<-- OtaStatus (VERIFYING) ----|                                |
  |                              |<-- FILE_COMPLETE --------------|
  |<-- OtaStatus (SUCCESS) ------|                                |
```

**Key properties:**
- `OtaStartRequest` errors (remote not found, OTA busy) are immediate `Error` responses
- On success, bridge pushes `OtaStatus(ANNOUNCING)` when the job is created
- `OtaAccepted` and first `OtaChunkRequest` are sent together in the same `loop()` call — zero delay
- Bridge pushes `OtaChunkRequest` when it needs chunks (first increment, gaps, next increment)
- Bridge pushes `OtaStatus` on every state change and periodically during transfer (e.g., every 10% or 5s)
- Addon never polls; it responds to `OtaChunkRequest` with `OtaChunkBatch`
- `OtaChunkRequest.request_id` correlates chunk requests with batch responses
- On WS disconnect during OTA, bridge auto-aborts the job via `api_ota_abort("", "ws_disconnect")`

### Stale batch handling

If the addon sends an `OtaChunkBatch` with a `response_request_id` that doesn't match the bridge's outstanding `OtaChunkRequest`, the bridge must NOT silently drop it. The addon would be waiting for the next `OtaChunkRequest` that may never come. Instead, the bridge should **send a fresh `OtaChunkRequest`** with the current set of needed sequences. This re-syncs the addon.

If the batch's `job_id` doesn't match the active OTA job, send an `Error` with code `OTA_NOT_ACTIVE`.

## Phased Plan

### Phase 1: Proto Schema + Bridge OTA Handler

**Goal:** Add OTA message support to the v2 protobuf protocol on the bridge, so the addon can perform OTA over the v2 WS connection. V1 WS still works in parallel for testing.

#### 1.1 Add OTA messages to proto

**File:** `ESPLR_V2/components/esp_tree_bridge/proto/esp_tree_runtime.proto`

- Add `OtaState` enum with 8 values (UNSPECIFIED through ABORTED)
- Add all 9 OTA message types (`OtaStartRequest`, `OtaAccepted`, `OtaChunkRequest`, `OtaProgress`, `OtaChunkBatch`, `OtaChunk`, `OtaStatus`, `OtaAbortRequest`, `OtaAborted`)
- Add field numbers 30–36 to the `Envelope` oneof
- Do NOT bump `kRuntimeApiVersion` — new oneof fields are backward-compatible

#### 1.2 Hand-written protobuf codec for OTA messages

**File:** `ESPLR_V2/components/esp_tree_bridge/bridge_api_proto_messages.h/.cpp`

**Parsers (incoming):**
- `ParsedOtaStartRequest`: `target_mac`, `file_size`, `md5`, `sha256`, `filename`, `preferred_chunk_size`
- `ParsedOtaChunkBatch`: contains `job_id`, `response_request_id`, and a vector/list of `ParsedOtaChunk` (each with `sequence`, `offset`, `payload`, `flags`, `crc32`)
- `ParsedOtaAbortRequest`: `job_id`, `reason`

**Encoders (outgoing):**
- `encode_ota_accepted(Writer&, job_id, target_mac, max_chunk_size, total_chunks, max_chunks_per_batch)`
- `encode_ota_chunk_request(Writer&, job_id, request_id, sequences, progress)`
- `encode_ota_status(Writer&, job_id, ota_state, percent, bytes_received, file_size, error_detail)` — takes `OtaState` enum, encodes as varint
- `encode_ota_aborted(Writer&, job_id, reason)`

**Dispatch:**
- Add decode functions following the existing `parse_command_request()` pattern
- Add encoder functions following the existing `Writer` class pattern
- Wire field numbers 30–32 into the envelope dispatch switch in `handle_envelope()`

**Gotcha:** `OtaChunk.payload` is protobuf `bytes` (length-delimited: field tag + varint length + raw bytes). The decoder must validate payload length against `max_chunk_size`. With batching, the entire `OtaChunkBatch` message is parsed into memory before processing — keep `max_chunks_per_batch` small.

#### 1.3 OTA message handling in BridgeApiProtoWsTransport

**File:** `ESPLR_V2/components/esp_tree_bridge/bridge_api_proto_ws.h/.cpp`

**Incoming message dispatch (field numbers 30–32):**

- **`OtaStartRequest` (field 30):**
  - Parse with `decode_ota_start_request()`
  - Call `bridge_->api_ota_start(...)` with parsed fields + envelope `request_id`
  - If `api_ota_start()` returns `false` (immediate failure):
    - Map `api_ota_start_error()` to an `Error` message code (see error codes table above)
    - Send `Error` response immediately
  - If `api_ota_start()` returns `true`: do NOT send a response here — `OtaAccepted` will be sent asynchronously by the callback system (see 1.4)

- **`OtaChunkBatch` (field 31):**
  - Parse with `decode_ota_chunk_batch()`
  - Validate `job_id` matches the active OTA job; send `Error(OTA_NOT_ACTIVE)` if not
  - Validate `response_request_id` matches the outstanding `OtaChunkRequest`; if stale:
    - Send a fresh `OtaChunkRequest` with current sequences to re-sync the addon
    - Do NOT process the stale batch's chunks
  - Iterate over chunks in the batch:
    - For each chunk, call `bridge_->api_ota_inject_chunk(sequence, data, len)`
    - If any chunk fails validation (bad sequence, CRC), send `Error(OTA_INVALID_CHUNK)` and abort
  - After processing all chunks, the `ESPNowOTAManager` will request more chunks via the callback system

- **`OtaAbortRequest` (field 32):**
  - Parse with `decode_ota_abort_request()`
  - Call `bridge_->api_ota_abort(job_id, reason)`
  - Send `OtaAborted` response

**WS disconnect handler — CRITICAL FIX:**

The v2 proto transport's `finish_session()` currently does NOT call `api_ota_abort()`. This must be fixed:

```cpp
// In BridgeApiProtoWsTransport::Impl::finish_session(int fd):
void finish_session(int fd) {
    std::lock_guard<std::mutex> lock(mutex);
    if (active_fd != fd) return;
    connected = false;
    authenticated = false;
    active_fd = -1;
    ESP_LOGI(TAG, "Bridge API protobuf client disconnected");
    // ADD: abort any active OTA when the WS client disconnects
    if (bridge != nullptr) {
        bridge->api_ota_abort("", "ws_disconnect");
    }
}
```

This matches the v1 WS behavior (`bridge_api_ws.cpp:510`).

**OTA-specific error codes:**
Add the error codes defined in the error codes table to the `Error` message dispatch.

#### 1.4 OTA callback interface and state machine refactor

**Background:** The v1 WS OTA flow is driven by `emit_ota_ws_events_()`, which:
- Runs in `ESPTreeBridge::loop()` (line 4006), polled every loop iteration
- Detects state transitions by comparing `ota_manager_->public_state()` against `ota_manager_prev_public_state_`
- Sends JSON messages directly via `api_ws_->send_text()`
- Only works when `api_ws_` is set (v1-specific check)

For v2, we need the same polling-driven approach but with callbacks instead of direct JSON construction.

**New file:** `ESPLR_V2/components/esp_tree_bridge/ota_transport_callbacks.h`

```cpp
namespace bridge_api {

class OtaTransportCallbacks {
public:
  virtual ~OtaTransportCallbacks() = default;
  virtual void on_ota_accepted(const std::string &job_id, const std::string &target_mac,
                               uint16_t max_chunk_size, uint32_t total_chunks,
                               uint16_t max_chunks_per_batch) = 0;
  virtual void on_ota_chunk_request(const std::string &job_id, const std::string &request_id,
                                    const std::vector<uint32_t> &sequences,
                                    uint32_t chunks_sent, uint32_t chunks_confirmed,
                                    uint32_t current_increment, uint32_t total_increments,
                                    uint32_t retransmit_round, uint32_t buffer_size_kb,
                                    uint32_t percent) = 0;
  virtual void on_ota_status(const std::string &job_id, OtaState state,
                             uint32_t percent, uint32_t bytes_received,
                             uint32_t file_size, const std::string &error_detail) = 0;
  virtual void on_ota_aborted(const std::string &job_id, const std::string &reason) = 0;
};

} // namespace bridge_api
```

`BridgeApiProtoWsTransport::Impl` implements this interface and sends the corresponding protobuf envelopes.

**ESPTreeBridge changes:**

- Add `set_ota_transport_callbacks(OtaTransportCallbacks*)` — stores the callback pointer
- Add `clear_ota_transport_callbacks()` — nulls the callback (called when transport disconnects)
- Refactor `emit_ota_ws_events_()` into a generic `emit_ota_events_()` that calls the registered callback interface instead of directly using `api_ws_->send_text()`:

  **`WAITING_FOR_LEAF` → first detection of leaf acceptance:**
  - Call `callbacks->on_ota_accepted(job_id, target_mac, ...)` — sends `OtaAccepted`
  - Call `callbacks->on_ota_chunk_request(job_id, request_id, sequences, ...)` — sends first `OtaChunkRequest`
  - These two happen in the same `loop()` call (zero delay, same as v1 behavior)

  **`WAITING_FOR_LEAF` → leaf never accepted (manager not busy):**
  - Send `OtaStatus(FAILED)` via callback (v1 sends an `error` message — v2 sends `OtaStatus` with FAILED state)

  **`WAITING_FOR_LEAF` → just entered (first call after `api_ota_start`):**
  - Call `callbacks->on_ota_status(job_id, OTA_STATE_ANNOUNCING, 0, 0, file_size, "")`
  - This is NEW — v1 doesn't send any status during WAITING_FOR_LEAF

  **`TRANSFERRING` → SUCCESS:**
  - Call `callbacks->on_ota_status(job_id, OTA_STATE_SUCCESS, 100, ...)`

  **`TRANSFERRING` → FAIL:**
  - Call `callbacks->on_ota_status(job_id, OTA_STATE_FAILED, percent, ...)`

  **`TRANSFERRING` → periodic progress:**
  - Every N loop iterations (or when percent changes by >= 10), call `callbacks->on_ota_status(job_id, OTA_STATE_TRANSFERRING, percent, ...)`

  **`TRANSFERRING` → new chunks needed (after increment/gaps):**
  - Currently v1's `emit_ota_ws_events_()` only sends `ota.chunk_request` once (right after `ota.accepted`). Gaps and next increments are handled via the `ota.status` poll — the addon sees `requested[]` in the status response.
  - In v2 push-based mode, the bridge needs to send `OtaChunkRequest` proactively whenever `ota_manager_->requested_sequences()` is non-empty. Check this in the LOOP transition or add a dedicated check in `emit_ota_events_()`:
    - If `ws_ota_job_state_ == TRANSFERRING` AND `ota_manager_->requested_sequences()` is non-empty AND `requested_sequences` differs from the last sent set:
    - Call `callbacks->on_ota_chunk_request(...)`

**Gotcha — Phase 1 coexistence with v1 WS:**

During Phase 1, both v1 and v2 transports are compiled. Only one transport should receive OTA callbacks at a time. The `emit_ota_events_()` function (refactored) must check:

```cpp
if (callbacks_ != nullptr) {
    // v2 (or v1) callback path
} else if (api_ws_ != nullptr && api_ws_->has_authenticated_client()) {
    // v1 direct JSON path (legacy)
}
```

When a v2 transport registers callbacks, v1 WS OTA events are suppressed. When callbacks are cleared (transport disconnects), v1 WS takes over again. The bridge only supports one OTA transfer at a time anyway (guarded by `ota_manager_->is_busy()`).

**State tracking generalization:**

The v1-specific members `ws_ota_job_state_`, `ws_ota_job_id_`, `ws_ota_request_id_`, `ws_ota_target_mac_`, `ws_ota_start_error_`, `ws_ota_session_id_`, and `ota_manager_prev_public_state_` must be generalized (drop the `ws_` prefix) since they are now shared between v1 and v2 transports. Rename them to `ota_job_state_`, `ota_job_id_`, etc.

The `api_ota_start()` method stores `request_id` from the envelope (v1 JSON or v2 proto) into the generalized `ota_request_id_`. This is used to correlate `OtaAccepted`/`OtaStatus`/`OtaAborted` responses.

#### 1.5 Test bridge OTA over v2 proto

- Verify v2 OTA works alongside v1 WS (both still compiled)
- Test: initiate OTA from a test client over v2 protobuf WS, verify chunks flow to remote
- Test: error cases (remote not found, remote offline, OTA busy, invalid chunk)
- Test: disconnect during transfer auto-aborts (verify `api_ota_abort()` is called in v2 `finish_session`)
- Test: stale `OtaChunkBatch` → bridge sends fresh `OtaChunkRequest`
- Test: `OtaChunkBatch` exceeds `max_chunks_per_batch` → bridge rejects or truncates
- Test: batch size limits respected

### Phase 2: Addon v2 OTA Client

**Goal:** Rewrite the addon's OTA pipeline to use v2 protobuf. The HA frontend API does not change.

#### 2.1 Update proto and regenerate Python code

**Files:**
- Copy updated `esp_tree_runtime.proto` from bridge to `app/protobuf/esp_tree_runtime.proto`
- Regenerate `app/protobuf/generated/esp_tree_runtime_pb2.py`
- Copy updated proto + generated code to `ha_integration/custom_components/esp_tree/protobuf/` (keep the integration in sync)
- Verify `OtaState` enum values are generated correctly in Python protobuf

#### 2.2 Add OTA message handling to BridgeV2Client

**File:** `app/bridge_v2_client.py`

**New methods:**

- `ota_start(target_mac, file_size, md5, sha256="", filename="", preferred_chunk_size=0)`:
  - Sends `OtaStartRequest` envelope with a fresh `request_id`
  - Returns a coroutine that resolves with an `OtaAccepted` result OR raises on `Error`
  
  **Critical:** Because `OtaAccepted` is **not** a direct request-response (it arrives asynchronously when the remote accepts), this must use a different pattern than `self.request()`. Options:
  - **(A)** Register a temporary event handler that resolves when `OtaAccepted` arrives with the matching `request_id`, with a timeout (e.g., 30s the "announcing" timeout, after which the remote hasn't accepted)
  - **(B)** Use a single-shot Future stored in a dict keyed by `request_id` — the message dispatch loop checks incoming envelopes against this dict and resolves the Future when it sees `OtaAccepted` with the matching `request_id`

  Recommend **(B)** — consistent with how v1's `request()` works. However, unlike v1 `request()` which awaits any response for that request_id, this specifically awaits `OtaAccepted` (field 33).

- `ota_abort(job_id, reason="user")`:
  - Sends `OtaAbortRequest` envelope
  - Calls `self.request(...)` to await `OtaAborted` (field 36) response
  - Returns `OtaAborted` result or error

- `send_ota_chunk_batch(job_id, response_request_id, chunks)`:
  - Constructs `OtaChunkBatch` with `OtaChunk` messages, each containing raw firmware bytes
  - Sends the envelope (no response expected — fire-and-forget)

**New handlers (registered on message dispatch):**

- `_on_ota_accepted(envelope: pb.Envelope)`:
  - Field 33
  - Resolves the pending Future for `ota_start()` by matching `request_id`

- `_on_ota_chunk_request(envelope: pb.Envelope)`:
  - Field 34
  - Decodes `OtaChunkRequest`, emits event to registered handler (e.g., `BridgeV2OTAClient`)

- `_on_ota_status(envelope: pb.Envelope)`:
  - Field 35
  - Decodes `OtaStatus`, emits event to registered handler

- `_on_ota_aborted(envelope: pb.Envelope)`:
  - Field 36
  - Decodes `OtaAborted`, emits event to registered handler; also resolves the Future for `ota_abort()` request

**Message dispatch change:**
Currently `BridgeV2Client._connect_once()` dispatches incoming envelopes by checking `request_id` against pending Futures, then passing unmatched messages to `_on_frame`. Add OTA field numbers (30–36) to the dispatch so:
- Field 33 (`OtaAccepted`) → resolves `ota_start()` Future by `request_id`
- Field 36 (`OtaAborted`) → resolves `ota_abort()` Future by `request_id`
- Field 34 (`OtaChunkRequest`) → calls `_on_ota_chunk_request` callback
- Field 35 (`OtaStatus`) → calls `_on_ota_status` callback
- Error messages (field 99) that relate to OTA `request_id`s → resolve/reject pending Futures

#### 2.3 Create BridgeV2OTAClient

**New file:** `app/bridge_v2_ota.py`

Thin wrapper over `BridgeV2Client` that manages OTA state:

```python
class BridgeV2OTAClient:
    def __init__(self, v2_client: BridgeV2Client):
        self._client = v2_client
        self.job_id: str | None = None
        self.max_chunk_size: int = 2048
        self.total_chunks: int = 0
        self.max_chunks_per_batch: int = 8
        self._status: OtaStatus | None = None
        self._status_event = asyncio.Event()
        self._accepted_event = asyncio.Event()

    async def start(self, target_mac, file_size, md5, sha256, filename, preferred_chunk_size) -> dict:
        result = await self._client.ota_start(
            target_mac, file_size, md5, sha256, filename, preferred_chunk_size
        )
        # result is parsed OtaAccepted
        self.job_id = result.job_id
        self.max_chunk_size = result.max_chunk_size
        self.total_chunks = result.total_chunks
        self.max_chunks_per_batch = result.max_chunks_per_batch
        self._accepted_event.set()
        return result

    async def send_chunks(self, response_request_id: str, sequences: list[int],
                          file_store: FirmwareStore, file_path: str):
        chunks = []
        for seq in sequences:
            offset = seq * self.max_chunk_size
            payload = await self._read_file_chunk(file_store, file_path, offset)
            crc = compute_crc32(payload)
            flags = 0x0001 if seq == self.total_chunks - 1 else 0
            chunks.append(pb.OtaChunk(sequence=seq, offset=offset,
                                       payload=payload, flags=flags, crc32=crc))
        await self._client.send_ota_chunk_batch(self.job_id, response_request_id, chunks)

    async def abort(self, job_id: str, reason: str = "user"):
        await self._client.ota_abort(job_id, reason)

    @property
    def status(self) -> OtaStatus | None:
        return self._status
```

**Key behaviors:**
- `start()` awaits `OtaAccepted` (async push from bridge), stores job parameters
- `send_chunks()` reads firmware from disk, encodes `OtaChunkBatch`, sends as fire-and-forget
- Respects `max_chunks_per_batch`: if `OtaChunkRequest` has 20 sequences but `max_chunks_per_batch` is 6, splits into 4 batches (6+6+6+2). Sends each batch sequentially with a small delay (6ms between batches) for ESP-NOW back-pressure
- Registers event handlers on `BridgeV2Client` for `OtaChunkRequest` → triggers `send_chunks()`, and `OtaStatus` → updates `self._status`

**Gotcha:** `_read_file_chunk()` must use async I/O (aiofiles or thread pool executor) to avoid blocking the event loop during firmware reads.

#### 2.4 Rewrite OTAWorker

**File:** `app/ota_worker.py`

**Constructor changes:**
- Replace `ws_manager: BridgeWsManager | None` with `bridge_manager: BridgeV2Manager`
- `ota_client` becomes a `BridgeV2OTAClient` retrieved from `bridge_manager` for the active bridge

**Core flow changes — `_process()` → event-driven:**

In v1, `_process_ws()` runs as a blocking async loop with `await asyncio.sleep(0.25)`. In v2, the worker becomes event-driven:

1. **`_process_starting(job)` — replaces the STARTING phase of `_process_ws()`:**
   - Calls `ota_client.start()` with target_mac, file_size, md5, etc.
   - On `OtaAccepted`, transitions job to TRANSFERRING, stores `job_id`, `max_chunk_size`, `max_chunks_per_batch`
   - On error (Error message response), same retry logic as v1: first failure → requeue; second → fail
   - On timeout (e.g., 30s without `OtaAccepted`), fail job

2. **`_on_chunk_request(request: OtaChunkRequest)` — replaces the chunk-sending loop:**
   - Checks `_stop_event`, checks job not terminal
   - Checks transfer timeout (same as v1: `now_ts() - transfer_started > self.transfer_timeout_s`)
   - Calls `ota_client.send_chunks(request.response_request_id, list(request.sequences), firmware_store, file_path)`
   - The batch-splitting logic (respecting `max_chunks_per_batch`) lives in `BridgeV2OTAClient.send_chunks()`
   - Updates `chunks_sent` count in DB per batch
   - Inter-batch delay for ESP-NOW back-pressure: `SOURCE_CHUNK_SEND_DELAY_S = 0.006` (6ms)

3. **`_on_ota_status(status: OtaStatus)` — replaces status polling:**
   - Updates job `percent` and `bridge_state` in DB immediately
   - On `OTA_STATE_TRANSFERRING`: track progress, log at 10% milestones
   - On `OTA_STATE_VERIFYING`: update job status to VERIFYING in DB
   - On `OTA_STATE_SUCCESS`: transition to WAITING_REJOIN, call `_wait_for_rejoin()`
   - On `OTA_STATE_FAILED`: fail job with `error_detail`
   - On `OTA_STATE_ABORTED`: fail job with "OTA aborted"
   - On `OTA_STATE_ANNOUNCING`: update job status to ANNOUNCING (new state), log "Waiting for device to accept..."

4. **`_wait_for_rejoin(job)` — unchanged:**
   - Uses `bridge_manager.topology()` (already v2)
   - Same uptime-based reboot detection, build date comparison, rejoin timeout

5. **`_abort_handler(aborted: OtaAborted)` — new:**
   - When bridge pushes `OtaAborted` (e.g., on WS disconnect from bridge side), fail the job

**`_run()` loop restructuring:**

The v1 `_run()` loop polls `db.active_job()` in a loop with `await asyncio.sleep(5)`. In v2, the main loop structure stays similar but the `_process()` path changes:

```python
async def _run(self):
    self._recover_startup()
    while not self._stop_event.is_set():
        job = self._db.active_job()
        if job and job.status in {STARTING, ANNOUNCING, TRANSFERRING, VERIFYING, WAITING_REJOIN}:
            await self._process(job)
        else:
            if not self._paused:
                await self._dequeue_next()
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                pass
            self._wake_event.clear()
        await self._cleanup_expired_files()
```

`_process(job)` registers the event handlers (`_on_chunk_request`, `_on_ota_status`, `_on_abort`) and waits for a terminal state or timeout, rather than looping.

**Preserved behaviors (unchanged from v1):**
- Startup recovery: kill active jobs on addon restart, mark PENDING_CONFIRM as aborted
- Pause/resume: `_paused` flag, auto-pause if queued jobs on startup
- Dequeue: 3-attempt retry with back-of-queue on exhaustion
- Rejoin verification: uptime comparison, build date matching, timeout
- Transfer timeout: `ota_transfer_timeout_s`
- Retain firmware file on completion
- All DB event logging (`flash_starting`, `flash_progress`, `flash_success`, etc.)

**Removed behaviors:**
- Polling loop with `await asyncio.sleep(0.25)`
- 5 consecutive poll failure threshold (replaced by a single connection timeout on `BridgeV2Client` or a per-request timeout for `OtaChunkRequest`)
- Burst limit of 12 chunks per poll (replaced by `max_chunks_per_batch` from bridge)
- `BridgeWsOTAClient` dependency entirely

**Timeout handling — per-request stale detection:**

In v1, 5 consecutive poll failures triggers abort. In v2:
- **Start timeout:** If no `OtaAccepted` within 30s of `OtaStartRequest`, fail job ("remote did not accept in time")
- **Chunk request timeout:** Keep the overall `ota_transfer_timeout_s` (default 30 min)
- **Stalled transfer:** If no `OtaChunkRequest` or `OtaStatus` received within 60s during TRANSFERRING state, treat as stalled → abort job

**New `ANNOUNCING` state in addon's job model:**

The addon's `models.py` needs a new job status `"announcing"` (or map the bridge's `OTA_STATE_ANNOUNCING` to something frontend-friendly). The existing job statuses: `pending_confirm → compile_queued → compiling → queued → starting → transferring → verifying → transfer_success_waiting_rejoin → success`.

Add `announcing` between `starting` and `transferring`:

```
pending_confirm → ... → starting → announcing → transferring → verifying → wait_rejoin → success
```

The frontend polls `/api/ota/current` which returns the job's `status` field — if we add `announcing` as a status, the frontend must be able to display it. Since the frontend is not changing, check whether the frontend handles unknown statuses gracefully (likely shows "Announcing" or the raw string). The existing `ANNOUNCING` gotcha in warnings covers this.

#### 2.5 Remove v1 WS OTA path from server.py

**File:** `app/server.py`

- Remove `BridgeWsManager` creation and injection into `OTAWorker`
- Change `OTAWorker` constructor to accept `BridgeV2Manager` instead of `BridgeWsManager`
- Remove `reconnect_ws_manager()` function (it created the v1 `BridgeWsManager` and injected it into `ota_worker.ws_manager`)
- Remove `bridge_transport` config option handling (no longer needed — only v2)
- Remove `ws_manager` state from `app.state`
- Keep `bridge_manager` (BridgeV2Manager) — already exists
- The OTA worker now uses `bridge_manager` for both topology (already v2) and OTA

#### 2.6 Test end-to-end OTA

- Upload firmware via `/api/ota/upload`
- Start OTA via `/api/ota/start`
- Verify the full flow: addon sends `OtaStartRequest` → bridge sends `OtaStatus(ANNOUNCING)` → bridge responds `OtaAccepted` + `OtaChunkRequest` (rapid-fire) → addon sends `OtaChunkBatch` → … → `OtaStatus(SUCCESS)`
- Test rejoin verification
- Test abort (user-initiated via `/api/ota/abort`)
- Test disconnect during transfer → bridge auto-aborts
- Test error cases: remote offline, remote not found, OTA busy, MD5 mismatch
- Test queuing multiple OTA jobs
- Test batch splitting when `max_chunks_per_batch` < requested sequences count
- Test transfer timeout

### Phase 3: Cleanup — Remove v1 WS

**Goal:** Delete all v1 JSON WebSocket code from both sides.

#### 3.1 Bridge: Remove v1 WS code

**Delete these files:**
- `components/esp_tree_bridge/bridge_api_ws.h`
- `components/esp_tree_bridge/bridge_api_ws.cpp`
- `components/esp_tree_bridge/bridge_api_messages.h`
- `components/esp_tree_bridge/bridge_api_messages.cpp`
- `components/esp_tree_bridge/bridge_api_router.h`
- `components/esp_tree_bridge/bridge_api_router.cpp`
- `components/esp_tree_bridge/bridge_api_ota_frame.h`
- `components/esp_tree_bridge/bridge_api_ota_frame.cpp`

**Modify `esp_tree_bridge.h/.cpp`:**
- Remove `bridge_api_ws` includes
- Remove `BridgeApiWsTransport` member variable and registration in `setup()`
- Remove v1 WS handler registration (`api_ws_handler_registered_` flag, `api_ws_->register_with_web_server()` call)
- Remove `api_ws_->has_authenticated_client()` check from `emit_ota_events_()` — only the callback path remains
- Remove the legacy v1 JSON path from `emit_ota_events_()` (the `else if (api_ws_ != nullptr ...)` branch)
- Remove `register_ota_web_handlers_()` declaration if unused
- Remove `BridgeApiRouter` and `BridgeApiMessages` references from includes and tests

**Modify build files:**
- Update `CMakeLists.txt` or ESP-IDF component CMake to remove deleted source files

**Gotcha:** The `BridgeApiAuth` class is shared between v1 and v2 transports. Do NOT delete it — v2 uses it too.

#### 3.2 Addon: Remove v1 WS code

**Delete these files:**
- `app/bridge_ws_client.py`
- `app/bridge_ws_ota.py`
- `app/ota_chunks.py`

**Modify:**
- `app/server.py`: Remove all `BridgeWsManager` and `BridgeWsClient` imports and references
- `app/ota_worker.py`: Remove all `BridgeWsOTAClient` imports
- `app/config.py`: Remove `bridge_transport` setting (only v2 now)
- Delete any v1 WS-related test files

#### 3.3 Update tests

**Bridge tests:**
- Remove v1 WS test fixtures (`tests/bridge_api_router_test.cpp`)
- Add v2 proto OTA tests:
  - Unit: encode/decode round-trip for each OTA message type
  - Unit: `OtaChunkBatch` validation (max_chunks_per_batch, CRC, stale request_id)
  - Integration: OTA flow through `BridgeApiProtoWsTransport` with mock bridge facade
  - Regression: disconnect mid-transfer calls `api_ota_abort()`

**Addon tests:**
- Replace `BridgeWsOTAClient` with `BridgeV2OTAClient` in test fixtures
- Test `BridgeV2Client.ota_start()` request-response correlation (success + error paths)
- Test `BridgeV2OTAClient.send_chunks()` batch splitting logic
- Test `OTAWorker` event-driven flow with mock `BridgeV2OTAClient`
- Verify all existing v2 tests still pass

#### 3.4 Update documentation

- Update `ESPLR_V2/docs/bridge_api/` to reflect v2-only WS protocol with OTA
- Update addon docs to remove v1 WS references
- Update `AGENTS.md` on both repos to reflect the new architecture

## Warnings and Gotchas

### Protocol design

1. **Shared WS connection** — OTA and other messages (events, commands, ping/pong) share the same v2 protobuf connection. Ensure no head-of-line blocking: chunk batches must not starve command requests. The bridge's event loop must interleave OTA chunk processing with other message handling. Consider yielding between batches if the event loop is cooperative.

2. **Memory pressure on ESP32** — The bridge's protobuf decoder must hold an entire `OtaChunkBatch` in memory to validate it (the whole binary frame is received, then parsed, then chunks are iterated). With 6 chunks at 2KB each + overhead ≈ 13KB. The ESP32 also holds ESP-NOW buffers, schema tables, and the WS receive buffer (up to 64KB). Keep `max_chunks_per_batch` at 6, and do NOT allocate additional per-chunk copies (zero-copy from parsed message to `api_ota_inject_chunk()`). The push-based flow (only one `OtaChunkRequest` outstanding at a time) naturally bounds memory: don't send a second `OtaChunkRequest` until the first batch is fully forwarded to ESP-NOW.

3. **Two `request_id` systems** — Confusion risk: 
   - Envelope `request_id` (field 1): correlates `OtaStartRequest` → `OtaAccepted`/`Error` and `OtaAbortRequest` → `OtaAborted`
   - `OtaChunkRequest.request_id` (field 2 of `OtaChunkRequest`): correlates chunk request → batch response within the OTA flow
   - `OtaChunkBatch` uses `response_request_id` (not `request_id`) to match `OtaChunkRequest.request_id` — this naming distinction avoids ambiguity
   These are completely independent. Do not confuse them in implementation.

4. **Stale batch handling** — Don't silently drop stale `OtaChunkBatch` messages. If the bridge receives a batch with an unrecognized `response_request_id`, send a fresh `OtaChunkRequest` to re-sync. Otherwise the addon waits indefinitely for a request that never comes.

5. **CRC-32 field** — CRC-32 of `payload` bytes only (same convention as v1 binary frames). Polynomial: `0xEDB88320`. Both sides must compute identically.

6. **Protobuf bytes field encoding** — The `bytes` type in protobuf is length-delimited. For 2KB payloads, this adds ~3 bytes overhead (1 byte tag + 2 byte length varint). Total envelope overhead per `OtaChunkBatch` is modest (envelope header + batch metadata + per-chunk metadata ≈ 30–50 bytes).

7. **`OtaChunk.offset` is redundant** — Always `sequence * max_chunk_size`. Included only for validation: the bridge can assert `chunk.offset == chunk.sequence * max_chunk_size` and reject mismatches. Consider removing this field to save per-chunk bytes (4 bytes × chunks_per_batch).

8. **`OtaChunk.flags` — only bit 0 defined** — Bit 0 = final chunk (`0x0001`). Other bits are reserved. Document clearly.

9. **`preferred_chunk_size` is advisory** — The bridge clamps it to `kMaxWsChunkSize` (2048) and the actual value depends on the remote's `max_frame_payload`. The `OtaAccepted.max_chunk_size` is authoritative.

10. **`sha256` in `OtaStartRequest` is currently unused** — The bridge ignores it (`(void) sha256_hex`). Included for future compatibility. The addon may compute and send it; the bridge won't validate it.

### Bridge implementation

11. **`emit_ota_events_()` runs in `loop()` context** — On ESP32, everything is single-threaded cooperative. Callbacks are called from the main loop, NOT from WS receive context. This is safe.

12. **`OtaAccepted` and `OtaChunkRequest` are sent in the same `loop()` call** — In v1, `emit_ota_ws_events_()` sends both `ota.accepted` and `ota.chunk_request` in rapid succession (lines 2880–2894). The v2 implementation must do the same: call `callbacks->on_ota_accepted()` then immediately `callbacks->on_ota_chunk_request()` in the same `loop()` iteration.

13. **Disconnect cleanup in v2 proto transport** — CRITICAL: The v2 `finish_session()` currently does NOT call `api_ota_abort()`. Must be added (see Phase 1.3). Without this, a disconnected client leaves OTA in a hung state.

14. **Phase 1 coexistence guard** — When both v1 and v2 transports are compiled, only one receives OTA callbacks. The `emit_ota_events_()` function checks `callbacks_ != nullptr` first, then falls back to v1 JSON. When a v2 transport registers callbacks, it suppresses v1 OTA events. When callbacks are cleared, v1 regains control.

15. **State tracking generalisation** — Rename `ws_ota_*` members to `ota_*` since they are now shared between transports. The `request_id` stored in `api_ota_start()` comes from the envelope (v1 JSON or v2 proto) and must be echoed back in `OtaAccepted`/`OtaStatus`/`OtaAborted` for correlation.

16. **`job_id` format** — The bridge generates a 4-hex-digit string from `ws_ota_job_counter_ & 0xFFFF`. This wraps at 65535 but is unlikely to collide in practice. The `OtaAccepted.job_id` is a string, matching this format.

17. **`kRuntimeApiVersion` stays at `2`** — New oneof fields in protobuf are forward-compatible. Clients that don't know field numbers 30–36 will ignore them. Bumping the version would be a protocol-breaking change and is unnecessary.

### Addon implementation

18. **`OtaAccepted` is asynchronous** — NOT a direct request-response. Use a single-shot Future keyed by `request_id` to await it. Set a 30s timeout on the Future to detect "announcing timeout".

19. **OTA worker reentrancy** — The v2 worker becomes event-driven instead of polling. Ensure event handlers don't block: use `await` for all I/O, avoid `time.sleep()`, and run file reads in a thread pool executor or use aiofiles.

20. **Job state in DB vs memory** — `OtaStatus` pushes update the addon's in-memory state. Update the SQLite DB atomically (within the same handler) to avoid showing stale progress to the frontend.

21. **`OtaState.ANNOUNCING` in addon's state machine** — This is a new state the v1 worker never sees. Add an `announcing` status to the addon's job model. The frontend will see this status via `/api/ota/current`. Verify the frontend handles it gracefully (even if just showing the raw string "announcing").

22. **No polling means no periodic keepalive** — In v1, `ota.status` polls every 250ms also served as keepalive. In v2, the bridge pushes `OtaStatus` periodically during transfer, but during ANNOUNCING and VERIFYING phases there may be long silences. The v2 WS `Ping`/`Pong` mechanism must be active with a reasonable interval (e.g., 30s) to maintain the connection. The addon's `BridgeV2Client` already sends pings; ensure the interval is short enough for OTA contexts.

### Removal

23. **v1 WS removal timing** — Do not delete v1 code until v2 OTA is tested end-to-end with a real device flash. v1 WS is the only working OTA path until Phase 2 is complete.

24. **`BridgeApiAuth` is shared** — Used by both v1 and v2 transports for HMAC-SHA256. Do NOT delete it.

25. **Envelope field numbers are permanent** — Once assigned (30–36), never reuse them. Deprecated message types keep their field numbers.
