# YAML Editor, Compilation & ESP-NOW Flashing — Workplan

## Goal

Enable users to create, edit, and compile ESPHome YAML device configs directly inside the ESPNow Tree add-on, then flash the resulting firmware to remote devices over ESP-NOW OTA through the existing bridge chunk protocol.

This transforms the workflow from "compile externally on a dev machine, upload `.ota.bin`, flash" to "edit YAML in the add-on UI, compile with a Docker sibling ESPHome container, auto-create OTA job, confirm and flash."

First-load factory binaries (for initial USB flashing) are available for download but the add-on does not perform USB flashing itself.

---

## Scope

### In Scope

- YAML config storage per device under `/data/devices/`
- Shared `secrets.yaml` for all devices
- Auto-generated YAML scaffolds populated from topology data (esphome name, platform, board, framework, espnow component)
- CodeMirror-based YAML editor on a dedicated device config page (`#/device/{mac}/config`)
- UI-based YAML import (upload or paste)
- Docker sibling container orchestration for ESPHome compilation
- SSE streaming of build logs to the frontend
- Post-compile binary parsing, preflight validation, and auto-creation of a pending OTA job
- Factory binary download (`.bin` without OTA header) for first-load USB flashing
- Remote device configs only (not bridge configs)
- Single YAML file per device (no `!include` support)

### Out of Scope (Future)

- Bridge device YAML editing
- Multi-file YAML configs (`!include`, `packages:`)
- Batch compilation of multiple devices
- In-add-on USB/serial flashing
- Template library for new device configs
- ESPHome config validation endpoint (beyond what compile already does)
- Git-backed YAML versioning
- Multi-bridge support
- Entity display/control

---

## Decisions Summary

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Compilation approach | Docker sibling container (`docker_api: true`) | Matches official ESPHome add-on pattern. Clean separation. No Alpine/musl toolchain issues. |
| 2 | YAML storage | Add-on owns YAML locally in `/data/devices/` | Persistent, self-contained, no external file dependencies. |
| 3 | Component source | Bundled in add-on Docker image | Always available, no runtime git or host mount dependency. Updating requires add-on image rebuild. |
| 4 | Path handling | Mirror compile.sh mount layout (`/config` + `/external`) | Zero YAML munging. WYSIWYG. User writes `path: ../components` and it works. |
| 5 | Secrets management | Single shared `/data/devices/secrets.yaml` | Matches ESPHome convention. Simple. |
| 6 | Container lifecycle | Ephemeral per-compile (`docker run --rm`) | No zombie container risk. On add-on startup, force-remove any stale container. PlatformIO cache persists on `/data` so rebuilds stay fast. |
| 7 | Build log streaming | Server-Sent Events (SSE) | Simple, auto-reconnect, works with FastAPI StreamingResponse. Compile logs are publish-only. |
| 8 | Compile-to-flash coupling | Auto-create pending OTA job after compile | Seamless workflow. User just confirms to flash. |
| 9 | Device-YAML mapping | Match by `esphome_name` from topology | Uses existing data. No manual association needed. |
| 10 | Flash transport | ESP-NOW OTA for updates, download-only factory binary for first load | ESP-NOW OTA is the primary path for remotes beyond WiFi range. |
| 11 | Compile granularity | One device at a time | Predictable resource usage. Queue can be added later. |
| 12 | YAML editor scope | Single YAML file per device | Keeps complexity low. No `!include` or `packages:` in V1. |
| 13 | ESPHome version | Default `latest`, user can pin tag in add-on options | Pragmatic for developer-focused tool. User can pin for reproducibility. |
| 14 | Config-device binding | Auto-populate scaffold from topology data | Scaffold provides a correct starting point. All YAML is fully editable. Preflight comparison after compile warns about mismatches. |
| 15 | Config scaffold | Auto-generate minimal scaffold from topology | Starting point only. User can modify all fields. Preflight is the safety net. |
| 16 | Bridge support | Remote configs only | Bridge firmware typically compiled and flashed separately via WiFi/serial. |
| 17 | Config import | UI-based YAML import/upload | Eases migration from existing ESPLR_V2 configs. |
| 18 | Docker security | Accept `docker_api: true` | Same as official ESPHome add-on. Acceptable for developer-focused tool. |

---

## UI Flow & Layout Specification

### Routes

Current:
- `#/` — Topology map
- `#/device/{mac}` — Device detail (diagnostics + OTA + flash history)
- `#/queue` — Queue manager
- `#/settings` — Settings

New:
- `#/device/{mac}/config` — **Device config page** (YAML editor + compile + install)
- `#/secrets` — **Secrets page** (shared secrets.yaml editor)

Add "Secrets" to the header nav bar.

### Topology Node Changes

Current node row (remotes only — bridge has no config buttons):
```
[status dot] [name + MAC] [metrics: uptime | RSSI | chip] [OTA indicator]
```

New node row:
```
[config badge] [status dot] [name + MAC] [metrics] [✏️ edit][📤 OTA] [OTA indicator]
```

**Config status badges** (left side, before status dot):
- No config → no badge (or subtle grey `—`)
- Has config → green `✓` dot
- Uncompiled changes → amber `●` (config saved but no compiled binary matches it)
- Compiled unflashed → blue `↑` (binary ready, not yet flashed or flash pending)

**Action buttons** (right side, after metrics):
- ✏️ pencil icon → navigates to `#/device/{mac}/config`
- 📤 upload icon → navigates to `#/device/{mac}` (existing device detail / OTA page)

Both buttons are **hidden on the bridge node** (bridge configs not supported in V1).

