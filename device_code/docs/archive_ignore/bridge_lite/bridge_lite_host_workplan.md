# Bridge Lite Host Protocol Engine — Workplan

## Goal

Enable the Home Assistant addon (`esphomenow-tree-ha`) to serve as the protocol brain for a `bridge_lite` ESP device by reusing the existing `BridgeProtocol` and `ESPNowOTAManager` C++ code compiled as a host shared library (`liblite_protocol.so`), called from Python via ctypes. The addon connects to the `bridge_lite` ESP over WebSocket, receives raw radio frames, runs the full ESP-NOW LR protocol state machine (sessions, crypto, schema, state, heartbeat, OTA), and publishes to Home Assistant via MQTT — identical behavior to the active bridge, but with the protocol logic moved from ESP to addon.

## Scope

### In Scope — v1

- Compile `BridgeProtocol` + `ESPNowOTAManager` + `espnow_crypto` into a host shared library
- C API wrapper (`lite_protocol.h/.cpp`) exposing init, on_frame, loop, action drain, command, OTA
- Python ctypes bridge (`gateway.py`) calling the `.so`
- Python `transport_manager.py` wrapping `bridge_lite_client` for WebSocket connection to bridge_lite ESP
- Python `mqtt_publisher.py` for HA auto-discovery, state, availability, command subscription
- Python `ota_driver.py` for firmware delivery over radio
- Addon integration: config, server startup, topology cache, REST API endpoints
- Single bridge connection (one addon instance ↔ one bridge_lite ESP)
- MQTT broker auto-discovery from HA supervisor

### Out of Scope — v1

- mDNS bridge discovery (manual IP config only)
- Multi-bridge support (architecture prepared, not implemented)
- Relay forwarding protocol (remotes relaying for other remotes)
- Force rejoin UI button
- Active bridge code changes (see constraints)

## Constraints

1. **No changes to the active bridge C++ code.** The files `components/esp_tree_bridge/*.cpp` and `components/esp_tree_bridge/*.h` must compile unchanged for ESPHome. The host build achieves portability through compat shims in a separate `host/` directory that satisfy the same `#include` paths. If a shim approach proves insufficient, prefer adding an `#ifdef` in the shim rather than modifying the source.

2. **Protocol source of truth is `espnow_types.h`.** Any Python constants (packet types, field types, struct layouts) must be derived from `espnow_types.h`. If a constant changes in the header, the Python mirror must change in lockstep.

3. **`espnow_crypto.cpp` already has host build paths.** The `#else` branches (OpenSSL for HMAC/AES, `/dev/urandom` for RNG, self-contained AES-CTR) must be used as-is. Do not duplicate crypto code.

4. **The `bridge_lite_client` Python package is the canonical WebSocket client.** It lives in `components/bridge_lite/python/`. The addon pip-installs it at Docker build time. Do not fork or inline-modify it.

5. **Single transport mode at a time.** The addon config selects `http`, `ws`, or `lite`. No mixing. The existing http/ws code paths remain untouched.

6. **MQTT topic format must match the active bridge exactly.** `homeassistant/<component>/<node_key>/<object_id>/config`, `<node_key>/<object_id>/state`, `<node_key>/availability`, `<node_key>/<object_id>/cmd`. This ensures remotes that migrate from active bridge to lite bridge re-appear with zero HA config changes.

7. **Host `millis()` uses addon monotonic clock.** All timing in `BridgeProtocol` is relative (delta-based timeouts). The addon's `std::chrono::steady_clock` → milliseconds epoch is irrelevant — only deltas matter.

8. **Future multi-bridge architecture.** Each `LiteGateway` instance owns one `BridgeProtocol` via ctypes, one `BridgeLiteClient`, one MQTT connection prefix. The v1 single-bridge implementation must not couple global state that would prevent future instantiation of multiple gateways.

## Assumptions

1. The `bridge_lite` ESP firmware is functional: PSK tag validation, ring buffer, WebSocket server, protobuf serialization, ChaCha20-Poly1305 auth+encryption. (Phases 1-4 of `bridge_lite_spec.md` are complete enough to carry frames.)

2. The addon Docker image can compile C++ against Alpine's `build-base`, `cmake`, `mbedtls-dev`, `openssl-dev`. The HA base image (`ghcr.io/home-assistant/amd64-base-python:3.13-alpine3.22`) supports this.

3. The HA supervisor API provides MQTT broker credentials via `GET /services/mqtt` with a valid `SUPERVISOR_TOKEN`.

4. The `bridge_lite_client` Python package's `BridgeLiteClient` API is stable: `connect()`, `send_frame()`, `on_frame` callback, `on_status` callback, `on_disconnect` callback.

5. `aiomqtt` can coexist with the existing FastAPI/uvicorn event loop. It uses the same asyncio loop.

