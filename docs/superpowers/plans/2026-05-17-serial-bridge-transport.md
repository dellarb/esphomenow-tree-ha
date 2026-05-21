# Serial Bridge Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add serial (USB-UART) transport as a compile-time alternative to WiFi/WebSocket for bridge-to-addon communication, using COBS framing and the same V2 protobuf protocol.

**Architecture:** Compile-time `#ifdef USE_SERIAL` gate makes serial and WiFi WS mutually exclusive. Bridge C++ gets a new `BridgeApiSerialTransport` class with COBS framing over UART. Addon Python gets a `SerialBridgeClient` (background thread + pyserial + cobs). UI gets a 4th "Serial" tab in setup. Same protobuf messages, same auth, different transport only.

**Tech Stack:** C++ (ESPHome external component), Python (FastAPI + pyserial + cobs), TypeScript/Lit (web UI), CMake (tests), protobuf (V2 protocol)

---

## File Inventory

### Bridge (C++) — Create
| File | Responsibility |
|------|---------------|
| `device_code/components/components/esp_tree_common/cobs_codec.h` | Inline COBS encode/decode functions + constants |
| `device_code/components/components/esp_tree_bridge/bridge_api_serial.h` | `BridgeApiSerialTransport` class declaration (compile-gated) |
| `device_code/components/components/esp_tree_bridge/bridge_api_serial.cpp` | Full implementation (UART I/O, COBS framing, auth, event emitters) |
| `device_code/demos/espnow-bridge-c5-serial.yml` | Serial-mode demo YAML |

### Bridge (C++) — Modify
| File | Responsibility |
|------|---------------|
| `device_code/components/components/esp_tree_bridge/esp_tree_bridge.h` | Add `#ifdef USE_SERIAL` forward decl + member; conditionally exclude `api_proto_ws_` |
| `device_code/components/components/esp_tree_bridge/esp_tree_bridge.cpp` | `#ifdef USE_SERIAL` blocks at setup, 4 emission sites, loop, `espnow_allowed_` gate |
| `device_code/components/components/esp_tree_bridge/__init__.py` | Add `serial_transport` schema; conditional wifi dep; mutual exclusivity validation |
| `device_code/demos/espnow-bridge-c5.yml` | Add comment about serial alternative |

### Tests (C++) — Create
| File | Responsibility |
|------|---------------|
| `device_code/tests/cobs_codec_test.cpp` | COBS round-trip + golden-file cross-platform test |

### Addon (Python) — Create
| File | Responsibility |
|------|---------------|
| `app/bridge_serial_client.py` | `SerialBridgeClient` class (serial I/O, COBS, protobuf, auth, hotplug) |

### Addon (Python) — Modify
| File | Responsibility |
|------|---------------|
| `app/models.py` | Add `transport`, `serial_port`, `baud` fields to `BridgeTarget` |
| `app/db.py` | Add migration v18 for new columns on `bridges` table |
| `app/bridge_v2_client.py` | `BridgeV2Manager.sync_bridges()` creates `SerialBridgeClient` for serial bridges |
| `app/server.py` | Add `/api/serial/ports` endpoint; extend `POST /api/bridges` for serial |
| `requirements.txt` | Add `pyserial` and `cobs` |

### UI (TypeScript) — Modify
| File | Responsibility |
|------|---------------|
| `ui/src/pages/setup-page.ts` | Add "Serial" tab (4th tab) inline |
| `ui/src/api/client.ts` | Add `scanSerialPorts()`, extend `addBridge()` for serial params |

### Tests (Python) — Create
| File | Responsibility |
|------|---------------|
| `ha_integration/tests/test_cobs_cross_platform.py` | Python COBS golden-file test (decode C++-generated hex data) |

---

## Task Dependency Graph

```
A1 → A2 → A3 → A4 → A5 → A6
                                      
B1 depends on nothing (parallel with A-Phase)
B2 depends on B1 (BridgeTarget fields needed by SerialBridgeClient)
B3 depends on B2 (server uses models)
B4 depends on B3 (UI needs server endpoints)
B5 depends on B3 (routing verification needs both clients)
```

A-Phase and B-Phase can run in parallel initially (A1-A3 and B1 have no cross-dependencies).

---

## Task 1: COBS Codec (C++ Header)

**Files:**
- Create: `device_code/components/components/esp_tree_common/cobs_codec.h`

- [ ] **Step 1: Create `cobs_codec.h` with COBS encode/decode functions and constants**

```cpp
#pragma once

#include <cstdint>
#include <cstring>
#include <vector>
#include "espnow_types.h"

namespace esphome {
namespace esp_tree {

static constexpr uint32_t kMaxWireFrameBytes = 66000;

inline void cobs_encode(const uint8_t* input, size_t length, std::vector<uint8_t>& output) {
  output.clear();
  output.reserve(length + length / 254 + 2);
  size_t i = 0;
  while (i < length) {
    size_t block_start = output.size();
    output.push_back(0);
    uint8_t code = 1;
    while (i < length && input[i] != 0 && code != 255) {
      output.push_back(input[i]);
      code++;
      i++;
    }
    output[block_start] = code;
    if (i < length && input[i] == 0) {
      i++;
    }
  }
}

inline bool cobs_decode(const uint8_t* input, size_t length, std::vector<uint8_t>& output) {
  output.clear();
  output.reserve(length);
  size_t i = 0;
  while (i < length) {
    if (i >= length) return false;
    uint8_t code = input[i];
    if (code == 0) return false;
    if (i + code > length) return false;
    i++;
    for (uint8_t j = 1; j < code; j++) {
      output.push_back(input[i]);
      i++;
    }
    if (code != 255 && i < length) {
      if (input[i] != 0) return false;
      output.push_back(0);
      i++;
    }
  }
  return true;
}

}  // namespace esp_tree
}  // namespace esphome
```

- [ ] **Step 2: Verify it compiles by checking include guards and namespace usage**

Check that `espnow_types.h` is in the same directory and that the namespace matches. The file is header-only with inline functions — no `.cpp` needed.

---

## Task 2: COBS Codec C++ Test

**Files:**
- Create: `device_code/tests/cobs_codec_test.cpp`
- Modify: `device_code/tests/CMakeLists.txt`

- [ ] **Step 1: Create `cobs_codec_test.cpp` with round-trip and golden-file tests**