Clicking the node name/area still navigates to `#/device/{mac}` as before.

The edit and OTA icons are small icon buttons styled consistently with the existing node row aesthetic (2px solid border, box-shadow, hover accent background).

### Device Detail Page (`#/device/{mac}`) — Minimal Changes

The existing device detail page stays **exactly as-is** (diagnostics, OTA box, flash history). The only addition:

- A small "Edit Config" link/button in the hero section header, navigating to `#/device/{mac}/config`.
- Only shown for remote devices, not the bridge.

### Device Config Page (`#/device/{mac}/config`)

**Header:**
```
← Back to device          living-room-light
                          AA:BB:CC:DD:EE:FF · ESP32-C3 · online
```
Back link navigates to `#/device/{mac}`.

**State: No Config**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│        No configuration yet for this device.            │
│                                                         │
│        [ Create Config ]     [ Import YAML ]            │
│                                                         │
│    Create Config generates a minimal scaffold             │
│    populated from this device's topology data.            │
│    Import lets you paste or upload an existing YAML.     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- **Create Config** → `POST /api/devices/{mac}/config` with `scaffold: true` → loads scaffold into editor
- **Import YAML** → file picker or paste dialog → `POST /api/devices/{mac}/config/import` → loads imported content

**State: Editor (config loaded)**
```
┌─────────────────────────────────────────────────────────┐
│ ← Back    living-room-light  ·  ESP32-C3               │
├─────────────────────────────────────────────────────────┤
│ ┌── CodeMirror Editor (full YAML) ──────────────────┐   │
│ │                                                     │  │
│ │  esphome:                                           │  │
│ │    name: living-room-light                           │  │
│ │                                                     │  │
│ │  esp32:                                             │  │
│ │    board: esp32-c3-devkitm-1                        │  │
│ │    framework:                                       │  │
│ │      type: esp-idf                                  │  │
│ │                                                     │  │
│ │  espnow_lr_remote:                                  │  │
│ │    network_id: !secret network_id                   │  │
│ │    psk: !secret psk                                 │  │
│ │    ota_over_espnow: true                            │  │
│ │    espnow_mode: lr                                  │  │
│ │                                                     │  │
│ │  # Add your sensors, switches, etc. below          │  │
│ │  logger:                                            │  │
│ │    level: DEBUG                                     │  │
│ │  sensor:                                            │  │
│ │    - platform: adc                                  │  │
│ │  ...                                                │  │
│ │                                                     │  │
│ └─────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  [Save]  [Compile & Install]           [Secrets ⚙]       │
│                                                          │
│  Status: saved · no compile yet                          │
└─────────────────────────────────────────────────────────┘
```

- **Full YAML editor** — CodeMirror with YAML syntax highlighting. All content is editable. The scaffold provides a correct starting point, but the user can modify any field.
- **Save** → `PUT /api/devices/{mac}/config`. Shows "Saving..." then "Saved ✓".
- **Compile & Install** → `POST /api/devices/{mac}/compile`. Triggers compile flow.
- **Secrets ⚙** → navigates to `#/secrets`.

**State: Compiling**
```
│  [Saved ✓]  [Compiling... ]           [Secrets ⚙]        │
│                                                          │
│  ┌── Build Log ──────────────────────────────────────┐   │
│  │ INFO ESPHome 2025.5.0                             │   │
│  │ INFO Compiling living-room-light.yaml...           │   │
│  │ ...                                               │   │
│  └───────────────────────────────────────────────────┘   │
```

- Build log streams via SSE in a scrollable terminal-style div.
- Compile & Install button disabled, showing "Compiling...".
- Cancel button appears during compile.

**State: Compile Success → Preflight**
```
│  [Save]  [Compile & Install]           [Secrets ⚙]        │
│                                                          │
│  ✓ Build successful                                      │
│    living-room-light v1.2.3 · 2026-05-02 · ESP32-C3     │
│    OTA: 487 KB · Factory: 1.2 MB                         │
│                                                          │
│  ┌── Preflight ─────────────────────────────────────┐   │
│  │ Name:     living-room-light       MATCH           │   │
│  │ Build:    NEWER +2d                               │   │
│  │ Chip:     ESP32-C3              MATCH              │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  [ ▶ Flash via ESP-NOW ]    [ ↓ Download factory .bin ]   │
│                                                          │
│  Flashing begins immediately. You will be redirected to   │
│  the device page to monitor progress.                     │
```

- **Flash via ESP-NOW** → auto-creates pending OTA job, auto-confirms flash start → navigates to `#/device/{mac}` where existing `<esp-ota-progress>` component shows the flashing progress.
- **Download factory .bin** → `GET /api/devices/{mac}/firmware/download` → browser download.

**State: Compile Failed**
```
│  [Save]  [Compile & Install]           [Secrets ⚙]        │
│                                                          │
│  ✗ Build failed                                          │
│                                                          │
│  ┌── Build Log ──────────────────────────────────────┐   │
│  │ ERROR 'sensor' is not a valid component...        │   │
│  │ ERROR Config validation failed                    │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  Fix the YAML above and try again.                        │
```

- Build log stays visible showing the error.
- User edits YAML and re-compiles.