6. The copy script that brings `components/` into the addon at `/opt/esp-tree/components/` will be extended to also bring `components/esp_tree_bridge/host/` and `components/esp_tree_common/`.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│               esphome-esp-tree-ha (addon)                │
│                                                              │
│  config.yaml: bridge_transport: "lite"                       │
│                                                              │
│  ┌─ Python ──────────────────────────────────────────────┐  │
│  │  app/lite/                                            │  │
│  │    __init__.py           (exports LiteManager)        │  │
│  │    gateway.py            (ctypes bridge to .so)        │  │
│  │    transport_manager.py  (BridgeLiteClient lifecycle)  │  │
│  │    mqtt_publisher.py     (HA auto-discovery + state)   │  │
│  │    ota_driver.py         (firmware file I/O, progress) │  │
│  │    types.py             (Python enums from espnow_types)│  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ C++ Shared Library ──────────────────────────────────┐  │
│  │  liblite_protocol.so                                 │  │
│  │    BridgeProtocol  (from esp_tree_bridge/ unchanged) │  │
│  │    ESPNowOTAManager (from esp_tree_bridge/ unchanged) │  │
│  │    espnow_crypto    (from esp_tree_common/ unchanged)│  │
│  │    espnow_types     (from esp_tree_common/ unchanged) │  │
│  │    lite_protocol    (C API wrapper — new)             │  │
│  │    compat shims      (new — satisfy ESPHome includes) │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
        │
        │ WebSocket (protobuf + ChaCha20-Poly1305)
        │
┌───────┴──────────────────────────────────────────────────────┐
│  bridge_lite ESP (passive radio relay)                       │
│  PSK tag validation → ring buffer → protobuf → WS → addon   │
│  RadioSend from addon → esp_now_send()                       │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Remote ──ESP-NOW──→ bridge_lite ESP ──WS──→ addon
                                                 │
                    protocol_on_frame(src_mac, data, len, rssi, ts)
                                                 │
                                           BridgeProtocol.so
                                                 │
                                           action drain queue
                                                 │
                              ┌──────────────────┼──────────────────┐
                              │                  │                  │
                         SEND_FRAME      PUBLISH_STATE     PUBLISH_DISCOVERY
                              │                  │                  │
                     transport_manager     mqtt_publisher     mqtt_publisher
                              │                  │                  │
                     BridgeLiteClient           │                  │
                              │           Home Assistant     Home Assistant
                     WebSocket → ESP    (state topic)      (config topic)
                              │
                     esp_now_send() → Remote
```

### Action Drain

All outbound side effects from `BridgeProtocol` are captured as `ProtocolAction` structs in a fixed-size ring buffer (64 slots). Python calls `protocol_loop()` and `protocol_on_frame()`, then drains actions:

```python
count = lib.protocol_get_action_count()
for i in range(count):
    action = ProtocolAction()
    lib.protocol_get_action(i, ctypes.byref(action))
    await dispatch(action)
lib.protocol_clear_actions()
```

This keeps C++ synchronous and Python in full control of I/O. No ctypes callbacks, no threading concerns.

## Implementation Phases

### Phase 1: Host Compat Shims + CMake Build

**Goal:** Compile `bridge_protocol.cpp`, `bridge_ota_manager.cpp`, and `espnow_crypto.cpp` into a `.so` on an Alpine Linux host with zero changes to the original source files.

**Steps:**

1. Create `components/esp_tree_bridge/host/compat/esphome/core/hal.h`:
   - `millis()` → `std::chrono::steady_clock` → milliseconds
   - `delay(x)` → no-op
   - `arch_init()` → no-op

2. Create `components/esp_tree_bridge/host/compat/esphome/core/log.h`:
   - `ESP_LOGI`, `ESP_LOGW`, `ESP_LOGE`, `ESP_LOGD` → `fprintf(stderr, ...)` macros
   - Match the `esph_log_*` pattern from `esp_tree_remote/standalone/compat/esphome/core/log.h`

3. Create `components/esp_tree_bridge/host/compat/esp_heap_caps.h`:
   - `heap_caps_get_total_size(MALLOC_CAP_DEFAULT)` → `SIZE_MAX`
   - `esp_get_free_heap_size()` → `SIZE_MAX`
   - This makes `evict_sessions_for_ram_()` calculate 100% free and return `false` immediately — no `#ifdef` needed in `bridge_protocol.cpp`

4. Create `components/esp_tree_bridge/host/compat/esp_random.h`:
   - `esp_random()` → `arc4random()` (available on Alpine/musl) or read `/dev/urandom`

5. Create `components/esp_tree_bridge/host/compat/esp_wifi.h`:
   - `esp_wifi_get_channel()` → stub returning channel 1, secondary 0

