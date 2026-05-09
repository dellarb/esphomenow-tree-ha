# Roadmap: Compile → OTA Queue + Serial Flash

## Goals

1. **Compile ESPHome YAML configs into firmware binaries** from the web editor, running ESPHome natively inside the add-on container (no Docker-in-Docker).
2. **Feed compiled binaries into the existing OTA queue** for over-the-air flashing via the ESP-NOW bridge.
3. **Phase 2: Serial flash over USB** for initial device provisioning or recovery.

## Design Decisions (from planning session)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ESPHome invocation | Subprocess (`esphome compile`) | Isolated from ESPHome internals, easy to cancel, same pattern as `compile.sh` |
| ESPHome version | Pinned (`esphome==2026.4.5`) | Custom components are tightly coupled; deliberate bumps only |
| ESPHome environment | Separate venv at `/opt/esp-tree/venv/` | Dependency isolation from web framework; no conflict risk |
| Compile working directory | Direct — run against `/data/esp_tree/{name}/{name}.yaml` | YAML files already live where ESPHome expects them; no staging directory needed |
| `external_components` path | Symlink `/external` → `/opt/esp-tree` in `00-prepare.sh` | Matches `yaml_scaffold.py` convention and ESPLR_V2 `compile.sh`; decoupled from actual install path |
| `secrets.yaml` handling | Copy before compile, delete after (try/finally) | Secrets only exist on disk during active compilation; guaranteed cleanup |
| Log streaming | Write subprocess stdout/stderr to `compile.log`, SSE reads from file | Reuses existing `CompileStore` + `EspCompileLogViewer` infrastructure |
| Build concurrency | Single compile at a time, existing queue system | ESPHome + PlatformIO is CPU/RAM heavy (~1GB per build) |
| Build artifacts | Extract both `firmware.ota.bin` and `firmware.factory.bin` | `.ota.bin` for OTA queue; `.factory.bin` for download endpoint and Phase 2 serial flash |
| Artifact persistence | Leave `.esphome/` and PlatformIO cache in place | Incremental builds faster; existing `DELETE /api/compile/artifacts` for manual cleanup |
| PlatformIO cache location | `PLATFORMIO_CORE_DIR=/data/platformio_cache/` env var on subprocess | Explicit, persistent across container restarts, matches `00-prepare.sh` directory |
| Cancellation | Kill process group (`start_new_session=True`, `os.killpg(SIGTERM)` + timeout + `SIGKILL`) | Ensures PlatformIO child processes (compiler toolchains) are cleaned up |
| Docker base | Switch to Debian-slim (`base-python:3.13-bookworm`) | ESPHome officially targets Debian (manylinux wheels); Alpine requires compiling C extensions from source (cryptography, cbor2) which is fragile across version bumps; ~100MB larger base but negligible after PlatformIO toolchain download |
| ESPHome version pin location | `requirements-compile.txt` | Matches existing `requirements.txt` pattern; separate file for compile venv |
| Phase 2 stubs | `NotImplementedError` in `compiler.py`, 501 endpoint, greyed UI button | Clear intent, no dead code |
| Error handling | Stream full log to user, no smart error parsing | UI log viewer already streams in real-time; users can diagnose from full output |
| First-run toolchain download | No special handling — let it show in the log | PlatformIO will download ~500MB ESP-IDF toolchain on first compile; progress visible in log |

---

## Phase A: Compile + OTA Queue

### A1 — Create `requirements-compile.txt`

Pin ESPHome and its transitive dependencies in a separate requirements file for the compile venv.

**File:** `esp-tree-ha/requirements-compile.txt`

```
esphome==2026.4.5
```

### A2 — Update Dockerfile (Alpine → Debian + compile venv)

Switch from Alpine to Debian-slim base image. ESPHome publishes manylinux (glibc) wheels — Debian avoids the fragile C extension compilation on musl/Alpine. On Alpine, packages like `cryptography`, `cbor2`, `numpy` must be compiled from source, requiring `gcc`, `musl-dev`, `libffi-dev`, `openssl-dev`, and often break across ESPHome version bumps. On Debian, all wheels are pre-built binaries.

**File:** `esp-tree-ha/Dockerfile`

**Current Dockerfile changes:**

1. **Base image** — change FROM line:
   ```dockerfile
   # Before:
   FROM ghcr.io/home-assistant/${BUILD_ARCH}-base-python:3.13-alpine3.22
   # After:
   FROM ghcr.io/home-assistant/${BUILD_ARCH}-base-python:3.13-bookworm
   ```

2. **SHELL directive** — change from ash to bash:
   ```dockerfile
   # Before:
   SHELL ["/bin/ash", "-o", "pipefail", "-c"]
   # After:
   SHELL ["/bin/bash", "-o", "pipefail", "-c"]
   ```