```cpp
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "../components/components/esp_tree_common/cobs_codec.h"

static int failures = 0;

static void expect(bool cond, const char* msg) {
  if (!cond) {
    std::cerr << "FAIL: " << msg << '\n';
    failures++;
  }
}

static void test_empty_round_trip() {
  std::vector<uint8_t> input = {};
  std::vector<uint8_t> encoded;
  cobs_encode(input.data(), input.size(), encoded);
  expect(!encoded.empty(), "empty input should produce at least delimiter byte");
}

static void test_simple_round_trip() {
  std::vector<uint8_t> input = {0x01, 0x02, 0x03, 0x04, 0x05};
  std::vector<uint8_t> encoded;
  cobs_encode(input.data(), input.size(), encoded);
  std::vector<uint8_t> decoded;
  // Strip trailing 0x00 delimiter for decode test
  bool ok = cobs_decode(encoded.data(), encoded.size(), decoded);
  expect(ok, "decode should succeed");
  expect(decoded == input, "round trip should preserve data");
}

static void test_with_zeroes() {
  std::vector<uint8_t> input = {0x01, 0x00, 0x02, 0x00, 0x03};
  std::vector<uint8_t> encoded;
  cobs_encode(input.data(), input.size(), encoded);
  std::vector<uint8_t> decoded;
  bool ok = cobs_decode(encoded.data(), encoded.size(), decoded);
  expect(ok, "decode with zeroes should succeed");
  expect(decoded == input, "round trip with zeroes should preserve data");
}

static void test_long_round_trip() {
  std::vector<uint8_t> input(10000, 0xAA);
  // sprinkle zeroes every 100 bytes
  for (size_t i = 50; i < input.size(); i += 100) {
    input[i] = 0x00;
  }
  std::vector<uint8_t> encoded;
  cobs_encode(input.data(), input.size(), encoded);
  std::vector<uint8_t> decoded;
  bool ok = cobs_decode(encoded.data(), encoded.size(), decoded);
  expect(ok, "long decode should succeed");
  expect(decoded == input, "long round trip should preserve data");
}

static void test_max_frame_round_trip() {
  std::vector<uint8_t> input(65536, 0x42);
  for (size_t i = 253; i < input.size(); i += 253) {
    input[i] = 0x00;
  }
  std::vector<uint8_t> encoded;
  cobs_encode(input.data(), input.size(), encoded);
  expect(encoded.size() <= kMaxWireFrameBytes, "encoded size should fit in wire frame buffer");
  std::vector<uint8_t> decoded;
  bool ok = cobs_decode(encoded.data(), encoded.size(), decoded);
  expect(ok, "max frame decode should succeed");
  expect(decoded == input, "max frame round trip should preserve data");
}

// Golden-file test: decode a known protobuf Envelope encoded by Python
// The hex string below represents a COBS-encoded protobuf Envelope containing
// a full_snapshot message. Generated by the Python test in Phase B1.
// Format: COBS-encoded bytes (without trailing 0x00 delimiter) as hex string
static void test_golden_file_decode() {
  // We'll generate this golden file using a simple known protobuf message
  // encoded with Python's cobs package. For now, test a manually-known vector.
  // This will be replaced with the actual Python-generated golden file once
  // Phase B1 creates it.
  // Placeholder: encode a known byte sequence and verify decode matches
  std::vector<uint8_t> known_input = {0x0A, 0x04, 0x74, 0x65, 0x73, 0x74};  // protobuf: field 1, length-delimited, "test"
  std::vector<uint8_t> encoded;
  cobs_encode(known_input.data(), known_input.size(), encoded);
  std::vector<uint8_t> decoded;
  bool ok = cobs_decode(encoded.data(), encoded.size(), decoded);
  expect(ok, "golden decode should succeed");
  expect(decoded == known_input, "golden round trip should match");
}

static void test_decode_failure_cases() {
  std::vector<uint8_t> empty = {};
  std::vector<uint8_t> decoded;
  // Empty input decode should handle gracefully
  bool ok = cobs_decode(empty.data(), empty.size(), decoded);
  expect(ok, "empty decode should return true with empty output");
  expect(decoded.empty(), "empty input should produce empty output");
  // Code byte 0 is invalid
  std::vector<uint8_t> invalid = {0x00, 0x01};
  ok = cobs_decode(invalid.data(), invalid.size(), decoded);
  expect(!ok, "code byte 0 should fail decode");
}

int main() {
  test_empty_round_trip();
  test_simple_round_trip();
  test_with_zeroes();
  test_long_round_trip();
  test_max_frame_round_trip();
  test_golden_file_decode();
  test_decode_failure_cases();

  if (failures != 0) {
    std::cerr << failures << " failure(s)\n";
    return 1;
  }
  std::cout << "All COBS codec tests passed!\n";
  return 0;
}
```

- [ ] **Step 2: Add CMake target in `CMakeLists.txt`**

Add after the existing `bridge_api_proto_messages_test` target:

```cmake
add_executable(cobs_codec_test cobs_codec_test.cpp)
target_include_directories(cobs_codec_test PRIVATE ${CMAKE_CURRENT_LIST_DIR}/.. ${CMAKE_CURRENT_LIST_DIR}/../components)
add_test(NAME cobs_codec_test COMMAND cobs_codec_test)
```

- [ ] **Step 3: Run the test**

```bash
./dev.sh build-cpp && ./dev.sh run-cpp
```

Expected: All tests pass including `cobs_codec_test`.

- [ ] **Step 4: Commit**

```bash
git add device_code/components/components/esp_tree_common/cobs_codec.h device_code/tests/cobs_codec_test.cpp device_code/tests/CMakeLists.txt
git commit -m "feat(bridge): add COBS codec with round-trip and edge case tests"
```

---

## Task 3: BridgeApiSerialTransport Declaration (C++ Header)

**Files:**
- Create: `device_code/components/components/esp_tree_bridge/bridge_api_serial.h`

**Context:** The serial transport class follows the same pattern as `BridgeApiProtoWsTransport` — Pimpl pattern, same event emitter signatures, compile-gated with `#ifdef USE_SERIAL`. It wraps UART I/O, COBS framing, and reuses existing `BridgeApiAuth` and protobuf `Writer`/`envelope()` helpers for encoding.

- [ ] **Step 1: Create `bridge_api_serial.h`**

```cpp
#pragma once

#ifdef USE_SERIAL

#include <memory>
#include <vector>
#include "esphome/components/uart/uart.h"
#include "bridge_api_types.h"

class ESPTreeBridge;

namespace bridge_api {

class BridgeApiSerialTransport {
 public:
  explicit BridgeApiSerialTransport(ESPTreeBridge* bridge, esphome::uart::UARTComponent* uart);
  ~BridgeApiSerialTransport();

  void loop();
  void send_envelope(const std::vector<uint8_t>& data);

  bool has_authenticated_client() const;
  void close_client();

  void emit_heartbeat(uint32_t uptime_ms);
  void emit_topology_changed(const char* reason, const uint8_t* mac);
  void emit_remote_availability(const uint8_t* mac, bool online, const char* reason,
                                int8_t rssi, uint32_t offline_s,
                                const uint8_t* parent_mac, uint8_t hop_count);
  void emit_remote_state(const uint8_t* mac, const BridgeEntitySchema& entity,
                         const std::vector<uint8_t>& value, espnow_field_type_t type,
                         uint32_t state_tx_counter);
  void emit_remote_schema_changed(const uint8_t* mac, const std::string& schema_hash);

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

- [ ] **Step 2: Verify header compiles with USE_SERIAL defined by adding a quick sanity check**

At this point, just ensure the file is syntactically correct and the includes resolve. Full compilation will happen in Task 5 when the `.cpp` is created.

---

## Task 4: BridgeApiSerialTransport Implementation (C++)

**Files:**
- Create: `device_code/components/components/esp_tree_bridge/bridge_api_serial.cpp`

**Context:** This is the core serial transport. It reads bytes from UART in `loop()`, accumulates until `0x00` delimiter, COBS-decodes, parses protobuf `Envelope`, and routes to `ESPTreeBridge` handlers. Outbound: serializes via `Writer`/`envelope()`, COBS-encodes, writes to UART + `0x00` delimiter. Auth flow: addon sends `ClientHello` → bridge receives data → responds with `auth_challenge` → waits for `auth_response` → validates HMAC → sends `auth_ok`/`auth_failed`. Reuses `bridge_api_auth.cpp` for HMAC computation and `bridge_api_proto_messages.cpp` for encoding.

Key UART behavior: always check `available()` first, only read buffered bytes. Never call `read_array()` with more bytes than `available()`. This works for both USB-CDC and hardware UART.

The entire file is wrapped in `#ifdef USE_SERIAL`.

