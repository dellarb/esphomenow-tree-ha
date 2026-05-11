# Serial Transport for Bridge-to-Addon Communication

## Overview

Add serial (USB-UART) transport as an alternative to WiFi/WebSocket for the communication between the ESPHome ESP-NOW bridge and the Home Assistant addon. This allows the bridge to connect via direct USB connection, eliminating WiFi radio hopping between ESP-NOW operations and addon communication.

```
Current (WiFi Mode):
  Bridge ←WiFi/WebSocket:80→ Addon ←→ Home Assistant

Serial Mode:
  Bridge ←USB-UART (COBS+Protobuf)→ Addon ←→ Home Assistant
  (WiFi disabled at compile time)
```

## Goals

1. Eliminate WiFi congestion on bridge by moving addon communication to serial
2. Reduce bridge radio interruption during ESP-NOW operations
3. Provide reliable wired connectivity alternative to WiFi
4. Keep protocol identical — same protobuf messages, same auth, different transport only

## Non-Goals

- OTA support over serial (separate roadmap item)
- Runtime transport switching (compile-time choice only)
- Changing the ESPNOW protocol (bridge-to-remote communication unchanged)
- Replacing WiFi transport — serial is an alternative, not a replacement

---

## Design

### Protocol Architecture

| Aspect | WiFi Mode | Serial Mode |
|--------|-----------|-------------|
| **Transport** | WebSocket (raw TCP) | UART (USB-UART adapter) |
| **Framing** | WebSocket binary frames (opcode 0x2) | COBS encoding with `0x00` delimiter |
| **Protocol** | V2 protobuf over WebSocket | Same V2 protobuf protocol |
| **Auth** | HMAC-SHA256 challenge-response | Identical HMAC computation |
| **Messages** | All V2 message types | Same message types |
| **Baud** | N/A | 460800 |

### COBS Framing

Each protobuf `Envelope` is serialized to bytes, COBS-encoded, then written to UART with a trailing `0x00` delimiter.

```
Sender: Envelope.SerializeToString() → COBS encode → write bytes + 0x00
Receiver: read until 0x00 → COBS decode → Envelope.ParseFromString()
```

**COBS decode failure handling**: If bytes are lost mid-frame or a `0x00` delimiter is corrupted, the receiver may accumulate partial or concatenated frames. The decoder must:
1. Validate overhead byte distances don't exceed remaining buffer length
2. On COBS decode failure: discard the corrupt frame, log a warning, resume scanning for the next `0x00`
3. On protobuf parse failure: same — discard and continue
4. No length prefix needed for initial implementation (USB-UART is reliable), but can be added later if field corruption is observed

COBS (Consistent Overhead Byte Stuffing) benefits:
- Self-synchronizing — frame boundary via `0x00` delimiter
- Simple decode — no escape sequence complexity
- Single-byte overhead per frame
- Widely used in embedded/ESP contexts

**Wire buffer sizing**: Decoded max is `kRuntimeMaxFrameBytes = 65536`. COBS worst-case overhead is `ceil(N/254)` bytes, giving max wire frame of `65536 + 258 + 1 (delimiter) = 65795 bytes`. Define `kMaxWireFrameBytes = 66000` for UART read/COBS buffers.

### Auth Flow (Identical to WiFi)

```
Bridge → Addon:  Envelope(auth_challenge=AuthChallenge(server_nonce=16_bytes, protocol="esp-tree-pb", ...))
Addon → Bridge:  Envelope(auth_response=AuthResponse(client_nonce=16_bytes, hmac_sha256=32_bytes, ...))
Bridge → Addon:  Envelope(auth_ok=AuthOk(...)) or Envelope(auth_failed=AuthFailed(...))
```

HMAC input: `esp-tree-pb|v2|<client_kind>|<server_nonce_hex>|<client_nonce_hex>`
Key: `api_key` bytes
Output: 32-byte lowercase hex

**Important**: The serial transport uses the **same protocol identifier** as V2 WebSocket (`esp-tree-pb`, `v2`). Do NOT create a new protocol identifier. This ensures existing `BridgeApiAuth` and protobuf message code can be reused without modification.

### Architecture Decision: No Shared Transport Base (Yet)