6. Create `components/esp_tree_bridge/host/compat/esp_now.h`:
   - Empty file. No ISR types or ESP-NOW calls on host. Needed only because `bridge_protocol.h` includes `<esp_now.h>` for `esp_now_recv_info_t` and `esp_now_send_info_t` types used in ISR callback signatures — stub the types.

7. Create `components/esp_tree_bridge/host/compat/esp_idf_version.h`:
   - `#define ESP_IDF_VERSION_VAL(major, minor, patch) ((major << 16) | (minor << 8) | patch)`
   - `#define ESP_IDF_VERSION ESP_IDF_VERSION_VAL(5, 0, 0)`

8. Create `components/esp_tree_bridge/host/compat/esp_err.h`:
   - `#define ESP_OK 0`
   - `#define ESP_FAIL -1`
   - `#define ESP_ERR_NO_MEM 0x101`

9. Create `components/esp_tree_bridge/host/CMakeLists.txt`:
   - Target: `liblite_protocol.so`
   - Sources: `bridge_protocol.cpp`, `bridge_ota_manager.cpp`, `espnow_crypto.cpp`, `lite_protocol.cpp`
   - Include paths: `compat/` (must resolve before system includes for `esphome/core/hal.h` etc.), parent `components/esp_tree_bridge/` (for `bridge_protocol.h`), parent `components/esp_tree_common/` (for `espnow_types.h`)
   - Link: OpenSSL (`libcrypto` for HMAC/AES — used by `espnow_crypto.cpp` host path)
   - Compile flags: `-DLITE_HOST_BUILD` (future use if needed), `-std=c++17`, `-fPIC`
   - Verify: build succeeds with zero warnings from `bridge_protocol.cpp` and `bridge_ota_manager.cpp`

**Key risk:** Include path resolution. The compat shims must be found *before* any ESP-IDF or ESPHome system headers. CMake `include_directories(BEFORE compat/)` ensures this. Test by intentionally including `<esphome/core/hal.h>` in a test file and confirming `millis()` resolves to the shim.

**Key risk:** `bridge_protocol.cpp` includes `"esphome/core/log.h"` and `"esphome/core/hal.h"`. These must resolve to the compat shims, not to any ESPHome installation. The CMake include order must put `compat/` first.

**Verification:** `cmake --build .` produces `liblite_protocol.so` with no undefined symbols. Run `nm -D liblite_protocol.so | grep protocol_init` to confirm the C API is exported.

### Phase 2: C API Wrapper

**Goal:** Create `lite_protocol.h/.cpp` that wraps `BridgeProtocol` and `ESPNowOTAManager` behind a flat C interface with action-queue semantics.

**Steps:**

1. Create `components/esp_tree_bridge/host/lite_protocol.h`:

   ```c
   // Lifecycle
   int protocol_init(const char *psk, const char *network_id, uint16_t heartbeat_interval);
   void protocol_destroy();

   // Inbound
   void protocol_on_frame(const uint8_t *src_mac, const uint8_t *data, size_t len,
                          int8_t rssi, uint32_t timestamp_ms);

   // Tick
   int protocol_loop(uint32_t now_ms);  // returns action count

   // Action drain
   int protocol_get_action_count();
   int protocol_get_action(int index, ProtocolAction *out);
   void protocol_clear_actions();

   // Inbound from Python
   int protocol_send_command(const uint8_t *mac, uint8_t entity_index,
                             const uint8_t *value, size_t value_len);
   int protocol_send_deauth(const uint8_t *mac);

   // OTA
   int protocol_ota_start(const uint8_t *mac, uint32_t file_size,
                          const uint8_t md5[16], uint8_t action,
                          uint16_t remote_max_payload);
   int protocol_ota_on_chunk(uint32_t sequence, const uint8_t *data, size_t len);
   void protocol_ota_abort(uint8_t reason);

   // Session query
   int protocol_get_session_count();
   int protocol_get_session(int index, ProtocolSession *out);
   ```

