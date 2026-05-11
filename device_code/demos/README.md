# ESP-NOW LR Demo Configurations

This folder contains ready-to-use ESPHome configurations for testing ESP-NOW LR.

## Files

### Bridge Configurations
- `espnow-bridge.yml` - Bridge node for ESP32-C5 (WiFi + MQTT + ESP-NOW LR)
- `espnow-bridge-c5.yml` - Alternative bridge configuration for ESP32-C5

### Remote Configurations
- `espnow-remote.yml` - Remote node with full demo entity set (all supported entity types)
- `espnow-remote-leaf.yml` - Leaf-only remote with full entity set and `preferred_parents` restriction
- `espnow-remote-ant1.yml` - Minimal remote with basic entities (temperature + GPIO switch)

### Template Files
- `secrets.example.yaml` - Template for secrets (copy to `secrets.yaml` - must be `.yaml` extension)

## Quick Start

1. **Copy the secrets template:**
   ```bash
   cd demos
   cp secrets.example.yaml secrets.yaml
   ```
   *Note: Must be `secrets.yaml` (ESPHome requires `.yaml` extension, not `.yml`)*

2. **Edit `secrets.yaml` with your credentials:**
   - WiFi SSID and password
   - MQTT broker details
   - OTA password
   - ESP-NOW LR network ID and PSK

3. **Build and flash the bridge:**
   ```bash
   docker run --rm -v "${PWD}:/config" -v "${PWD}/..:/external" -v "${PWD}/../cache/docker_compiler:/root/.platformio" ghcr.io/esphome/esphome:latest compile espnow-bridge.yml
   docker run --rm -v "${PWD}:/config" -v "${PWD}/..:/external" -v "${PWD}/../cache/docker_compiler:/root/.platformio" ghcr.io/esphome/esphome:latest upload espnow-bridge.yml
   ```
   *Binary output: ../cache/builds/espnow-bridge.bin*

4. **Build and flash a remote:**
   ```bash
   docker run --rm -v "${PWD}:/config" -v "${PWD}/..:/external" -v "${PWD}/../cache/docker_compiler:/root/.platformio" ghcr.io/esphome/esphome:latest compile espnow-remote.yml
   docker run --rm -v "${PWD}:/config" -v "${PWD}/..:/external" -v "${PWD}/../cache/docker_compiler:/root/.platformio" ghcr.io/esphome/esphome:latest upload espnow-remote.yml
   ```
   *Binary output: ../cache/builds/espnow-remote.bin*

5. **Forced relay topology demos:**
   - Build `espnow-remote-ant1.yml` for an intermediate relay node.
   - Build `espnow-remote-leaf.yml` for a leaf that is restricted to `preferred_parents`.
   - Update the placeholder MAC in `espnow-remote-leaf.yml` to the actual MAC of the relay node before testing.

## Full Bridge YAML Example

```yaml
esphome:
  name: espnow-bridge
  friendly_name: ESP-NOW LR Bridge

esp32:
  board: esp32-c5-devkitc-1
  framework:
    type: esp-idf

logger:
  level: DEBUG

ota:
  - platform: esphome
    password: !secret ota_password

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

external_components:
  - source:
      type: local
      path: ../components
    components: [esp_tree_bridge, esp_tree_common]

mqtt:
  broker: !secret mqtt_broker
  username: !secret mqtt_username
  password: !secret mqtt_password

web_server:
  port: 80

esp_tree_bridge:
  id: bridge_component
  network_id: !secret espnow_network_id
  psk: !secret espnow_psk
  espnow_mode: lr                        # 'lr' for long range, 'regular' for standard ESP-NOW
  heartbeat_interval_seconds: 60         # seconds between heartbeat checks
  mqtt_discovery_prefix: homeassistant  # MQTT discovery prefix for Home Assistant
  bridge_friendly_name: "ESP-NOW LR Bridge"  # Display name for the bridge
```

### Bridge Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `network_id` | string | **required** | Network identifier (1-32 chars, case-sensitive, must match remotes) |
| `psk` | string | **required** | Pre-shared key (64 hex chars = 32 bytes, must match remotes) |
| `espnow_mode` | string | `"lr"` | Radio mode: `"lr"` for long range, `"regular"` for standard ESP-NOW |
| `heartbeat_interval_seconds` | int | `60` | Heartbeat check interval in seconds |
| `mqtt_discovery_prefix` | string | `"homeassistant"` | MQTT discovery prefix for Home Assistant |
| `bridge_friendly_name` | string | `"ESP-NOW LR Bridge"` | Human-readable name for the bridge |
| `id` | string | auto | Component ID for use in lambdas |

## Full Remote YAML Example