The two existing transports (`BridgeApiWsTransport` for V1 JSON and `BridgeApiProtoWsTransport` for V2 protobuf) don't share a common base class. They each implement their own auth state machine, framing, and event emission independently. The protobuf transport even has its own auth verification (`Impl::verify_auth_response()`) using `espnow_crypto_hMAC256` rather than reusing `BridgeApiAuth`.

**Decision**: Don't extract a shared base class yet. The serial transport will follow the same pattern — its own self-contained auth and message handling. This avoids touching working code and reduces risk. A future refactor can extract a `BridgeApiTransportBase` once all three transports are stable.

**Shared code for serial**: Reuse `bridge_api_proto_messages` (protobuf encode/decode) and the `api_runtime_encode_*` / `api_runtime_handle_*` methods on `ESPTreeBridge`. These are transport-agnostic. The serial transport does **not** need `BridgeApiRouter` — it routes messages directly like the protobuf WS transport does.

### Serial Connection Types

**Option A: USB-CDC** (ESP32-C5, ESP32-S3, ESP32-S2 with native TinyUSB)
```yaml
serial_transport:
  baud_rate: 460800
  usb_cdc: {}
```

**Option B: UART0** (CP2102, CH340, or other USB-UART adapters)
```yaml
serial_transport:
  baud_rate: 460800
  tx_pin: GPIO1
  rx_pin: GPIO3
```

Both use the same transport class — just different UART hardware interfaces.

**Important UART behavior difference**: `USBCDCACMInstance::read_array()` is **non-blocking** (returns false if insufficient bytes), while `IDFUARTComponent::read_array()` **blocks for up to 100ms**. The serial transport's `loop()` must always check `available()` first and only read what's buffered. Never call `read_array()` with more bytes than `available()`. This pattern works for both hardware types.

### UART Buffer Sizing — CRITICAL

At 460800 baud, data arrives at ~46KB/s. The default ESPHome UART RX buffer (256 bytes) fills in ~5.5ms. During ESP-NOW radio operations which can block the CPU for 10-50ms, a default buffer **will overflow**.

**Required**: Set `rx_buffer_size: 8192` minimum in the serial transport config. This gives the main loop ~170ms of breathing room at 460800 baud — enough to survive ESP-NOW radio interruptions.

**Required**: The bridge's `loop()` must drain UART bytes before doing ESP-NOW operations to minimize overflow risk.

**Future consideration**: RTS/CTS hardware flow control if the USB-UART adapter supports it.

```yaml
serial_transport:
  baud_rate: 460800
  rx_buffer_size: 8192    # CRITICAL — prevents overflow during ESP-NOW radio ops
```

---

## Bridge YAML Config

```yaml
esp_tree_bridge:
  api_key: !secret api_key

# --- Choose ONE transport at compile time ---

# WiFi mode (default):
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

# OR Serial mode:
serial_transport:
  baud_rate: 460800
  # For native USB (ESP32-C5/S3/S2):
  usb_cdc: {}
  # OR for UART0 pins:
  # tx_pin: GPIO1
  # rx_pin: GPIO3
```

`wifi:` and `serial_transport:` are mutually exclusive in the schema.

---

## Addon UI Flow

**Add Bridge Modal** — two tabs:

### WiFi Tab (existing)
- Hostname/IP field
- Port field (default 80)
- API Key field
- Test connection button
- Save button

### Serial Tab (new)
- **Scan Ports** button
- Dropdown of detected serial ports (`/dev/ttyUSB0`, `COM3`, etc.)
- Baud rate field (default 460800)
- API Key field
- Connect button → attempts auth → on success: save bridge config

No auto-detect VID/PID — user explicitly selects the port from a list.

---

## File Inventory

### Bridge (ESPHome C++)

