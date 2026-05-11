# Standalone ESP-NOW LR Remote — User Guide

A non-ESPHome ESP-NOW Long Range (LR) remote implementation. You control the C++ code directly — no ESPHome YAML, no code generation. Reuses the same `RemoteProtocol` and `espnow_crypto` from the ESPHome integration.

---

## 1. Overview

**What it does:** Connects an ESP32 (or ESP32-C3/S3) to an `esp_tree_bridge` via ESP-NOW LR for communication with Home Assistant. Operates without WiFi station association — the ESP-NOW LR interface is used exclusively.

**What it does not do:** No MQTT, no WiFi client, no Home Assistant API. Those live on the bridge.

**Prerequisites:**
- ESP-IDF v5.x (`idf.py --version` should report v5.x)
- A running `esp_tree_bridge` on the same `network_id` and `psk`
- ESP32, ESP32-C3, or ESP32-S3 hardware

---

## 2. Quick Start

### 2.1 Create Project

```bash
idf.py create-project my-remote && cd my-remote
```

### 2.2 Copy Standalone Component

```bash
cp -r <repo>/components/esp_tree_remote/standalone components/esp_tree_remote
```

### 2.3 Write main.cpp

Copy the example from `components/esp_tree_remote/standalone/main.cpp` into your project's `main/` directory. See [Section 7](#7-example-walkthrough) for a full explanation.

### 2.4 Configure SDKconfig

Run `idf.py menuconfig` and set the following:

```
Component config → Wi-Fi → ESP-NOW
  CONFIG_ESP_WIFI_ESPNOW=y
  CONFIG_ESP_WIFI_ESPNOW_ENCRYPT=n    # set to y only if bridge uses encryption

Component config → Software Coexistence → SW Coexistence Enable
  CONFIG_SW_COEXIST_ENABLE=n           # required, no WiFi coexistence needed
```

### 2.5 Build and Flash

```bash
idf.py build
idf.py -p /dev/ttyUSB0 flash
idf.py monitor
```

---

## 3. Project Structure

```
components/esp_tree_remote/
└── standalone/
    ├── compat/esphome/core/
    │   ├── hal.h           # shim: millis() → esp_timer_get_time()/1000
    │   └── log.h           # shim: ESP_LOG* → esp_log_write()
    ├── standalone_remote.h   # User API declarations
    ├── standalone_remote.cpp # Transport + protocol wiring
    ├── CMakeLists.txt       # ESP-IDF component registration
    └── main.cpp             # Working GPIO example (copy to your main/)
```

The `compat/` directory shadows ESPHome headers so `remote_protocol.cpp` compiles without modification. Your application code only includes `standalone_remote.h`.

---

## 4. SDKconfig Requirements

| Setting | Value | Reason |
|---------|-------|--------|
| `CONFIG_ESP_WIFI_ESPNOW` | `y` | Enables ESP-NOW support |
| `CONFIG_ESP_WIFI_ESPNOW_ENCRYPT` | `n` | Encryption is optional; must match bridge setting |
| `CONFIG_SW_COEXIST_ENABLE` | `n` | Disables WiFi coexistence timer; not needed without WiFi |

If `CONFIG_ESP_WIFI_ESPNOW_ENCRYPT` is `y` on the bridge, you must also set it `y` here. The PSK and encryption mode must match across all nodes.

---

## 5. API Reference

### 5.1 StandaloneRemote

```
#include "standalone_remote.h"
using namespace esphome::esp_tree;
```

**Initialization:**

```cpp
int init(const char* psk_hex,
         const char* network_id,
         const char* node_id,
         const char* node_label,
         uint16_t heartbeat_interval_seconds);
```
- `psk_hex`: 64-character hex string (32 bytes). Must match the bridge.
- `network_id`: 1–32 character string identifying your network. Must match the bridge.
- `node_id`: Unique identifier for this node (used in protocol, not displayed in HA).
- `node_label`: Human-readable name shown in Home Assistant.
- `heartbeat_interval_seconds`: How often to send a heartbeat if no state change. Default: 60.
- Returns: `0` on success, `-1` on transport failure, non-zero from `protocol_.init()` on crypto failure.

**Main Loop:**

```cpp
void loop();
```
Call this in your `app_main()` loop. It drains received frames, runs protocol tick, and flushes log output. Must be called frequently (every 10ms or so).

**Entity Registration:**