### Secrets Page (`#/secrets`)

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to topology               Secrets                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ wifi_ssid: "MyNetwork"                              │  │
│ │ wifi_password: "MyPassword"                        │  │
│ │ mqtt_broker: "homeassistant.local"                  │  │
│ │ ota_password: "securepassword123"                  │  │
│ │ network_id: "my_network"                           │  │
│ │ psk: "my_psk_key"                                  │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                         │
│ [Save]                                                   │
│                                                         │
│ ⚠ These secrets are stored in plaintext. Access is        │
│   protected by Home Assistant ingress authentication.     │
│                                                         │
│ ⚠ Missing keys referenced by device configs will         │
│   cause compile failures.                                │
└─────────────────────────────────────────────────────────┘
```

- Simple monospace textarea (not CodeMirror).
- Warnings about missing keys: if a device YAML references `!secret wifi_ssid` and that key doesn't exist in secrets.yaml, show a warning.
- `PUT /api/secrets` to save.

### Flash Hand-off

When the user clicks **Flash via ESP-NOW** on the config page:

1. Frontend calls `POST /api/devices/{mac}/compile/start-flash` (or equivalent — the backend auto-confirms the pending OTA job created after compile).
2. On success response, navigate to `#/device/{mac}`.
3. The existing `<esp-ota-progress>` component picks up the active job and shows progress.
4. The device detail page works as before for monitoring the flash.

The config page does NOT reimplement OTA progress display. It hands off to the existing device detail page.

### Component Structure

New files:
- `ui/src/pages/config-page.ts` — Full device config page (states: no-config, editor, compiling, preflight)
- `ui/src/components/config-editor.ts` — CodeMirror YAML editor (full file, fully editable)
- `ui/src/components/compile-status.ts` — Compile state machine, progress, preflight results
- `ui/src/components/compile-log-viewer.ts` — SSE-based terminal log viewer
- `ui/src/pages/secrets-page.ts` — Secrets editor page

Modified files:
- `ui/src/app.ts` — Add routes for `/device/{mac}/config` and `/secrets`, add Secrets nav button
- `ui/src/components/topology-node.ts` — Add config status badge + edit/OTA action buttons for remotes
- `ui/src/components/device-detail.ts` — Add "Edit Config" link in hero section
- `ui/src/api/client.ts` — Add config, compile, secrets API methods

---

## Assumptions

1. The ESPLR_V2 components directory structure is stable and backwards-compatible across minor versions.
2. The Docker socket is available at `/var/run/docker.sock` in the HA Supervisor environment (guaranteed when `docker_api: true` is set).
3. The `ghcr.io/esphome/esphome` image is pullable from the HA host's Docker daemon.
4. First compile after install requires pulling the ESPHome image (~500 MB+). The UI must show a "pulling image" state.
5. PlatformIO build cache stored at `/data/platformio_cache` and ESPHome build artifacts at `/data/devices/.esphome/` can grow to several GB. The UI must expose a "Clean Build Artifacts" action that wipes both directories. Incremental rebuilds are faster when caches are warm, so this is manual rather than automatic.
6. The user's HA instance has sufficient disk space under `/data` for configs, build cache, and firmware binaries.
7. The existing OTA worker, firmware store, and bin_parser pipeline are reused as-is for the flash step after compilation.
8. ESP-NOW OTA is the only flash transport for remote device updates. The add-on does not perform standard WiFi OTA or USB flashing.

---

## Constraints

1. **No `!include` or `packages:` support** — Single YAML file per device. If a user imports a config with `!include`, ESPHome compile will fail with a clear error.
2. **Remote configs only** — Bridge YAML editing is out of scope. Bridge firmware is typically flashed over WiFi/serial, not ESP-NOW OTA.
3. **One compile at a time** — No parallel compilation. The ESPHome container runs one `esphome compile` at a time.
4. **Remote device must be online for flash** — ESP-NOW OTA requires the device to be in the bridge topology. If offline, the auto-created job will require the device to come back online before flashing.
5. **Add-on image must be rebuilt to update components** — Bundled components are baked into the Docker image. Component updates require a new add-on release.
6. **Container lifecycle is ephemeral** — Each compile runs `docker run --rm`. No persistent container. On add-on startup, force-remove any stale container. PlatformIO cache persists on `/data/platformio_cache` so rebuilds stay fast.
7. **Secrets are stored in plaintext** — The `secrets.yaml` file is stored unencrypted in `/data/devices/secrets.yaml`. This matches ESPHome convention. Access is limited by HA ingress auth.
8. **No binary size validation in V1** — The add-on does not check compiled firmware size against the target device's flash partition. If a binary is too large for the OTA partition, the remote firmware will reject it during the ESP-NOW transfer. This is a safe failure mode (the device won't brick), just potentially time-consuming for a very large image over a slow radio link.

---

## Architecture

```text
User                    Add-on Backend                  Docker (ephemeral)
                        (FastAPI / port 8099)           (ESPHome container per-compile)
                          │                                │
 Edit YAML ───────────► │                                │
 Import YAML ──────────► │                                │
 Edit secrets ──────────► │                                │
                          │                                │
 Compile button ────────► │ docker run --rm ────────────► │
                          │   esphome compile             │
                          │◄── SSE log stream ─────────── │
                          │   (container removed on exit) │
                          │                                │
 Build success ──► Parse .ota.bin ──► firmware_store      │
                          │    + .bin (factory)            │
                          │                                │
                  Auto-create pending OTA job              │
                          │                                │
 User confirms flash ──► │ OTA worker ──► Bridge ──► ESP-NOW ──► Remote
                          │                                │
 User downloads ────────► │ Factory .bin (for USB)         │
```

### Volume Mounts for Compilation

When the ESPHome sibling container runs a compile:

```text
/data/devices/           → /config          (YAML configs + secrets.yaml)
/opt/espnow-tree/components/ → /external     (bundled ESPLR_V2 components)
/data/platformio_cache/  → /root/.platformio (PlatformIO build cache)
/data/devices/{name}/    → /config           (working dir for esphome compile)
```