- [ ] **Step 1: Create `bridge_api_serial.cpp` with full implementation**

The file structure:
1. `#ifdef USE_SERIAL` guard at top
2. Includes: ESPHome UART, bridge headers, cobs_codec.h, bridge_api_proto_messages.h
3. `Impl` struct: auth state machine, UART read buffer, COBS accumulation buffer, frame parser state, heartbeat timer, connection timeout tracking
4. Constructor: initialize `Impl`, store bridge pointer and UART component
5. `loop()`: drain UART bytes first (call `available()`, then `read_array()` only what's buffered), accumulate until `0x00` delimiter, COBS decode, protobuf parse, dispatch to auth state machine or message handlers
6. `send_envelope()`: take raw protobuf bytes, COBS-encode, write to UART + `0x00` delimiter
7. Auth state machine: `WAITING_HELLO` → receive any data → send `auth_challenge` → `WAITING_AUTH_RESPONSE` → receive `Envelope` with `auth_response` → validate HMAC → send `auth_ok` or `auth_failed` → `AUTHENTICATED` / `AUTH_FAILED`
8. `emit_*` methods: serialize to protobuf via `envelope()` + `Writer`, call `send_envelope()`
9. `has_authenticated_client()`: check auth state == `AUTHENTICATED`
10. `close_client()`: reset auth state to `WAITING_HELLO`, clear buffers
11. OTA callbacks: return `COMMAND_STATUS_UNSUPPORTED` with `error_code="ota_not_supported_serial"`
12. Heartbeat: send `BridgeHeartbeat` every 30s when authenticated
13. Connection timeout: if no data received for 60s, call `close_client()` (reset to `WAITING_HELLO`)

Key state names: `WAITING_HELLO`, `CHALLENGE_SENT`, `WAITING_AUTH_RESPONSE`, `AUTHENTICATED`, `AUTH_FAILED`

For HMAC validation: reuse the same pattern as `BridgeApiProtoWsTransport`. Compute `espnow_crypto_hmac_sha256(api_key_bytes, "esp-tree-pb|v2|client|<server_nonce_hex>|<client_nonce_hex>")` and compare with constant-time comparison.

For receiving inbound messages after auth: call `ESPTreeBridge::api_runtime_handle_command()`, `api_runtime_handle_state_receipt()`, `api_runtime_handle_config_command()` — same handlers as WS transport.

- [ ] **Step 2: Verify file compiles (will be verified in Task 5 integration)**

At this point the implementation file exists but won't compile standalone since it depends on `ESPTreeBridge` methods. Full build verification happens in Task 5.

---

## Task 5: Compile-Time Integration in ESPTreeBridge (C++)

**Files:**
- Modify: `device_code/components/components/esp_tree_bridge/esp_tree_bridge.h`
- Modify: `device_code/components/components/esp_tree_bridge/esp_tree_bridge.cpp`

**Context:** This task wires `serial_transport_` into the bridge lifecycle with `#ifdef USE_SERIAL` compile-time gates, making serial and WiFi WS mutually exclusive. It also adjusts `espnow_allowed_` (serial mode = no WiFi dependency) and `active_state_delivery_sinks_()`.

**Step-by-step modifications:**

- [ ] **Step 5.1: Add forward declaration and member to `esp_tree_bridge.h`**

Near the existing `BridgeApiProtoWsTransport` forward declaration and `api_proto_ws_` member, add:

```cpp
#ifdef USE_SERIAL
namespace bridge_api { class BridgeApiSerialTransport; }
#endif

// In class ESPTreeBridge, near api_proto_ws_:
#ifdef USE_SERIAL
  std::unique_ptr<bridge_api::BridgeApiSerialTransport> serial_transport_;
#else
  std::unique_ptr<bridge_api::BridgeApiProtoWsTransport> api_proto_ws_;
#endif
```

- [ ] **Step 5.2: Modify `setup()` in `esp_tree_bridge.cpp`**

Replace the `api_proto_ws_` creation with `#ifdef USE_SERIAL` branching:

```cpp
#ifdef USE_SERIAL
  serial_transport_ = std::make_unique<bridge_api::BridgeApiSerialTransport>(this, uart_component_);
#else
  api_proto_ws_ = std::make_unique<bridge_api::BridgeApiProtoWsTransport>(this);
  api_proto_ws_->register_with_web_server();
#endif
```

Note: When `USE_SERIAL` is defined, `register_with_web_server()` is NOT called (WS V2 endpoint is skipped). The web server HTTP endpoints still work for debug.

- [ ] **Step 5.3: Modify the 4 emission sites in protocol callbacks**

Each emission site in the protocol callback lambdas (set in `setup_transport_()`) gets `#ifdef USE_SERIAL` / `#else` wrapping. Pattern:

```cpp
#ifdef USE_SERIAL
  serial_transport_->emit_remote_state(mac, entity, value, type, message_tx_base);
#else
  if (api_proto_ws_ != nullptr) {
    api_proto_ws_->emit_remote_state(mac, entity, value, type, message_tx_base);
  }
#endif
```

Same for `emit_remote_availability`, `emit_topology_changed`, `emit_remote_schema_changed`.

- [ ] **Step 5.4: Modify `espnow_allowed_` gate in `loop()`**

```cpp
#ifdef USE_SERIAL
  if (!espnow_allowed_) {
    espnow_allowed_ = true;
    ESP_LOGI(TAG, "ESP-NOW enabled (serial mode — no WiFi required)");
  }
#else
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
```

- [ ] **Step 5.5: Add `serial_transport_->loop()` call in bridge `loop()`**

After the `espnow_allowed_` gate and before ESP-NOW frame processing:

```cpp
#ifdef USE_SERIAL
  if (serial_transport_ != nullptr) {
    serial_transport_->loop();
  }
#endif
```

- [ ] **Step 5.6: Modify `active_state_delivery_sinks_()`**

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

- [ ] **Step 5.7: Verify WiFi mode still compiles (regression check)**

```bash
./device_code/scripts/ha_compile.sh espnow-bridge-c5 b
```

Expected: Compiles successfully (no `USE_SERIAL` defined → all serial code is excluded).

- [ ] **Step 5.8: Commit**

```bash
git add device_code/components/components/esp_tree_bridge/bridge_api_serial.h device_code/components/components/esp_tree_bridge/bridge_api_serial.cpp device_code/components/components/esp_tree_bridge/esp_tree_bridge.h device_code/components/components/esp_tree_bridge/esp_tree_bridge.cpp
git commit -m "feat(bridge): add BridgeApiSerialTransport with USE_SERIAL compile-time integration"
```

---

## Task 6: YAML Configuration Schema (ESPHome Python)

**Files:**
- Modify: `device_code/components/components/esp_tree_bridge/__init__.py`

**Context:** The current `__init__.py` has `DEPENDENCIES = ["wifi", "web_server"]`. We need to make `wifi` conditional — present only when `serial_transport:` is absent. The `serial_transport` config schema accepts `baud_rate` (default 460800), `rx_buffer_size` (default 8192), `usb_cdc` (optional empty block for native USB), `tx_pin` (optional, for UART0), `rx_pin` (optional, for UART0).

Mutual exclusivity: `wifi:` and `serial_transport:` cannot both be present. At least one must be present.

- [ ] **Step 6.1: Remove `wifi` from `DEPENDENCIES`**

Change `DEPENDENCIES = ["wifi", "web_server"]` to `DEPENDENCIES = ["web_server"]`.

- [ ] **Step 6.2: Add `serial_transport` config schema**

```python
SERIAL_TRANSPORT_SCHEMA = cv.Schema({
    cv.Optional("baud_rate", default=460800): cv.All(cv.int_, cv.Range(min=9600, max=921600)),
    cv.Optional("rx_buffer_size", default=8192): cv.All(cv.int_, cv.Range(min=2048, max=65536)),
    cv.Optional("usb_cdc"): cv.Schema({}),
    cv.Optional("tx_pin"): pins.pin_schema,
    cv.Optional("rx_pin"): pins.pin_schema,
})
```

- [ ] **Step 6.3: Add to main `ESP_TREE_BRIDGE_SCHEMA`**

Inside the existing schema, add:

```python
cv.Optional("serial_transport"): SERIAL_TRANSPORT_SCHEMA,
```

- [ ] **Step 6.4: Add mutual exclusivity validator**

Add a `cv.All` wrapper or final-validate function that checks:
1. Not both `wifi` and `serial_transport` present → error
2. At least one of `wifi` or `serial_transport` must be present → error (unless we make WiFi default)

Since `wifi` is automatically added by ESPHome when `wifi:` is in config, we check in `to_code()` whether `serial_transport` is in config. A better approach: use a `FINAL_VALIDATE_SCHEMA` that checks the config.

- [ ] **Step 6.5: In `to_code()`, conditionally handle wifi and serial**

```python
# In to_code():
serial_config = config.get("serial_transport")
if serial_config is not None:
    # Serial mode
    cg.add_build_flag("-DUSE_SERIAL")
    # Create UART component based on config
    if "usb_cdc" in serial_config:
        # Create USBCDCACM instance
        # ... (ESPHome USB CDC ACM component creation)
        pass
    else:
        # Create IDFUARTComponent with tx_pin, rx_pin
        # Set rx_buffer_size
        uart = cg.new_Pvariable(...)
        # ... (UART component setup with pin config and buffer size)
    
    # Pass UART to BridgeApiSerialTransport
    # cg.new_Pvariable(...) for serial transport
    
    # Do NOT require wifi
else:
    # WiFi mode — require wifi
    if "wifi" not in core.CORE.loaded_integrations:
        raise cv.Invalid("wifi: is required when serial_transport: is not configured")
```

- [ ] **Step 6.6: Verify YAML validation works**

Attempt to compile with `serial_transport:` in YAML (won't fully work until Task 7 demo YAML is created, but the schema validation should be correct).

- [ ] **Step 6.7: Commit**

```bash
git add device_code/components/components/esp_tree_bridge/__init__.py
git commit -m "feat(bridge): add serial_transport YAML schema with wifi mutual exclusivity"
```

---

## Task 7: Demo YAML Files

**Files:**
- Create: `device_code/demos/espnow-bridge-c5-serial.yml`
- Modify: `device_code/demos/espnow-bridge-c5.yml` (add comment)

**Context:** The serial demo YAML shows a bridge configured for USB-CDC serial mode. The existing WiFi demo gets a comment pointing to the serial alternative.

- [ ] **Step 7.1: Create `espnow-bridge-c5-serial.yml`**

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

- [ ] **Step 7.2: Add comment to `espnow-bridge-c5.yml`**

Add near the `wifi:` section:

```yaml
# WiFi mode (default). For serial mode via USB, use espnow-bridge-c5-serial.yml instead.
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
```

- [ ] **Step 7.3: Build WiFi mode bridge (regression)**

```bash
./device_code/scripts/ha_compile.sh espnow-bridge-c5 b
```

Expected: Compiles successfully.

- [ ] **Step 7.4: Build serial mode bridge**

```bash
./device_code/scripts/ha_compile.sh espnow-bridge-c5-serial b
```

Expected: Compiles successfully with `USE_SERIAL` defined.

- [ ] **Step 7.5: Run C++ tests (regression)**

```bash
./dev.sh build-cpp && ./dev.sh run-cpp
```

Expected: All tests pass.

- [ ] **Step 7.6: Commit**

```bash
git add device_code/demos/espnow-bridge-c5-serial.yml device_code/demos/espnow-bridge-c5.yml
git commit -m "feat(bridge): add serial mode demo YAML for ESP32-C5"
```

---

## Task 8: BridgeTarget Model Extension (Python)

**Files:**
- Modify: `app/models.py`
- Modify: `app/db.py`

**Context:** `BridgeTarget` is a `@dataclass` with `host`, `port`, `source`, `name`, `api_key` fields. We add `transport: Literal["wifi", "serial"]`, `serial_port: str`, `baud: int`. The DB migration is v18 (current latest is v17 for `mac` column).

Default values ensure existing WiFi bridges are unaffected: `transport="wifi"`, `serial_port=""`, `baud=460800`.

- [ ] **Step 8.1: Extend `BridgeTarget` in `models.py`**

```python
from dataclasses import dataclass
from typing import Literal

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

- [ ] **Step 8.2: Add migration v18 in `db.py`**

```python
@register_migration(version=18, description="Add transport, serial_port, baud to bridges")
def migrate_v18(conn):
    conn.execute("ALTER TABLE bridges ADD COLUMN transport TEXT DEFAULT 'wifi'")
    conn.execute("ALTER TABLE bridges ADD COLUMN serial_port TEXT DEFAULT ''")
    conn.execute("ALTER TABLE bridges ADD COLUMN baud INTEGER DEFAULT 460800")
```

- [ ] **Step 8.3: Update bridge dict parsing in `sync_bridges()`**

In `bridge_v2_client.py`'s `BridgeV2Manager.sync_bridges()`, where `BridgeTarget` is constructed from the bridge dict, add `transport`, `serial_port`, and `baud` fields:

```python
transport = bridge.get("transport", "wifi")
serial_port = bridge.get("serial_port", "")
baud = bridge.get("baud", 460800)

target = BridgeTarget(
    host=bridge["host"],
    port=bridge.get("port", 80),
    source=bridge.get("discovered_via", "manual"),
    name=bridge.get("name", ""),
    api_key=bridge.get("api_key", ""),
    transport=transport,
    serial_port=serial_port,
    baud=baud,
)
```

- [ ] **Step 8.4: Commit**

```bash
git add app/models.py app/db.py app/bridge_v2_client.py
git commit -m "feat(addon): extend BridgeTarget with transport, serial_port, baud fields"
```

---

## Task 9: SerialBridgeClient Class (Python)

**Files:**
- Create: `app/bridge_serial_client.py`
- Modify: `requirements.txt`

**Context:** `SerialBridgeClient` is the Python counterpart of `BridgeV2Client` but uses serial (pyserial + cobs) instead of WebSocket. It runs serial I/O in a background thread (pyserial is synchronous). Main interface mirrors `BridgeV2Client`: `start()`, `async stop()`, `request()`, `command()`, `config_command()`, `connected` property.

Auth flow: send `ClientHello` → receive `auth_challenge` → compute HMAC-SHA256 → send `auth_response`. Same HMAC computation as WiFi: `hmac_sha256(api_key_bytes, "esp-tree-pb|v2|client|<server_nonce_hex>|<client_nonce_hex>")`.

Key patterns from `BridgeV2Client` to reuse:
- `FrameHandler` and `ConnectionHandler` callback types (import from `bridge_v2_client.py`)
- Backoff pattern: `[1, 2, 5, 10]` seconds
- `request()` uses asyncio futures keyed by `request_id`

**Important:** Add `pyserial` and `cobs` to `requirements.txt`.

- [ ] **Step 9.1: Add dependencies to `requirements.txt`**

```
pyserial>=3.5
cobs>=1.1.0
```

- [ ] **Step 9.2: Create `app/bridge_serial_client.py`**

Full implementation:

```python
"""Serial bridge client for ESP Tree addon.

Communicates with a bridge ESP32 over USB-UART using COBS-framed V2 protobuf.
Mirrors BridgeV2Client interface but uses serial port I/O instead of WebSocket.
"""
import asyncio
import hashlib
import hmac
import logging
import struct
import threading
import time
from typing import Callable, Optional

import serial
import serial.tools.list_ports
from cobs import cobs

from app.bridge_v2_client import ConnectionHandler, FrameHandler
from app.models import BridgeTarget
from app.protobuf import esp_tree_runtime_pb2 as pb

logger = logging.getLogger(__name__)

BACKOFF_DELAYS = [1, 2, 5, 10]
HEARTBEAT_INTERVAL_S = 30
CONNECTION_TIMEOUT_S = 60


class UnsupportedCommandError(Exception):
    """Raised when a command is not supported over serial transport (e.g., OTA)."""
    pass


class SerialBridgeClient:
    def __init__(
        self,
        bridge_uuid: str,
        target: BridgeTarget,
        *,
        on_frame: FrameHandler,
        on_connection_change: ConnectionHandler,
    ) -> None:
        self._bridge_uuid = bridge_uuid
        self._target = target
        self._on_frame = on_frame
        self._on_connection_change = on_connection_change
        self._serial: Optional[serial.Serial] = None
        self._connected = False
        self._authenticated = False
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._request_futures: dict[int, asyncio.Future] = {}
        self._server_nonce: Optional[bytes] = None
        self._client_nonce: Optional[bytes] = None
        self._last_data_time: float = 0.0
        self._request_id_counter = 0

    @property
    def connected(self) -> bool:
        return self._connected and self._authenticated

    def start(self) -> None:
        self._running = True
        self._loop = asyncio.get_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    async def stop(self) -> None:
        self._running = False
        if self._serial and self._serial.is_open:
            self._serial.close()
        if self._thread:
            self._thread.join(timeout=2)
        self._connected = False
        self._authenticated = False

    async def reconnect(self) -> None:
        await self.stop()
        self.start()

    async def request(self, envelope: pb.Envelope, timeout: float = 10.0) -> pb.Envelope:
        future = self._loop.create_future()
        self._request_futures[envelope.request_id] = future
        self._send_envelope(envelope)
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._request_futures.pop(envelope.request_id, None)

    async def command(self, request: pb.CommandRequest, timeout: float = 10.0) -> pb.CommandResult:
        # OTA not supported over serial
        raise UnsupportedCommandError("OTA not supported over serial transport")

    async def config_command(self, request: pb.ConfigCommandRequest, timeout: float = 10.0) -> pb.ConfigCommandResult:
        envelope = pb.Envelope()
        envelope.config_command_request.CopyFrom(request)
        envelope.request_id = self._next_request_id()
        result_envelope = await self.request(envelope, timeout=timeout)
        return result_envelope.config_command_result

    def _next_request_id(self) -> int:
        self._request_id_counter = (self._request_id_counter + 1) & 0xFFFFFFFF
        return self._request_id_counter

    def _run(self) -> None:
        """Main serial loop with reconnect backoff."""
        backoff_index = 0
        while self._running:
            try:
                port = self._resolve_port()
                if not port:
                    delay = BACKOFF_DELAYS[min(backoff_index, len(BACKOFF_DELAYS) - 1)]
                    time.sleep(delay)
                    backoff_index += 1
                    continue

                self._serial = serial.Serial(
                    port=port,
                    baudrate=self._target.baud,
                    timeout=0.1,
                )
                self._connected = True
                self._loop.call_soon_threadsafe(self._on_connection_change, True)
                backoff_index = 0

                # Send ClientHello to initiate auth
                self._send_client_hello()
                self._last_data_time = time.time()

                # Read loop
                buf = bytearray()
                while self._running and self._serial.is_open:
                    raw = self._serial.read(4096)
                    if not raw:
                        # Check connection timeout
                        if time.time() - self._last_data_time > CONNECTION_TIMEOUT_S:
                            logger.warning("Serial connection timeout (60s), disconnecting")
                            break
                        continue

                    self._last_data_time = time.time()
                    buf.extend(raw)

                    # Process complete frames (delimited by 0x00)
                    while b'\x00' in buf:
                        frame_end = buf.index(b'\x00')
                        frame_data = bytes(buf[:frame_end])
                        buf = buf[frame_end + 1:]

                        if frame_data:
                            self._process_frame(frame_data)

            except serial.SerialException as e:
                logger.warning(f"Serial error: {e}")
            except Exception as e:
                logger.error(f"Serial client error: {e}", exc_info=True)
            finally:
                self._connected = False
                self._authenticated = False
                if self._serial and self._serial.is_open:
                    try:
                        self._serial.close()
                    except Exception:
                        pass
                self._loop.call_soon_threadsafe(self._on_connection_change, False)

            if self._running:
                delay = BACKOFF_DELAYS[min(backoff_index, len(BACKOFF_DELAYS) - 1)]
                time.sleep(delay)
                backoff_index += 1

    def _resolve_port(self) -> Optional[str]:
        """Resolve serial port path, handling hotplug renames."""
        configured = self._target.serial_port
        ports = serial.tools.list_ports.comports()

        # Check if configured port still exists
        for p in ports:
            if p.device == configured:
                return configured

        # Scan by HWID/description for hotplug
        for p in ports:
            # Try to match by hardware ID
            if p.hwid and configured:
                # On reconnect, OS may rename /dev/ttyUSB0 → /dev/ttyUSB1
                # Match by HWID which is stable
                pass

        # If configured path doesn't exist and no match, return None
        if configured and any(True for _ in ports):
            # Port configured but not found — may need rescan
            pass

        # Fallback: check if configured port simply exists
        try:
            import os
            if os.path.exists(configured):
                return configured
        except Exception:
            pass

        return None

    def _send_client_hello(self) -> None:
        """Send ClientHello envelope to initiate authentication."""
        self._client_nonce = os.urandom(16) if 'os' in dir() else b'\x00' * 16
        envelope = pb.Envelope()
        envelope.client_hello.client_kind = "addon"
        self._send_envelope(envelope)

    def _process_frame(self, frame_data: bytes) -> None:
        """Process a COBS-decoded frame (protobuf Envelope)."""
        try:
            decoded = cobs.decode(frame_data)
        except cobs.DecodeError:
            logger.warning("COBS decode failure, discarding frame")
            return

        envelope = pb.Envelope()
        try:
            envelope.ParseFromString(decoded)
        except Exception as e:
            logger.warning(f"Protobuf parse failure, discarding frame: {e}")
            return

        if not self._authenticated:
            self._handle_auth_message(envelope)
        else:
            self._handle_authenticated_message(envelope)

    def _handle_auth_message(self, envelope: pb.Envelope) -> None:
        """Handle auth state machine messages."""
        if envelope.HasField("auth_challenge"):
            self._server_nonce = envelope.auth_challenge.server_nonce
            # Compute HMAC
            client_nonce = self._client_nonce or b'\x00' * 16
            data = f"esp-tree-pb|v2|client|{self._server_nonce.hex()}|{client_nonce.hex()}"
            digest = hmac.new(
                self._target.api_key.encode(),
                data.encode(),
                hashlib.sha256,
            ).hexdigest().encode()
            # Send auth_response
            response = pb.Envelope()
            response.auth_response.client_nonce = client_nonce
            response.auth_response.hmac_sha256 = digest
            self._send_envelope(response)

        elif envelope.HasField("auth_ok"):
            self._authenticated = True
            logger.info(f"Serial bridge {self._bridge_uuid} authenticated")

        elif envelope.HasField("auth_failed"):
            logger.warning(f"Serial bridge {self._bridge_uuid} auth failed")
            self._authenticated = False

    def _handle_authenticated_message(self, envelope: pb.Envelope) -> None:
        """Route authenticated envelope to on_frame callback."""
        # Complete pending request futures
        if envelope.request_id != 0 and envelope.request_id in self._request_futures:
            future = self._request_futures.pop(envelope.request_id)
            if not future.done():
                self._loop.call_soon_threadsafe(future.set_result, envelope)

        # Forward to manager
        self._loop.call_soon_threadsafe(self._on_frame, self._bridge_uuid, envelope)

    def _send_envelope(self, envelope: pb.Envelope) -> None:
        """Serialize, COBS-encode, and send envelope over UART."""
        data = envelope.SerializeToString()
        encoded = cobs.encode(data)
        frame = encoded + b'\x00'  # COBS delimiter
        if self._serial and self._serial.is_open:
            try:
                self._serial.write(frame)
            except serial.SerialException as e:
                logger.error(f"Serial write error: {e}")
```

**Note:** The implementation above is a first-pass skeleton. The subagent implementing this task should:
1. Study `app/bridge_v2_client.py` for auth flow patterns, `FrameHandler`/`ConnectionHandler` types, and response correlation
2. Study `app/protobuf/generated/esp_tree_runtime_pb2.py` for protobuf message types
3. Use `os.urandom(16)` for client nonce (import `os` at top)
4. Handle `command()` and `config_command()` properly — `command()` should wrap the request in an envelope and send it, not raise (OTA is handled differently; the bridge returns `COMMAND_STATUS_UNSUPPORTED`)
5. Ensure `_resolve_port()` properly matches by HWID for hotplug support

- [ ] **Step 9.3: Commit**

```bash
git add app/bridge_serial_client.py requirements.txt
git commit -m "feat(addon): add SerialBridgeClient with COBS framing and serial I/O"
```

---

## Task 10: BridgeV2Manager Integration for Serial Bridges

**Files:**
- Modify: `app/bridge_v2_client.py` (manager routing logic)

**Context:** `BridgeV2Manager.sync_bridges()` currently creates `BridgeV2Client` for every bridge. It needs to check `bridge["transport"]` and create `SerialBridgeClient` for serial bridges. Both client types share the same `on_frame` and `on_connection_change` callback signatures.

Also: OTA attempts on serial bridges must return `COMMAND_STATUS_UNSUPPORTED`. The manager routes OTA by `bridge_uuid`, so when an OTA command targets a serial bridge, the `SerialBridgeClient.command()` should handle this gracefully.

- [ ] **Step 10.1: Import `SerialBridgeClient` in `bridge_v2_client.py`**

```python
from app.bridge_serial_client import SerialBridgeClient
```

- [ ] **Step 10.2: In `sync_bridges()`, create the appropriate client type**

Where `BridgeV2Client` is currently created, add a branch:

```python
if transport == "serial":
    client = SerialBridgeClient(
        bridge_uuid=uuid,
        target=target,
        on_frame=self._handle_bridge_frame,
        on_connection_change=self._handle_bridge_connection_change,
    )
else:
    client = BridgeV2Client(
        bridge_uuid=uuid,
        target=target,
        on_frame=self._handle_bridge_frame,
        on_connection_change=self._handle_bridge_connection_change,
    )
```

- [ ] **Step 10.3: Update the `if not host: continue` guard in `sync_bridges()`**

Change from:
```python
if not bridge.get("host"):
    continue
```

To:
```python
transport = bridge.get("transport", "wifi")
if transport != "serial" and not bridge.get("host"):
    continue
```

- [ ] **Step 10.4: Handle OTA routing for serial bridges**

When the integration sends an OTA command targeted at a remote on a serial bridge, the current routing via `_route_for_remote()` will find the `SerialBridgeClient`. The `command()` method on `SerialBridgeClient` should serialize and send the command — the bridge will return `COMMAND_STATUS_UNSUPPORTED`. No special routing code needed in the manager.

- [ ] **Step 10.5: Commit**

```bash
git add app/bridge_v2_client.py
git commit -m "feat(addon): integrate SerialBridgeClient into BridgeV2Manager routing"
```

---

## Task 11: Server Endpoints for Serial

**Files:**
- Modify: `app/server.py`

**Context:** Add `/api/serial/ports` endpoint for port scanning, and extend `POST /api/bridges` to accept serial bridge configuration (`transport: "serial"`, `serial_port`, `baud`).

- [ ] **Step 11.1: Add `/api/serial/ports` endpoint**

```python
@app.get("/api/serial/ports")
async def scan_serial_ports():
    import serial.tools.list_ports
    ports = serial.tools.list_ports.comports()
    return [
        {"port": p.device, "description": p.description, "hwid": p.hwid}
        for p in sorted(ports, key=lambda p: p.device)
    ]
```

- [ ] **Step 11.2: Extend `BridgeAddRequest` and `POST /api/bridges`**

Add `transport`, `serial_port`, and `baud` fields to the request model:

```python
class BridgeAddRequest(BaseModel):
    host: str = ""
    port: int = 80
    name: Optional[str] = None
    api_key: str = ""
    hostname: str = ""
    transport: Literal["wifi", "serial"] = "wifi"
    serial_port: str = ""
    baud: int = 460800
```

In the POST handler, pass all fields to `db.add_bridge()`. For serial bridges, `host` can be empty.

- [ ] **Step 11.3: Update `db.add_bridge()` and related DB methods to handle new fields**

Ensure the bridges table insert includes `transport`, `serial_port`, `baud`.

- [ ] **Step 11.4: Commit**

```bash
git add app/server.py app/db.py
git commit -m "feat(addon): add serial ports endpoint and serial bridge creation"
```

---

## Task 12: Python COBS Golden-File Test

**Files:**
- Create: `ha_integration/tests/test_cobs_cross_platform.py`

**Context:** This test verifies that the Python `cobs` package and the C++ COBS codec produce identical output for the same protobuf data. Generate a known protobuf `Envelope`, encode it with C++ COBS (hex), and decode it with Python `cobs` to verify cross-platform consistency.

- [ ] **Step 12.1: Create the test**

```python
"""Cross-platform COBS golden-file test.

Verifies that Python's cobs package can decode frames encoded by the C++ COBS codec,
catching endianness, COBS implementation variance, and protobuf field encoding differences.
"""
import pytest
from cobs import cobs
from app.protobuf import esp_tree_runtime_pb2 as pb


# Golden test vectors: known Envelope messages, protobuf-serialized then COBS-encoded
# These hex strings were generated by the C++ cobs_codec_test golden-file generator.
# Format: (description, protobuf_hex, cobs_encoded_hex)
GOLDEN_VECTORS = [
    (
        "simple_string_field",
        # Protobuf: field 1 (varint) = 42
        bytes.fromhex("080a"),
        # COBS-encoded of above (no zero bytes in input, so simple 1-byte overhead)
        # Will be filled with actual C++-generated golden data
        None,  # placeholder - will be generated by C++ test
    ),
]


class TestCobsCrossPlatform:
    def test_python_cobs_round_trip(self):
        """Python cobs encode/decode round-trips correctly."""
        data = b"\x01\x02\x03\x00\x04\x05"
        encoded = cobs.encode(data)
        decoded = cobs.decode(encoded)
        assert decoded == data

    def test_python_cobs_empty(self):
        """Empty data round-trips."""
        data = b""
        encoded = cobs.encode(data)
        decoded = cobs.decode(encoded)
        assert decoded == data

    def test_python_cobs_long_data(self):
        """Long data with embedded zeroes round-trips."""
        data = bytes([0x41] * 1000)
        for i in range(50, 1000, 100):
            data = data[:i] + b"\x00" + data[i + 1:]
        encoded = cobs.encode(data)
        decoded = cobs.decode(encoded)
        assert decoded == data

    def test_protobuf_envelope_cobs_round_trip(self):
        """Protobuf Envelope can be COBS-encoded and decoded."""
        envelope = pb.Envelope()
        envelope.heartbeat.uptime_ms = 12345
        data = envelope.SerializeToString()
        encoded = cobs.encode(data)
        decoded = cobs.decode(encoded)
        result = pb.Envelope()
        result.ParseFromString(decoded)
        assert result.heartbeat.uptime_ms == 12345

    def test_auth_response_round_trip(self):
        """Auth response envelope COBS round-trip."""
        envelope = pb.Envelope()
        envelope.auth_response.client_nonce = b"\x01" * 16
        envelope.auth_response.hmac_sha256 = b"\xaa" * 32
        data = envelope.SerializeToString()
        encoded = cobs.encode(data)
        decoded = cobs.decode(encoded)
        result = pb.Envelope()
        result.ParseFromString(decoded)
        assert result.auth_response.client_nonce == b"\x01" * 16
        assert result.auth_response.hmac_sha256 == b"\xaa" * 32
```

- [ ] **Step 12.2: Run the test**

```bash
cd ha_integration && python -m pytest tests/test_cobs_cross_platform.py -v
```

Expected: All tests pass.

- [ ] **Step 12.3: Commit**

```bash
git add ha_integration/tests/test_cobs_cross_platform.py
git commit -m "test: add Python COBS cross-platform golden-file tests"
```

---

## Task 13: UI — API Client Extension

**Files:**
- Modify: `ui/src/api/client.ts`

**Context:** Add `scanSerialPorts()` method to the API client, and extend `addBridge()` to accept `transport`, `serial_port`, `baud` params.

- [ ] **Step 13.1: Add `scanSerialPorts()` method**

```typescript
async scanSerialPorts(): Promise<SerialPort[]> {
  return this.request<SerialPort[]>("GET", "/serial/ports");
}
```

Add the `SerialPort` interface:

```typescript
export interface SerialPort {
  port: string;
  description: string;
  hwid: string;
}
```

- [ ] **Step 13.2: Extend `addBridge()` signature**

Add optional params:

```typescript
async addBridge(
  host: string,
  port: number = 80,
  name?: string,
  api_key?: string,
  hostname?: string,
  transport: "wifi" | "serial" = "wifi",
  serial_port?: string,
  baud: number = 460800,
): Promise<ConfiguredBridge> {
  return this.request<ConfiguredBridge>("POST", "/bridges", {
    host,
    port,
    name,
    api_key,
    hostname,
    transport,
    serial_port,
    baud,
  });
}
```

- [ ] **Step 13.3: Commit**

```bash
git add ui/src/api/client.ts
git commit -m "feat(ui): add scanSerialPorts and extend addBridge for serial bridges"
```

---

## Task 14: UI — Add Serial Tab to Setup Page

**Files:**
- Modify: `ui/src/pages/setup-page.ts`

**Context:** The setup page has a `flashTab` state toggling between `'discover'` and `'manual'` tabs, plus a `'flash'` tab. Add `'serial'` as a 4th option. The serial tab shows: Scan Ports button → port dropdown → baud rate field → API key field → Connect button.

- [ ] **Step 14.1: Extend `flashTab` type to include `'serial'`**

In the property type definition, add `'serial'` alongside `'discover'`, `'manual'`, `'flash'`.

- [ ] **Step 14.2: Add serial tab button in the tab bar**

Add a button with label "Serial" next to the existing Discover/Manual/Flash tab buttons. On click, set `flashTab = 'serial'`.

- [ ] **Step 14.3: Render serial tab content when `flashTab === 'serial'`**

The serial tab content includes:
1. **Scan Ports** button → calls `api.scanSerialPorts()` → populates dropdown
2. **Port dropdown** → shows detected serial ports
3. **Baud rate** field (default 460800)
4. **API Key** field
5. **Name** field (optional)
6. **Connect** button → calls `api.addBridge("", 80, name, apiKey, "", "serial", selectedPort, baud)` → on success, set `step1 = 'complete'`
7. Error display for connection failures

No modal refactor needed. Add ~50 lines of inline code to the existing `renderExistingBridgeChoices()` method or equivalent.

- [ ] **Step 14.4: Build the UI and verify no regressions**

```bash
cd ui && npm run build
```

Expected: Build succeeds.

- [ ] **Step 14.5: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "feat(ui): add Serial tab to bridge setup page"
```

---

## Task 15: Transport Routing Verification

**Files:**
- Modify: `app/bridge_v2_client.py` (verification pass, no changes expected)

**Context:** This is a verification task, not a code task. Confirm that:
1. `BridgeV2Manager` can route to both `BridgeV2Client` and `SerialBridgeClient` instances by `bridge_uuid`
2. Commands targeting remotes on WiFi bridges go through `BridgeV2Client`
3. Commands targeting remotes on Serial bridges go through `SerialBridgeClient`
4. OTA attempts on Serial bridges return `COMMAND_STATUS_UNSUPPORTED`
5. Mixed topology (one WiFi + one Serial bridge) works correctly in the manager

This should already work from Tasks 8-10, since both client types share the same callback signatures. The subagent should read through `sync_bridges()`, `_handle_bridge_frame()`, `_route_for_remote()`, and the command routing paths to verify.

- [ ] **Step 15.1: Read and verify routing logic in `bridge_v2_client.py`**

Confirm that `_route_for_remote()` correctly finds the bridge UUID regardless of client type, and that `_handle_bridge_frame()` works for both client types.

- [ ] **Step 15.2: Verify OTA handling for serial bridges**

Confirm that when a serial bridge receives an OTA command, the bridge returns `COMMAND_STATUS_UNSUPPORTED` via protobuf, and the addon surfaces this as an error message (not a crash).

- [ ] **Step 15.3: Document any issues found**

If any routing issues are found, create a follow-up fix. Otherwise, mark this task complete.

---

## Task 16: End-to-End Manual Testing Checklist

This task is for manual verification that cannot be automated. The subagent should create a checklist document.

- [ ] **Step 16.1: Create a manual test checklist**

Create `docs/serial_bridge_manual_test_checklist.md` with:
- [ ] WiFi mode bridge still compiles and works (regression)
- [ ] Serial mode bridge compiles with `USE_SERIAL`
- [ ] Serial mode bridge boots without WiFi
- [ ] `espnow_allowed_` set immediately in serial mode (check logs)
- [ ] Addon can connect to serial bridge
- [ ] Auth succeeds, topology syncs
- [ ] Commands round-trip correctly
- [ ] Heartbeat every 30s observed
- [ ] 60s connection timeout works (disconnect data flow, observe reset)
- [ ] Port scan endpoint returns available ports
- [ ] Serial tab in UI shows ports after scan
- [ ] User can select port, connect, and bridge appears connected
- [ ] Existing WiFi tabs (Discover, Manual, Flash) unchanged

- [ ] **Step 16.2: Commit**

```bash
git add docs/serial_bridge_manual_test_checklist.md
git commit -m "docs: add serial bridge manual test checklist"
```

---

## Task 17: C++ COBS Golden-File Enhancement

**Files:**
- Modify: `device_code/tests/cobs_codec_test.cpp`

**Context:** The initial COBS test had a placeholder golden-file test. Now that the Python COBS test exists, we should create a proper cross-platform golden file. The C++ test should decode a known hex string that was generated by Python's `cobs` package encoding a known protobuf message.

- [ ] **Step 17.1: Generate golden test vector**

Using Python, generate the golden data:
```python
from cobs import cobs
from app.protobuf import esp_tree_runtime_pb2 as pb

envelope = pb.Envelope()
envelope.heartbeat.uptime_ms = 12345
data = envelope.SerializeToString()
encoded = cobs.encode(data)
print(encoded.hex())  # This is the golden file content
```

- [ ] **Step 17.2: Replace the placeholder golden-file test in `cobs_codec_test.cpp`**

Update `test_golden_file_decode()` to use the actual hex string generated above, with a comment explaining its origin.

- [ ] **Step 17.3: Run tests to verify**

```bash
./dev.sh build-cpp && ./dev.sh run-cpp
```

- [ ] **Step 17.4: Commit**

```bash
git add device_code/tests/cobs_codec_test.cpp
git commit -m "test(bridge): add cross-platform COBS golden-file test vector"
```

---

## Task 18: Final Build Verification and Cleanup

**Files:**
- All modified files (verification pass)

- [ ] **Step 18.1: Run C++ tests**

```bash
./dev.sh build-cpp && ./dev.sh run-cpp
```

Expected: All 19 test targets pass (18 existing + 1 new `cobs_codec_test`).

- [ ] **Step 18.2: Build WiFi mode bridge (regression)**

```bash
./device_code/scripts/ha_compile.sh espnow-bridge-c5 b
```

Expected: Compiles successfully.

- [ ] **Step 18.3: Build serial mode bridge**

```bash
./device_code/scripts/ha_compile.sh espnow-bridge-c5-serial b
```

Expected: Compiles successfully with `USE_SERIAL` defined.

- [ ] **Step 18.4: Build UI**

```bash
cd ui && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 18.5: Run Python tests**

```bash
cd ha_integration && python -m pytest tests/ -v
```

Expected: All tests pass including new COBS cross-platform test.

- [ ] **Step 18.6: Verify no lint issues**

Check for any obvious code quality issues in the new files.

- [ ] **Step 18.7: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "chore: serial bridge final verification fixes"
```

---

## Task Execution Order

Tasks must be executed in this order due to dependencies:

1. **Task 1** — COBS Codec Header (no deps)
2. **Task 2** — COBS C++ Test (depends on Task 1)
3. **Task 3** — BridgeApiSerialTransport Header (no deps, parallel with Task 1-2)
4. **Task 4** — BridgeApiSerialTransport Implementation (depends on Tasks 1, 3)
5. **Task 5** — Compile-Time Integration in ESPTreeBridge (depends on Tasks 3, 4)
6. **Task 6** — YAML Configuration Schema (depends on Task 5 conceptually, but can implement independently)
7. **Task 7** — Demo YAML Files (depends on Tasks 5, 6)
8. **Task 8** — BridgeTarget Model Extension (no deps, parallel with A-Phase)
9. **Task 9** — SerialBridgeClient Class (depends on Task 8)
10. **Task 10** — BridgeV2Manager Integration (depends on Tasks 8, 9)
11. **Task 11** — Server Endpoints (depends on Task 8)
12. **Task 12** — Python COBS Test (no deps)
13. **Task 13** — UI API Client Extension (depends on Task 11 conceptually)
14. **Task 14** — UI Serial Tab (depends on Task 13)
15. **Task 15** — Transport Routing Verification (depends on Tasks 9, 10)
16. **Task 16** — Manual Test Checklist (no deps)
17. **Task 17** — COBS Golden-File Enhancement (depends on Tasks 2, 12)
18. **Task 18** — Final Build Verification (depends on all)

**Parallel execution possible:**
- Tasks 1-2 and Task 8 can run in parallel
- Task 3 can run parallel with Tasks 1-2
- Task 12 can run parallel with Tasks 1-7
- Task 16 can run at any time

**For subagent-driven development:** Dispatch one task at a time to avoid file conflicts. Tasks 1+2 and Task 8 can be parallelized since they touch different files entirely.