| File | Action | Description |
|------|--------|-------------|
| `components/esp_tree_common/cobs_codec.h` | Create | Inline COBS encode/decode functions |
| `components/esp_tree_bridge/bridge_api_serial.h` | Create | `BridgeApiSerialTransport` class declaration |
| `components/esp_tree_bridge/bridge_api_serial.cpp` | Create | UART I/O, COBS framing, message handling, auth |
| `components/esp_tree_bridge/esp_tree_bridge.h` | Modify | Add `BridgeApiSerialTransport*` member |
| `components/esp_tree_bridge/esp_tree_bridge.cpp` | Modify | Init serial transport in serial mode; add `serial_transport_->emit_*()` calls at 4 event sites |
| `components/esp_tree_bridge/bridge_api_proto_messages.cpp` | Modify | Add `send_envelope()` helper for serial (reuse existing encode logic) |
| Demo YAML (e.g., `espnow-bridge-c5.yml`) | Modify | Add `serial_transport:` config option |

### Addon (Python)

| File | Action | Description |
|------|--------|-------------|
| `app/bridge_serial_client.py` | Create | `SerialBridgeClient` class — serial I/O, COBS, protobuf, auth |
| `app/config.py` | Modify | Add `SerialBridgeConfig` model, `transport: wifi\|serial` per bridge |
| `app/server.py` | Modify | Import `SerialBridgeClient`, add serial client lifecycle |
| `app/bridge_v2_manager.py` (or wherever routing lives) | Modify | Route messages through WiFi or serial client based on `transport` |
| UI templates/routes | Modify | Add Serial tab to Add Bridge modal, Scan Ports button |

---

## Phased Implementation Plan

### Phase A: Bridge Serial Transport

#### Phase A1: COBS Codec
**Goal**: Pure utility — no ESPHome dependencies

**Files**: `components/esp_tree_common/cobs_codec.h`

**Steps**:
1. Implement `cobs_encode(input, output)` — encode bytes to COBS
2. Implement `cobs_decode(input, output)` — decode COBS to bytes
3. Add round-trip unit test
4. Ensure max frame size handles `kRuntimeMaxFrameBytes` (65536)

**Verify**: `tests/cobs_codec_test.cpp` passes

---

#### Phase A2: BridgeApiSerialTransport Declaration
**Goal**: Establish the class interface

**Files**: `components/esp_tree_bridge/bridge_api_serial.h`

**Interface**:
```cpp
class BridgeApiSerialTransport {
 public:
  explicit BridgeApiSerialTransport(ESPTreeBridge* bridge, UARTComponent* uart);
  ~BridgeApiSerialTransport();

  void loop();  // called from main loop()
  void send_envelope(const std::vector<uint8_t>& data);

  bool has_authenticated_client() const;
  void close_client();

  // Event emitters (same as BridgeApiProtoWsTransport)
  void emit_heartbeat(uint32_t uptime_ms);
  void emit_topology_changed(const char* reason, const uint8_t* mac);
  void emit_remote_availability(...);
  void emit_remote_state(...);
  void emit_remote_schema_changed(...);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
```

**Verify**: Class compiles, virtual methods match `BridgeApiProtoWsTransport` interface

---

#### Phase A3: BridgeApiSerialTransport Implementation
**Goal**: Full serial transport with auth and message handling

**Files**: `components/esp_tree_bridge/bridge_api_serial.cpp`

**Steps**:
1. UART read loop — read bytes, accumulate until `0x00` delimiter
2. COBS decode incoming frames
3. Parse `Envelope` protobuf
4. Implement auth state machine (bridge initiates: sends `auth_challenge` immediately on client connect, then waits for `auth_response`)
5. On auth success: enter normal operation mode
6. Route messages to `ESPTreeBridge` handlers (same as WS version)
7. Implement event emitters that serialize + COBS-encode + send
8. Implement heartbeat timer (30s interval, same as WS) — bridge sends `BridgeHeartbeat` periodically
9. Implement connection timeout in `loop()` — if no data received for 60s, disconnect and wait for reconnect

**Key reuse**:
- `bridge_api_proto_messages.cpp` — protobuf serialization (already exists)
- `bridge_api_auth.cpp` — HMAC verification (already exists)
- `esp_tree_bridge.h` — `api_key()` accessor

**Verify**:
- Bridge sends `auth_challenge` on startup
- Addon can authenticate and receive `full_snapshot`
- Commands flow both directions

---

#### Phase A4: YAML Configuration Schema
**Goal**: Add `serial_transport:` to ESPHome config

**Files**: `components/esp_tree_bridge/__init__.py` (or similar Python config)