```yaml
esphome:
  name: espnow-remote
  friendly_name: ESP-NOW LR Remote
  project:
    name: ben.esp_tree_remote
    version: "0.1.0"

esp32:
  board: esp32-c3-devkitm-1
  framework:
    type: esp-idf

logger:
  level: DEBUG

api:
  reboot_timeout: 0s

ota:
  - platform: esphome
    password: !secret ota_password

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

external_components:
  - source:
      type: local
      path: ../components
    components: [esp_tree_remote, esp_tree_common]

esp_tree_remote:
  network_id: !secret espnow_network_id
  psk: !secret espnow_psk
  espnow_mode: lr                           # 'lr' for long range, 'regular' for standard ESP-NOW
  relay_enabled: true                        # Allow this node to relay for other remotes
  heartbeat_interval_seconds: 60             # seconds between heartbeat packets
  max_hops: 5                                # max hop count for topology
  max_discover_pending: 8                    # max pending discovery responses
  preferred_parents: []                        # list of preferred parent MACs (empty = any)

# SENSOR
sensor:
  - platform: internal_temperature
    name: "Chip Temperature"
    id: chip_temp
    entity_category: diagnostic
    update_interval: 10s
  - platform: uptime
    name: "Uptime"
    id: uptime_sensor

# TEXT SENSOR
text_sensor:
  - platform: template
    id: long_uptime_text
    name: "Time Spoken"

# TEXT
text:
  - platform: template
    id: text_input
    name: "Text Input"
    optimistic: true
    min_length: 0
    max_length: 255
    mode: text

# SWITCH
switch:
  - platform: template
    name: "Test Switch"
    id: switch_1
    optimistic: true
  - platform: gpio
    pin: GPIO2
    name: "Board LED"
    id: board_led
    icon: mdi:led-on
  - platform: restart
    name: "Reboot"

# BINARY SENSOR
binary_sensor:
  - platform: template
    name: "Test Binary Sensor"
    id: binary_sensor_1

# BUTTON
button:
  - platform: template
    name: "Test Button"
    id: button_1
    on_press:
      - logger.log: "Button pressed!"

# COVER
cover:
  - platform: template
    id: cover_1
    name: "Test Cover"
    optimistic: true

# LIGHT (requires output definitions)
output:
  - platform: ledc
    id: dimmer_output
    pin: GPIO25
    frequency: 1000 Hz
  - platform: ledc
    id: rgb_red
    pin: GPIO26
  - platform: ledc
    id: rgb_green
    pin: GPIO27
  - platform: ledc
    id: rgb_blue
    pin: GPIO32

light:
  - platform: monochromatic
    id: dimmer_light
    name: "Dimmer Light"
    output: dimmer_output
    gamma_correct: 2.2
  - platform: rgb
    id: rgb_light
    name: "RGB Light"
    red: rgb_red
    green: rgb_green
    blue: rgb_blue
  - platform: esp32_rmt_led_strip
    id: ws2812_light
    name: "WS2812 Light"
    pin: GPIO33
    num_leds: 1
    rgb_order: GRB
    chipset: ws2812
    effects:
      - addressable_rainbow:
          speed: 50
          width: 50
      - addressable_color_wipe:

# NUMBER
number:
  - platform: template
    id: number_1
    name: "Test Number"
    min_value: 0
    max_value: 100
    step: 1
    optimistic: true

# FAN
fan:
  - platform: template
    id: fan_1
    name: "Test Fan"
    speed_count: 5

# LOCK
lock:
  - platform: template
    id: lock_1
    name: "Test Lock"
    optimistic: true

# SELECT
select:
  - platform: template
    id: select_1
    name: "Test Select"
    options:
      - "Auto"
      - "Manual"
      - "Off"
    optimistic: true

# ALARM CONTROL PANEL
alarm_control_panel:
  - platform: template
    id: alarm_1
    name: "Test Alarm"
    requires_code_to_arm: false

# VALVE
valve:
  - platform: template
    id: valve_1
    name: "Test Valve"
    optimistic: true

# EVENT
event:
  - platform: template
    id: event_1
    name: "Test Event"
    event_types:
      - "triggered"
      - "cleared"
```

### Remote Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `network_id` | string | **required** | Network identifier (1-32 chars, must match bridge) |
| `psk` | string | **required** | Pre-shared key (64 hex chars, must match bridge) |
| `espnow_mode` | string | `"lr"` | Radio mode: `"lr"` or `"regular"` |
| `relay_enabled` | bool | `true` | Allow this node to act as a relay for other remotes |
| `heartbeat_interval_seconds` | int | `60` | Seconds between heartbeat packets |
| `max_children` | int | `6` | Maximum child nodes when acting as relay |
| `max_hops` | int | `4` | Maximum hop count for topology |
| `max_discover_pending` | int | `8` | Maximum pending discovery responses |
| `preferred_parents` | list | `[]` | List of preferred parent MAC addresses (empty = any parent) |