The YAML file references `external_components: source: {type: local, path: ../components}`, which resolves to `/external/components` inside the container — matching the existing compile.sh convention.

### Chip Type to Board Mapping

The topology provides `chip_type` (integer). The scaffold generator maps this to ESPHome platform/board/framework:

| chip_type | ESPHome platform | ESPHome board | framework |
|-----------|-----------------|---------------|-----------|
| 1 (0x0001) | esp32 | esp32dev | esp-idf |
| 2 (0x0002) | esp32-s2 | esp32-s2-saola | esp-idf |
| 5 (0x0005) | esp32-c3 | esp32-c3-devkitm-1 | esp-idf |
| 9 (0x0009) | esp32-s3 | esp32-s3-devkitc-1 | esp-idf |
| 12 (0x000C) | esp32-c2 | esp32-c2-devkitm-1 | esp-idf |
| 13 (0x000D) | esp32-c6 | esp32-c6-devkitc | esp-idf |
| 16 (0x0010) | esp32-h2 | esp32-h2-devkitm-1 | esp-idf |
| 23 (0x0017) | esp32-c5 | esp32-c5-devkitc | esp-idf |

This mapping table lives in `yaml_scaffold.py` and is authoritative. Unknown chip types should block scaffold creation and show an error.

---

## Implementation Phases

### Phase 1 — Docker Infrastructure & Add-on Config

Foundation: Docker access, ESPHome container management, component bundling.

- [ ] **1.1** Add `docker_api: true` to `config.yaml`. This grants the add-on access to the Docker socket.
- [ ] **1.2** Add `docker` Python package to `requirements.txt` (official Docker SDK).
- [ ] **1.3** Add add-on options to `config.yaml` schema: `esphome_container_tag` (str, default `"latest"`) and `component_version` (str, default `"bundled"` — future use for git refs).
- [ ] **1.4** Copy ESPLR_V2 `components/` directory into the add-on Docker image at `/opt/espnow-tree/components/`. Update `Dockerfile` with a `COPY` line for the components. The components must be available at build time; they are baked into the image.
- [ ] **1.5** Create `app/compiler.py` with `ESPHomeCompiler` class:
  - `__init__`: Docker client, image tag from settings.
  - `cleanup_stale()`: On startup, force-remove any stale `esphome-espnow-tree-compiler` container. Called from `main.py` startup.
  - `ensure_image()`: Pull `ghcr.io/esphome/esphome:{tag}` if not present. Return pulling status for SSE.
  - `compile(config_name: str)`: Run `docker run --rm` with compile command. Stream stdout/stderr. Container is removed on exit.
  - `get_image_status()`: Check if ESPHome image is pulled and available.
- [ ] **1.6** Add `/data/platformio_cache` directory creation to `rootfs/etc/cont-init.d/00-prepare.sh` or `app/main.py` startup.
- [ ] **1.7** Add `/data/devices` directory creation to startup. Create default `secrets.yaml` if not present.
- [ ] **1.8** Test: verify Docker socket access from add-on container, verify image pull, verify container creation with correct mounts.

---

### Phase 2 — YAML Storage & Scaffolding

YAML config CRUD, scaffold generation, secrets management.

- [ ] **2.1** Create `app/yaml_store.py` with `YAMLStore` class:
  - `__init__(root: Path)`: Root is `/data/devices`.
  - `get_config(esphome_name: str) -> str | None`: Read `{root}/{esphome_name}/{esphome_name}.yaml`. Return raw text or None.
  - `save_config(esphome_name: str, content: str)`: Write YAML text. Create directory if needed. No locked field validation — all content is user-editable.
  - `delete_config(esphome_name: str)`: Remove config file and directory.
  - `list_configs() -> list[str]`: List all esphome_name directories that have a `.yaml` file.
  - `get_secrets() -> str`: Read `{root}/secrets.yaml`. Return raw text or empty string.
  - `save_secrets(content: str)`: Write `{root}/secrets.yaml`.
  - `get_factory_binary(esphome_name: str) -> Path | None`: Return path to compiled factory binary if it exists.
  - `get_ota_binary(esphome_name: str) -> Path | None`: Return path to compiled OTA binary if it exists.
- [ ] **2.2** Create `app/yaml_scaffold.py` with `generate_scaffold(node: dict) -> str`:
  - Takes a topology device node (with `esphome_name`, `chip_type`, `chip_name`, `firmware_version`, etc.).
  - Maps `chip_type` to ESPHome platform/board/framework using the mapping table.
  - Generates a minimal valid YAML config populated from topology data.
  - Includes `espnow_lr_remote` component with `ota_over_espnow: true`, `network_id: !secret network_id`, `psk: !secret psk`, `espnow_mode: lr`.
  - Returns the YAML string. All content is editable — the scaffold is a starting point only.
  - Raises `ValueError` for unknown chip types.
- [ ] **2.3** Add `chip_type_to_board` mapping function to `yaml_scaffold.py`:
  - Maps the integer `chip_type` from topology to `{platform, board, framework}` dict.
  - Returns `None` for unknown chip types.
  - This is the single source of truth for the mapping.

---

### Phase 3 — Compilation API

Backend endpoints to trigger, monitor, and manage ESPHome compilation.

- [ ] **3.1** Create `app/compile_store.py` with `CompileStore` class:
  - Stores compile state in `/data/devices/{esphome_name}/compile_status.json`.
  - States: `idle`, `pulling_image`, `creating_container`, `compiling`, `success`, `failed`.
  - `get_status(esphome_name) -> dict`: Return current compile status, log path, binary paths, error.
  - `set_status(esphome_name, status, **kwargs)`: Write status file.
  - `clear_status(esphome_name)`: Reset to idle.
