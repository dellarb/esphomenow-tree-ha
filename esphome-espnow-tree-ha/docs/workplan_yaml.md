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
- Auto-generated YAML scaffolds with locked device-critical fields (esphome name, platform, board, framework, espnow component)
- CodeMirror-based YAML editor in the device detail page
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
| 6 | Container lifecycle | Start when compiling, stop when idle, don't remove | No idle resource consumption. Warm starts are fast (container kept, just stopped). |
| 7 | Build log streaming | Server-Sent Events (SSE) | Simple, auto-reconnect, works with FastAPI StreamingResponse. Compile logs are publish-only. |
| 8 | Compile-to-flash coupling | Auto-create pending OTA job after compile | Seamless workflow. User just confirms to flash. |
| 9 | Device-YAML mapping | Match by `esphome_name` from topology | Uses existing data. No manual association needed. |
| 10 | Flash transport | ESP-NOW OTA for updates, download-only factory binary for first load | ESP-NOW OTA is the primary path for remotes beyond WiFi range. |
| 11 | Compile granularity | One device at a time | Predictable resource usage. Queue can be added later. |
| 12 | YAML editor scope | Single YAML file per device | Keeps complexity low. No `!include` or `packages:` in V1. |
| 13 | ESPHome version | Default `latest`, user can pin tag in add-on options | Pragmatic for developer-focused tool. User can pin for reproducibility. |
| 14 | Config-device binding | Auto-populate and lock device-critical fields | Eliminates chip/name mismatches. Board, chip, framework, esphome name are inferred from topology and non-editable. |
| 15 | Config scaffold | Auto-generate minimal scaffold with locked header | Clean starting point. User adds entities. |
| 16 | Bridge support | Remote configs only | Bridge firmware typically compiled and flashed separately via WiFi/serial. |
| 17 | Config import | UI-based YAML import/upload | Eases migration from existing ESPLR_V2 configs. |
| 18 | Docker security | Accept `docker_api: true` | Same as official ESPHome add-on. Acceptable for developer-focused tool. |

---

## Assumptions

1. The ESPLR_V2 components directory structure is stable and backwards-compatible across minor versions.
2. The Docker socket is available at `/var/run/docker.sock` in the HA Supervisor environment (guaranteed when `docker_api: true` is set).
3. The `ghcr.io/esphome/esphome` image is pullable from the HA host's Docker daemon.
4. First compile after install requires pulling the ESPHome image (~500 MB+). The UI must show a "pulling image" state.
5. PlatformIO build cache stored at `/data/platformio_cache` can grow to several GB. The UI should expose a "clear cache" action.
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
6. **Container lifecycle is managed, not instant** — Starting a stopped ESPHome container takes a few seconds. First-time image pull can take minutes.
7. **Secrets are stored in plaintext** — The `secrets.yaml` file is stored unencrypted in `/data/devices/secrets.yaml`. This matches ESPHome convention. Access is limited by HA ingress auth.

---

## Architecture