```cpp
uint8_t add_sensor(const char* name, const char* unit = "", const char* entity_id = nullptr);
uint8_t add_binary_sensor(const char* name, const char* entity_id = nullptr);
uint8_t add_switch(const char* name, const char* entity_id = nullptr);
uint8_t add_button(const char* name, const char* entity_id = nullptr);
uint8_t add_number(const char* name, const char* unit = "", const char* entity_id = nullptr);
uint8_t add_text(const char* name, const char* entity_id = nullptr);
uint8_t add_cover(const char* name, const char* entity_id = nullptr);
uint8_t add_light(const char* name, const char* entity_id = nullptr);
uint8_t add_fan(const char* name, const char* entity_id = nullptr);
uint8_t add_lock(const char* name, const char* entity_id = nullptr);
uint8_t add_alarm(const char* name, const char* entity_id = nullptr);
uint8_t add_select(const char* name, const char* entity_id = nullptr);
uint8_t add_event(const char* name, const char* entity_id = nullptr);
uint8_t add_valve(const char* name, const char* entity_id = nullptr);
uint8_t add_text_sensor(const char* name, const char* entity_id = nullptr);
```
- Returns an entity index (0-based) used in `update_entity()` and command callbacks.
- `entity_id`: Optional explicit ID string. If `nullptr` or empty, auto-generated from `name` (lowercase, spaces→underscores, non-alphanumeric removed). Example: `"Temperature °C"` → `"temperature_c"`.

**State Updates:**

```cpp
void update_entity(uint8_t index, float value);     // sensor, number
void update_entity(uint8_t index, bool value);        // switch, binary_sensor, lock, fan
void update_entity(uint8_t index, const char* value); // text, text_sensor
void update_entity(uint8_t index, const uint8_t* raw, size_t raw_len); // raw bytes
```
- Call when an entity's value changes. The protocol sends STATE to the bridge only for dirty (changed) entities.
- For `float` on sensor/number: value is memcpy'd as 4 bytes.
- For `bool` on switch: `1` = ON, `0` = OFF.

**Command Callback:**

```cpp
using CommandCallback = std::function<void(
    uint8_t entity_index,   // which entity the bridge is commanding
    uint8_t flags,          // protocol flags (currently unused in standalone)
    const uint8_t* value,   // raw command payload
    size_t value_len        // length of payload
)>;

void set_command_callback(CommandCallback cb);
```
- Called when the bridge sends a `PKT_COMMAND` (e.g., a switch turn-on from Home Assistant).
- Use `helpers::parse_switch()`, `helpers::parse_float()`, etc. to decode the raw `value`.

**Relay / Mesh Configuration:**

```cpp
void set_relay_enabled(bool enabled);
void set_max_hops(uint8_t max_hops);
void set_max_discover_pending(uint8_t max_discover_pending);
void add_allowed_parent(const std::array<uint8_t 6>& mac);
```
- Relay settings control whether this node forwards packets for other remotes.
- `add_allowed_parent()` restricts which bridges this node will join. Without it, any bridge responding to DISCOVER is accepted.

**Status Queries:**

```cpp
bool is_protocol_ready() const;      // crypto + protocol initialized
bool is_transport_ready() const;     // ESP-NOW transport initialized
const char* get_state_name() const;  // DISCOVERING, JOINING, JOINED, STATE_SYNC, NORMAL, PROVIDING_RELAY
uint32_t get_uptime_seconds() const;
```

### 5.2 helpers Namespace

```cpp
namespace esphome::esp_tree::helpers {
    bool parse_switch(const uint8_t* value, size_t len);    // returns value[0] != 0
    bool parse_binary(const uint8_t* value, size_t len);   // same as parse_switch
    float parse_float(const uint8_t* value, size_t len);   // memcpy 4 bytes → float
    int32_t parse_int(const uint8_t* value, size_t len);   // memcpy 4 bytes → int32_t
    std::string parse_string(const uint8_t* value, size_t len);
}
```
Use these to decode command payloads in your `on_command` callback.

---

## 6. Connection Lifecycle

When `init()` is called, the protocol begins immediately:

1. **DISCOVERING**: Broadcasts `PKT_DISCOVER` on WiFi channels 1–13, collects `PKT_DISCOVER_ACK` responses, selects best parent (lowest hop count, highest RSSI).
2. **JOINING**: Sends `PKT_JOIN` to selected bridge, derives session key from PSK + nonces.
3. **JOINED / STATE_SYNC**: Sends full entity state snapshot to bridge.
4. **NORMAL**: Operational — sends STATE updates on entity changes, heartbeats at interval, processes commands.
5. **PROVIDING_RELAY**: (if `set_relay_enabled(true)`) — node relays packets for other remotes.

If the bridge disappears, the protocol detects transmit stalls and returns to DISCOVERING automatically.

