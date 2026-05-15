# Workplan: Bridge Flash Sub-Wizard (First Install)

## Objective

Add a "Flash New Bridge" path to the setup wizard so that users on a fresh add-on install with no existing bridge can configure, compile, and serial-flash a bridge ESP32 directly from the setup UI. After flashing, the wizard auto-detects the bridge on the network, configures it in the add-on, and returns to the main wizard with Step 1 complete.

## Scope

### In Scope

- Step 1 UI refactored to 3-tab layout: "Discover" | "Manual" | "Flash New Bridge"
- Bridge flash sub-wizard: config form, chip auto-detect, compile, serial flash, post-flash detection
- Backend: bridge scaffold generation with WiFi/web_server/OTA/api_key, secrets merge, chip detect endpoint, compile-without-MAC support, bridge auto-activation
- Pre-fill config from existing secrets.yaml; warn on network_id/PSK changes
- Pre-flash DB record with provisioning status; auto-activate on scan match
- Reuse existing compile/flash UI components from config page

### Out of Scope

- HA integration changes
- Firmware/device code changes
- Browser Web Serial flash path (future: user edits YAML on config page + downloads .bin/.bin.ota for self-flash)
- MQTT in bridge scaffold (dev-only, not needed for add-on path)
- Remote flash flow (this wizard only handles bridge first-flash)

## Design

### Entry Point

Wizard Step 1 ("Connect Your Bridge") changes from scan/manual toggle to **three equal tabs**:

| Tab | Description |
|-----|-------------|
| **Discover** | Existing network scan flow: scan → select bridge → enter API key → connect |
| **Manual** | Existing manual entry: host, port, API key → connect |
| **Flash New Bridge** | New sub-wizard flow described below |

### Sub-Wizard Flow