- [ ] **3.2** Add compile endpoints to `server.py`:
  - `GET /api/devices/{mac}/config` — Read device YAML config. 404 if no config exists.
  - `PUT /api/devices/{mac}/config` — Save/update device YAML config. No locked field validation — all content is user-editable. Creates directory if none exists.
  - `DELETE /api/devices/{mac}/config` — Delete device config.
  - `POST /api/devices/{mac}/config/import` — Accept multipart file upload or plain text body. Save as device config. No locked field validation — imported content is saved as-is.
  - `POST /api/devices/{mac}/compile` — Trigger compilation. Validates config exists. Checks no other compile is running. Sets status to `pulling_image` → `compiling`. Returns job ID for polling.
  - `GET /api/devices/{mac}/compile/status` — Return current compile status, percent (estimated from log lines), error if any.
  - `GET /api/devices/{mac}/compile/logs` — SSE endpoint. Streams build logs in real-time.
  - `POST /api/devices/{mac}/compile/cancel` — Cancel running compile. Kill the container exec process.
  - `GET /api/secrets` — Read shared secrets.yaml.
  - `PUT /api/secrets` — Write shared secrets.yaml.
  - `GET /api/compile/container/status` — Check if ESPHome image is pulled. No persistent container exists (ephemeral per-compile).
  - `DELETE /api/compile/container` — Remove any stale container, clear PlatformIO cache and ESPHome build artifacts. Recovery action.
  - `DELETE /api/compile/artifacts` — Delete `/data/platformio_cache/*` and `/data/devices/.esphome/*` to free disk space. Returns the bytes freed.
- [ ] **3.3** Implement SSE log streaming in `compiler.py`:
  - `stream_logs(esphome_name: str) -> AsyncGenerator[str, None]`: Attach to container stdout during compile. Yield lines as SSE events. Container is ephemeral (`--rm`), logs stream in real-time.
  - On compile completion: parse exit code, set compile status to `success` or `failed`. Container is auto-removed by Docker on exit.
- [ ] **3.4** Add `compile_device(esphome_name: str) -> CompileResult` to `compiler.py`:
  - Orchestrates: ensure image → `docker run --rm` with compile command → stream logs → capture result.
  - On success: locate output binaries in the ESPHome build output path (inside `/data/devices/.esphome/build/`).
  - Copy `.ota.bin` to `/data/firmware/active/{compile_id}.bin`.
  - Copy factory `.bin` to `/data/devices/{esphome_name}/{esphome_name}.factory.bin`.
  - Run `bin_parser.parse_firmware()` on the `.ota.bin` for preflight metadata.
  - Return `CompileResult` with paths, metadata, and success status.
- [ ] **3.5** In `server.py`, `POST /api/devices/{mac}/compile`:
  - After successful compile, auto-create a `PENDING_CONFIRM` OTA job using the existing `db.create_job()` and `firmware_store` flow.
  - Include preflight comparison against the device's current topology data.
  - Return the job info alongside the compile result.

---

### Phase 4 — Compile Result Integration with OTA Pipeline

Connect compiled binaries to the existing firmware store and OTA worker.

- [ ] **4.1** In `compiler.py`, after ESPHome compile succeeds:
  - Locate `<esphome_name>.ota.bin` in the build output path inside `/data/devices/{esphome_name}/.esphome/build/`.
  - Compute MD5 and size using `firmware_store` patterns.
  - Parse firmware info using `bin_parser.parse_firmware()`.
  - Move the `.ota.bin` to `/data/firmware/active/` (or create a symlink/reference).
  - Keep the factory binary at `/data/devices/{esphome_name}/{esphome_name}.factory.bin` for download.
- [ ] **4.2** Auto-create pending OTA job:
  - After compile success, call `db.create_job()` with:
    - `mac`: target device MAC
    - `status`: `PENDING_CONFIRM`
    - `firmware_path`: path to the `.ota.bin` in active dir
    - `firmware_name`: `{esphome_name}.ota.bin`
    - `firmware_size`, `firmware_md5`, `parsed_*` fields from bin_parser
    - `old_firmware_version`, `old_project_name` from topology
    - `preflight_warnings` from `_preflight_comparison()`
  - This reuses the entire existing upload/confirm/flash pipeline unchanged.
- [ ] **4.3** Factory binary download endpoint:
  - `GET /api/devices/{mac}/firmware/download` — Serve the factory binary as a file download.
  - Returns `FileResponse` with the `.factory.bin` file.
  - 404 if no config exists or no factory binary has been compiled yet.
- [ ] **4.4** Handle compile failures:
  - Set compile status to `failed`.
  - Store error log at `/data/devices/{esphome_name}/compile_error.log`.
  - Return the error log in the status endpoint.
  - Do not create an OTA job on failure.
  - User can view the error in the UI and fix their YAML.

---

### Phase 5 — Frontend: Config Page & YAML Editor

Full-page config editor at `#/device/{mac}/config` route with CodeMirror and compile/install flow.

- [ ] **5.1** Create `ui/src/pages/config-page.ts` as a LitElement:
  - Full page replacement (not embedded in device detail).
  - Header with back link to `#/device/{mac}`, device name, MAC, chip, online status.
  - State machine: `no_config` → `editor` → `compiling` → `success`/`failed`.
  - **No config state**: "Create Config" and "Import YAML" buttons centered on page.
  - **Editor state**: full CodeMirror editor + bottom action bar.
  - **Compiling state**: disabled buttons, build log viewer visible.
  - **Success state**: summary card, preflight comparison, "Flash via ESP-NOW" and "Download factory .bin" buttons.
  - **Failed state**: build log visible with error, "Fix and retry" guidance.
  - "Flash via ESP-NOW" auto-creates pending OTA job, auto-confirms flash, then navigates to `#/device/{mac}`.