---

## 7. Example Walkthrough

This example is in `standalone/main.cpp`. It implements:
- **Binary sensor input**: GPIO4 — PIR motion sensor (polled each loop)
- **Sensor value**: Temperature, simulated with a ramp every 100 loops
- **Switch output**: GPIO5 — relay controlled via command from bridge/HA

```cpp
#include "standalone_remote.h"

#include <driver/gpio.h>
#include <esp_log.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

static const char* TAG = "app_main";

using namespace esphome::esp_tree;

static StandaloneRemote remote;
static uint8_t motion_idx;   // binary_sensor (PIR on GPIO4)
static uint8_t temp_idx;     // sensor (simulated temperature)
static uint8_t relay_idx;    // switch (GPIO5 output)

// Called when bridge sends a command (e.g., HA turns on the switch)
void on_command(uint8_t entity_index, uint8_t flags, const uint8_t* value, size_t value_len) {
    (void)flags;
    if (entity_index == relay_idx) {
        bool on = helpers::parse_switch(value, value_len);  // decode: value[0] = 0/1
        gpio_set_level(GPIO_NUM_5, on ? 1 : 0);            // drive relay GPIO
        remote.update_entity(relay_idx, on);                // echo state back to bridge
    }
}

extern "C" void app_main(void) {
    // Configure GPIOs
    gpio_set_direction(GPIO_NUM_4, GPIO_MODE_INPUT);   // PIR input
    gpio_set_direction(GPIO_NUM_5, GPIO_MODE_OUTPUT); // relay output
    gpio_set_level(GPIO_NUM_5, 0);                     // start with relay off

    // Your 64-char hex PSK (must match bridge's psk)
    const char* psk = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

    // Set up command callback BEFORE init
    remote.set_command_callback(on_command);

    // Initialize remote
    int ret = remote.init(
        psk,
        "my-network",           // network_id (must match bridge)
        "node-1",                // node_id (unique per node)
        "Shed Controller",      // node_label (shown in HA)
        10                       // heartbeat interval (seconds)
    );
    if (ret != 0) {
        ESP_LOGE(TAG, "remote init failed: %d", ret);
        return;
    }

    // Register entities — returns index used in update_entity() and on_command()
    motion_idx = remote.add_binary_sensor("Motion", "motion");
    temp_idx   = remote.add_sensor("Temperature", "°C", "temperature");
    relay_idx  = remote.add_switch("Relay", "relay");

    ESP_LOGI(TAG, "standalone remote ready");
    ESP_LOGI(TAG, "  motion_idx=%u temp_idx=%u relay_idx=%u", motion_idx, temp_idx, relay_idx);

    int loop_count = 0;
    float temperature = 20.0f;

    while (true) {
        remote.loop();  // must be called every iteration

        // Read PIR sensor and push state
        int pir = gpio_get_level(GPIO_NUM_4);
        remote.update_entity(motion_idx, pir == 1);

        // Simulate temperature change every 100 loops (~1 second at 10ms delay)
        if (loop_count % 100 == 0) {
            temperature += 0.1f;
            if (temperature > 30.0f) temperature = 15.0f;
            remote.update_entity(temp_idx, temperature);
        }

        vTaskDelay(pdMS_TO_TICKS(10));
        loop_count++;
    }
}
```

**Key patterns:**
- `set_command_callback()` must be called before `init()`
- Register all entities after `init()` but before entering the loop
- Call `remote.loop()` every iteration — do not block for long periods
- Use `helpers::parse_switch()` to decode command payloads

**GPIO assignments (example, change for your hardware):**
- `GPIO_NUM_4`: Digital input — pull LOW, connect PIR signal pin
- `GPIO_NUM_5`: Digital output — relay control pin

---

## 8. Building and Flashing

```bash
# Build
idf.py build

# Flash (replace /dev/ttyUSB0 with your serial port)
idf.py -p /dev/ttyUSB0 flash

# Monitor output
idf.py monitor
```

Combine build + flash + monitor:
```bash
idf.py -p /dev/ttyUSB0 build flash monitor
```

---

## 9. Log Output

The protocol and application both emit logs via ESP_LOG macros with `TAG = "espnow"` (protocol) and your chosen `TAG` (application).

**Protocol state transitions:**
```
I (5000) espnow: State: JOINING
I (5200) espnow:  [RX JOIN_ACK] ... status=100 (COMPLETE)
I (5300) espnow: State: STATE_SYNC
I (5500) espnow:  [RX STATE_ACK] ... rtt=12ms
I (5600) espnow: State: NORMAL
```