The "Flash New Bridge" tab opens an **inline sub-wizard** within Step 1. Four sequential stages, backward navigation at each:

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Configure   │───▶│ Port / Chip  │───▶│Compile & Flash│───▶│Detect Bridge │
│  (1 page)    │    │  Detect      │    │              │    │              │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       ◀──────────────────────── Back ──────────────────────────────────▶
```

### Stage A: Configure (single page, all fields visible)

All configuration presented on one page:

| Field | Type | Default | Pre-fill from secrets.yaml | Notes |
|-------|------|---------|---------------------------|-------|
| ESPHome Name | text input | `espnow-bridge` | No | Used as esphome name and friendly_name |
| Network ID | text input | (required) | Yes, if `espnow_network_id` exists | ESP-NOW network identifier, 1-32 chars |
| PSK | text input | (required) | Yes, if `espnow_psk` exists | 64 hex chars (32 bytes) |
| WiFi SSID | text input | (required) | Yes, if `wifi_ssid` exists | Bridge WiFi network |
| WiFi Password | password input | (required) | Yes, if `wifi_password` exists | Bridge WiFi password |
| API Key | text input (auto-gen) | Random ~32-char base64 | Yes, if `bridge_api_key` exists | Auto-generated, user can edit. Saved to secrets for future device configs |
| ESP-NOW Mode | dropdown | `lr` | No | Options: `lr`, `regular` |
| OTA Password | text input (auto-gen) | Random 32-char string | Yes, if `ota_password` exists | For ESPHome WiFi OTA fallback |
| Serial Port | dropdown (`GET /api/serial/ports`) | — | No | Populated from API |

**Behavior:**
- Pre-fill: On sub-wizard load, call `GET /api/secrets` and pre-fill any matching fields
- Network ID / PSK change warning: If existing values found in secrets.yaml, show: "Changing these values will break communication with any existing remotes on this network"
- API Key note: Show helper text: "This key is auto-generated and saved to secrets. It will auto-populate for any devices installed from this add-on. Copy it for reference if needed."

### Stage B: Port Selection & Chip Auto-Detect

Integrated into the config page (serial port field triggers detection):

1. User selects a serial port from the dropdown
2. Frontend calls `POST /api/bridge/flash-wizard/detect-chip` with `{port: "/dev/ttyUSB0"}`
3. Backend runs `esptool.py chip_id --port <port>`, parses chip name from output
4. Maps chip name to board info via `CHIP_NAME_TO_BOARD` dict in `yaml_scaffold.py`
5. Returns `{chip_name: "ESP32-C5", board_info: {platform: "esp32", board: "esp32-c5-devkitc-1", variant: "esp32c5", framework: "esp-idf"}}`
6. Frontend shows: "Detected: ESP32-C5 (esp32-c5-devkitc-1)"
7. **Fallback**: If auto-detect fails, show board picker dropdown with all supported boards from `CHIP_NAME_TO_BOARD`

**No serial ports found**: Show help message about USB passthrough in HA add-on config, with link to HA docs.

### Stage C: Compile & Flash

User clicks "Flash Bridge" button. This triggers:

1. **Generate scaffold** — Frontend calls `POST /api/bridge/flash-wizard/submit` with all config fields + detected chip info
2. **Backend processing**:
   a. Generate full bridge YAML via `generate_bridge_scaffold()` — saves to YAMLStore
   b. Merge secrets into secrets.yaml (read → merge → write, preserving unrelated keys)
   c. Create pending bridge DB record (temporary MAC `FF:FF:FF:FF:FF:FF`, status "provisioning", API key stored)
   d. Create compile job (COMPILE_QUEUED, `auto_flash=false`)
3. **Compile** — Reuse config page compile UI components:
   - Stream build log via SSE (`GET /api/devices/{mac}/compile/logs`)
   - Show progress bar / status text
   - On compile success: proceed to serial flash
4. **Serial Flash** — Using the selected serial port:
   - Create serial flash job via `POST /api/devices/{mac}/flash/serial` with `{port: selected_port}`
   - Stream flash log via SSE
   - On flash success: proceed to Stage D
5. **Failure handling**: Show error log, "Retry" button. "Back" returns to config page (overwrites scaffold + secrets on re-confirm)

**Reuse**: Extract reusable compile/serial-flash panel component from config page. Sub-wizard uses same component with reduced options (no edit YAML, no OTA flash — goes straight to compile + serial flash).

### Stage D: Detect Bridge

After successful serial flash:

1. Trigger `POST /api/bridge/scan` — immediate network scan
2. Poll `GET /api/bridge/discover` every 2 seconds, up to 90 seconds
3. Match discovered bridge against provisioning DB record by API key
4. On match:
   a. Validate HMAC-SHA256 auth via `validate_bridge_key_pb()`
   b. Update bridge DB record: set real MAC, host, port, remove "provisioning" status
   c. Call `bridge_manager.sync_bridges()` + `ws_manager.start_client()` to connect
   d. Return to main wizard Step 1 → mark complete, advance to Step 2
5. On timeout (90s): Show "Bridge not found on network" with options:
   - "Retry Scan" — trigger another scan + poll cycle
   - "Skip" — return to Step 1 without bridge, user can manually configure later
   - "Check WiFi" — helper text: "Make sure the bridge is connected to the same WiFi network as Home Assistant"

### Bridge Scaffold YAML (generated)

```yaml
esphome:
  name: <name>
  friendly_name: <name>

external_components:
  - source:
      type: local
      path: /opt/esp-tree/components
    components: [esp_tree_bridge, esp_tree_common]

<platform>:
  board: <board>
  variant: <variant>
  framework:
    type: esp-idf
    sdkconfig_options:
      CONFIG_FREERTOS_USE_TRACE_FACILITY: "y"
      CONFIG_ESP_MAIN_TASK_STACK_SIZE: "12288"

logger:
  level: DEBUG

ota:
  - platform: esphome
    password: !secret ota_password

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

web_server:
  port: 80