2. Create `components/esp_tree_bridge/host/lite_protocol.cpp`:

   - Global `BridgeProtocol *g_proto` and `ESPNowOTAManager *g_ota` instances
   - Fixed-size `ProtocolAction g_actions[64]` ring buffer with `g_action_count`
   - Wire all 11 `BridgeProtocol` callbacks to push `ProtocolAction` entries:
     - `send_fn_` → `ACTION_SEND_FRAME` (raw frame bytes + dst_mac + lr_mode)
     - `publish_state_fn_` → `ACTION_PUBLISH_STATE` (mac, entity_index, value, type, text_value)
     - `publish_discovery_fn_` → `ACTION_PUBLISH_DISCOVERY` (mac, entity schema fields, total_entities, is_commandable)
     - `publish_availability_fn_` → `ACTION_PUBLISH_AVAILABILITY` (mac, online)
     - `clear_entities_fn_` → `ACTION_CLEAR_ENTITIES` (mac, entity list)
     - `schema_complete_fn_` → `ACTION_SCHEMA_COMPLETE` (mac, total_entities)
     - `discovery_confirmed_fn_` → `ACTION_DISCOVERY_CONFIRMED` (mac, entity_index, success)
     - `publish_bridge_diag_fn_` → `ACTION_PUBLISH_BRIDGE_DIAG` (uptime_s, nodes_online)
     - `file_ack_fn_` → `ACTION_OTA_ACK` (mac, ack details)
     - `send_err_fn_` → `ACTION_SEND_ERR` (mac, error details)
     - `send_ota_frame_fn_` → `ACTION_SEND_FRAME` (same as send_fn_, for FILE_TRANSFER packets)
   - `protocol_on_frame()` calls `g_proto->on_espnow_frame(src_mac, data, len, rssi)`
   - `protocol_loop()` calls `g_proto->loop()` and `g_ota->loop()`, returns action count
   - `protocol_destroy()` calls `delete g_proto; delete g_ota;`

3. Define `ProtocolAction` struct in `lite_protocol.h`:
   - `ActionType type` (enum: SEND_FRAME, PUBLISH_STATE, PUBLISH_DISCOVERY, PUBLISH_AVAILABILITY, CLEAR_ENTITIES, SCHEMA_COMPLETE, DISCOVERY_CONFIRMED, PUBLISH_BRIDGE_DIAG, OTA_ACK, SEND_ERR)
   - Fixed-size fields: `uint8_t dst_mac[6]`, `uint8_t leaf_mac[6]`, `uint8_t raw_frame[1500]`, `size_t raw_frame_len`, `bool lr_mode`
   - Per-action-type fields in a union or flat struct (simpler for ctypes): entity_index, entity_type, value[200], value_len, text_value[200], entity_name[33], entity_unit[9], entity_id[33], entity_options[200], total_entities, is_commandable, online, ack_type, ack_result, ack_ref_counter, uptime_s, nodes_online

4. Define `ProtocolSession` struct in `lite_protocol.h`:
   - Flat struct with key session fields for topology cache: `leaf_mac[6]`, `online`, `remote_state` (uint8_t), `esphome_name[33]`, `node_label[65]`, `total_entities`, `last_seen_ms`, `hops_to_bridge`, `rssi`

5. Add `lite_protocol.cpp` to `CMakeLists.txt` sources.

**Key risk:** Callback lifetime. `BridgeProtocol` stores `std::function` callbacks by value. The lambda captures in `lite_protocol.cpp` must not reference stack-local variables. Use `g_actions` (global) and `g_proto` (global) in lambda bodies.

**Key risk:** `send_fn_` return type is `bool`. If `g_actions` ring is full, the send must still succeed at the C++ level — the action is queued and Python will drain it. If the ring overflows (64 actions), log a warning and drop the action. This is non-fatal — the protocol will retry.

**Verification:** Write a minimal test program that calls `protocol_init()`, feeds a crafted `DISCOVER` frame via `protocol_on_frame()`, calls `protocol_loop()`, and checks that an `ACTION_SEND_FRAME` (DISCOVER_ANNOUNCE) appears in the action drain.

### Phase 3: Python ctypes Gateway

**Goal:** Create `app/lite/gateway.py` that loads `liblite_protocol.so`, calls the C API, and dispatches actions to async Python handlers.

**Steps:**

1. Create `app/lite/types.py`:
   - Python `IntEnum` mirrors of `espnow_types.h` constants: `PacketType`, `FieldType`, `LogState`, join status codes, file transfer constants, header sizes
   - Source: read `espnow_types.h` values, transcribe verbatim. Add a comment: "Keep in sync with espnow_types.h"

2. Create `app/lite/gateway.py`:
   - `LiteGateway` class
   - `__init__(self, psk, network_id, mqtt_publisher, transport_manager)`:
     - Load `liblite_protocol.so` via `ctypes.CDLL`
     - Define ctypes argtypes/restypes for all C functions
     - Define `ctypes.Structure` subclasses matching `ProtocolAction` and `ProtocolSession`
     - Call `protocol_init(psk.encode(), network_id.encode(), 60)`
   - `async on_frame(self, radio_frame)`:
     - Call `protocol_on_frame(src_mac, raw_frame, len, rssi, timestamp_ms)`
     - Call `await self._drain_actions()`
   - `async tick(self)`:
     - Call `protocol_loop(int(time.time() * 1000))`
     - If action count > 0, call `await self._drain_actions()`
   - `async _drain_actions(self)`:
     - Get action count
     - For each action, dispatch: SEND_FRAME → transport.send_frame, PUBLISH_STATE → mqtt.publish_state, etc.
     - Clear actions
   - `send_command(self, mac, entity_index, value)`:
     - Call `protocol_send_command(mac, entity_index, value, len)`
   - `get_topology(self)`:
     - Call `protocol_get_session_count()` and `protocol_get_session()` for each
     - Convert to list of dicts matching the existing `get_topology_list()` shape
   - Topology cache: maintain `self._topology_cache` dict, updated incrementally on PUBLISH_DISCOVERY and PUBLISH_AVAILABILITY actions

