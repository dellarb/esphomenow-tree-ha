# Serial Transport for Bridge-to-Addon Communication — Roadmap & Workplan

## Overview

Add serial (USB-UART) transport as an alternative to WiFi/WebSocket for the communication between the ESPHome ESP-NOW bridge and the Home Assistant addon. This allows the bridge to connect via direct USB connection, eliminating WiFi radio hopping between ESP-NOW operations and addon communication.

```
Current (WiFi Mode):
  Bridge ←WiFi/WebSocket:80→ Addon ←→ Home Assistant
  (with optional MQTT export)

Serial Mode:
  Bridge ←USB-UART (COBS+Protobuf)→ Addon ←→ Home Assistant
  (WiFi disabled at compile time; MQTT excluded by config)
```

## Goals

1. Eliminate WiFi congestion on bridge by moving addon communication to serial
2. Reduce bridge radio interruption during ESP-NOW operations
3. Provide reliable wired connectivity alternative to WiFi
4. Keep protocol identical — same protobuf messages, same auth, different transport only

## Non-Goals

- OTA of bridge firmware via serial (flashing the bridge itself over the same USB cable is unsupported — bridge must be flashed via USB with esptool)
- OTA of remote firmware via ESP-NOW (`ota_over_espnow`) is unchanged and fully supported in serial mode
- Runtime transport switching (compile-time choice only)
- Changing the ESPNOW protocol (bridge-to-remote communication unchanged)
- Replacing WiFi transport — serial is an alternative, not a replacement
- Shared transport base class (deferred until all three transports are stable)

---

## Design Decisions

### Decision 1: Serial is a Third Transport (Compile-Time Exclusive with WiFi WS)