esp_tree_bridge:
  id: bridge_component
  network_id: !secret espnow_network_id
  psk: !secret espnow_psk
  espnow_mode: <lr|regular>
  ota_over_espnow: true
  api_key: !secret bridge_api_key
```

**No MQTT** — the add-on uses WebSocket protobuf, not MQTT.

### Secrets Written

| Key | Source |
|-----|--------|
| `espnow_network_id` | User input |
| `espnow_psk` | User input |
| `wifi_ssid` | User input |
| `wifi_password` | User input |
| `bridge_api_key` | Auto-generated, user can edit |
| `ota_password` | Auto-generated |

**Merge strategy**: Read existing secrets.yaml → parse as YAML → update only the keys above → re-serialize and write. Unrelated keys preserved. Comments may be lost on re-serialize (acceptable trade-off).

### Compile Without MAC

The existing compile API requires a device MAC address. For the bridge-first-flash case, we don't have a MAC yet (bridge hasn't booted).

**Solution**: Use a temporary placeholder MAC `FF:FF:FF:FF:FF:FF` in the DB record and compile APIs. When the real bridge is detected post-flash (Stage D), update the DB record with the real MAC. The compile and serial flash endpoints work with any MAC — it's just a DB key for job tracking.

**Important**: The temporary MAC entry must be cleaned up if the user abandons the wizard without completing bridge detection. Add a cleanup step or TTL for provisioning records.

---

## Phases

### Phase 1: Backend — Bridge Scaffold Generator

Add `generate_bridge_scaffold()` to `yaml_scaffold.py` and a chip detection utility.

#### Tasks

1.1. **Add `generate_bridge_scaffold()` to `app/yaml_scaffold.py`**:
   - Signature: `generate_bridge_scaffold(name: str, board_info: dict[str, str], espnow_mode: str = "lr") -> str`
   - Returns full bridge YAML string (as shown in design above)
   - Uses `esphome_platform_key()` for the platform key (same as existing scaffold)
   - Does NOT take secrets values — those are in `!secret` references in the YAML
   - Includes `sdkconfig_options` for FreeRTOS trace facility and main task stack size (matching bridge demo YAML for ESP-IDF)

1.2. **Add `detect_chip_on_port()` to `app/compiler.py`** (or new `app/serial_detect.py`):
   - Signature: `async detect_chip_on_port(port: str) -> dict[str, Any]`
   - Runs `esptool.py chip_id --port {port}` as subprocess
   - Parses output for chip name (e.g., "ESP32-C5")
   - Maps chip name via `CHIP_NAME_TO_BOARD` to board info
   - Returns `{"chip_name": "ESP32-C5", "board_info": {...}}` or `{"chip_name": "unknown", "board_info": None}`
   - Timeout: 10 seconds
   - Handle: port not found, chip not responding, permission denied

1.3. **Add `merge_secrets()` to `app/yaml_store.py`**:
   - Signature: `merge_secrets(new_values: dict[str, str]) -> None`
   - Read existing secrets.yaml (or empty dict if not exists)
   - Parse as YAML
   - Update keys from `new_values` dict
   - Write back to secrets.yaml
   - Handles missing file (create new)

1.4. **Unit tests** for `generate_bridge_scaffold()`, `detect_chip_on_port()` (mock esptool), `merge_secrets()`.

**Validation:** `generate_bridge_scaffold()` output matches expected YAML. `merge_secrets()` correctly merges without clobbering. `detect_chip_on_port()` returns correct board mapping for known chips.

---

### Phase 2: Backend — API Endpoints

Add three new endpoints for the flash wizard flow.

#### Tasks

2.1. **`POST /api/bridge/flash-wizard/detect-chip`**:
   - Request body: `{"port": "/dev/ttyUSB0"}`
   - Calls `detect_chip_on_port(port)`
   - Returns: `{"chip_name": "ESP32-C5", "board_info": {"platform": "esp32", "board": "esp32-c5-devkitc-1", "variant": "esp32c5", "framework": "esp-idf"}}`
   - Error: 404 if port not found, 500 if esptool fails (return `{"chip_name": "unknown"}`)

2.2. **`POST /api/bridge/flash-wizard/submit`**:
   - Request body:
     ```json
     {
       "name": "espnow-bridge",
       "network_id": "mynet",
       "psk": "abcd1234...",
       "wifi_ssid": "MyWiFi",
       "wifi_password": "password",
       "api_key": "auto-gen-base64...",
       "espnow_mode": "lr",
       "ota_password": "auto-gen...",
       "chip_name": "ESP32-C5",
       "board_info": {"platform": "esp32", "board": "esp32-c5-devkitc-1", "variant": "esp32c5", "framework": "esp-idf"}
     }
     ```
   - Processing:
     a. Generate bridge YAML via `generate_bridge_scaffold(name, board_info, espnow_mode)`
     b. Save YAML to YAMLStore: `yaml_store.save_config(name, yaml_content)`
     c. Merge secrets: `yaml_store.merge_secrets({"espnow_network_id": ..., "espnow_psk": ..., "wifi_ssid": ..., "wifi_password": ..., "bridge_api_key": ..., "ota_password": ...})`
     d. Create pending bridge DB record: `db.add_bridge()` with `mac="FF:FF:FF:FF:FF:FF"`, `api_key=api_key`, `name=name`, `enabled=0` (don't connect yet), extra field `flash_wizard_pending=1`
     e. Create device entry in topology DB for the placeholder MAC
     f. Trigger compile: `POST /api/devices/FF:FF:FF:FF:FF:FF/compile` (or call compile_worker directly)
     g. Return: `{"status": "compiling", "mac": "FF:FF:FF:FF:FF:FF", "esphome_name": name}`
   - **Idempotent**: If called again for same name, cancel any in-progress compile, regenerate scaffold, overwrite secrets, re-trigger compile

2.3. **`GET /api/bridge/flash-wizard/status`**:
   - Returns current flash wizard state by looking up provisioning bridge records:
     ```json
     {
       "provisioning": true,
       "esphome_name": "espnow-bridge",
       "mac": "FF:FF:FF:FF:FF:FF",
       "compile_status": "compiling",
       "serial_flash_status": "idle",
       "bridge_detected": false,
       "detected_bridge": null
     }
     ```
   - Checks: DB for provisioning bridge record, compile job status, serial flash status, bridge discovery results

2.4. **Update `POST /api/devices/{mac}/flash/serial`**:
   - No changes needed — it already works with any MAC and factory.bin from the device's YAMLStore directory
   - Verify the placeholder MAC path resolves correctly in YAMLStore

2.5. **Bridge auto-activation on discovery**:
   - In `network_discovery.py` or the scan result handler: after scanning, check if any discovered bridge's API key matches a provisioning bridge DB record
   - If match found:
     a. Validate HMAC-SHA256 auth via `validate_bridge_key_pb(host, port, api_key)`
     b. Update bridge DB record: set real MAC, host, port, `enabled=1`, clear `flash_wizard_pending`
     c. Call `bridge_manager.sync_bridges(db.list_enabled_bridges())` to connect
   - This makes the post-flash bridge detection automatic — the scan loop already runs

2.6. **Provisioning record cleanup**:
   - On add-on startup: delete any DB records with `flash_wizard_pending=1` and `mac="FF:FF:FF:FF:FF:FF"` — they're stale from abandoned wizard sessions
   - Alternatively: add TTL (e.g., 1 hour) and clean up expired provisioning records

2.7. **Serial port enumeration enhancement**:
   - Verify `GET /api/serial/ports` works correctly in the add-on Docker container
   - Add `/dev/serial/by-id/*` resolution (already exists per AGENTS.md)
   - Return additional metadata: `chip_auto_detected: bool` (set false, frontend triggers detection)

**Validation:** Curl each endpoint. Verify scaffold generates. Verify secrets merge. Verify compile triggers. Verify serial flash with placeholder MAC. Verify auto-activation on scan match.

---

### Phase 3: Frontend — Tab Layout & Config Form

Refactor Step 1 to three tabs, build the bridge flash config page.

#### Tasks

3.1. **Refactor Step 1 to tab layout in `ui/src/pages/setup-page.ts`**:
   - Replace current setup-step-1 content (scan/manual toggle) with 3-tab selector
   - Tab labels: "Discover", "Manual", "Flash New Bridge"
   - "Discover" tab: existing scan flow (unchanged)
   - "Manual" tab: existing manual entry (unchanged)
   - "Flash New Bridge" tab: new sub-wizard content
   - Preserve existing Step 2 and Step 3 logic unchanged
   - Tab styling: horizontal button group, active tab highlighted

3.2. **Build bridge flash config form** (new component or section in setup-page.ts):
   - Single-page form with all fields from Stage A design
   - Pre-fill: On mount, call `GET /api/secrets`, parse YAML, pre-fill matching fields
   - Network ID / PSK warning: Show if existing values differ from defaults or if values already exist
   - API key: Auto-generate 24-char base64 string on mount (unless pre-filled from secrets). Show in editable text field with copy button. Helper text about auto-population for future devices.
   - OTA Password: Auto-generate 32-char random string on mount. Show in editable text field.
   - ESP-NOW Mode: Select dropdown with `lr` (default) and `regular`
   - Serial Port: Dropdown populated from `GET /api/serial/ports`. Include "No serial ports found" state with USB passthrough help text.
   - "Next: Prepare Firmware" button at bottom — validates required fields, proceeds to Stage B/C
   - "Back" button — returns to tab view (abandons sub-wizard if nothing submitted yet)

3.3. **Chip detection on port selection**:
   - When user selects a serial port, call `POST /api/bridge/flash-wizard/detect-chip`
   - Show loading spinner during detection
   - On success: show detected chip info (chip name, board name) — read-only badge
   - On failure: show board picker dropdown with all entries from `CHIP_NAME_TO_BOARD`
   - Board picker items: format as "ESP32-C5 (esp32-c5-devkitc-1)", etc.

3.4. **Form validation**:
   - Required: name, network_id, psk, wifi_ssid, wifi_password, serial_port, (chip detected or board picked)
   - PSK format: validate 64 hex chars (show inline error)
   - Name: validate ESPHome name format (lowercase, no spaces, alphanumeric + hyphens)

**Validation:** Config form renders all fields. Pre-fill works from secrets. Chip detection triggers on port selection. Validation catches missing/invalid fields.

---

### Phase 4: Frontend — Compile & Flash UI

Integrate compile and serial flash into the sub-wizard flow.

#### Tasks

4.1. **Extract reusable compile panel from config page**:
   - Identify the compile/flash UI section in `ui/src/pages/config-page.ts`
   - Extract into `ui/src/components/compile-flash-panel.ts` (or similar)
   - Props: `esphome_name`, `mac`, `serialPort`, `mode: "full" | "wizard"`
   - Mode "full": current config page behavior (edit YAML, compile, OTA flash, serial flash, download)
   - Mode "wizard": streamlined — compile + serial flash only, no YAML editor, no OTA option
   - SSE log streaming reuse: `GET /api/devices/{mac}/compile/logs` and `GET /api/devices/{mac}/flash/serial/logs`

4.2. **Integrate compile-flash panel into sub-wizard**:
   - After config form submission, show compile-flash panel in "wizard" mode
   - Automatically starts compilation on mount
   - On compile success: automatically starts serial flash with selected port
   - On serial flash success: auto-advance to Stage D (detect bridge)
   - On any failure: show error, "Retry" button, "Back to Config" button
   - Progress indicator: stepper/breadcrumb showing current sub-stage (Configure → Compile → Flash → Detect)

4.3. **Submit handler**:
   - On "Next: Prepare Firmware" click from config form:
     a. Validate all fields
     b. Call `POST /api/bridge/flash-wizard/submit` with config data
     c. On success: switch view to compile-flash panel
   - On re-submit (user went back and changed config):
     a. Call `POST /api/bridge/flash-wizard/submit` again (idempotent — overwrites scaffold + secrets, re-compiles)

4.4. **Serial flash integration**:
   - After compile completes, call `POST /api/devices/{placeholder_mac}/flash/serial` with `{port: selected_port}`
   - Stream serial flash log
   - On success: transition to Stage D
   - On failure: show error, "Retry Flash" button

**Validation:** Config submission triggers compile. Compile log streams. Serial flash auto-starts. Failure shows retry. Back button works.

---

### Phase 5: Frontend — Post-Flash Bridge Detection

Auto-detect the bridge after serial flash and complete Step 1.

#### Tasks

5.1. **Detection UI**:
   - After serial flash success, show "Waiting for bridge..." view:
     - Spinner or pulsing bridge icon
     - Status text: "Bridge is booting and connecting to WiFi..."
     - Elapsed time counter
   - Trigger `POST /api/bridge/scan` immediately
   - Poll `GET /api/bridge/discover` every 2 seconds
   - Poll `GET /api/bridge/flash-wizard/status` every 2 seconds to check `bridge_detected`

5.2. **Bridge found handling**:
   - When a discovered bridge's API key matches our provisioning record (detected via `/api/bridge/flash-wizard/status` returning `bridge_detected: true`):
     a. Show success: "Bridge detected and connected!"
     b. Wait 1.5 seconds (UX pause)
     c. Transition back to main wizard Step 1, mark as complete
     d. Auto-advance to Step 2

5.3. **Timeout handling (90 seconds)**:
   - Show: "Bridge was not found on the network"
   - Options:
     - "Retry Scan" — trigger fresh scan + restart poll cycle
     - "Skip" — dismiss sub-wizard, return to Step 1 Discover tab (user can manually find bridge once it's online)
     - Help text: "Make sure the bridge is connected to the same WiFi network. Check the bridge's power and WiFi credentials."

5.4. **Polling optimization**:
   - Combine discover poll + flash-wizard/status poll into single request or parallel requests
   - Stop polling when user navigates away or sub-wizard is dismissed

5.5. **Cleanup on abandon**:
   - If user clicks "Skip" or navigates away during detection:
     - Call cleanup endpoint or just leave provisioning record (cleaned up on next add-on startup via Phase 2 task 2.6)
     - The compiled firmware and secrets remain valid — user can find bridge later via Discover tab

**Validation:** After flash, detection spinner shows. Bridge appears within 90s. Auto-advance to Step 2. Timeout shows retry/skip options. Skip returns to Step 1.

---

### Phase 6: Integration & Edge Cases

End-to-end wiring, error handling, and polish.

#### Tasks

6.1. **End-to-end flow test**:
   - Fresh add-on install → setup wizard → "Flash New Bridge" tab
   - Fill config → select port → chip detected → submit → compile → serial flash → detect → Step 1 complete
   - Verify bridge appears in topology after Step 3 completes

6.2. **Backward navigation test**:
   - Go back from compile stage → change config → re-submit → verify scaffold overwritten, secrets merged, new compile starts
   - Go back from flash stage → re-flash → verify no duplicate compile
   - Go back from detection stage → retry scan → verify no re-flash

6.3. **Existing secrets merge test**:
   - Create secrets.yaml with existing `espnow_network_id`, add extra keys like `my_custom_key`
   - Run sub-wizard with different network_id
   - Verify: network_id updated, `my_custom_key` preserved, warning shown about network_id change

6.4. **Chip detection failure test**:
   - Select port with non-ESP device (or mock esptool failure)
   - Verify: board picker dropdown appears, user can manually select board
   - Run compile with manually selected board → verify it succeeds

6.5. **Serial port unavailable test**:
   - Mock `GET /api/serial/ports` returning empty array
   - Verify: "No serial ports found" message with USB passthrough help text
   - Verify: cannot proceed to compile (serial port required)

6.6. **Compile failure handling**:
   - Mock compile failure (invalid YAML, missing dependency)
   - Verify: error log shown, "Retry" button works, re-submit regenerates scaffold

6.7. **Serial flash failure handling**:
   - Mock flash failure (esptool error, permission denied)
   - Verify: error shown, "Retry Flash" button works

6.8. **Provisioning cleanup**:
   - Start sub-wizard but abandon (navigate away)
   - Restart add-on
   - Verify: stale provisioning record cleaned up

6.9. **esptool availability in add-on container**:
   - Verify esptool is installed in the add-on Docker container
   - If not, add to Dockerfile or requirements
   - Test: `esptool.py chip_id` runs inside container with USB device passed through

6.10. **Dockerfile / add-on config update**:
   - Ensure USB device mapping is documented in add-on config
   - Add `usb` device tree mapping if not already present in `config.yaml`

**Validation:** All edge cases handled gracefully. No orphaned records. No data loss on secrets merge.

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| esptool not available in add-on container | Chip detection and serial flash fail | Verify in Phase 6 task 6.9. Install if missing. |
| USB passthrough not configured in HA add-on | No serial ports visible | Show help text with HA USB passthrough instructions. Link to HA docs. Future: browser Web Serial fallback. |
| Chip auto-detect fails (clone board, unusual adapter) | Can't auto-select board | Fallback board picker dropdown. User manually selects. |
| Bridge takes >90s to boot and appear on network | Detection timeout | "Retry Scan" button. Increase default timeout or make configurable. |
| Secrets.yaml merge corrupts unrelated keys | Other devices break | Use safe YAML parse/write. Test with complex secrets files. Accept comment loss as trade-off. |
| Placeholder MAC collides with real device | DB conflict | `FF:FF:FF:FF:FF:FF` is not a valid ESP32 MAC. Add unique constraint enforcement. |
| Compile takes very long (5+ min on first build) | User experience degrades | Show streaming log. Offer progress estimates based on compile history. |
| Bridge connects to different WiFi than HA add-on | Scan can't find bridge | Help text on timeout. User must ensure same network. |
| Provisioning DB records accumulate | Stale records | Cleanup on startup. TTL-based expiry. |
| esptool chip_id resets running ESP32 firmware | Brief interruption on target device | Acceptable — user is about to flash new firmware anyway. |

## File Change Summary

| File | Change |
|------|--------|
| `app/yaml_scaffold.py` | Add `generate_bridge_scaffold()` with full bridge YAML generation |
| `app/compiler.py` (or new `app/serial_detect.py`) | Add `detect_chip_on_port()` — runs esptool chip_id, maps to board info |
| `app/yaml_store.py` | Add `merge_secrets()` — read/merge/write secrets.yaml |
| `app/server.py` | Add `POST /api/bridge/flash-wizard/detect-chip`, `POST /api/bridge/flash-wizard/submit`, `GET /api/bridge/flash-wizard/status`; add auto-activation logic; add provisioning cleanup |
| `app/network_discovery.py` | Add auto-match of discovered bridges against provisioning DB records |
| `app/db.py` | Add `flash_wizard_pending` field to bridge table; add provisioning record cleanup query |
| `ui/src/pages/setup-page.ts` | Refactor Step 1 to 3-tab layout; integrate bridge flash sub-wizard |
| `ui/src/components/compile-flash-panel.ts` | New: extracted reusable compile/flash panel from config page |
| `ui/src/pages/config-page.ts` | Refactor to use shared compile-flash-panel component |
| `ui/src/api/client.ts` | Add `detectChip(port)`, `submitFlashWizard(config)`, `getFlashWizardStatus()` |
| `Dockerfile` | Ensure esptool is installed (verify, add if missing) |
| `config.yaml` | Verify/add USB device mapping documentation |