3. Create `app/lite/__init__.py`:
   - Export `LiteManager` (composition of `LiteGateway` + `TransportManager` + `MqttPublisher`)

**Key risk:** ctypes `Structure` field alignment. The C struct and Python `ctypes.Structure` must have identical layout. Use `pack = 1` if needed, or verify with `sizeof(ProtocolAction)` matching between C and Python. Test this explicitly.

**Key risk:** String fields in `ProtocolAction` (entity_name, text_value, esphome_name, etc.) — these are fixed-size `char[]` arrays in C. Python reads them with `action.entity_name.decode('utf-8').rstrip('\x00')`.

**Verification:** Unit test that loads `.so`, calls `protocol_init()`, constructs a minimal frame, and gets an action back.

### Phase 4: Transport Manager

**Goal:** Wrap `bridge_lite_client` Python package for WebSocket connection lifecycle.

**Steps:**

1. Create `app/lite/transport_manager.py`:
   - `LiteTransportManager` class
   - Uses `BridgeLiteClient` from `bridge_lite_client` package (pip-installed from `components/bridge_lite/python/`)
   - `__init__(self, host, port, api_key)`:
     - Create `BridgeLiteClient(host, port, api_key, client_name="addon")`
   - `async start(self)`:
     - Connect, authenticate, receive `BridgeHello`
     - Wire `on_frame` callback to gateway
     - Wire `on_status` callback for diagnostics logging
     - Wire `on_disconnect` callback for reconnection
   - `async send_frame(self, dst_mac, raw_frame, lr_mode)`:
     - Call `self.client.send_frame(dst_mac, raw_frame, lr_mode)` with flow control
     - Flow control: `BridgeLiteClient` already has `FlowController` for max_inflight
   - `async stop(self)`:
     - Disconnect client

2. Create reconnection loop:
   - Exponential backoff: 1s, 2s, 5s, 10s (same pattern as `BridgeWsClient`)
   - On disconnect, attempt reconnect after backoff
   - On reconnect, `protocol_on_frame` will see DISCOVER packets from remotes and rebuild sessions naturally

**Key risk:** `BridgeLiteClient` is async (uses `websockets` library). It must run in the same asyncio event loop as the gateway. Ensure `connect()` is awaited, not run in a separate thread.

### Phase 5: MQTT Publisher

**Goal:** Publish HA auto-discovery, state, availability, and subscribe to command topics. Topic format must match the active bridge exactly.

**Steps:**

1. Create `app/lite/mqtt_publisher.py`:
   - `MqttPublisher` class
   - `__init__(self, host, port, username, password)`:
     - Create `aiomqtt.Client` with credentials from HA supervisor
   - `async start(self)`:
     - Connect to MQTT broker
   - `async publish_discovery(self, action)`:
     - Construct HA auto-discovery config payload matching active bridge format
     - Publish to `homeassistant/<component>/<node_key>/<object_id>/config`
     - Component type maps from `action.entity_type` (sensor, switch, binary_sensor, etc.)
   - `async publish_state(self, action)`:
     - Publish to `<node_key>/<object_id>/state`
     - Value encoding: numeric values as string, text values as-is
   - `async publish_availability(self, action)`:
     - Publish to `<node_key>/availability`
     - Payload: `online` / `offline`
   - `async subscribe_commands(self, node_key)`:
     - Subscribe to `<node_key>/<object_id>/cmd`
     - On message: call `gateway.send_command(mac, entity_index, value_bytes)`
   - `async clear_entities(self, mac)`:
     - Publish empty config payloads to remove stale entities

2. `node_key` construction:
   - Must match active bridge: `esp_tree_<mac_hex_no_colons>`
   - `object_id` construction: `<entity_name>_<mac_last_4_hex>` or as defined in active bridge

**Key risk:** Topic format must exactly match `esp_tree_bridge.cpp`. Audit the active bridge's MQTT publish calls to confirm:
   - Discovery: `homeassistant/<component>/<node_key>/<object_id>/config` with `device` grouping
   - State: `<node_key>/<object_id>/state`
   - Availability: `<node_key>/availability`
   - Command subscribe: `<node_key>/<object_id>/cmd`