Serial follows the same pattern as the MQTT extraction (`ESPTreeBridgeMQTT`): it is a compile-time-optional transport gated by `#ifdef USE_SERIAL`. The key difference is that **serial and WiFi protobuf WS are mutually exclusive** — a bridge is one or the other, never both. MQTT remains orthogonal (and naturally excluded in serial mode since there's no network).

**Three transports, two compile-time gates:**

| Transport | Compile Gate | Coexists With |
|-----------|-------------|---------------|
| WiFi protobuf WS | Default (no `USE_SERIAL`) | MQTT (if `USE_MQTT`), never serial |
| MQTT export | `#ifdef USE_MQTT` | WiFi WS (no network in serial mode) |
| Serial protobuf | `#ifdef USE_SERIAL` | Nothing (excludes WiFi and MQTT) |

**YAML mutual exclusivity**: `serial_transport:` and `wifi:` cannot both be present. When `serial_transport:` is in the YAML, `USE_SERIAL` is defined and `USE_MQTT` is not (MQTT requires WiFi).

**Emission pattern** — no 3-way branching:

```cpp
// State emission (in protocol callback):
#ifdef USE_SERIAL
  serial_transport_->emit_remote_state(mac, entity, value, type, message_tx_base);
#else
  if (api_proto_ws_ != nullptr) {
    api_proto_ws_->emit_remote_state(mac, entity, value, type, message_tx_base);
  }
#endif
#ifdef USE_MQTT
  if (mqtt_export_ != nullptr) {
    mqtt_export_->queue_state(mac, entity, value, type, text_value, message_tx_base, next_hop_mac, remote_display_name_(mac));
  }
#endif
```

Since serial and WS are `#ifdef`-exclusive, exactly one of the first two blocks compiles. MQTT remains independently gated. No `if (serial_transport_ != nullptr)` null-checks needed for serial — the pointer always exists when `USE_SERIAL` is defined.

**Why not a shared transport base class?** The roadmap originally considered extracting `BridgeApiTransportBase` but explicitly deferred it. The MQTT extraction proved that self-contained transport classes with `#ifdef` gates work well. Both existing transports (`BridgeApiProtoWsTransport` and the MQTT helper) implement their own auth state machines, framing, and event emission independently. Serial follows the same pattern — its own self-contained class. A future refactor can extract a base class once all three are stable. Risk is lower this way because we don't touch working WS transport code.

### Decision 2: State Delivery Sink Bitmask Unchanged

In serial mode, `serial_transport_` replaces `api_proto_ws_` as the V2 protobuf transport. The `STATE_DELIVERY_SINK_PROTOBUF` bitmask value (`0x02`) applies to serial too — serial *is* the protobuf transport in serial mode. No new sink constant needed.

When serial is compiled in, `active_state_delivery_sinks_()` returns `STATE_DELIVERY_SINK_PROTOBUF` when `serial_transport_->has_authenticated_client()` is true, instead of checking `api_proto_ws_->has_authenticated_client()`.

### Decision 3: `espnow_allowed_` Gate in Serial Mode

When `USE_SERIAL` is defined, `espnow_allowed_` does **not** depend on WiFi connectivity. The bridge can process ESP-NOW frames immediately after ESP-NOW init, since the upstream transport is serial (not WiFi-dependent). WiFi is only needed for the web server debug endpoint, not for core functionality.

### Decision 4: Addon UI — Add Serial Tab Inline (Refactor Deferred)

The current `setup-page.ts` is ~2000 lines. Rather than refactoring first, add a 4th tab ("Serial") inline alongside the existing Discover/Manual/Flash tabs. The `<bridge-setup-modal>` extraction is deferred as a future cleanup task once all three transports (WiFi, MQTT, Serial) are stable. This minimizes regression risk.

### Decision 5: BridgeTarget Extension (Not Separate Config Class)

Serial bridge config extends the existing `BridgeTarget` dataclass with `transport`, `serial_port`, and `baud` fields, rather than creating a separate `SerialBridgeConfig`. This ensures `BridgeV2Manager` routing works without type-specific dispatch.

**Note**: Adding fields to `BridgeTarget` will auto-trigger client recreation in `sync_bridges()` via `@dataclass` `__eq__`. This is intentional — any config change requires reconnection.

### Decision 6: WiFi Dependency Handling

`wifi` is removed from `DEPENDENCIES` in `__init__.py` and handled conditionally (like MQTT). When `serial_transport:` is present, `wifi:` is not required in the YAML and WiFi is not compiled in. When `serial_transport:` is absent, `wifi:` is required and WiFi mode is compiled. The YAML validator enforces exactly one of `wifi:` or `serial_transport:` is present (rejects both-missing and both-present).

### Decision 7: Auth Initiation — Addon Sends ClientHello First

In serial mode, the transport is always "connected" (cable plugged in). The addon sends a `ClientHello` envelope immediately after opening the serial port. The bridge receives data → responds with `auth_challenge` → normal HMAC-SHA256 flow follows. This mirrors the WS pattern (addon connects → bridge challenges) and avoids USB enumeration detection complexity on the bridge side.

### Decision 8: Web Server in Serial Mode

`web_server` stays in `DEPENDENCIES` always. In serial mode, the web server still starts and provides HTTP endpoints (JSON `/topology.json`, `/status`, etc.), but the WebSocket V2 protobuf endpoint is skipped (`#ifdef USE_SERIAL` guards `register_with_web_server()`). This is a pragmatic choice — the web server is lightweight and useful for debug even in serial mode.

### Decision 9: Serial Port Hotplug Handling

`SerialBridgeClient` handles port renames gracefully. Before each reconnect attempt, it scans available ports with `serial.tools.list_ports`. If the configured `serial_port` path exists → use it. If missing but a port with matching HWID/description exists → update `serial_port` in DB and use the new path. If no match → continue retrying with backoff. This handles `/dev/ttyUSB0` → `/dev/ttyUSB1` renames without manual reconfiguration.

### Decision 10: Cross-Platform COBS/Protobuf Golden-File Test

A golden-file test verifies that the C++ COBS codec and Python `cobs` package produce identical output. Phase A1 adds a C++ test that decodes a hex golden file generated by Python (a known protobuf `Envelope`). Phase B1 adds a Python test that does the reverse. This catches endianness, COBS implementation variance, and protobuf field encoding differences before they become runtime bugs.

---

## Protocol Architecture

| Aspect | WiFi Mode | Serial Mode |
|--------|-----------|-------------|
| **Transport** | WebSocket (raw TCP) | UART (USB-UART adapter) |
| **Framing** | WebSocket binary frames (opcode 0x2) | COBS encoding with `0x00` delimiter |
| **Protocol** | V2 protobuf over WebSocket | Same V2 protobuf protocol |
| **Auth** | HMAC-SHA256 challenge-response | Identical HMAC computation |
| **Messages** | All V2 message types | Same message types |
| **Baud** | N/A | 460800 |
| **Compile Gate** | Default (no `USE_SERIAL`) | `#ifdef USE_SERIAL` |
| **Coexists with MQTT** | Yes (if `USE_MQTT`) | No (no network) |

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

**Wire buffer sizing**: Decoded max is `kRuntimeMaxFrameBytes = 65536`. COBS worst-case overhead is `ceil(65536/254) = 259` bytes, giving max wire frame of `65536 + 259 + 1 (delimiter) = 65796 bytes`. Define `kMaxWireFrameBytes = 66000` for UART read/COBS buffers (rounded up for safety).

### Auth Flow (Identical to WiFi, Addon Initiates)

```
Addon → Bridge:  Envelope(client_hello=ClientHello(...))  ← addon sends first (probe)
Bridge → Addon:  Envelope(auth_challenge=AuthChallenge(server_nonce=16_bytes, protocol="esp-tree-pb", ...))
Addon → Bridge:  Envelope(auth_response=AuthResponse(client_nonce=16_bytes, hmac_sha256=32_bytes, ...))
Bridge → Addon:  Envelope(auth_ok=AuthOk(...)) or Envelope(auth_failed=AuthFailed(...))
```

The addon sends `ClientHello` immediately after opening the serial port. Since serial is always "connected" (cable plugged in), this serves as the "I'm here" probe that triggers the bridge to begin the auth challenge-response flow. This mirrors the WS pattern (addon connects → bridge challenges) and avoids USB enumeration detection complexity on the bridge side.

HMAC input: `esp-tree-pb|v2|<client_kind>|<server_nonce_hex>|<client_nonce_hex>`
Key: `api_key` bytes
Output: 32-byte lowercase hex

**Important**: The serial transport uses the **same protocol identifier** as V2 WebSocket (`esp-tree-pb`, `v2`). Do NOT create a new protocol identifier. This ensures existing `BridgeApiAuth` and protobuf message code can be reused without modification.

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

**Required**: Set `rx_buffer_size` based on hardware type:

| Hardware | Recommended `rx_buffer_size` | Notes |
|----------|------------------------------|-------|
| Native USB-CDC (ESP32-C5, S3, S2) | 8192 | TinyUSB has deeper internal buffers (~512 bytes). 8KB provides ~170ms breathing room. |
| Hardware UART (CP2102, CH340) | 16384 | Hardware FIFO is only 128 bytes. 16KB provides ~350ms breathing room to survive ESP-NOW radio blocks. |

**Strongly recommended for hardware UART**: Enable RTS/CTS flow control if the USB-UART adapter supports it. This prevents overflow at the hardware FIFO level (which the software ring buffer cannot protect against).

**Required**: The bridge's `loop()` must drain UART bytes before doing ESP-NOW operations to minimize overflow risk.

**Runtime diagnostic**: Bridge logs a warning if `rx_dropped_` counter increments during serial mode (indicates buffer overflows are occurring).

```yaml
serial_transport:
  baud_rate: 460800
  # For native USB (ESP32-C5/S3/S2):
  usb_cdc: {}
  rx_buffer_size: 8192

  # OR for hardware UART (CP2102, CH340):
  # tx_pin: GPIO1
  # rx_pin: GPIO3
  # rx_buffer_size: 16384
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

# OR Serial mode (mutually exclusive with wifi:):
serial_transport:
  baud_rate: 460800
  rx_buffer_size: 8192
  # For native USB (ESP32-C5/S3/S2):
  usb_cdc: {}
  # OR for UART0 pins (use rx_buffer_size: 16384):
  # tx_pin: GPIO1
  # rx_pin: GPIO3
```

`wifi:` and `serial_transport:` are mutually exclusive in the schema. The YAML validator rejects both-missing and both-present. When `serial_transport:` is present, `USE_SERIAL` is defined and WiFi is not compiled in (`wifi` is not in `DEPENDENCIES` — it is handled conditionally in `to_code()`).

When `serial_transport:` is absent, `wifi:` is required (enforced by the conditional dependency in `to_code()`) and normal WiFi mode is compiled.

---

## Addon UI Flow

**Add Bridge Area** — four tabs inline in `setup-page.ts` (no modal refactor for v1):

### Discover Tab (existing)
- Scan network for bridges
- Displays discovered bridges
- Prompt for API key
- Connect button

### Manual Tab (existing)
- Hostname/IP field
- Port field (default 80)
- API Key field
- Connect button

### Flash Tab (existing)
- Full flash wizard for provisioning new bridges
- Config form → compile → flash → detect

### Serial Tab (new)
- **Scan Ports** button → calls `GET /api/serial/ports`
- Dropdown of detected serial ports (`/dev/ttyUSB0`, `COM3`, etc.)
- Baud rate field (default 460800)
- API Key field
- **Connect** button → POST to `/api/bridges` with `{transport: "serial", port, baud, api_key, name}`
- On success: transition to bridge connected state
- On failure: show error message

No auto-detect VID/PID — user explicitly selects the port from a list.

---

## File Inventory

### Bridge (ESPHome C++)

| File | Action | Description |
|------|--------|-------------|
| `components/esp_tree_common/cobs_codec.h` | Create | Inline COBS encode/decode functions |
| `components/esp_tree_bridge/bridge_api_serial.h` | Create | `BridgeApiSerialTransport` class declaration, wrapped in `#ifdef USE_SERIAL` |
| `components/esp_tree_bridge/bridge_api_serial.cpp` | Create | UART I/O, COBS framing, message handling, auth — entire file wrapped in `#ifdef USE_SERIAL` |
| `components/esp_tree_bridge/esp_tree_bridge.h` | Modify | Add `#ifdef USE_SERIAL` forward declaration + `serial_transport_` member; conditionally exclude `api_proto_ws_` and wifi members when serial mode |
| `components/esp_tree_bridge/esp_tree_bridge.cpp` | Modify | `#ifdef USE_SERIAL` blocks at: setup(), 4 emission sites, loop() (drain UART), `espnow_allowed_` gate (serial mode = WiFi not required) |
| `components/esp_tree_bridge/__init__.py` | Modify | Add `serial_transport` config schema; validate mutual exclusivity with `wifi:`; set `USE_SERIAL` build flag |
| `components/esp_tree_bridge/bridge_api_proto_messages.h` | Modify | No changes needed — serial transport reuses existing encode/decode helpers directly |
| Demo YAML (e.g., `espnow-bridge-c5.yml`) | Modify | Add `serial_transport:` config option with comment |
| New demo YAML (e.g., `espnow-bridge-c5-serial.yml`) | Create | Serial-only bridge demo config |

### Addon (Python)

| File | Action | Description |
|------|--------|-------------|
| `app/bridge_serial_client.py` | Create | `SerialBridgeClient` class — serial I/O, COBS, protobuf, auth, hotplug port handling |
| `app/models.py` | Modify | Add `transport`, `serial_port`, `baud` fields to `BridgeTarget` |
| `app/db.py` | Modify | Add `transport`, `serial_port`, `baud` columns to `bridges` table (migration v18) |
| `app/bridge_v2_client.py` | Modify | `BridgeV2Manager.sync_bridges()` creates `SerialBridgeClient` for serial bridges; route OTA attempts to serial bridge → `COMMAND_STATUS_UNSUPPORTED` |
| `app/server.py` | Modify | Add `/api/serial/ports` endpoint; extend `/api/bridges` POST for serial config; serial client lifecycle |
| `requirements.txt` | Modify | Add `pyserial` and `cobs` dependencies |

### UI (Lit/TypeScript)

| File | Action | Description |
|------|--------|-------------|
| `ui/src/pages/setup-page.ts` | Modify | Add "Serial" tab (4th tab) inline alongside Discover/Manual/Flash tabs. No modal refactor. |
| `ui/src/api/client.ts` | Modify | Add `scanSerialPorts()`, extend `addBridge()` for `transport`, `serial_port`, `baud` params |

### Tests

| File | Action | Description |
|------|--------|-------------|
| `device_code/tests/cobs_codec_test.cpp` | Create | C++ COBS golden-file test (decode Python-generated hex data) |
| `ha_integration/tests/` (new test) | Create | Python COBS golden-file test (decode C++-generated hex data) |

---

## Phased Implementation Plan

### Phase A: Bridge Serial Transport

#### Phase A1: COBS Codec
**Goal**: Pure utility — no ESPHome dependencies, cross-platform verified

**Files**: `components/esp_tree_common/cobs_codec.h`, `device_code/tests/cobs_codec_test.cpp`

**Steps**:
1. Implement `cobs_encode(input, output)` — encode bytes to COBS
2. Implement `cobs_decode(input, output)` — decode COBS to bytes
3. Add round-trip unit test
4. Ensure max frame size handles `kRuntimeMaxFrameBytes` (65536)
5. Add `kMaxWireFrameBytes = 66000` constant for COBS wire buffers (math: 65536 + ceil(65536/254) + 1 = 65796, rounded up)
6. Add golden-file test: Python generates a known protobuf `Envelope`, COBS-encodes it, saves as hex golden file. C++ test decodes and asserts parsed fields match. This catches COBS implementation variance, endianness, and protobuf field encoding differences between platforms.

**Verify**: `dev.sh run-cpp` passes all tests including new `cobs_codec_test` and golden-file cross-platform test

---

#### Phase A2: BridgeApiSerialTransport Declaration
**Goal**: Establish the class interface, compile-gated by `USE_SERIAL`

**Files**: `components/esp_tree_bridge/bridge_api_serial.h`

**Interface**:
```cpp
#ifdef USE_SERIAL

#include "esphome/components/uart/uart.h"

namespace bridge_api {

class BridgeApiSerialTransport {
 public:
  explicit BridgeApiSerialTransport(ESPTreeBridge* bridge, esphome::uart::UARTComponent* uart);
  ~BridgeApiSerialTransport();

  void loop();  // called from ESPTreeBridge::loop() — drain UART, process frames
  void send_envelope(const std::vector<uint8_t>& data);

  bool has_authenticated_client() const;
  void close_client();  // reset auth state, clear buffers

  // Event emitters (same signatures as BridgeApiProtoWsTransport)
  void emit_heartbeat(uint32_t uptime_ms);
  void emit_topology_changed(const char* reason, const uint8_t* mac);
  void emit_remote_availability(const uint8_t* mac, bool online, const char* reason,
                                int8_t rssi, uint32_t offline_s,
                                const uint8_t* parent_mac, uint8_t hop_count);
  void emit_remote_state(const uint8_t* mac, const BridgeEntitySchema& entity,
                         const std::vector<uint8_t>& value, espnow_field_type_t type,
                         uint32_t state_tx_counter);
  void emit_remote_schema_changed(const uint8_t* mac, const std::string& schema_hash);

  // OTA transport callbacks (return unsupported status)
  void on_ota_accepted(uint32_t request_id, const std::string& job_id, const uint8_t* target_mac);
  void on_ota_chunk_request(uint32_t request_id, const std::string& job_id, uint32_t chunk_request_id);
  void on_ota_status(uint32_t request_id, const std::string& job_id, uint32_t state, uint32_t percent);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bridge_api

#endif  // USE_SERIAL
```

**Key design points**:
- `#ifdef USE_SERIAL` guard on the entire class — compiles to nothing when serial is not configured
- Same event emitter signatures as `BridgeApiProtoWsTransport` for consistent call sites
- OTA callbacks respond with `COMMAND_STATUS_UNSUPPORTED` for serial mode
- `close_client()` resets auth state (serial "disconnect" = client lost)

**Verify**: Class compiles with `USE_SERIAL` defined, excluded without it

---

#### Phase A3: BridgeApiSerialTransport Implementation
**Goal**: Full serial transport with auth and message handling

**Files**: `components/esp_tree_bridge/bridge_api_serial.cpp` (entire file wrapped in `#ifdef USE_SERIAL`)

**Steps**:
1. UART read loop in `loop()` — always check `available()` first, only read buffered bytes, accumulate until `0x00` delimiter
2. COBS decode incoming frames — on decode failure: discard, log warning, resume scanning for `0x00`
3. Parse `Envelope` protobuf — on parse failure: discard, log, continue
4. Implement auth state machine (addon sends `ClientHello` on connect → bridge receives data, responds with `auth_challenge` → waits for `auth_response`)
5. Reuse `bridge_api_auth.cpp` — HMAC verification using same `espnow_crypto_hmac_sha256` as WS transport
6. On auth success: enter normal operation mode, send `auth_ok` with bridge info
7. On auth failure: send `auth_failed`, reset state, wait for reconnect
8. Route authenticated messages to `ESPTreeBridge` handlers (same as WS version)
9. Implement event emitters that serialize → COBS-encode → write to UART
10. Implement heartbeat timer (30s interval, same as WS) — bridge sends `BridgeHeartbeat` periodically
11. Implement connection timeout in `loop()` — if no data received for 60s, reset auth state and wait for reconnect
12. OTA commands return `CommandResult` with `COMMAND_STATUS_UNSUPPORTED` and `error_code="ota_not_supported_serial"`
13. UART drain priority: `loop()` drains UART bytes before ESP-NOW processing to minimize overflow risk

**Key reuse**:
- `bridge_api_proto_messages.cpp` — protobuf serialization (`Writer` class, `envelope()` helper)
- `bridge_api_auth.cpp` — HMAC verification (same `espnow_crypto_hmac_sha256`)
- `esp_tree_bridge.h` — `api_key()` accessor, protocol handler methods

**Verify**:
- Addon sends `ClientHello` → bridge responds with `auth_challenge`
- Addon can authenticate and receive `full_snapshot`
- Commands flow both directions
- Heartbeat is sent every 30s
- 60s timeout resets auth state

---

#### Phase A4: Compile-Time Integration in ESPTreeBridge
**Goal**: Wire serial transport into bridge lifecycle, compile-time exclusive with WiFi WS

**Files**: `components/esp_tree_bridge/esp_tree_bridge.h`, `components/esp_tree_bridge/esp_tree_bridge.cpp`

**This phase replaces the original roadmap's A4 (YAML Config) and A5 (WiFi Disable) — they are combined here because the `#ifdef USE_SERIAL` approach makes them inseparable.**

**Step A4.1: Header changes** (`esp_tree_bridge.h`):

```cpp
// Forward declaration
#ifdef USE_SERIAL
namespace bridge_api { class BridgeApiSerialTransport; }
#endif

class ESPTreeBridge : public Component, public bridge_api::BridgeFacade {
  // ...

#ifdef USE_SERIAL
  std::unique_ptr<bridge_api::BridgeApiSerialTransport> serial_transport_;
#else
  std::unique_ptr<bridge_api::BridgeApiProtoWsTransport> api_proto_ws_;
#endif

  // ...
};
```

**Step A4.2: Setup changes** (`esp_tree_bridge.cpp` — `setup()`):

```cpp
void ESPTreeBridge::setup() {
  // ... protocol init, setup_transport_() ...

#ifdef USE_SERIAL
  serial_transport_ = std::make_unique<bridge_api::BridgeApiSerialTransport>(this, uart_component_);
  // No WiFi init, no web server WebSocket registration needed
#else
  api_proto_ws_ = std::make_unique<bridge_api::BridgeApiProtoWsTransport>(this);
  api_proto_ws_->register_with_web_server();
#endif

  // MQTT is naturally excluded in serial mode (no WiFi → no network)
#ifdef USE_MQTT
  // ... existing MQTT init ...
#endif
}
```

**Step A4.3: Emission site changes** — the 4 protocol callback sites plus any other `api_proto_ws_` references:

Each site gets `#ifdef USE_SERIAL` / `#else` / `#endif` wrapping:

```cpp
// set_publish_state_fn callback (in setup_transport_):
protocol_.set_publish_state_fn([this](...) {
    // ... state delivery tracking ...

#ifdef USE_SERIAL
    serial_transport_->emit_remote_state(mac, entity, value, type, message_tx_base);
#else
    if (api_proto_ws_ != nullptr) {
      api_proto_ws_->emit_remote_state(mac, entity, value, type, message_tx_base);
    }
#endif

#ifdef USE_MQTT
    if (mqtt_export_ != nullptr) {
      mqtt_export_->queue_state(mac, entity, value, type, text_value, message_tx_base, next_hop_mac, remote_display_name_(mac));
    }
#endif
  });
```

Same pattern for `emit_remote_availability`, `emit_topology_changed`, `emit_remote_schema_changed`.

**Step A4.4: `espnow_allowed_` gate** — in serial mode, WiFi connectivity is not required:

```cpp
void ESPTreeBridge::loop() {
  // ...

#ifdef USE_SERIAL
  // Serial mode: espnow_allowed_ is always true after init (no WiFi dependency)
  if (!espnow_allowed_) {
    espnow_allowed_ = true;
    ESP_LOGI(TAG, "ESP-NOW enabled (serial mode — no WiFi required)");
  }
#else
  // WiFi mode: check WiFi connectivity
  auto* wifi = esphome::wifi::global_wifi_component;
  if (wifi && wifi->is_connected()) {
    if (!espnow_allowed_) {
      espnow_allowed_ = true;
      ESP_LOGI(TAG, "ESP-NOW enabled (WiFi connected)");
    }
  } else {
    if (espnow_allowed_) {
      espnow_allowed_ = false;
    }
  }
#endif

  // ... drain frames, process ...

#ifdef USE_SERIAL
  if (serial_transport_ != nullptr) {
    serial_transport_->loop();  // drain UART, process incoming frames
  }
#endif

  // ... rest of loop (OTA, airtime, etc.) ...
}
```

**Step A4.5: `active_state_delivery_sinks_()` update**:

```cpp
uint8_t ESPTreeBridge::active_state_delivery_sinks_() const {
  uint8_t sinks = 0;
#ifdef USE_SERIAL
  if (serial_transport_ != nullptr && serial_transport_->has_authenticated_client()) {
    sinks |= STATE_DELIVERY_SINK_PROTOBUF;
  }
#else
  if (api_proto_ws_ != nullptr && api_proto_ws_->has_authenticated_client()) {
    sinks |= STATE_DELIVERY_SINK_PROTOBUF;
  }
#endif
#ifdef USE_MQTT
  if (mqtt_export_ != nullptr && mqtt_export_->is_connected()) {
    sinks |= STATE_DELIVERY_SINK_MQTT;
  }
#endif
  return sinks;
}
```

**Step A4.6: Mark state sink delivered** — when serial transport confirms delivery:

```cpp
void ESPTreeBridge::mark_state_sink_delivered_(const uint8_t* mac, uint8_t entity_index,
                                                uint32_t message_tx_base,
                                                StateDeliverySink sink) {
  // ... existing implementation ...
  // No change needed — serial sets STATE_DELIVERY_SINK_PROTOBUF, same as WS
}
```

No new sink constant. Serial uses the existing `STATE_DELIVERY_SINK_PROTOBUF` flag.

**Step A4.7: Web server in serial mode** — `web_server` stays in `DEPENDENCIES` always. In serial mode, the web server still starts and provides HTTP endpoints (`/topology.json`, `/status`, etc.), but the WebSocket V2 protobuf endpoint registration is skipped (`#ifdef USE_SERIAL` guards `register_with_web_server()`). This is pragmatic — the web server is lightweight and its HTTP endpoints are useful for debug even in serial mode.

**Verify**:
- Serial mode bridge compiles with `USE_SERIAL` defined
- WiFi mode bridge compiles without `USE_SERIAL` (no regression)
- `espnow_allowed_` set immediately in serial mode
- Emission sites compile-correct for both modes
- Binary size comparison: serial mode should be smaller (no WS/MQTT code)

---

#### Phase A5: YAML Configuration Schema
**Goal**: Add `serial_transport:` to ESPHome config with mutual exclusivity validation, conditional wifi dependency

**Files**: `components/esp_tree_bridge/__init__.py`

**Steps**:
1. Remove `wifi` from `DEPENDENCIES` (line 4). Keep `web_server` in `DEPENDENCIES`.
   ```python
   DEPENDENCIES = ["web_server"]
   ```
2. In `to_code()`, conditionally require `wifi:` when `serial_transport:` is absent:
   ```python
   if "serial_transport" not in config:
       if "wifi" not in core.CORE.loaded_integrations:
           raise cv.Invalid("wifi: is required when serial_transport: is not configured")
   ```
3. Add `serial_transport` config schema as optional block with:
   - `baud_rate` (default 460800, int, min 9600, max 921600)
   - `rx_buffer_size` (default 8192 for USB-CDC, 16384 recommended for hardware UART, int, min 2048, max 65536)
   - `usb_cdc` (optional, for native USB boards — creates a `USBCDCACM` instance)
   - `tx_pin` (optional, for UART0 — `PinSchema`)
   - `rx_pin` (optional, for UART0 — `PinSchema`)
4. Validate mutual exclusivity: `wifi:` and `serial_transport:` cannot both be present
   - At least one must be present (reject both-missing)
   - Use a custom final validator
5. When `serial_transport:` is present in config:
   - Set `USE_SERIAL` build flag via `cg.add_build_flag("-DUSE_SERIAL")`
   - Create UART component (either `USBCDCACM` or `IDFUARTComponent` based on `usb_cdc` vs pin config)
   - Pass UART device and config to `BridgeApiSerialTransport` via `to_code()`
6. When `serial_transport:` is absent:
   - `USE_SERIAL` is not defined
   - Normal WiFi mode (wifi dependency enforced at step 2)

**Verify**:
- ESPHome validates `serial_transport:` YAML without error
- ESPHome rejects YAML with both `wifi:` and `serial_transport:`
- ESPHome rejects YAML with neither `wifi:` nor `serial_transport:`
- Bridge starts in serial mode when configured
- `rx_buffer_size` is correctly propagated to UART component

---

#### Phase A6: Demo YAML and Testing

**Step A6.1**: Create `device_code/demos/espnow-bridge-c5-serial.yml`:
```yaml
esp32:
  board: esp32-c5-devkitc-1
  variant: esp32c5
  framework:
    type: esp-idf

external_components:
  - source: local
    path: ../components
    components: [esp_tree_bridge, esp_tree_common]

web_server:
  port: 80

esp_tree_bridge:
  api_key: !secret api_key
  network_id: !secret network_id
  psk: !secret psk
  serial_transport:
    baud_rate: 460800
    rx_buffer_size: 8192
    usb_cdc: {}

# No wifi: block — serial mode (wifi not required when serial_transport: present)
```

**Step A6.2**: Update `device_code/demos/espnow-bridge-c5.yml` with comment:
```yaml
# WiFi mode (default). For serial mode via USB, use espnow-bridge-c5-serial.yml instead.
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
```

**Step A6.3**: Run existing C++ tests to verify no regression:
```bash
./dev.sh run-cpp
```

**Step A6.4**: Build WiFi mode bridge (regression):
```bash
./device_code/scripts/ha_compile.sh espnow-bridge-c5 b
```

**Step A6.5**: Build serial mode bridge:
```bash
./device_code/scripts/ha_compile.sh espnow-bridge-c5-serial b
```

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
        target: BridgeTarget,  # has transport="serial", serial_port, baud
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
1. Add `pyserial` and `cobs` dependencies to `requirements.txt`
2. Implement serial port open with configurable baud (from `target.baud`)
3. On connect, send `ClientHello` envelope first → bridge responds with `auth_challenge` → HMAC-SHA256 auth flow follows
4. Run serial I/O in a background thread — `pyserial` is synchronous and must not block the asyncio event loop. Set `serial.timeout = 0.1` for non-blocking polling. On shutdown, close the serial port from the main thread (causes `SerialException` in reader → thread exits cleanly). Store thread reference for `.join(timeout=2)`.
5. Implement COBS encode/decode (use `cobs` Python package: `cobs.cobs.encode()` / `cobs.cobs.decode()`)
6. Implement read loop thread — read until `0x00`, COBS decode, parse protobuf, enqueue to asyncio event loop via `loop.call_soon_threadsafe()`
7. Implement auth handshake (same HMAC-SHA256 flow as `BridgeV2Client._authenticate()`)
8. Implement `request()` / `command()` / `config_command()` methods (use asyncio futures for response correlation)
9. Implement reconnect with exponential backoff (same delays as `BridgeV2Client`: `[1, 2, 5, 10]` seconds). Before each reconnect attempt, scan available ports to handle hotplug renames:
   - If configured `serial_port` path exists → use it
   - If missing, scan `serial.tools.list_ports` for matching HWID/description → update `serial_port` in DB, use new path
   - If no match → retry with backoff
10. Implement 60s connection timeout — if no data received in 60s, fire `on_connection_change(False)` and attempt reconnect
11. Add Python-side COBS golden-file test: decode C++-generated hex data and assert parsed fields match

**Key reuse**:
- `app/bridge_v2_client.py` — auth logic patterns, `FrameHandler`/`ConnectionHandler` types
- `app/protobuf/generated/esp_tree_runtime_pb2.py` — same protobuf types

**Note**: Serial transport uses V2 protobuf protocol only. V1 JSON-over-WebSocket is not supported over serial. The `SerialBridgeClient` is a parallel implementation to `BridgeV2Client`, not `BridgeWsClient`.

**Verify**:
- Addon can connect to bridge via serial
- Auth succeeds, topology syncs
- Commands round-trip correctly
- Reconnect works after cable unplug/replug

---

#### Phase B2: Serial Config Model
**Goal**: Persist serial bridge configuration in existing data structures

**Files**: `app/models.py`, `app/db.py`

**Steps**:
1. Extend `BridgeTarget` dataclass with serial fields:
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
2. Add DB migration **v18** for `bridges` table: (last migration was v17 for `mac` column)
   - `transport TEXT DEFAULT 'wifi'` column
   - `serial_port TEXT DEFAULT ''` column
   - `baud INTEGER DEFAULT 460800` column
   - Backfill existing bridges with `transport='wifi'`
3. Update `BridgeV2Manager.sync_bridges()` — extend bridge dict parsing to include `transport`, `serial_port`, `baud`
4. WiFi bridges have `transport="wifi"` — existing code works unchanged since `host` and `port` are still present

**Verify**:
- Addon saves/loads serial bridge configs correctly
- Existing WiFi bridges unaffected (migration adds defaults)
- `BridgeTarget(transport="serial", serial_port="/dev/ttyUSB0")` creates valid serial client

---

#### Phase B3: Server Integration
**Goal**: Wire `SerialBridgeClient` into addon server lifecycle

**Files**: `app/server.py`, `app/bridge_v2_client.py`

**Steps**:
1. Import `SerialBridgeClient` alongside `BridgeV2Client`
2. In `BridgeV2Manager.sync_bridges()`: check each bridge's `transport` setting:
   - `transport == "wifi"` → create `BridgeV2Client` (existing behavior)
   - `transport == "serial"` → create `SerialBridgeClient`
3. Both client types share the same `on_frame` and `on_connection_change` callback signatures, so `BridgeV2Manager` handles them identically — no type-specific dispatch needed in the manager
4. Route integration frames to correct client (WiFi or serial) based on `bridge_uuid` — manager already routes by UUID
5. Handle connection state changes — `on_connection_change(False)` triggers same topology update logic regardless of transport
6. Add `/api/serial/ports` endpoint to server:
   ```python
   @app.get("/api/serial/ports")
   async def scan_serial_ports():
       import serial.tools.list_ports
       ports = serial.tools.list_ports.comports()
       return [{"port": p.device, "description": p.description, "hwid": p.hwid} for p in ports]
   ```
7. Extend `POST /api/bridges` to accept `{transport: "serial", serial_port, baud, api_key, name}` — `host` is not required for serial bridges
8. Ensure `sync_bridges()` handles serial bridges that have empty `host` — currently skipped by the `if not host` guard. Change to `if not bridge_uuid or not api_key: continue` and add `if transport != "serial" and not host: continue`.

**Verify**:
- Server starts without error
- Serial bridges connect on startup when configured
- WiFi bridges still work alongside (if both types configured)
- `GET /api/serial/ports` returns list of available ports

---

#### Phase B4: UI — Add Serial Tab Inline
**Goal**: Add "Serial" tab to the existing inline tab structure (refactor deferred)

**Approach**: Add `'serial'` as a 4th option to the existing `flashTab` property (which already controls Discover/Manual/Flash tabs). No modal extraction. ~50 lines of new code.

**Step B4.1: Add Serial tab to `setup-page.ts`**
- Add `'serial'` to the `flashTab` property type (line 68)
- Add serial tab button in the tab bar alongside Discover/Manual/Flash
- Render serial tab content when `flashTab === 'serial'`:
  - **Scan Ports** button → calls `GET /api/serial/ports`
  - Dropdown of detected serial ports
  - Baud rate field (default 460800)
  - API Key field
  - **Connect** button → POST to `/api/bridges` with `{transport: "serial", serial_port, baud, api_key, name}`
  - On success: transition to `step1 = 'complete'`
  - On failure: show error message

**Step B4.2: Update API client** (`ui/src/api/client.ts`):
- Add `scanSerialPorts()` → `GET /api/serial/ports`
- Extend `addBridge()` to accept `transport`, `serial_port`, `baud` params

**Verify**:
- Existing WiFi bridge setup still works (Discover, Manual, Flash tabs unchanged)
- Serial tab shows available ports after scan
- User can select port, connect, and bridge appears connected
- No regression to flash wizard or any existing flow

---

#### Phase B5: Transport Routing Verification
**Goal**: Ensure commands route to correct bridge transport

**Files**: `app/bridge_v2_client.py` (manager routing logic)

**Steps**:
1. Verify `BridgeV2Manager` tracks each bridge's transport type via `BridgeTarget.transport`
2. When sending command: select client by `bridge_uuid` — manager already does this; both `BridgeV2Client` and `SerialBridgeClient` expose `command()` and `config_command()`
3. OTA: `SerialBridgeClient` raises `UnsupportedCommandError` or returns `CommandResult(status=COMMAND_STATUS_UNSUPPORTED, error_code="ota_not_supported_serial")` when OTA is attempted
4. Mixed topology: manager can handle both `BridgeV2Client` (WiFi) and `SerialBridgeClient` (serial) bridges simultaneously — each is identified by `bridge_uuid`

**Verify**:
- HA sends command to remote on WiFi bridge → uses `BridgeV2Client`
- HA sends command to remote on Serial bridge → uses `SerialBridgeClient`
- OTA attempt on Serial bridge → appropriate error response
- Both types work simultaneously if both are configured

---

## Testing Plan

| Phase | Test | Method |
|-------|------|--------|
| A1 | COBS round-trip encode/decode | C++ unit test (`dev.sh run-cpp`) |
| A1 | Cross-platform COBS golden-file (Python→C++) | C++ unit test with hex golden file |
| A2 | `BridgeApiSerialTransport` compiles | ESPHome build with `USE_SERIAL` |
| A3 | Addon sends `ClientHello`, bridge responds with `auth_challenge` | Manual test with addon running |
| A3 | Full topology sync over serial | Manual test |
| A3 | Command round-trip over serial | Manual test |
| A3 | Heartbeat every 30s | Manual test (observe timing) |
| A3 | 60s connection timeout | Manual test (cut data flow, observe reset) |
| A4 | WiFi mode bridge compiles without `USE_SERIAL` | ESPHome build (regression) |
| A4 | Serial mode bridge boots without WiFi | Serial bridge device |
| A4 | `espnow_allowed_` set immediately in serial mode | Check logs |
| A5 | YAML validates `serial_transport:` | ESPHome config validation |
| A5 | YAML rejects both `wifi:` and `serial_transport:` | ESPHome config validation |
| A5 | YAML rejects neither `wifi:` nor `serial_transport:` | ESPHome config validation |
| A5 | YAML with `serial_transport:` does not require `wifi:` | ESPHome config validation |
| A6 | WiFi mode bridge still works (regression) | Flash + manual test |
| A6 | Serial mode bridge connects via USB | Flash + manual test |
| B1 | `SerialBridgeClient` connects and authenticates | Manual test |
| B1 | Disconnect/reconnect works | Unplug/replug USB cable |
| B1 | Port rename hotplug (`/dev/ttyUSB0`→`/dev/ttyUSB1`) | Manual test with HWID matching |
| B1 | Cross-platform COBS golden-file (C++→Python) | Python unit test |
| B2 | Serial bridge config persists in DB | Manual test |
| B2 | Existing WiFi bridges unaffected by migration v18 | Manual test |
| B3 | Mixed WiFi+Serial topology works in manager | Two bridges, one of each type |
| B3 | OTA attempt on Serial bridge → `COMMAND_STATUS_UNSUPPORTED` | Manual test |
| B4 | Port scan returns correct ports | Manual test on Linux |
| B4 | Bridge appears connected after serial connect | Manual test |

---

## Edge Cases

| Scenario | Handling |
|---------|----------|
| Wrong baud rate | Addon times out on auth, user must adjust baud in config |
| Auth failure | Addon retries 3x with backoff, shows "Auth failed" error |
| Cable disconnected | `SerialBridgeClient` detects read timeout (60s), fires `on_connection_change(False)`, retries with backoff |
| Bridge reboots | Addon auto-reconnects, sends fresh `ClientHello`, bridge responds with `AuthChallenge`, re-authenticates |
| Serial + OTA attempt | Bridge returns `CommandResult` with `COMMAND_STATUS_UNSUPPORTED` and `error_code="ota_not_supported_serial"`. Addon UI shows "OTA not available over serial connection". Remote ESP-NOW OTA is unaffected. |
| Both `wifi:` and `serial_transport:` in YAML | ESPHome validation error at compile time |
| Neither `wifi:` nor `serial_transport:` in YAML | ESPHome validation error at compile time |
| Unknown serial port | User sees error in addon UI when connecting |
| UART buffer overflow (460800 baud) | `rx_buffer_size: 16384` (hardware UART) or `8192` (USB-CDC). Bridge `loop()` drains UART before ESP-NOW ops. Bridge logs warning on `rx_dropped_` increment. |
| COBS frame corruption | Discard frame, log warning, resume scanning for `0x00` |
| USB CDC vs hardware UART `read_array()` difference | `loop()` always checks `available()` first, only reads buffered bytes. Works for both hardware types. |
| Serial mode + MQTT in YAML | ESPHome validation error at compile time (MQTT requires WiFi, which is absent in serial mode) |
| Serial mode + web server | Web server still runs providing HTTP debug endpoints. WS endpoint registration skipped by `#ifdef USE_SERIAL`. |
| Serial port renamed by OS (`/dev/ttyUSB0`→`/dev/ttyUSB1`) | `SerialBridgeClient` scans ports on reconnect. Matches by HWID → updates DB → uses new path. |
| Serial bridge reboots during ESP-NOW OTA of a remote | OTA job fails (`WAITING_REJOIN` timeout), addon marks OTA as failed. User must re-flash the remote after bridge recovers. |

---

## Future Work (Out of Scope)

- **OTA over serial** — separate roadmap item using same USB serial connection
- **Runtime transport switching** — compile-time only for simplicity
- **Auto-detect serial bridge** — user selects port explicitly for wide HA compatibility
- **Shared transport base class** — once all three transports are stable, extract `BridgeApiTransportBase`

---

## Review Issues (Resolved)

| # | Issue | Severity | Resolution |
|---|-------|----------|------------|
| 1 | Protocol table said "ESPHome Native API" for WiFi mode — wrong, it's V2 protobuf over WebSocket | Critical | Fixed to "V2 protobuf over WebSocket" |
| 2 | No mention of UART RX buffer sizing — default 256 bytes will overflow at 460800 baud during ESP-NOW ops | Critical | Added `rx_buffer_size: 8192` requirement and loop ordering note |
| 3 | No wire buffer constant for COBS — max wire frame is 65795 bytes, not 65536 | High | Defined `kMaxWireFrameBytes = 66000` |
| 4 | Auth protocol identifier not explicitly called out — serial must use `esp-tree-pb\|v2` same as V2 WS | High | Added explicit note about using same protocol identifier |
| 5 | No COBS decode failure handling specified | High | Added decode failure handling: validate, discard, resume scanning |
| 6 | No shared transport base class — risk of code duplication | Medium | Decision: no shared base yet, follow MQTT extraction pattern. Compensated by `#ifdef USE_SERIAL` compile-time exclusivity eliminating null-check overhead. |
| 7 | USB CDC ACM `read_array()` is non-blocking vs hardware UART blocking | High | Added note about always checking `available()` first |
| 8 | `SerialBridgeConfig` was a separate class from `BridgeTarget` — routing expects `BridgeTarget` | Medium | Changed to extend `BridgeTarget` with `transport`, `serial_port`, `baud` fields |
| 9 | Missing which event emission call sites need `serial_transport_->emit_*()` | Medium | Listed 4 exact call sites with `#ifdef USE_SERIAL` pattern. Also `active_state_delivery_sinks_()` and `loop()` UART drain. |
| 10 | Auth flow direction unclear — who sends first? | Medium | Clarified: bridge sends `auth_challenge` when data is received from addon |
| 11 | `pyserial` is synchronous — will block asyncio event loop | High | Added background thread requirement for serial I/O |
| 12 | V1 JSON protocol over serial not explicitly excluded | Low | Added note: serial is V2 protobuf only |
| 13 | OTA error not specified for both sides | Medium | Added `COMMAND_STATUS_UNSUPPORTED` on bridge, UI message on addon |
| 14 | Should create separate `BridgeSerialManager` or extend `BridgeV2Manager`? | Medium | Extend `BridgeV2Manager` — same topology/routing logic, both client types managed by same manager |
| 15 | Heartbeat and connection timeout direction not specified | Medium | Added: bridge sends heartbeat every 30s, addon timeout after 60s |
| 16 | Serial and WS can never coexist — why use 3-way null checks? | Medium (new) | Changed to `#ifdef USE_SERIAL` compile-time exclusivity. No 3-way branching at call sites. Serial and WS are mutually exclusive at compile time. |
| 17 | `espnow_allowed_` in serial mode should not depend on WiFi | Medium (new) | In serial mode, `espnow_allowed_` is set true immediately after ESP-NOW init. No WiFi connectivity check. |
| 18 | State delivery sink bitmask — serial needs its own? | Low (new) | No. Serial uses `STATE_DELIVERY_SINK_PROTOBUF` (same as WS). In serial mode, that's the only sink. |
| 19 | UI setup page is ~1400 lines — adding serial inline will make it worse | Medium (new) | Refactor first: extract `<bridge-setup-modal>` component, then add Serial tab. |
| 20 | MQTT is naturally excluded in serial mode (no network) | Low (new) | Not enforced at YAML level yet — could add validator later. For v1, MQTT just won't connect in serial mode. |

---

## Dependencies

### Bridge
- ESPHome framework (existing)
- `uart` component (ESPHome) — for hardware UART
- `usb_cdc_acm` component (ESPHome) — for native USB boards
- Protobuf serialization (existing `bridge_api_proto_messages`)
- HMAC auth (existing `bridge_api_auth`)
- `#ifdef USE_SERIAL` compile-time gate (new, follows MQTT pattern)

### Addon
- Python 3.10+
- `pyserial` (for serial port communication)
- `cobs` Python package (for COBS encoding/decoding)
- `protobuf` (existing, for V2 protocol)
- `websockets` (existing, for WiFi bridges)

### Dev/Build
- ESPHome external component build system (for `USE_SERIAL` build flag)
- `device_code/tests/CMakeLists.txt` — add `cobs_codec_test` target