**Steps**:
1. Add `serial_transport` config schema with:
   - `baud_rate` (default 460800)
   - `usb_cdc` (optional, for native USB boards)
   - `tx_pin` (optional, for UART0)
   - `rx_pin` (optional, for UART0)
2. Validate mutual exclusivity: `wifi:` or `serial_transport:`, not both
3. Validate pin assignments match chip capabilities
4. Pass UART device to `BridgeApiSerialTransport` on init

**Verify**:
- ESPHome validates YAML without error
- Bridge starts in serial mode when configured

---

#### Phase A5: WiFi Disable in Serial Mode
**Goal**: Ensure WiFi is not initialized when serial mode is configured

**Files**: `components/esp_tree_bridge/esp_tree_bridge.cpp`

**Steps**:
1. When `serial_transport:` is in config, do not call `wifi_->start()`
2. Do not initialize MQTT client (no WiFi means no network)
3. Web server can still run (for debug/status) or be disabled — TBD per compile-time config
4. Ensure ESP-NOW still works (bridge still receives ESPNOW frames and processes them)
5. Add `serial_transport_->emit_*()` calls alongside existing `api_ws_->` and `api_proto_ws_->` calls at these 4 event sites in `esp_tree_bridge.cpp`:
   - `queue_state_()` (~line 1181) — `emit_remote_state`
   - `queue_availability_()` (~line 1193) — `emit_remote_availability`
   - `schema_complete_()` (~line 3857) — `emit_remote_schema_changed`
   - Lambda in `setup_transport_()` (~line 3905) — `emit_topology_changed`

   Pattern (same as existing dual-transport calls):
   ```cpp
   if (serial_transport_ != nullptr) {
       serial_transport_->emit_remote_state(mac, entity, value, type);
   }
   ```

**Verify**:
- Serial mode bridge boots without WiFi connection
- ESP-NOW remote communication still works
- Addon can connect via serial and control remotes

---

### Phase B: Addon Serial Support

#### Phase B1: SerialBridgeClient Class
**Goal**: Python equivalent of `BridgeV2Client` over serial

**Files**: `app/bridge_serial_client.py`

**Interface** (mirrors `BridgeV2Client`):
```python
class SerialBridgeClient:
    def __init__(
        self,
        bridge_uuid: str,
        port: str,
        baud: int,
        api_key: str,
        *,
        on_frame: FrameHandler,
        on_connection_change: ConnectionHandler,
    ) -> None:
        ...

    def start() -> None: ...
    async def stop() -> None: ...
    async def request(envelope: pb.Envelope, timeout: float) -> pb.Envelope: ...
    async def command(request: pb.CommandRequest, timeout: float) -> pb.CommandResult: ...
    async def config_command(request: pb.ConfigCommandRequest, timeout: float) -> pb.ConfigCommandResult: ...
    @property
    def connected() -> bool: ...
```