**Key risk:** MQTT QoS. Use QoS 0 for state (fire and forget, like the active bridge), QoS 1 for discovery config (must arrive).

### Phase 6: OTA Driver

**Goal:** Firmware delivery over radio via FILE_TRANSFER packets. The C++ `ESPNowOTAManager` handles chunk windowing and retry. Python reads firmware from disk and feeds chunks on request.

**Steps:**

1. Create `app/lite/ota_driver.py`:
   - `LiteOtaDriver` class
   - `__init__(self, gateway)`:
     - Reference to gateway for calling `protocol_ota_start`, `protocol_ota_on_chunk`, `protocol_ota_abort`
   - `start_transfer(self, mac, firmware_path, action=OTA_FLASH, max_payload=250)`:
     - Read firmware file, compute MD5
     - Call `protocol_ota_start(mac, file_size, md5, action, max_payload)`
     - The C engine will produce `ACTION_SEND_FRAME` for FILE_ANNOUNCE
   - `on_chunk_requested(self, sequence, offset, length)`:
     - Called from gateway dispatch when `request_chunk_fn` fires in C++
     - Read `length` bytes at `offset` from firmware file
     - Call `protocol_ota_on_chunk(sequence, data, len)`
   - `on_progress(self, percent)`:
     - Log progress, update any status API
   - Track transfer state: IDLE, ANNOUNCING, STREAMING, ENDING, COMPLETE, FAILED

**Key risk:** The `request_chunk_fn` callback in `ESPNowOTAManager` requests firmware chunks. This fires during `protocol_loop()` as a C++ callback (pushed as an action or called synchronously). If it's synchronous within `protocol_loop()`, Python must pre-load chunks. Design: make `request_chunk_fn` always succeed and push an `ACTION_OTA_CHUNK_REQUESTED` action, then Python feeds chunks on the next drain cycle.

**Verification:** Not testable without real firmware delivery to a remote. Verify the C engine calls `request_chunk_fn` during `loop()` and that the action path works.

### Phase 7: Addon Integration

**Goal:** Wire lite mode into the addon's FastAPI server, config, and startup.

**Steps:**

1. Modify `app/config.py`:
   - Add `espnow_psk: str` and `espnow_network_id: str` to `Settings`
   - Add `mqtt_host: str` and `mqtt_port: int` (populated from supervisor API or explicit config)
   - Add `mqtt_username: str` and `mqtt_password: str` (from supervisor)
   - Add `discover_mqtt()` method using `SUPERVISOR_TOKEN` to call `http://supervisor/services/mqtt`

2. Modify `app/server.py`:
   - Import `LiteManager` from `app.lite`
   - In `startup()`, add branch:
     ```python
     if settings.bridge_transport == "lite":
         mqtt_info = await ha_client.discover_mqtt()
         lite_manager = LiteManager(settings, mqtt_info)
         await lite_manager.start()
         app.state.lite_manager = lite_manager
         app.state.lite_transport = "lite"
     ```
   - In `shutdown()`, add `await lite_manager.stop()` if present
   - Add API endpoints:
     - `GET /api/lite/status` → connection status, session count, bridge_hello info
     - `GET /api/lite/sessions` → topology cache (reuse `get_topology_list()` shape)
     - Extend `GET /api/bridge/topology.json` to route to `lite_manager.get_topology_list()` when in lite mode
   - Ensure OTA upload endpoint (`POST /api/ota/upload`) can route to `LiteOtaDriver` when in lite mode

3. Modify `config.yaml`:
   - Add `espnow_psk` (password type) and `espnow_network_id` (str type) to options/schema
   - Add `"lite"` to `bridge_transport` list

4. Modify `requirements.txt`:
   - Add `aiomqtt>=2.0`

5. Modify `Dockerfile`:
   - Add C++ build dependencies: `cmake build-base mbedtls-dev openssl-dev`
   - Add CMake build step for `liblite_protocol.so`
   - Copy `components/` to `/opt/esp-tree/components/`
   - Run CMake build
   - Copy `.so` to `/opt/esp-tree/lib/`
   - Add `pip install` of `components/bridge_lite/python/`
   - Set `LD_LIBRARY_PATH=/opt/esp-tree/lib`