- [ ] **5.2** Create `ui/src/components/config-editor.ts` as a LitElement:
  - CodeMirror YAML editor (`@codemirror/lang-yaml` and `@codemirror/view` packages).
  - Full file editing — all content is editable. The scaffold provides a correct starting point, but the user can modify any field.
  - Warn on save if `!include` or `!packages` directives are detected (these will fail at compile time).
- [ ] **5.3** Add `js-yaml` and CodeMirror dependencies to `ui/package.json`:
  - `js-yaml` for client-side YAML validation.
  - `@codemirror/lang-yaml`, `@codemirror/view`, `@codemirror/state`, `@codemirror/theme-one-dark` (or similar theme).
- [ ] **5.4** Implement scaffold creation UI:
  - "Create Config" button on config page (no-config state) → `POST /api/devices/{mac}/config` with `scaffold: true`.
  - Backend generates scaffold, saves it, returns the YAML.
  - UI transitions to editor state with the new scaffold.
- [ ] **5.5** Implement config import UI:
  - "Import YAML" button on config page (no-config state) and in editor toolbar.
  - File picker or paste dialog.
  - Upload → `POST /api/devices/{mac}/config/import` with file content.
  - No locked field validation — imported content is saved as-is. All content is editable.
- [ ] **5.6** Create `ui/src/pages/secrets-page.ts` as a LitElement:
  - Simple monospace textarea (not CodeMirror) for secrets.yaml.
  - `GET /api/secrets` to load, `PUT /api/secrets` to save.
  - Save button with "Saved ✓" confirmation.
  - Warning banners about plaintext storage and missing key references.
  - Back link to topology.
- [ ] **5.7** Update `ui/src/app.ts`:
  - Add route for `#/device/{mac}/config` → render `<esp-config-page>`.
  - Add route for `#/secrets` → render `<esp-secrets-page>`.
  - Add "Secrets" to header nav bar (between Queue and Settings).

---

### Phase 6 — Frontend: Compile Status, Log Viewer & API Client

Compile trigger, progress display, SSE log viewer, and API methods.

- [ ] **6.1** Create `ui/src/components/compile-status.ts` as a LitElement:
  - "Compile & Install" button (disabled if no config or compile in progress).
  - On click: `POST /api/devices/{mac}/compile`.
  - State machine: `idle` → `pulling_image` → `creating_container` → `compiling` → `success`/`failed`.
  - `pulling_image` state: show "Pulling ESPHome Docker image (this may take a few minutes on first run)...".
  - `compiling` state: show build log viewer with spinner.
  - `success` state: show summary card (firmware version, build date, chip, sizes) + preflight comparison table matching existing OTA preflight style + "Flash via ESP-NOW" and "Download factory .bin" buttons.
  - `failed` state: show build log with error highlighted + "Fix YAML and retry" guidance.
  - "Flash via ESP-NOW" auto-confirms the pending OTA job and navigates to `#/device/{mac}`.
  - "Download factory .bin" triggers `GET /api/devices/{mac}/firmware/download`.
- [ ] **6.2** Create `ui/src/components/compile-log-viewer.ts` as a LitElement:
  - SSE connection to `GET /api/devices/{mac}/compile/logs`.
  - Auto-scrolling terminal-style div (dark background, monospace font).
  - ANSI color code stripping (ESPHome uses colored output).
  - Pause/resume scroll button.
  - Clear button.
  - Max height with overflow scroll.
- [ ] **6.3** Add SSE client method to `ui/src/api/client.ts`:
  - `streamCompileLogs(mac: string, onLog: (line: string) => void, onError: (err: Error) => void): EventSource` — Returns an EventSource for the SSE endpoint. Caller manages lifecycle.
- [ ] **6.4** Add compile and config API methods to `ui/src/api/client.ts`:
  - `getConfig(mac: string)` → `GET /api/devices/{mac}/config`
  - `saveConfig(mac: string, content: string)` → `PUT /api/devices/{mac}/config`
  - `deleteConfig(mac: string)` → `DELETE /api/devices/{mac}/config`
  - `importConfig(mac: string, content: string)` → `POST /api/devices/{mac}/config/import`
  - `createScaffold(mac: string)` → `POST /api/devices/{mac}/config` (with scaffold flag)
  - `compileDevice(mac: string)` → `POST /api/devices/{mac}/compile`
  - `getCompileStatus(mac: string)` → `GET /api/devices/{mac}/compile/status`
  - `cancelCompile(mac: string)` → `POST /api/devices/{mac}/compile/cancel`
  - `getSecrets()` → `GET /api/secrets`
  - `saveSecrets(content: string)` → `PUT /api/secrets`
  - `getContainerStatus()` → `GET /api/compile/container/status`
  - `deleteContainer()` → `DELETE /api/compile/container`
  - `downloadFactoryBinary(mac: string)` → `GET /api/devices/{mac}/firmware/download` (returns blob URL)

---

### Phase 7 — Frontend: Topology, Device Detail & Integration

Wire config page entry points into topology nodes and device detail.