**Application logs:**
```
I (0) app_main: standalone remote ready
I (0) app_main:   motion_idx=0 temp_idx=1 relay_idx=2
```

**Connection states** (shown via `get_state_name()`):
| State | Meaning |
|-------|---------|
| `DISCOVERING` | Searching for bridge on all WiFi channels |
| `JOINING` | Bridge found, sending JOIN request |
| `JOINED` | JOIN_ACK received, syncing state |
| `STATE_SYNC` | Sending full entity state to bridge |
| `NORMAL` | Fully operational |
| `PROVIDING_RELAY` | Relaying packets for child remotes |

---

## 10. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `remote init failed: -1` | Transport setup failed | Check ESP-NOW init, WiFi driver |
| `remote init failed: -2` | Invalid PSK format | PSK must be 64 hex characters |
| Stays `DISCOVERING` forever | Bridge not running, wrong `network_id`/`psk`, `preferred_parents` list too restrictive with no fallback | Verify bridge is running with matching `network_id`/`psk`; check `preferred_parents` |
| Stays `JOINING` forever | Bridge rejected JOIN | Check bridge logs; verify `network_id`/`psk` match; check schema hash if bridge has entity count mismatch |
| Commands from HA not arriving | Bridge not sending commands, or `set_command_callback()` not set | Ensure `set_command_callback(cb)` is called before `init()`; check bridge has MQTT command subscription |
| `update_entity()` values not reaching HA | Entity index wrong | Verify index returned from `add_*()` matches index passed to `update_entity()` |
| `protocol init failed: -1` | PSK string not valid 64-char hex | Verify PSK is exactly 64 hex characters with no spaces or newlines |

**Debugging tips:**
- Use `idf.py monitor` to see all ESP_LOG output including protocol state transitions
- Check `get_state_name()` — if not `NORMAL`, the node hasn't completed join
- Check bridge logs to see if DISCOVER/JOIN packets are arriving
- Ensure `CONFIG_ESP_WIFI_ESPNOW` and `CONFIG_ESP_WIFI_ESPNOW_ENCRYPT` match bridge settings

---

## 11. File Reference

```
components/esp_tree_remote/standalone/
├── compat/esphome/core/hal.h
│     Provides millis() via esp_timer_get_time()/1000
│     ESPHome path: uses real esphome/core/hal.h
│     Standalone path: uses this shim
│
├── compat/esphome/core/log.h
│     Provides ESP_LOGI/W/E/D via esp_log_write()
│     Also provides esphome::esp_log_printf_() for format string compatibility
│
├── standalone_remote.h
│     StandaloneRemote class declaration
│     helpers namespace for command payload decoding
│
├── standalone_remote.cpp
│     WiFi driver init (STA mode, no AP association)
│     ESP-NOW init + recv/send callbacks
│     RX frame queue (FreeRTOS mutex + vector)
│     Entity registration → protocol_.register_entity()
│     State updates → protocol_.on_entity_state_change() / on_entity_text_change()
│     Command dispatch via protocol_.command_fn_ callback
│
├── CMakeLists.txt
│     idf_component_register() compiling:
│       standalone_remote.cpp
│       remote_protocol.cpp (from ../remote_protocol.cpp)
│       espnow_crypto.cpp (from ../../esp_tree_common/)
│
└── main.cpp
      Working GPIO example:
        GPIO4 input (binary_sensor / PIR)
        GPIO5 output (switch / relay)
        Simulated temperature sensor
        Command callback handling
```

---

## 12. Comparison: Standalone vs ESPHome Integration

| Aspect | Standalone | ESPHome Integration |
|--------|-----------|---------------------|
| Entity config | C++ `add_sensor()`, etc. | YAML `sensor:`, `switch:`, etc. |
| State push | Call `update_entity()` manually | Entity state callbacks auto-trigger |
| Command receive | Set `CommandCallback` | ESPHome entity `turn_on()`/`turn_off()` called automatically |
| Build system | `idf.py build` | `./compile.sh` (Docker ESPHome) |
| Code generation | None | ESPHome Python codegen from YAML |
| Protocol library | `RemoteProtocol` class | Same `RemoteProtocol` class |
| Crypto | `espnow_crypto.*` (shared) | Same `espnow_crypto.*` |
| Transport | ESP-NOW init + callbacks in `StandaloneRemote` | `ESPNowLRRemote` component handles it |
| Logging | `ESP_LOG*` macros | Same `ESP_LOG*` macros |
| Configuration | Hardcoded in `main.cpp` | YAML `esp_tree_remote:` block |
| Size | Minimal — only what you write | Full ESPHome stack |