**Key risk:** Alpine musl vs glibc. The `.so` is compiled against musl (Alpine's libc). Python's `ctypes.CDLL` loads musl-linked `.so` fine on Alpine. If the Docker base image changes to Debian, this will break. Pin the base image or document the constraint.

**Key risk:** `aiomqtt` version compatibility. `aiomqtt>=2.0` has breaking API changes from 1.x. Verify the MQTT client code uses the 2.x API.

**Verification:** Docker build succeeds. Addon starts. `GET /api/lite/status` returns 200.

### Phase 8: End-to-End Integration

**Goal:** Real bridge_lite ESP → addon → MQTT → HA entity appears.

**Steps:**

1. Flash a `bridge_lite` ESP with the demo YAML (`demos/espnow-bridge-lite.yml`). Ensure it boots and the WebSocket server is accessible.

2. Configure addon with `bridge_transport: "lite"`, `bridge_host: "<ESP_IP>"`, `bridge_port: 80`, `espnow_psk: "<matches ESP>">`, `espnow_network_id: "<matches ESP>"`.

3. Start addon. Verify:
   - Addon connects to bridge_lite WebSocket (ChaCha20 handshake succeeds)
   - `BridgeHello` received
   - `GET /api/lite/status` shows connected

4. Power on a remote (flashed with `demos/espnow-remote.yml`). Verify:
   - Remote sends `DISCOVER` → addon sends `DISCOVER_ANNOUNCE` → remote sends `JOIN` → addon sends `JOIN_ACK`
   - Session key derived, state transitions: NONE → DISCOVERING → JOINING → JOINED
   - Remote sends `SCHEMA_PUSH` → addon assembles entities → `ACTION_PUBLISH_DISCOVERY` → MQTT config published
   - Remote sends `STATE` → addon reassembles state → `ACTION_PUBLISH_STATE` → MQTT state published
   - HA entity appears with correct values

5. Verify command path:
   - Trigger HA entity command → MQTT `<node_key>/<object_id>/cmd` → `gateway.send_command()` → `protocol_send_command()` → `ACTION_SEND_FRAME` → `transport.send_frame()` → bridge_lite → remote
   - Remote sends ACK → `ACTION_PUBLISH_STATE` → MQTT state updated

6. Verify heartbeat/offline:
   - Wait for heartbeat timeout → `ACTION_PUBLISH_AVAILABILITY` (offline) → MQTT availability offline
   - Remote reconnects → availability online

7. Verify OTA:
   - Upload firmware via addon → `LiteOtaDriver.start_transfer()` → FILE_ANNOUNCE → remote accepts → chunks stream → remote verifies → complete

**Key risk:** The `bridge_lite` ESP's WebSocket encryption (ChaCha20-Poly1305) may not be fully implemented yet. Check `bridge_lite_spec.md` Phase 4 status — `encrypt_and_send_` and `decrypt_frame_` were noted as stubs. If encryption is not complete, test with `api_key: ""` (disabled auth) first.

**Key risk:** PSK tag validation on the addon side. The Python `gateway.py` calls `protocol_on_frame()` which internally calls `espnow_crypto_verify_psk_tag()`. Ensure the PSK passed to `protocol_init()` matches the bridge_lite ESP's PSK exactly.

**Key risk:** Schema entity construction for MQTT. The active bridge constructs `node_key` from `mac_hex` (no colons, lowercase) and `object_id` from entity index/name. Verify the exact format by capturing active bridge MQTT messages and comparing.

## Key Things to Watch Out For

### 1. No Changes to Active Bridge Source

If a compat shim proves insufficient and `bridge_protocol.cpp` or `bridge_ota_manager.cpp` needs an `#ifdef`, prefer adding the `#ifdef` in the compat shim header rather than in the source file. If a source change is absolutely necessary, it must be `#ifdef LITE_HOST_BUILD` guarded and must not affect the ESP build path. Document any such changes in this file.

### 2. Protocol Constant Sync

`app/lite/types.py` must mirror `espnow_types.h` constants. If a packet type, field type, or constant changes in the header, the Python file must be updated in the same commit. Consider adding a CI check that extracts constants from the header and compares against the Python file.

### 3. MQTT Topic Fidelity

Capture active bridge MQTT output (`mosquitto_sub -v -t "homeassistant/#"`) during normal operation. Use this as a reference to verify the lite publisher produces identical topic names, payload structures, and QoS levels.

### 4. ctypes Structure Alignment

On x86_64, `ctypes.Structure` default alignment is 8 bytes. C structs with `uint8_t` fields may have different padding. Use `ctypes.sizeof()` on both sides and verify they match. If they don't, add `#pragma pack(1)` to the C struct or ` _pack_ = 1` to the Python Structure.

### 5. asyncio + ctypes Blocking

All ctypes calls (`protocol_on_frame`, `protocol_loop`, `protocol_send_command`) are synchronous C++ that may take up to a few milliseconds. They run on the asyncio event loop thread. For v1, this is acceptable. If profiling shows latency issues, move ctypes calls to `asyncio.run_in_executor()` later — but this requires adding mutex protection to `BridgeProtocol` (currently not thread-safe).

### 6. Fragment Assembly Memory

`BridgeProtocol` allocates `std::map<uint8_t, espnow_fragment_assembly_t>` for state and schema assemblies per session. On ESP, these are bounded by `max_assembly_bytes` and `max_total_fragment_bytes`. On host, these bounds still apply (same code). No additional memory limits are needed.

### 7. Action Ring Overflow

The 64-slot action ring may overflow during burst scenarios (e.g., 10 remotes joining simultaneously each producing 7 actions). If the ring is full when a callback fires, the action is dropped with a logged warning. This is non-fatal — state will be corrected by subsequent frames. If this proves problematic, increase `ACTION_RING_SIZE` (a compile-time constant in `lite_protocol.h`).

### 8. MQTT Connection Loss

If MQTT disconnects, `aiomqtt` will attempt reconnection. During the disconnect, `ACTION_PUBLISH_*` actions are still produced by the C engine. Options: (a) drop publish actions if MQTT is disconnected (actions are lost, state will be corrected on next frame), or (b) queue actions for retry. For v1, option (a) is simpler. Add a check in `_drain_actions()` that skips PUBLISH actions if MQTT is disconnected.

### 9. WebSocket + MQTT Coexistence

When `bridge_transport` is `"lite"`, neither the HTTP bridge client nor the WS bridge client is active. The addon's startup must not attempt to resolve or connect to an active bridge. The `bridge_manager` and `ws_manager` should not be instantiated.

### 10. Docker Build Reproducibility

The CMake build references source files at `/opt/esp-tree/components/`. These are copied by the copy script before Docker build. If the copy script changes or source files move, the build will break. Pin the copy script version and verify in CI.

## File Change Summary

### New Files (ESPLR_V2)

| File | Description |
|------|-------------|
| `components/esp_tree_bridge/host/CMakeLists.txt` | CMake build for `.so` |
| `components/esp_tree_bridge/host/lite_protocol.h` | Flat C API header |
| `components/esp_tree_bridge/host/lite_protocol.cpp` | C API implementation + action ring |
| `components/esp_tree_bridge/host/compat/esphome/core/hal.h` | `millis()` shim |
| `components/esp_tree_bridge/host/compat/esphome/core/log.h` | `ESP_LOG*` shim |
| `components/esp_tree_bridge/host/compat/esp_heap_caps.h` | Heap stubs |
| `components/esp_tree_bridge/host/compat/esp_random.h` | RNG shim |
| `components/esp_tree_bridge/host/compat/esp_wifi.h` | WiFi channel stub |
| `components/esp_tree_bridge/host/compat/esp_now.h` | Empty (no ISR on host) |
| `components/esp_tree_bridge/host/compat/esp_idf_version.h` | Version define |
| `components/esp_tree_bridge/host/compat/esp_err.h` | ESP error code defines |

### New Files (addon)

| File | Description |
|------|-------------|
| `app/lite/__init__.py` | Exports `LiteManager` |
| `app/lite/gateway.py` | ctypes bridge, action dispatch, asyncio tick |
| `app/lite/transport_manager.py` | BridgeLiteClient lifecycle, reconnect |
| `app/lite/mqtt_publisher.py` | HA auto-discovery, state, commands |
| `app/lite/ota_driver.py` | Firmware delivery over radio |
| `app/lite/types.py` | Python constants from `espnow_types.h` |

### Modified Files (addon)

| File | Change |
|------|--------|
| `app/config.py` | Add `espnow_psk`, `espnow_network_id`, MQTT discovery fields |
| `app/server.py` | Add "lite" transport mode branch, API endpoints |
| `config.yaml` | Add `espnow_psk`, `espnow_network_id`, `"lite"` option |
| `requirements.txt` | Add `aiomqtt>=2.0` |
| `Dockerfile` | Add C++ build, `.so` install, bridge_lite_client pip install |

### Unchanged Files

- All `components/esp_tree_bridge/*.cpp` and `*.h` — zero modifications
- All `components/esp_tree_common/*` — zero modifications
- All `components/bridge_lite/*` — zero modifications
- All `app/bridge_ws_client.py`, `app/bridge_client.py`, `app/ota_worker.py` — zero modifications
- `app/ha_client.py` — zero modifications (MQTT discovery can be added here or in config.py)

## Lines estimate

| Module | Lines |
|--------|-------|
| Compat shims (11 files) | ~120 |
| `lite_protocol.h/.cpp` | ~350 |
| `CMakeLists.txt` | ~60 |
| `gateway.py` | ~250 |
| `transport_manager.py` | ~150 |
| `mqtt_publisher.py` | ~400 |
| `ota_driver.py` | ~200 |
| `types.py` | ~250 |
| `__init__.py` | ~30 |
| `server.py` changes | ~60 |
| `config.py` changes | ~40 |
| `Dockerfile` changes | ~20 |
| **Total new code** | **~1,930** |
| Reused C++ (compiled, not rewritten) | ~2,550 |