```text
User                    Add-on Backend                  Docker Sibling
                        (FastAPI / port 8099)           (ESPHome container)
                          │                                │
 Edit YAML ───────────► │                                │
 Import YAML ──────────► │                                │
 Edit secrets ──────────► │                                │
                          │                                │
 Compile button ────────► │ docker start esphome ───────► │
                          │ docker exec esphome compile   │
                          │◄── SSE log stream ─────────── │
                          │                                │
                          │ docker stop esphome ◄──────── │ (on idle)
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
  - `__init__`: Docker client, container name (`esphome-espnow-tree-compiler`), image tag from settings.
  - `ensure_image()`: Pull `ghcr.io/esphome/esphome:{tag}` if not present. Return pulling status for SSE.
  - `ensure_container()`: Create container if not exists (mounts: `/data/devices:/config`, `/opt/espnow-tree/components:/external`, `/data/platformio_cache:/root/.platformio`). Start if stopped.
  - `stop_container()`: Stop (not remove) the container.
  - `remove_container()`: Remove the container.
  - `compile(config_name: str)`: Run `docker exec` with `esphome compile {config_name}.yaml`. Stream stdout/stderr.
  - `get_container_status()`: Check if container exists, is running, is stopped.
- [ ] **1.6** Add `/data/platformio_cache` directory creation to `rootfs/etc/cont-init.d/00-prepare.sh` or `app/main.py` startup.
- [ ] **1.7** Add `/data/devices` directory creation to startup. Create default `secrets.yaml` if not present.
- [ ] **1.8** Test: verify Docker socket access from add-on container, verify image pull, verify container creation with correct mounts.

---

### Phase 2 — YAML Storage & Scaffolding

YAML config CRUD, scaffold generation, secrets management.

- [ ] **2.1** Create `app/yaml_store.py` with `YAMLStore` class:
  - `__init__(root: Path)`: Root is `/data/devices`.
  - `get_config(esphome_name: str) -> str | None`: Read `{root}/{esphome_name}/{esphome_name}.yaml`. Return raw text or None.
  - `save_config(esphome_name: str, content: str)`: Write YAML text. Create directory if needed. Validate that locked header fields are present and unmodified.
  - `delete_config(esphome_name: str)`: Remove config file and directory.
  - `list_configs() -> list[str]`: List all esphome_name directories that have a `.yaml` file.
  - `get_secrets() -> str`: Read `{root}/secrets.yaml`. Return raw text or empty string.
  - `save_secrets(content: str)`: Write `{root}/secrets.yaml`.
  - `get_factory_binary(esphome_name: str) -> Path | None`: Return path to compiled factory binary if it exists.
  - `get_ota_binary(esphome_name: str) -> Path | None`: Return path to compiled OTA binary if it exists.
- [ ] **2.2** Create `app/yaml_scaffold.py` with `generate_scaffold(node: dict) -> str`:
  - Takes a topology device node (with `esphome_name`, `chip_type`, `chip_name`, `firmware_version`, etc.).
  - Maps `chip_type` to ESPHome platform/board/framework using the mapping table.
  - Generates a minimal valid YAML config with locked header fields.
  - Includes `espnow_lr_remote` component with `ota_over_espnow: true`, `network_id: !secret network_id`, `psk: !secret psk`, `espnow_mode: lr`.
  - Locked fields are wrapped in YAML comments marking them as auto-generated and non-editable.
  - Returns the YAML string.
  - Raises `ValueError` for unknown chip types.
- [ ] **2.3** Add `validate_locked_fields(esphome_name: str, yaml_content: str, node: dict) -> list[str]` to `yaml_scaffold.py`:
  - Parse the YAML content.
  - Check that `esphome.name`, `esp32.platform`, `esp32.board` (or equivalent), and `framework.type` match the expected values for the device.
  - Return list of warnings if locked fields have been modified.
  - Used on save to warn, not block.
- [ ] **2.4** Add `chip_type_to_board` mapping function to `yaml_scaffold.py`:
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
  - `PUT /api/devices/{mac}/config` — Save/update device YAML config. Validates locked fields match device. Creates directory and scaffold if none exists.
  - `DELETE /api/devices/{mac}/config` — Delete device config.
  - `POST /api/devices/{mac}/config/import` — Accept multipart file upload or plain text body. Save as device config. Validate locked fields.
  - `POST /api/devices/{mac}/compile` — Trigger compilation. Validates config exists. Checks no other compile is running. Sets status to `pulling_image` → `compiling`. Returns job ID for polling.
  - `GET /api/devices/{mac}/compile/status` — Return current compile status, percent (estimated from log lines), error if any.
  - `GET /api/devices/{mac}/compile/logs` — SSE endpoint. Streams build logs in real-time.
  - `POST /api/devices/{mac}/compile/cancel` — Cancel running compile. Kill the container exec process.
  - `GET /api/secrets` — Read shared secrets.yaml.
  - `PUT /api/secrets` — Write shared secrets.yaml.
  - `GET /api/compile/container/status` — Check ESPHome Docker container status (exists, running, stopped, image pulled).
  - `DELETE /api/compile/container` — Remove the ESPHome container and clear PlatformIO cache. Recovery action.
- [ ] **3.3** Implement SSE log streaming in `compiler.py`:
  - `stream_logs(esphome_name: str) -> AsyncGenerator[str, None]`: Attach to container stdout during compile. Yield lines as SSE events.
  - On compile completion: parse exit code, set compile status to `success` or `failed`.
- [ ] **3.4** Add `compile_device(esphome_name: str) -> CompileResult` to `compiler.py`:
  - Orchestrates: ensure image → ensure container started → write config files → docker exec compile → stream logs → capture result.
  - On success: locate output binaries in the ESPHome build output path (inside container mount).
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

### Phase 5 — Frontend: Config Editor

CodeMirror YAML editor with locked header display.

- [ ] **5.1** Create `ui/src/components/config-editor.ts` as a LitElement:
  - CodeMirror YAML editor (use `@codemirror/lang-yaml` and `@codemirror/view` packages).
  - Read-only header section showing locked fields (esphome name, platform, board, framework, chip type). Rendered as a separate block above the editor, styled distinctly.
  - Editable section for user-configurable YAML content (everything below the locked header).
  - Save button → `PUT /api/devices/{mac}/config`.
  - Import button → file upload dialog.
  - Create from scaffold button → `POST /api/devices/{mac}/config` with scaffold YAML.
  - Discard button → reload from server.
- [ ] **5.2** Add `yaml` parsing dependency to `ui/package.json`: `js-yaml` for client-side YAML validation on save.
- [ ] **5.3** Implement scaffold creation UI:
  - In device detail, if no config exists, show "Create Config" button.
  - Click → `POST /api/devices/{mac}/config` with `scaffold: true`.
  - Backend generates scaffold and saves it.
  - UI opens the config editor with the new scaffold.
- [ ] **5.4** Implement config import UI:
  - Button in config editor toolbar: "Import YAML"
  - Opens file picker or paste dialog.
  - Upload → `POST /api/devices/{mac}/config/import` with file content.
  - Backend validates locked fields, saves if valid.
  - If locked fields mismatch, return warnings — display in UI.
- [ ] **5.5** Implement secrets editor:
  - `GET /api/secrets` → display in a textarea (not CodeMirror — secrets should be simple key-value).
  - `PUT /api/secrets` → save on change.
  - Accessible from device detail settings or a dedicated "Secrets" section.
  - Warn if `!secret` references in config don't have corresponding keys in secrets.yaml.

---

### Phase 6 — Frontend: Compile Status & Log Viewer

Compile trigger, progress, and log display.

- [ ] **6.1** Create `ui/src/components/compile-status.ts` as a LitElement:
  - Compile button: "Compile & Flash" (disabled if no config exists, or if compile already in progress).
  - On click: `POST /api/devices/{mac}/compile`.
  - State machine: `idle` → `pulling_image` → `creating_container` → `compiling` → `success`/`failed`.
  - Progress indicator: show current state label. During `compiling`, show an indeterminate spinner with log output.
  - On `pulling_image`: show "Pulling ESPHome Docker image (this may take a few minutes on first run)...".
  - On `success`: show summary (firmware version, build date, chip, size) and "Review & Flash" button that scrolls to the OTA box showing the pending confirm job.
- [ ] **6.2** Create `ui/src/components/compile-log-viewer.ts` as a LitElement:
  - SSE connection to `GET /api/devices/{mac}/compile/logs`.
  - Auto-scrolling terminal-style log output.
  - ANSI color code stripping (ESPHome uses colored output).
  - Pause/resume scroll button.
  - Clear button.
- [ ] **6.3** Add SSE client method to `ui/src/api/client.ts`:
  - `streamCompileLogs(mac: string, onLog: (line: string) => void, onError: (err: Error) => void): EventSource` — Returns an EventSource for the SSE endpoint. Caller manages lifecycle.
- [ ] **6.4** Add compile API methods to `ui/src/api/client.ts`:
  - `getConfig(mac: string)` → `GET /api/devices/{mac}/config`
  - `saveConfig(mac: string, content: string)` → `PUT /api/devices/{mac}/config`
  - `deleteConfig(mac: string)` → `DELETE /api/devices/{mac}/config`
  - `importConfig(mac: string, content: string)` → `POST /api/devices/{mac}/config/import`
  - `compileDevice(mac: string)` → `POST /api/devices/{mac}/compile`
  - `getCompileStatus(mac: string)` → `GET /api/devices/{mac}/compile/status`
  - `cancelCompile(mac: string)` → `POST /api/devices/{mac}/compile/cancel`
  - `getSecrets()` → `GET /api/secrets`
  - `saveSecrets(content: string)` → `PUT /api/secrets`
  - `getContainerStatus()` → `GET /api/compile/container/status`
  - `deleteContainer()` → `DELETE /api/compile/container`
  - `downloadFactoryBinary(mac: string)` → `GET /api/devices/{mac}/firmware/download` (returns blob URL)

---

### Phase 7 — Frontend: Device Detail Integration

Wire config editor and compile flow into the existing device detail page.

- [ ] **7.1** Update `ui/src/components/device-detail.ts`:
  - Add a "Configuration" section below the diagnostics.
  - If device has a config: show config editor with summary card (esphome name, board, last compile status).
  - If device has no config: show "Create Config" button → generates scaffold.
  - Add "Import Config" button for file upload/paste.
- [ ] **7.2** Add "Flash History" integration:
  - After successful compile and OTA job creation, the existing `<esp-ota-box>` component shows the pending confirm.
  - The "Review & Flash" button in compile status scrolls to the OTA box section.
  - Factory binary download link appears in config section after successful compile.
- [ ] **7.3** Add topology-driven config indicators:
  - In the topology node, show a badge/icon if a device has a stored config.
  - Show a badge if a device has a compiled but unflashed binary.
- [ ] **7.4** Add settings section for:
  - ESPHome container tag (default: `latest`).
  - Container status indicator (pulling, running, stopped, error).
  - "Clear build cache" button → `DELETE /api/compile/container`.
  - "Pull ESPHome image" button → force image pull.
  - Secrets editor link.

---

### Phase 8 — Edge Cases, Error Handling & Recovery

- [ ] **8.1** Compile while another compile is running: Reject with 409. Only one compile at a time.
- [ ] **8.2** Container not available: If Docker socket is inaccessible or image pull fails, return clear error message with troubleshooting steps.
- [ ] **8.3** Config with `!include` or `!packages`: ESPHome compile will fail. The config editor should warn on save if these directives are detected in the YAML text.
- [ ] **8.4** Secrets.yaml missing `!secret` keys: ESPHome compile will fail with a clear error. The secrets editor should show a warning indicator if config references keys that don't exist in secrets.
- [ ] **8.5** Compile produces wrong chip binary: The preflight comparison (reusing `_preflight_comparison()`) will catch this and show warnings in the pending OTA job. The locked scaffold is the primary defense.
- [ ] **8.6** Device goes offline between compile and flash: The OTA worker's existing rejoin logic handles this. The pending confirm job will show a warning.
- [ ] **8.7** Add-on restart during compile: On startup, check if ESPHome container has an active compile. If so, mark compile status as `failed` (compile output lost). User must retry.
- [ ] **8.8** PlatformIO cache corruption: "Clear build cache" button in settings removes `/data/platformio_cache/*` and recreates the ESPHome container. Next compile starts fresh.
- [ ] **8.9** Unknown chip type in topology: Block scaffold creation. Show error "Unsupported chip type: X. Create a config manually or use import." Allow manual YAML import for unsupported chips.
- [ ] **8.10** Container image pull timeout: Set a configurable pull timeout (default 300s). If exceeded, fail the compile with a clear message suggesting to check internet connectivity and Docker availability.

---

### Phase 9 — Testing & Validation

- [ ] **9.1** Create a config for an online remote device. Verify scaffold generation with locked fields.
- [ ] **9.2** Edit the config in the YAML editor. Save. Verify locked fields are preserved.
- [ ] **9.3** Click Compile. Verify ESPHome image pull (first time), container start, compile execution.
- [ ] **9.4** Verify SSE log streaming shows real-time compile output.
- [ ] **9.5** Verify successful compile creates `.ota.bin` in `/data/firmware/active/` and `.factory.bin` in `/data/devices/`.
- [ ] **9.6** Verify auto-created pending OTA job appears in device detail with preflight comparison.
- [ ] **9.7** Confirm flash. Verify existing OTA worker feeds the compiled binary to the bridge over ESP-NOW.
- [ ] **9.8** Download factory binary. Verify it's a valid full-flash image (not OTA-only).
- [ ] **9.9** Import an existing ESPLR_V2 YAML. Verify locked fields are validated.
- [ ] **9.10** Edit secrets.yaml. Add missing key. Compile. Verify ESPHome error about missing secret is surfaced.
- [ ] **9.11** Compile with a YAML that has wrong board for the device chip type. Verify preflight warning.
- [ ] **9.12** Compile while another compile is running. Verify 409 error.
- [ ] **9.13** Cancel a running compile. Verify container exec process is killed, status set to failed.
- [ ] **9.14** Clear build cache. Verify PlatformIO cache is deleted and container is recreated.
- [ ] **9.15** Restart add-on during idle. Verify ESPHome container is stopped (no resource waste).
- [ ] **9.16** Restart add-on during compile. Verify compile is marked failed on recovery.
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
| `app/yaml_scaffold.py` | 2 | ~120 | Scaffold generation, chip mapping, locked field validation |
| `app/server.py` | 3-4 | ~200 | New config, compile, secrets, container, download endpoints |
| `ui/src/components/config-editor.ts` | 5 | ~350 | CodeMirror YAML editor with locked header |
| `ui/src/components/compile-status.ts` | 6 | ~150 | Compile trigger, state display, progress |
| `ui/src/components/compile-log-viewer.ts` | 6 | ~120 | SSE log viewer terminal |
| `ui/src/components/device-detail.ts` | 7 | ~80 | Integration of config editor and compile into device page |
| `ui/src/api/client.ts` | 6 | ~60 | New API methods for config, compile, secrets |

---

## Docker Sibling Container Details

### Container Name
`esphome-espnow-tree-compiler`

### Create Container Args
```python
container = docker_client.containers.create(
    image=f"ghcr.io/esphome/esphome:{tag}",
    name="esphome-espnow-tree-compiler",
    volumes={
        "/data/devices": {"bind": "/config", "mode": "rw"},
        "/opt/espnow-tree/components": {"bind": "/external", "mode": "ro"},
        "/data/platformio_cache": {"bind": "/root/.platformio", "mode": "rw"},
    },
    detach=True,
    tty=True,
)
```

### Compile Command
```python
exec_result = container.exec_run(
    cmd=f"esphome compile {esphome_name}.yaml",
    workdir="/config",
    stream=True,
    demux=True,
)
```

### Lifecycle
- **First compile**: Pull image → create container → start → exec compile → stop.
- **Subsequent compiles**: Start existing container → exec compile → stop.
- **Idle**: Container exists but is stopped. Zero resource usage.
- **Clear cache**: Remove container, delete `/data/platformio_cache/*`, recreate on next compile.
- **Config change**: No container rebuild needed. Config is on `/data/devices` which is always mounted.

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