**Steps**:
1. Add `pyserial` dependency to addon (or ensure it's available)
2. Implement serial port open with 460800 baud
3. Run serial I/O in a background thread (`asyncio.to_thread` or `loop.run_in_executor`) — `pyserial` is synchronous and must not block the asyncio event loop
4. Implement COBS encode/decode (use `cobs` Python package or inline)
5. Implement read loop thread — read until `0x00`, COBS decode, parse protobuf, enqueue to asyncio event loop
6. Implement auth handshake (same as `BridgeV2Client._authenticate()`)
7. Implement `request()` / `command()` / `config_command()` methods (use asyncio futures for response correlation)
8. Implement reconnect with exponential backoff (same as `BridgeV2Client`)

**Key reuse**:
- `app/bridge_v2_client.py` — auth logic, message handling patterns
- `app/protobuf/generated/esp_tree_runtime_pb2.py` — same protobuf types

**Note**: Serial transport uses V2 protobuf protocol only. V1 JSON-over-WebSocket is not supported over serial. The `SerialBridgeClient` is a parallel implementation to `BridgeV2Client`, not `BridgeWsClient`.

**Verify**:
- Addon can connect to bridge via serial
- Auth succeeds, topology syncs
- Commands round-trip correctly

---

#### Phase B2: Serial Config Model
**Goal**: Persist serial bridge configuration

**Files**: `app/config.py`, `app/models.py`, `app/db.py`

**Steps**:
1. Extend `BridgeTarget` dataclass (not create a separate `SerialBridgeConfig`):
   ```python
   @dataclass
   class BridgeTarget:
       host: str
       port: int = 80
       source: str = "manual"
       name: str = ""
       api_key: str = ""
       transport: Literal["wifi", "serial"] = "wifi"
       serial_port: str = ""
       baud: int = 460800
   ```
2. Add `transport`, `serial_port`, `baud` columns to `bridges` table in `db.py` (with migration)
3. `BridgeV2Manager.sync_bridges()` already creates `BridgeTarget` from DB rows — extend it to pass new fields
4. `BridgeV2Client` checks `target.transport` to decide WebSocket vs serial connection

**Verify**:
- Addon saves/loads serial bridge configs correctly
- Existing WiFi bridges unaffected

---

#### Phase B3: Server Integration
**Goal**: Wire `SerialBridgeClient` into addon server lifecycle

**Files**: `app/server.py`

**Steps**:
1. Import `SerialBridgeClient` alongside `BridgeV2Client`
2. Extend `BridgeV2Manager` (not create a new manager) to handle serial clients — the topology, routing, and event handling logic is identical for both transports
3. In `sync_bridges()`: check each bridge's `transport` setting — create `BridgeV2Client` for "wifi" or `SerialBridgeClient` for "serial"
4. Both client types share the same `on_frame` and `on_connection_change` callback signatures, so `BridgeV2Manager` handles them identically
5. Route integration frames to correct client (WiFi or serial) based on `transport` and `bridge_uuid`
6. Handle connection state changes — emit topology updates on disconnect

**Verify**:
- Server starts without error
- Serial bridges connect on startup
- WiFi bridges still work alongside (if both types configured)

---

#### Phase B4: UI — Serial Tab in Add Bridge Modal
**Goal**: User-facing serial port selection

**Files**: UI templates (Jinja2), server routes

**Steps**:
1. Add "Serial" tab to Add Bridge modal (next to "WiFi")
2. Add **Scan Ports** button → calls `/api/serial/ports` endpoint
3. Add port dropdown (populated from scan results)
4. Add `baud_rate` field (default 460800)
5. Add `api_key` field
6. Add **Connect** button → POST to `/api/bridges` with `transport: serial`
7. On success: close modal, show bridge in list
8. On failure: show error message

**API Endpoints**:
- `GET /api/serial/ports` — returns list of available serial ports
- `POST /api/bridges` — accepts `{transport: "serial", port, baud, api_key, name}`

**Serial port scan**:
```python
import serial.tools.list_ports
ports = serial.tools.list_ports.comports()
return [{"port": p.device, "description": p.description} for p in ports]
```

**Verify**:
- Scan Ports returns correct list on Linux, Windows, macOS
- User can select port, connect, save bridge
- Bridge appears in list and connects

---

#### Phase B5: Transport Routing
**Goal**: Ensure commands route to correct bridge transport

**Files**: `app/bridge_v2_manager.py` (or wherever routing lives)

**Steps**:
1. Track each bridge's `transport` type
2. When sending command: select `BridgeV2Client` or `SerialBridgeClient` based on transport
3. Handle mixed topology (some bridges WiFi, some Serial)
4. Ensure `on_frame` handler routes correctly regardless of transport

**Verify**:
- HA sends command to remote on WiFi bridge → uses `BridgeV2Client`
- HA sends command to remote on Serial bridge → uses `SerialBridgeClient`
- Both work simultaneously if both types configured

---

## Testing Plan

| Phase | Test | Method |
|-------|------|--------|
| A1 | COBS round-trip encode/decode | C++ unit test |
| A2 | `BridgeApiSerialTransport` compiles | ESPHome build |
| A3 | Serial auth handshake with addon | Manual test with addon running |
| A3 | Full topology sync over serial | Manual test |
| A3 | Command round-trip over serial | Manual test |
| A4 | YAML compiles with `serial_transport:` | ESPHome build |
| A5 | Bridge boots without WiFi in serial mode | Serial bridge device |
| B1 | `SerialBridgeClient` connects and authenticates | Manual test |
| B1 | Disconnect/reconnect works | Unplug/replug USB cable |
| B4 | Port scan returns correct ports | Manual test on target system |
| B5 | Mixed WiFi+Serial topology works | Two bridges, one of each type |

---

## Edge Cases

| Scenario | Handling |
|---------|----------|
| Wrong baud rate | Addon times out on auth, user must adjust baud in config |
| Auth failure | Addon retries 3x with backoff, shows "Auth failed" error |
| Cable disconnected | `SerialBridgeClient` detects read timeout, fires `on_connection_change(False)`, retries |
| Bridge reboots | Addon auto-reconnects after cable replug, gets new `AuthChallenge`, re-authenticates |
| Serial + OTA attempt | Bridge returns `CommandResult` with `COMMAND_STATUS_UNSUPPORTED` and `error_code="ota_not_supported_serial"`. Addon UI shows "OTA not available over serial connection". |
| Both `wifi:` and `serial_transport:` in YAML | ESPHome validation error at compile time |
| Unknown serial port | User sees error in addon UI when connecting |

---

## Future Work (Out of Scope)

- **OTA over serial** — separate roadmap item using same USB serial connection
- **Runtime transport switching** — compile-time only for simplicity
- **Auto-detect serial bridge** — user selects port explicitly for wide HA compatibility

---

## Review Issues (Resolved)

These issues were identified during a fresh model review and have been incorporated into the document above:

| # | Issue | Severity | Resolution |
|---|-------|----------|------------|
| 1 | Protocol table said "ESPHome Native API" for WiFi mode — wrong, it's V2 protobuf over WebSocket | Critical | Fixed to "V2 protobuf over WebSocket" |
| 2 | No mention of UART RX buffer sizing — default 256 bytes will overflow at 460800 baud during ESP-NOW ops | Critical | Added `rx_buffer_size: 8192` requirement and loop ordering note |
| 3 | No wire buffer constant for COBS — max wire frame is 65795 bytes, not 65536 | High | Defined `kMaxWireFrameBytes = 66000` |
| 4 | Auth protocol identifier not explicitly called out — serial must use `esp-tree-pb|v2` same as V2 WS | High | Added explicit note about using same protocol identifier |
| 5 | No COBS decode failure handling specified | High | Added decode failure handling: validate, discard, resume scanning |
| 6 | No shared transport base class — risk of code duplication | Medium | Added architecture decision: no shared base yet, follow existing pattern |
| 7 | USB CDC ACM `read_array()` is non-blocking vs hardware UART blocking | High | Added note about always checking `available()` first |
| 8 | `SerialBridgeConfig` was a separate class from `BridgeTarget` — routing expects `BridgeTarget` | Medium | Changed to extend `BridgeTarget` with `transport`, `serial_port`, `baud` fields |
| 9 | Missing which event emission call sites need `serial_transport_->emit_*()` | Medium | Listed 4 exact call sites in `esp_tree_bridge.cpp` |
| 10 | Auth flow direction unclear — who sends first? | Medium | Clarified: bridge sends `auth_challenge` first on connect |
| 11 | `pyserial` is synchronous — will block asyncio event loop | High | Added background thread requirement for serial I/O |
| 12 | V1 JSON protocol over serial not explicitly excluded | Low | Added note: serial is V2 protobuf only |
| 13 | OTA error not specified for both sides | Medium | Added `COMMAND_STATUS_UNSUPPORTED` on bridge, UI message on addon |
| 14 | Should create separate `BridgeSerialManager` or extend `BridgeV2Manager`? | Medium | Changed to extend `BridgeV2Manager` — same topology/routing logic |
| 15 | Heartbeat and connection timeout direction not specified | Medium | Added: bridge sends heartbeat every 30s, addon timeout after 60s |

---

## Dependencies

### Bridge
- ESPHome framework (existing)
- `uart` component (ESPHome)
- `usb_cdc_acm` component (ESPHome, for native USB boards)
- Protobuf serialization (existing `bridge_api_proto_messages`)
- HMAC auth (existing `bridge_api_auth`)

### Addon
- Python 3.10+
- `pyserial` (for serial port communication)
- `cobs` Python package (for COBS encoding/decoding)
- `protobuf` (existing, for V2 protocol)
- `websockets` (existing, for WiFi bridges)