3. **Package install** — replace `apk add` with `apt-get`:
   ```dockerfile
   # Before:
   RUN apk add --no-cache nodejs~22 npm
   # After:
   RUN apt-get update && \
       apt-get install -y --no-install-recommends nodejs npm && \
       rm -rf /var/lib/apt/lists/*
   ```
   Note: Debian `nodejs` and `npm` packages may have different version numbering. Pin to Node 22 if needed via NodeSource or download the binary.

4. **ESPHome compile venv** — add after requirements.txt install:
   ```dockerfile
   COPY requirements-compile.txt ./
   RUN python3 -m venv /opt/esp-tree/venv && \
       /opt/esp-tree/venv/bin/pip install --no-cache-dir --upgrade pip && \
       /opt/esp-tree/venv/bin/pip install --no-cache-dir -r requirements-compile.txt
   ```

5. **Components** — add copy (already exists as `mkdir -p` line, add actual copy):
   ```dockerfile
   COPY components/ /opt/esp-tree/components/
   ```

**`00-prepare.sh` changes:**

Debian uses `/bin/sh` which is dash by default. The existing script uses `#!/usr/bin/with-contenv sh` which is s6-overlay and works on both. All commands (`set -eu`, `mkdir -p`, `cp -a`, `python3 -`, `rm -rf`) are POSIX-compatible. **No changes needed to `00-prepare.sh`.**

**Additional consideration:** Debian `base-python` images include `pip` and `venv` by default, so `python3 -m venv` works without extra packages. The Node.js install may need adjusting — Debian's default `nodejs` package is often older than 22. Consider using NodeSource or the Node binary distribution to pin Node 22.

### A3 — Update container startup (`00-prepare.sh`)

Add one-time symlinks and directory setup for compilation.

**File:** `esp-tree-ha/rootfs/etc/cont-init.d/00-prepare.sh`

Changes:
- `ln -sf /opt/esp-tree /external` — external_components path for ESPHome
- Ensure `/data/platformio_cache/` exists (already done)
- Ensure `/data/esp_tree/.esphome/` directory exists

### A4 — Rewrite `compiler.py`

Replace the stub `ESPHomeCompiler` with a real subprocess-based implementation.

**File:** `esp-tree-ha/app/compiler.py`

**`compile(esphome_name)` method:**
1. Copy `secrets.yaml` from `/data/esp_tree/secrets.yaml` → `/data/esp_tree/{name}/secrets.yaml`
2. Set environment: `PLATFORMIO_CORE_DIR=/data/platformio_cache`, `ESPHOME_NOGITHUB=1`
3. Spawn subprocess:
   ```python
   proc = await asyncio.create_subprocess_exec(
       "/opt/esp-tree/venv/bin/esphome", "compile",
       str(yaml_path),
       env=compile_env,
       stdout=asyncio.subprocess.PIPE,
       stderr=asyncio.subprocess.STDOUT,
       start_new_session=True,
   )
   ```
4. Stream stdout to `CompileStore.save_log()` line-by-line (async readline loop)
5. Update `CompileStore` status to "compiling"
6. On process exit:
   - Exit code 0: locate `firmware.ota.bin` and `firmware.factory.bin` in `.esphome/build/{name}/.pioenvs/{name}/`, parse metadata with `bin_parser.parse_firmware()`, return `CompileResult(success=True, ...)`
   - Exit code != 0: return `CompileResult(success=False, error=...)` with full log
7. `try/finally`: delete `secrets.yaml` from device dir regardless of outcome

**`stream_logs(esphome_name)` method:**
- Read from `CompileStore.get_log()` file, yield lines as SSE events
- If compile is active, tail the log file for new lines

**`cancel_compile(esphome_name)` method:**
- Track active subprocess by `esphome_name`
- Send `os.killpg(pgid, signal.SIGTERM)`
- Wait 5 seconds, then `os.killpg(pgid, signal.SIGKILL)` if still alive
- Clean up `secrets.yaml` in finally block

**`clean_artifacts()` method:**
- Keep existing implementation (already works)

### A5 — Review `compile_worker.py`

The existing `_process()` method should work as-is once `compiler.compile()` returns real results. Key points:

- Lines 111-122: Copies `.ota.bin` to active firmware dir, injects timestamp, parses metadata — correct
- Line 130: Preflight comparison against bridge topology — correct
- Lines 149-174: Transitions job to `QUEUED` for OTA — correct
- Lines 177-183: Failure path — correct

**Review scope:** Verify that `result.ota_bin_path` and `result.factory_bin_path` from the new `CompileResult` map correctly to the copy operations. The new `compiler.py` should return absolute paths to files inside the venv's build output directory.

**One fix needed:** After `compile_worker._process()` copies the `.ota.bin` to the active firmware directory, it should also copy the `.factory.bin` to a known location so the download endpoint can serve it. Currently `yaml_store.get_factory_binary()` looks for `{name}.factory.bin` in the device dir — we need to copy it there from the build output.

### A6 — Save `factory.bin` for download endpoint

The firmware download endpoint (`GET /api/devices/{mac}/firmware/download`) calls `yaml_store.get_factory_binary(esphome_name)` which looks for `{device_dir}/{esphome_name}.factory.bin`.