- [ ] **7.1** Update `ui/src/components/topology-node.ts`:
  - Add config status badge before status dot (grey=none, green=has config, amber=uncompiled changes, blue=compiled unflashed). Badge state fetched from a new `/api/devices/{mac}/config/status` endpoint or included in topology data.
  - Add ✏️ edit icon button after metrics area → navigates to `#/device/{mac}/config`. Only shown for remotes (hops > 0).
  - Add 📤 upload icon button next to edit icon → navigates to `#/device/{mac}` (existing device detail page).
  - Both icons are small buttons with `border: 2px solid`, `box-shadow`, same style as existing node buttons but smaller (icon-only, no text).
  - Hidden on bridge node (hops == 0).
- [ ] **7.2** Update `ui/src/components/device-detail.ts`:
  - Add "Edit Config" link/button in the hero section (top right, next to device name and status).
  - Links to `#/device/{mac}/config`.
  - Only shown for remote devices (not bridge).
- [ ] **7.3** Add settings section for compile infrastructure:
  - ESPHome container tag (default: `latest`) with editable text input.
  - Container status indicator: shows "image pulled" or "image not found" (no persistent container — ephemeral per-compile).
  - "Clean Build Artifacts" button → `DELETE /api/compile/artifacts`. Wipes `/data/platformio_cache/*` and `/data/devices/.esphome/*`. Warns the user that next compile will be slower (no cache).
  - "Pull ESPHome image" button → forces image pull before next compile.
- [ ] **7.4** Add config status to topology data:
  - Extend `/api/bridge/topology.json` proxy or add `/api/devices/{mac}/config/status` endpoint that returns config state for each device (no_config, has_config, uncompiled_changes, compiled_ready).
  - Poll alongside topology (every 5s) to update badges.
- [ ] **7.5** Wire flash hand-off from config page:
  - After clicking "Flash via ESP-NOW" on config page, the auto-confirmed pending OTA job is already created by the backend after compile.
  - Frontend navigates to `#/device/{mac}` where `<esp-ota-progress>` shows the active flash.
  - No new OTA progress component needed — reuse existing `<esp-ota-box>` and `<esp-ota-progress>`.

---

### Phase 8 — Edge Cases, Error Handling & Recovery

- [ ] **8.1** Compile while another compile is running: Reject with 409. Only one compile at a time.
- [ ] **8.2** Container not available: If Docker socket is inaccessible or image pull fails, return clear error message with troubleshooting steps.
- [ ] **8.3** Config with `!include` or `!packages`: ESPHome compile will fail. The config editor should warn on save if these directives are detected in the YAML text.
- [ ] **8.4** Secrets.yaml missing `!secret` keys: ESPHome compile will fail with a clear error. The secrets editor should show a warning indicator if config references keys that don't exist in secrets.
- [ ] **8.5** Compile produces wrong chip binary: The preflight comparison (reusing `_preflight_comparison()`) will catch this and show warnings in the pending OTA job. The scaffold generates the correct chip/board, but since all fields are editable, the user could change them — preflight warns if the compiled chip doesn't match the topology.
- [ ] **8.6** Device goes offline between compile and flash: The OTA worker's existing rejoin logic handles this. The pending confirm job will show a warning.
- [ ] **8.7** Add-on restart during compile: On startup, force-remove any stale `esphome-espnow-tree-compiler` container. If a compile was in progress, mark its compile status as `failed` (output lost). User must retry.
- [ ] **8.8** Build artifacts cleanup: "Clean Build Artifacts" button in settings removes `/data/platformio_cache/*` and `/data/devices/.esphome/*`. Since the container is ephemeral, there is no container to remove. Next compile starts fresh (image pull still cached).
- [ ] **8.9** Unknown chip type in topology: Block scaffold creation. Show error "Unsupported chip type: X. Create a config manually or use import." Allow manual YAML import for unsupported chips.
- [ ] **8.10** Container image pull timeout: Set a configurable pull timeout (default 300s). If exceeded, fail the compile with a clear message suggesting to check internet connectivity and Docker availability.

---

### Phase 9 — Testing & Validation

- [ ] **9.1** Create a config for an online remote device. Verify scaffold generation with correct chip/board/framework from topology data.
- [ ] **9.2** Edit the config in the YAML editor. Save. Verify content round-trips correctly.
- [ ] **9.3** Click Compile. Verify ESPHome image pull (first time), container start, compile execution.
- [ ] **9.4** Verify SSE log streaming shows real-time compile output.
- [ ] **9.5** Verify successful compile creates `.ota.bin` in `/data/firmware/active/` and `.factory.bin` in `/data/devices/`.
- [ ] **9.6** Verify auto-created pending OTA job appears in device detail with preflight comparison.
- [ ] **9.7** Confirm flash. Verify existing OTA worker feeds the compiled binary to the bridge over ESP-NOW.
- [ ] **9.8** Download factory binary. Verify it's a valid full-flash image (not OTA-only).
- [ ] **9.9** Import an existing ESPLR_V2 YAML. Verify content is saved as-is (fully editable).
- [ ] **9.10** Edit secrets.yaml. Add missing key. Compile. Verify ESPHome error about missing secret is surfaced.
- [ ] **9.11** Compile with a YAML that has wrong board for the device chip type. Verify preflight warning.
- [ ] **9.12** Compile while another compile is running. Verify 409 error.
- [ ] **9.13** Cancel a running compile. Verify Docker container is killed, status set to failed, container is removed.
- [ ] **9.14** Clean build artifacts. Verify `.esphome/` and `/data/platformio_cache/` are deleted. Verify no stale container remains.
- [ ] **9.15** Restart add-on during idle. Verify no stale container exists (ephemeral, no persistent container).
- [ ] **9.16** Restart add-on during compile. Verify stale container is force-removed, compile is marked failed on recovery.
- [ ] **9.17** Test with ESPHome container image pin (e.g., `2025.5.0`). Verify pinned tag is used.
- [ ] **9.18** Verify topology config badge appears for devices with stored configs.