## Supported Entity Types

All standard ESPHome entity types are supported via automatic registration:

| ESPHome Entity | Field Type | HA Component | Commandable |
|---------------|------------|--------------|-------------|
| `sensor:` | SENSOR | sensor | No |
| `switch:` | SWITCH | switch | Yes |
| `binary_sensor:` | BINARY | binary_sensor | No |
| `button:` | BUTTON | button | No |
| `cover:` | COVER | cover | Yes |
| `light:` | LIGHT | light | Yes |
| `number:` | NUMBER | number | Yes |
| `fan:` | FAN | fan | Yes |
| `lock:` | LOCK | lock | Yes |
| `select:` | SELECT | select | Yes |
| `alarm_control_panel:` | ALARM | alarm_control_panel | Yes |
| `valve:` | VALVE | valve | Yes |
| `text:` | TEXT | text | Yes |
| `text_sensor:` | TEXT_SENSOR | text_sensor | No |
| `event:` | EVENT | event | No |

### Entity Type Notes

- **Commandable entities** receive commands from Home Assistant via the bridge
- **Non-commandable entities** (sensor, binary_sensor, button, text_sensor, event) only send state updates to the bridge
- Light supports additional sub-commands: fan speed, oscillation, and direction
- All entities are automatically discovered by Home Assistant via MQTT discovery

## Hardware Notes

### Bridge Node
- ESP32-C5 board (tested with `esp32-c5-devkitc-1`) or ESP32
- Requires WiFi connection
- Requires MQTT broker access
- Web server on port 80 for topology diagnostics

### Remote Node
- ESP32-C3 DevKitM-1 (`esp32-c3-devkitm-1`) or ESP32
- Uses internal temperature sensor
- Controls board LED on GPIO8 (inverted)
- Adjust pin for your specific board

## Security Notes

- `secrets.yaml` is gitignored - never commit secrets!
- Generate a strong PSK: `openssl rand -hex 32`
- Use different credentials for production

## Network Configuration

Both bridge and remote must use the same:
- `espnow_network_id` (string, 1-32 characters)
- `espnow_psk` (64 hex characters = 32 bytes)

The bridge will:
1. Discover remote nodes via ESP-NOW LR
2. Exchange schemas with remotes
3. Publish remote entities to Home Assistant via MQTT discovery
4. Relay commands from HA to remotes

## preferred_parents

`preferred_parents` is an optional `esp_tree_remote:` ordered list of MAC addresses that influences parent selection.

- If empty (default), parent selection uses normal tiebreaking (hops → RSSI).
- If populated, parents in the list are ranked by their position in the list (first = highest preference).
- A preferred parent with good signal (RSSI ≥ -85 dBm) automatically wins over any non-preferred parent.
- If no preferred parent has adequate signal, normal selection runs among all responders (including any preferred that passed the threshold).

This is intended for deterministic relay testing, for example forcing `leaf -> relay1 -> bridge`.

Example (leaf prefers joining through a specific relay):
```yaml
esp_tree_remote:
  network_id: !secret espnow_network_id
  psk: !secret espnow_psk
  relay_enabled: false
  heartbeat_interval_seconds: 10
  preferred_parents:
    - "B0:CB:D8:D6:BA:68"  # MAC address of relay1 node (preferred index 0)
```

## MQTT Discovery

When a remote joins the bridge, the bridge publishes MQTT discovery messages to Home Assistant for each entity on the remote. Entity naming uses the remote's MAC address for stable identity:

```
homeassistant/<component>/<mac>_<entity_name>/config
homeassistant/<component>/<mac>_<entity_name>/state
homeassistant/<component>/<mac>_<entity_name>/command  # commandable entities only
```

For example, a sensor named "Temperature" on a remote with MAC `AABBCCDDEEFF`:
```
homeassistant/sensor/AABBCCDDEEFF_temperature/config
homeassistant/sensor/AABBCCDDEEFF_temperature/state
```

## Bridge Diagnostics

The bridge publishes its own diagnostic entities:
- `espnow_bridge_uptime` - Bridge uptime in seconds
- `espnow_bridge_nodes_joined` - Number of remotes currently joined

Per-remote diagnostics (hidden in HA):
- `<mac>_last_seen` - Timestamp of last state received
- `<mac>_signal` - RSSI of last packet
- `<mac>_uptime` - Remote uptime in seconds