After successful compilation, `compile_worker._process()` must copy the factory binary to the device directory:

```python
# After copying .ota.bin to active_path
if result.factory_bin_path:
    factory_dest = self.yaml_store.device_dir(esphome_name) / f"{esphome_name}.factory.bin"
    factory_dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(result.factory_bin_path, factory_dest)
```

### A7 — Unblock compile endpoint

**File:** `esp-tree-ha/app/server.py` (line 1944)

Remove the `raise HTTPException(status_code=503, ...)` at the top of `compile_device_config()`. The dead code below it is the real implementation — it will become active.

### A8 — Add Phase 2 stubs

**`compiler.py`:**
```python
async def flash_serial(self, esphome_name: str, port: str) -> FlashResult:
    raise NotImplementedError("Serial flash not yet implemented (Phase 2)")
```

**`server.py`:**
```python
@app.post("/api/devices/{mac}/flash/serial")
async def flash_serial(mac: str) -> dict[str, Any]:
    raise HTTPException(status_code=501, detail="Serial flash not yet implemented")
```

**UI (`compile-status.ts`):**
- Add a greyed-out "Flash via USB" button next to "Download factory .bin" with tooltip "Coming soon — Phase 2"

### A9 — Update `yaml_scaffold.py`

No changes needed. The scaffold already generates:
```yaml
external_components:
  - source:
      type: local
      path: /external/components
```

The `/external` → `/opt/esp-tree` symlink (A3) resolves this. If users import their own YAML with a different path, they'll need to update it to use `/external/components`.

### A10 — Integration test checklist

Manual testing steps after implementation:

1. **First compile** — triggers PlatformIO toolchain download (~5-10 min), should show progress in log viewer
2. **Subsequent compile** — should be faster (incremental build, cached toolchain)
3. **Compile failure** — bad YAML should show error in log, job marked as `failed`
4. **Compile cancel** — should kill esphome process and clean up `secrets.yaml`
5. **Compile → OTA queue** — successful compile should transition to `QUEUED`, then `STARTING` → `TRANSFERRING` → `SUCCESS`
6. **Factory binary download** — `GET /api/devices/{mac}/firmware/download` should serve the `.factory.bin`
7. **Secrets cleanup** — verify `secrets.yaml` is deleted from device dir after compile (success or failure)
8. **Clean artifacts** — `DELETE /api/compile/artifacts` should clear `.esphome/` and `/data/platformio_cache/`
9. **Container restart** — PlatformIO cache should persist across restarts (second compile still fast)

### A11 — `config.yaml` changes

No changes needed. No new user-configurable options. ESPHome version is pinned in `requirements-compile.txt`.

### A12 — Version pin updates in `qc.sh`

Add a step to `qc.sh` that updates the ESPHome version in `requirements-compile.txt` when bumping the add-on version. This should be a manual decision (not automatic), but the script should surface the current ESPHome version for review.

---

## Phase B: Serial Flash (Future)

### Goals

- Flash firmware to ESP32 devices over USB/serial from the add-on web UI
- Use `esptool` (installed as part of the ESPHome venv) to write `.factory.bin` to device
- Support initial provisioning of new devices and recovery of bricked devices
- No OTA bridge required — direct USB connection

### Architectural Decisions (pre-decided)

- **`compiler.py`** will have `flash_serial(esphome_name, port)` method using `esptool` via subprocess
- **Factory binary** — serial flash uses the `.factory.bin` file already extracted in Phase A (A6)
- **Separate API endpoint** — `POST /api/devices/{mac}/flash/serial` with `{"port": "/dev/ttyUSB0"}` body
- **No queue** — serial flash is immediate, one device at a time, no OTA queue involvement
- **Real-time progress** — esptool outputs percentage lines; stream via same SSE pattern as compile logs
- **Cancellation** — same `os.killpg()` pattern as compile cancellation
- **Docker device access** — add-on `config.yaml` needs USB device mapping:
  ```yaml
  devices:
    - /dev/ttyUSB0:/dev/ttyUSB0
    - /dev/ttyACM0:/dev/ttyACM0
  ```
- **Serial port enumeration** — API endpoint `GET /api/serial/ports` that scans `/dev/tty*` and returns available ports
- **UI** — "Flash via USB" button (currently stubbed), port selector dropdown, progress display

### Scope Summary

| Item | Description |
|------|-------------|
| `compiler.py` | Add `flash_serial()` using `esptool write_flash` subprocess |
| `server.py` | Add `POST /api/devices/{mac}/flash/serial`, `GET /api/serial/ports` |
| `config.yaml` | Add USB device passthrough |
| UI | "Flash via USB" button, serial port selector, progress panel |
| `docker-compose` | Add device mappings for USB serial access |

### Out of Scope

- Automatic device detection (plug-and-play) — manual port selection only
- Multiple simultaneous serial flashes
- Firmware verification after serial flash (esptool handles this internally)