---

## Key Files

| File | Phase | ~Lines | Purpose |
|------|-------|--------|---------|
| `config.yaml` | 1 | +8 | Add `docker_api: true`, `esphome_container_tag`, `component_version` options |
| `Dockerfile` | 1 | +3 | Copy ESPLR_V2 `components/` into image |
| `requirements.txt` | 1 | +1 | Add `docker` package |
| `rootfs/etc/cont-init.d/00-prepare.sh` | 1 | +5 | Create `/data/devices/`, `/data/platformio_cache/`, default `secrets.yaml` |
| `app/compiler.py` | 1-4 | ~250 | ESPHome Docker container lifecycle, compile orchestration, log streaming |
| `app/compile_store.py` | 3 | ~80 | Compile status persistence per device |
| `app/yaml_store.py` | 2 | ~100 | YAML config CRUD, secrets management |
| `app/yaml_scaffold.py` | 2 | ~80 | Scaffold generation, chip mapping |
| `app/server.py` | 3-4 | ~200 | New config, compile, secrets, container, download endpoints |
| `ui/src/pages/config-page.ts` | 5 | ~400 | Full config page with states: no-config, editor, compiling, preflight |
| `ui/src/components/config-editor.ts` | 5 | ~300 | CodeMirror YAML editor (full file, fully editable) |
| `ui/src/components/compile-status.ts` | 6 | ~150 | Compile state machine, progress, preflight results, flash hand-off |
| `ui/src/components/compile-log-viewer.ts` | 6 | ~120 | SSE terminal log viewer |
| `ui/src/pages/secrets-page.ts` | 5 | ~100 | Secrets editor page |
| `ui/src/app.ts` | 5 | +20 | New routes, Secrets nav button |
| `ui/src/components/topology-node.ts` | 7 | +40 | Config status badge, edit/OTA action buttons |
| `ui/src/components/device-detail.ts` | 7 | +10 | "Edit Config" link in hero |
| `ui/src/api/client.ts` | 6 | +80 | New API methods for config, compile, secrets, download |

---

## Docker Sibling Container Details

### Container Name
`esphome-espnow-tree-compiler` (but always run with `--rm`, so it doesn't persist)

### Compilation: `docker run --rm`
```python
container = docker_client.containers.run(
    image=f"ghcr.io/esphome/esphome:{tag}",
    name="esphome-espnow-tree-compiler",
    volumes={
        "/data/devices": {"bind": "/config", "mode": "rw"},
        "/opt/espnow-tree/components": {"bind": "/external", "mode": "ro"},
        "/data/platformio_cache": {"bind": "/root/.platformio", "mode": "rw"},
    },
    command=f"esphome compile {esphome_name}.yaml",
    working_dir="/config",
    detach=True,
    remove=True,
    stdout=True,
    stderr=True,
)
```

### Startup Cleanup
On add-on startup, force-remove any stale container:
```python
try:
    stale = docker_client.containers.get("esphome-espnow-tree-compiler")
    stale.remove(force=True)
except docker.errors.NotFound:
    pass
```

### Lifecycle
- **Every compile**: `docker run --rm` with compile command. Container is created, compiles, exits, and is removed automatically. No persistent container.
- **On add-on startup**: Force-remove any stale `esphome-espnow-tree-compiler` container that might remain from a previous session or crash.
- **Config change**: No container rebuild needed. Config is on `/data/devices` which is always mounted at compile time.
- **Clear cache**: Delete `/data/platformio_cache/*` and `/data/devices/.esphome/*`. No container to remove since it's ephemeral.

### Build Output Path
Inside the container, ESPHome outputs to:
```
/config/.esphome/build/{esphome_name}/.pioenvs/{esphome_name}/firmware.ota.bin
/config/.esphome/build/{esphome_name}/.pioenvs/{esphome_name}/firmware.factory.bin
```

Since `/data/devices` is mounted at `/config`, these are accessible at:
```
/data/devices/.esphome/build/{esphome_name}/.pioenvs/{esphome_name}/firmware.ota.bin
/data/devices/.esphome/build/{esphome_name}/.pioenvs/{esphome_name}/firmware.factory.bin
```

---

## Risk Notes

- **Component version coupling**: Bundling ESPLR_V2 components in the add-on image means component updates require an add-on image rebuild. Future: support a `component_version` config option that pulls a specific git ref at runtime.
- **One compile at a time**: The sibling container can only run one `esphome compile` at a time. If a second compile is requested, it must wait or be rejected (409).
- **First pull latency**: The first compile will be slow (pulling ~500 MB+ ESPHome image). The UI must handle this gracefully with a "Pulling ESPHome image..." state and progress indication.
- **PlatformIO cache size**: Build caches can grow to several GB. The settings page should show cache size and offer a "Clear Build Cache" action.
- **`!include` fragility**: ESPHome configs that use `!include` or `!packages` will fail at compile time because only the single device YAML and `secrets.yaml` are in `/config`. The editor should detect these directives and warn on save.
- **Container management edge cases**: If the Docker daemon is unavailable, the add-on must degrade gracefully. Compile endpoints should return clear errors. The rest of the add-on (topology, OTA flash) must continue to work.
- **Secrets security**: `secrets.yaml` is stored in plaintext under `/data`. This matches ESPHome convention. HA ingress auth protects access. The UI should note this.