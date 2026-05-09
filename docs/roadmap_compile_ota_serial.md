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
| Compile working directory | Direct — run against `/data/esp_tree/devices/{name}/{name}.yaml` | YAML files already live where ESPHome expects them; no staging directory needed |
| `external_components` path | Symlink `/external` → `/opt/esp-tree` in `00-prepare.sh` | Matches `yaml_scaffold.py` convention and ESPLR_V2 `compile.sh`; decoupled from actual install path |
| `secrets.yaml` handling | Copy before compile, delete after (try/finally) | Secrets only exist on disk during active compilation; guaranteed cleanup |
| Log streaming | Write subprocess stdout/stderr to `compile.log`, SSE reads from file | Reuses existing `CompileStore` + `EspCompileLogViewer` infrastructure |
| Build concurrency | Single compile at a time, existing queue system | ESPHome + PlatformIO is CPU/RAM heavy (~1GB per build) |
| Build artifacts | Extract both `firmware.ota.bin` and `firmware.factory.bin` | `.ota.bin` for OTA queue; `.factory.bin` for download endpoint and Phase 2 serial flash |
| Artifact persistence | Leave `.esphome/` and PlatformIO cache in place | Incremental builds faster; existing `DELETE /api/compile/artifacts` for manual cleanup |
| Artifact cleanup | Must glob per-device `.esphome` dirs, not a single shared dir | Each device's build artifacts are under `{devices_root}/{name}/.esphome/`, not `{devices_root}/.esphome/` |
| PlatformIO cache location | `PLATFORMIO_CORE_DIR=/data/platformio_cache/` env var on subprocess | Explicit, persistent across container restarts, matches `00-prepare.sh` directory |
| ESPHome data directory | Do NOT set `ESPHOME_IS_HA_ADDON` or `ESPHOME_DATA_DIR`; let ESPHome default to `{config_dir}/.esphome` | ESPHome's default puts build output at `{yaml_dir}/.esphome/build/{name}/...`; setting `ESPHOME_IS_HA_ADDON` would redirect to `/data/.esphome` which conflicts with other add-on data |
| Build output paths | ESP-IDF (our remotes): `{yaml_dir}/.esphome/build/{name}/.pioenvs/{name}/firmware.ota.bin` and `firmware.factory.bin`; Arduino (ESP8266): same dir but different offsets | Must search for both `.ota.bin` and `.factory.bin` in the correct per-device build directory |
| Cancellation | Kill process group (`start_new_session=True`, `os.killpg(SIGTERM)` + timeout + `SIGKILL`) | Ensures PlatformIO child processes (compiler toolchains) are cleaned up |
| Docker base | Switch to Debian-slim (`base-python:3.13-bookworm`) | ESPHome officially targets Debian (manylinux wheels); Alpine requires compiling C extensions from source (cryptography, cbor2) which is fragile across version bumps; ~100MB larger base but negligible after PlatformIO toolchain download |
| Node.js | Use NodeSource or Node binary distribution to pin Node 22 | Debian Bookworm's default `nodejs` package is v18.x; we need v22 for the UI build |
| ESPHome version pin location | `requirements-compile.txt` | Matches existing `requirements.txt` pattern; separate file for compile venv |
| Phase 2 stubs | `NotImplementedError` in `compiler.py`, 501 endpoint, greyed UI button | Clear intent, no dead code |
| Error handling | Stream full log to user, no smart error parsing | UI log viewer already streams in real-time; users can diagnose from full output |
| First-run toolchain download | No special handling — let it show in the log | PlatformIO will download ~500MB ESP-IDF toolchain on first compile; progress visible in log |
| Secrets source path | Copy from `YAMLStore.root / "secrets.yaml"` (= `/data/esp_tree/devices/secrets.yaml`) | `yaml_store` root is `settings.data_dir / "devices"` — secrets are at the root of that directory |

---

## Path Reference

All paths below assume:
- `settings.data_dir` = `/data` (default, from `ESP_TREE_DATA_DIR` env var)
- `YAMLStore.root` = `settings.data_dir / "devices"` = `/data/esp_tree/devices`
- `CompileStore.root` = same as YAMLStore.root
- `ESPHomeCompiler.devices_root` = same as YAMLStore.root

| Item | Path |
|------|------|
| Device YAML | `/data/esp_tree/devices/{name}/{name}.yaml` |
| Secrets (source) | `/data/esp_tree/devices/secrets.yaml` |
| Secrets (copy target) | `/data/esp_tree/devices/{name}/secrets.yaml` (deleted after compile) |
| ESPHome build output | `/data/esp_tree/devices/{name}/.esphome/build/{name}/.pioenvs/{name}/firmware.ota.bin` |
| ESPHome factory binary | `/data/esp_tree/devices/{name}/.esphome/build/{name}/.pioenvs/{name}/firmware.factory.bin` |
| PlatformIO cache | `/data/platformio_cache/` (set via `PLATFORMIO_CORE_DIR` env var) |
| Factory binary (served) | `/data/esp_tree/devices/{name}/{name}.factory.bin` (copied from build output) |
| OTA binary (served) | `/data/firmware/active/{uuid}.bin` (copied from build output) |
| `/external` symlink | `/external` → `/opt/esp-tree/` |
| Components path | `/opt/esp-tree/components/` (in Docker image) |
| ESPHome venv | `/opt/esp-tree/venv/bin/esphome` |
| ESPHome CLI invocation | `/opt/esp-tree/venv/bin/esphome compile /data/esp_tree/devices/{name}/{name}.yaml` |

---

## Phase A: Compile + OTA Queue

### A1 — Create `requirements-compile.txt`

Pin ESPHome in a separate requirements file for the compile venv.

**File:** `esp-tree-ha/requirements-compile.txt`

```
esphome==2026.4.5
```

### A2 — Update Dockerfile (Alpine → Debian + compile venv)

Switch from Alpine to Debian-slim base image. ESPHome publishes manylinux (glibc) wheels — Debian avoids the fragile C extension compilation on musl/Alpine. On Alpine, packages like `cryptography`, `cbor2`, `numpy` must be compiled from source, requiring `gcc`, `musl-dev`, `libffi-dev`, `openssl-dev`, and often break across ESPHome version bumps. On Debian, all wheels are pre-built binaries.

**File:** `esp-tree-ha/Dockerfile`

**Current file** (lines 1-45):
```dockerfile
ARG BUILD_ARCH=amd64
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base-python:3.13-alpine3.22
...
SHELL ["/bin/ash", "-o", "pipefail", "-c"]
...
RUN apk add --no-cache nodejs~22 npm
...
```

**Changes (shown as diff):**

1. **Base image** — line 2:
   ```dockerfile
   # Before:
   FROM ghcr.io/home-assistant/${BUILD_ARCH}-base-python:3.13-alpine3.22
   # After:
   FROM ghcr.io/home-assistant/${BUILD_ARCH}-base-python:3.13-bookworm
   ```

2. **SHELL directive** — line 18:
   ```dockerfile
   # Before:
   SHELL ["/bin/ash", "-o", "pipefail", "-c"]
   # After:
   SHELL ["/bin/bash", "-o", "pipefail", "-c"]
   ```

3. **Node.js install** — line 26. Debian Bookworm ships Node 18.x in default repos; we need Node 22. Use NodeSource:
   ```dockerfile
   # Before:
   RUN apk add --no-cache nodejs~22 npm
   # After:
   RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
       apt-get install -y nodejs && \
       rm -rf /var/lib/apt/lists/*
   ```
   Alternative: download Node 22 binary from `https://nodejs.org/dist/` and extract to `/usr/local/`. NodeSource is simpler but adds a dependency on their repo. Either approach works — choose based on preference.

4. **ESPHome compile venv** — add after line 29 (`RUN pip3 install --no-cache-dir -r requirements.txt`):
   ```dockerfile
   COPY requirements-compile.txt ./
   RUN python3 -m venv /opt/esp-tree/venv && \
       /opt/esp-tree/venv/bin/pip install --no-cache-dir --upgrade pip && \
       /opt/esp-tree/venv/bin/pip install --no-cache-dir -r requirements-compile.txt
   ```
   Note: Debian `base-python` images include `python3 -m venv` by default (`python3-venv` package). No extra apt packages needed.

5. **Components copy** — line 39 currently has `RUN mkdir -p /opt/esp-tree/components/`. Add a COPY after it:
   ```dockerfile
   RUN mkdir -p /opt/esp-tree/components/
   COPY components/ /opt/esp-tree/components/
   ```
   **Important:** The `components/` directory is populated by `qc.sh` which syncs it from `ESPLR_V2/components/`. It's gitignored and removed after commit. The Docker build must happen while `components/` is populated. If building from a clean checkout, run `qc.sh` sync step first or copy components manually.

6. **No other apk→apt conversions needed.** The remaining lines (`COPY`, `RUN chmod`, `WORKDIR`) are platform-independent.

**`00-prepare.sh` — no changes needed.** The script uses `#!/usr/bin/with-contenv sh` (s6-overlay) and POSIX commands only (`set -eu`, `mkdir -p`, `cp -a`, `python3 -`, `rm -rf`). All compatible with Debian.

### A3 — Update container startup (`00-prepare.sh`)

Add symlinks and directory setup for compilation.

**File:** `esp-tree-ha/rootfs/etc/cont-init.d/00-prepare.sh`

Add after the existing `mkdir` lines (after line 8):

```sh
ln -sf /opt/esp-tree /external
mkdir -p /data/esp_tree/devices
```

Note: `/data/platformio_cache/` is already created on line 7. `/data/esp_tree/devices` is already implied by `yaml_store` usage but should be ensured at startup.

### A4 — Rewrite `compiler.py`

Replace the stub `ESPHomeCompiler` with a real subprocess-based implementation.

**File:** `esp-tree-ha/app/compiler.py`

**Constructor changes:**
- Add `_active_procs: dict[str, asyncio.subprocess.Process]` to track running compile processes (needed for cancellation)
- Add `_secrets_paths: dict[str, Path]` to track per-compile secrets copies (for cleanup)
- Keep existing `devices_root`, `components_root`, `platformio_cache` attributes

**`compile(esphome_name)` method:**
1. Resolve paths:
   - `yaml_path = self.devices_root / esphome_name / f"{esphome_name}.yaml"`
   - `secrets_src = self.devices_root / "secrets.yaml"` (matches `YAMLStore.root / "secrets.yaml"`)
   - `secrets_dst = self.devices_root / esphome_name / "secrets.yaml"`
   - `build_output_dir = self.devices_root / esphome_name / ".esphome" / "build" / esphome_name / ".pioenvs" / esphome_name`
2. **Copy secrets** before compile:
   ```python
   if secrets_src.exists():
       shutil.copy2(secrets_src, secrets_dst)
       self._secrets_paths[esphome_name] = secrets_dst
   ```
3. **Set environment** for the subprocess:
   ```python
   import os
   compile_env = dict(os.environ)
   compile_env["PLATFORMIO_CORE_DIR"] = str(self.platformio_cache)
   # Do NOT set ESPHOME_IS_HA_ADDON — it changes data_dir to /data
   # Do NOT set ESPHOME_DATA_DIR — we want ESPHome to default to {config_dir}/.esphome
   ```
4. **Spawn subprocess:**
   ```python
   proc = await asyncio.create_subprocess_exec(
       "/opt/esp-tree/venv/bin/esphome", "compile",
       str(yaml_path),
       env=compile_env,
       stdout=asyncio.subprocess.PIPE,
       stderr=asyncio.subprocess.STDOUT,
       start_new_session=True,
   )
   self._active_procs[esphome_name] = proc
   ```
5. **Stream stdout** to `CompileStore.save_log()` line-by-line:
   ```python
   log_path = self.compile_store._log_path(esphome_name)
   log_path.parent.mkdir(parents=True, exist_ok=True)
   lines = []
   while True:
       line = await proc.stdout.readline()
       if not line:
           break
       decoded = line.decode("utf-8", errors="replace")
       lines.append(decoded)
   self.compile_store.save_log(esphome_name, "".join(lines))
   ```
   Note: Also stream in real-time by writing each line to the log file as it arrives, not just at the end.

6. **Await process exit** and handle result:
   ```python
   await proc.wait()
   exit_code = proc.returncode
   del self._active_procs[esphome_name]
   ```
   - Exit code 0: locate build artifacts:
     ```python
     ota_bin = build_output_dir / "firmware.ota.bin"
     factory_bin = build_output_dir / "firmware.factory.bin"
     
     # For ESP-IDF builds, also check:
     # build_output_dir / "firmware.bin"  (generic name)
     # build_output_dir.parent / "firmware.factory.bin"  (one level up)
     
     if not ota_bin.exists():
         # Fallback: search for .ota.bin in build tree
         # ESP-IDF may place output differently
         pass
     
     firmware_info = parse_firmware(ota_bin) if ota_bin.exists() else None
     return CompileResult(
         success=True,
         esphome_name=esphome_name,
         ota_bin_path=str(ota_bin) if ota_bin.exists() else None,
         factory_bin_path=str(factory_bin) if factory_bin.exists() else None,
         firmware_info=firmware_info,
         build_log="".join(lines),
     )
     ```
   - Exit code != 0: return failure with full log
   - **Important:** Handle the case where `firmware.factory.bin` may not exist (ESP8266 Arduino builds). Only `.ota.bin` is guaranteed for all platforms.

7. **`try/finally`** — always clean up secrets:
   ```python
   finally:
       secrets_dst = self.devices_root / esphome_name / "secrets.yaml"
       if secrets_dst.exists():
           secrets_dst.unlink()
       self._secrets_paths.pop(esphome_name, None)
   ```
8. **Error handling** — if `firmware.ota.bin` is not found after successful exit (exit code 0 but no output file), treat it as a compile failure. Log the missing path and return `CompileResult(success=False, ...)`.

**`stream_logs(esphome_name)` method:**
- Read from `CompileStore.get_log()` file path
- If the log file exists, yield each line as an SSE event: `f"data: {line}\n\n"`
- If compile is active (tracked via `_active_procs`), also stream new lines as they arrive using file polling
- Include status events: `f"event: status\ndata: compiling\n\n"` at start, `f"event: status\ndata: success\n\n"` or `f"event: status\ndata: failed\n\n"` at end

**`cancel_compile(esphome_name)` method:**
```python
async def cancel_compile(self, esphome_name: str) -> bool:
    proc = self._active_procs.get(esphome_name)
    if proc is None:
        return False
    
    import signal
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGTERM)
    except (ProcessLookupError, OSError):
        pass
    
    try:
        await asyncio.wait_for(proc.wait(), timeout=5.0)
    except asyncio.TimeoutError:
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, OSError):
            pass
        await proc.wait()
    
    # Clean up secrets
    secrets_dst = self.devices_root / esphome_name / "secrets.yaml"
    if secrets_dst.exists():
        secrets_dst.unlink()
    
    return True
```

**`clean_artifacts()` method — BUG FIX REQUIRED:**

Current implementation (line 62-68):
```python
def clean_artifacts(self) -> tuple[int, int]:
    platformio_bytes = _rmtree_size(self.platformio_cache)
    self.platformio_cache.mkdir(parents=True, exist_ok=True)
    
    esphome_cache = self.devices_root / ".esphome"  # BUG: wrong path!
    esphome_bytes = _rmtree_size(esphome_cache)
    
    return platformio_bytes, esphome_bytes
```

This cleans `/data/esp_tree/devices/.esphome/` (a single shared directory) but build artifacts are actually at `/data/esp_tree/devices/{name}/.esphome/` (per-device). Fix:
```python
def clean_artifacts(self) -> tuple[int, int]:
    platformio_bytes = _rmtree_size(self.platformio_cache)
    self.platformio_cache.mkdir(parents=True, exist_ok=True)
    
    # Clean per-device .esphome directories (not a single shared dir)
    esphome_bytes = 0
    if self.devices_root.exists():
        for entry in self.devices_root.iterdir():
            esphome_dir = entry / ".esphome"
            if entry.is_dir() and esphome_dir.exists():
                esphome_bytes += _rmtree_size(esphome_dir)
    
    return platformio_bytes, esphome_bytes
```

### A5 — Review `compile_worker.py`

The existing `_process()` method should work with minor fixes once `compiler.compile()` returns real results.

**File:** `esp-tree-ha/app/compile_worker.py`

**Review of existing code (lines 89-184):**
- Lines 108-122: Copies `.ota.bin` to `active_path`, injects timestamp, parses metadata — **correct but needs review**. Currently copies from `result.ota_bin_path` then from `ota_path` (same file). After our changes, `result.ota_bin_path` will be an absolute path inside `.esphome/build/`. The `shutil.copy2` on line 112 and line 122 both copy the same file — line 122 overwrites line 112 after `inject_timestamp`. This is intentional (timestamp injection modifies the OTA binary, then re-copies to the active path).

- **Type compatibility:** `result.ota_bin_path` and `result.factory_bin_path` are `str | None` in `CompileResult`. The existing code on line 114 does `Path(result.ota_bin_path)` which works fine with strings.

- **Important:** The `inject_timestamp()` call on line 121 modifies `ota_path` in-place (the build output file). After this call, the original build artifact is modified. This is fine for the active copy but means the build output is tainted. We should copy first, then inject timestamp on the copy, not on the build output. Current code: copies build→active, injects on build, copies build→active again. Better approach: copy build→active, inject timestamp on active only. **This is an existing behavior issue that should be fixed.**

  Fix: Change line 121 from `inject_timestamp(ota_path, upload_timestamp)` to `inject_timestamp(active_path, upload_timestamp)` and remove the second `shutil.copy2` on line 122.

- Lines 130-135: Preflight comparison against bridge topology — **correct**.
- Lines 149-174: Transitions job to `QUEUED` for OTA — **correct**.
- Lines 177-183: Failure path — **correct**.

### A6 — Save `factory.bin` for download endpoint

The firmware download endpoint (`GET /api/devices/{mac}/firmware/download`) calls `yaml_store.get_factory_binary(esphome_name)` which looks for `{device_dir}/{esphome_name}.factory.bin` (see `yaml_store.py` line 51-53).

After successful compilation, `compile_worker._process()` must copy the factory binary to the device directory.

**File:** `esp-tree-ha/app/compile_worker.py`

Add after the OTA binary copy block (after line 122):

```python
if result.factory_bin_path:
    factory_src = Path(result.factory_bin_path)
    factory_dest = self.yaml_store.root / esphome_name / f"{esphome_name}.factory.bin"
    factory_dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(factory_src, factory_dest)
```

Note: Uses `self.yaml_store.root / esphome_name` instead of `self.yaml_store._device_dir(esphome_name)` since `_device_dir` is a private method. The `root / esphome_name` gives the same result: `/data/esp_tree/devices/{name}`.

### A7 — Unblock compile endpoint

**File:** `esp-tree-ha/app/server.py`

Remove line 1945: `raise HTTPException(status_code=503, detail="Compilation is not available. Native ESPHome compilation is not yet implemented in this build.")`

The rest of the function (lines 1946-1991) is the real implementation — it will become active once the raise is removed.

### A8 — Add Phase 2 stubs

**File:** `esp-tree-ha/app/compiler.py`

Add `FlashResult` dataclass and `flash_serial()` stub:

```python
@dataclass
class FlashResult:
    success: bool
    esphome_name: str
    port: str
    error: str | None = None
    build_log: str = ""

class ESPHomeCompiler:
    # ... existing methods ...
    
    async def flash_serial(self, esphome_name: str, port: str) -> FlashResult:
        raise NotImplementedError("Serial flash not yet implemented (Phase 2)")
```

**File:** `esp-tree-ha/app/server.py`

Add endpoint stub:

```python
@app.post("/api/devices/{mac}/flash/serial")
async def flash_serial(mac: str) -> dict[str, Any]:
    raise HTTPException(status_code=501, detail="Serial flash not yet implemented")
```

**File:** `esp-tree-ha/ui/src/components/compile-status.ts`

Add a greyed-out "Flash via USB" button next to "Download factory .bin" with a tooltip "Coming soon — Phase 2". The button should be `disabled` and styled with reduced opacity.

### A9 — `yaml_scaffold.py` — No changes needed

The scaffold already generates:
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
4. **Compile cancel** — should kill esphome process group and clean up `secrets.yaml`
5. **Compile → OTA queue** — successful compile should transition to `QUEUED`, then `STARTING` → `TRANSFERRING` → `SUCCESS`
6. **Factory binary download** — `GET /api/devices/{mac}/firmware/download` should serve the `.factory.bin`
7. **Secrets cleanup** — verify `secrets.yaml` is deleted from device dir after compile (success or failure)
8. **Clean artifacts** — `DELETE /api/compile/artifacts` should clear all per-device `.esphome/` dirs and `/data/platformio_cache/`
9. **Container restart** — PlatformIO cache should persist across restarts (second compile still fast)
10. **ESP-IDF build** — verify `.factory.bin` exists in build output for ESP-IDF framework remotes
11. **Secrets missing** — compile should still succeed if `secrets.yaml` doesn't exist at root (some configs don't use secrets)
12. **Process group cleanup** — cancel during PlatformIO toolchain download should kill all child processes

### A11 — `config.yaml` — No changes needed

No new user-configurable options. ESPHome version is pinned in `requirements-compile.txt`.

### A12 — Version pin updates in `qc.sh`

**File:** `qc.sh`

Add a step that surfaces the ESPHome version in `requirements-compile.txt` during the review/bump cycle. This is informational — version bumps are manual decisions:

```bash
echo "Current ESPHome version: $(grep 'esphome==' requirements-compile.txt | cut -d= -f2)"
```

The version should be reviewed but NOT auto-bumped. ESPHome version changes require testing against custom components.

### A13 — `qc.sh` component sync timing

The `qc.sh` script copies `ESPLR_V2/components/` to `esp-tree-ha/components/` and removes them after commit. The Dockerfile `COPY components/ /opt/esp-tree/components/` will fail if `components/` is empty (gitignored).

**Fix options:**
- Option A: Keep components in the Docker context. Modify `qc.sh` to NOT remove components after commit. Add `components/` to `.gitignore` but keep them in the working tree for Docker builds.
- Option B: Copy components during container startup (`00-prepare.sh`) from a bind-mounted volume instead of baking into the image.
- Option C: Build the Docker image as part of `qc.sh` after syncing components but before removing them.

**Recommended: Option A** — simplest. Components are ~small C++ headers, not worth the complexity of runtime mounting. Remove the `rm -rf components/` from `qc.sh` and add `components/` to `.gitignore` (it likely already is).

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

### Conflict with ESPLR_V2 Serial Bridge Roadmap

The ESPLR_V2 `docs/roadmap_serial_bridge.md` describes a **serial transport for bridge↔addon communication** (COBS+Protobuf over UART), which is completely different from our Phase B **serial flash** (USB-UART for firmware writing via esptool).

**Two important intersections:**
1. **Serial port collision** — You cannot serial-flash a bridge device while it's using that same serial port for bridge communication. UI must gray out "Flash via USB" for bridges connected via serial transport.
2. **Shared `GET /api/serial/ports` endpoint** — Both features need serial port enumeration. Implement once, use for both.
3. **`pyserial` dependency placement** — The ESPLR_V2 serial bridge will need `pyserial` in the main app's `requirements.txt` (not the compile venv). Our Phase B serial flash uses `esptool` from the compile venv. Keep dependencies in the correct place.

### FlashResult dataclass

Already defined in A8 stub. Phase B will flesh it out with `success`, `esphome_name`, `port`, `error`, and `build_log` fields, plus a `flashed_bytes` field for progress tracking.

---

## Appendix: ESPHome Path Resolution

This section documents how ESPHome resolves its build paths, as discovered during code review of `esphome/core/__init__.py` (v2026.4.5).

### `CORE.data_dir` property
```python
@property
def data_dir(self) -> Path:
    if is_ha_addon():           # ESPHOME_IS_HA_ADDON env var
        return Path("/data")
    if "ESPHOME_DATA_DIR" in os.environ:
        return Path(get_str_env("ESPHOME_DATA_DIR", None))
    return self.relative_config_path(".esphome")  # DEFAULT: {yaml_dir}/.esphome
```

### Our chosen configuration
- **Do NOT set `ESPHOME_IS_HA_ADDON`** — would route all data to `/data`, conflicting with other add-on data
- **Do NOT set `ESPHOME_DATA_DIR`** — let ESPHome default to `{config_dir}/.esphome`
- This means: `data_dir = config_dir / ".esphome"` where `config_dir` is the YAML file's parent directory

### Resulting paths for `esphome compile /data/esp_tree/devices/mydevice/mydevice.yaml`

| Item | Path |
|------|------|
| `config_dir` | `/data/esp_tree/devices/mydevice/` |
| `data_dir` (default) | `/data/esp_tree/devices/mydevice/.esphome/` |
| `build_path` | `/data/esp_tree/devices/mydevice/.esphome/build/mydevice/` |
| PlatformIO `.pioenvs` | `/data/esp_tree/devices/mydevice/.esphome/build/mydevice/.pioenvs/mydevice/` |
| `firmware.ota.bin` | `/data/esp_tree/devices/mydevice/.esphome/build/mydevice/.pioenvs/mydevice/firmware.ota.bin` |
| `firmware.factory.bin` | `/data/esp_tree/devices/mydevice/.esphome/build/mydevice/.pioenvs/mydevice/firmware.factory.bin` |
| ESP-IDF `firmware.bin` | `/data/esp_tree/devices/mydevice/.esphome/build/mydevice/.pioenvs/mydevice/firmware.bin` |
| Storage JSON | `/data/esp_tree/devices/mydevice/.esphome/storage/mydevice.yaml.json` |
| PlatformIO cache | `/data/platformio_cache/` (via `PLATFORMIO_CORE_DIR` env var) |

### `firmware.factory.bin` availability

| Framework | `firmware.factory.bin` | `firmware.ota.bin` | Notes |
|-----------|------------------------|--------------------|-------|
| ESP-IDF (ESP32, S2, S3, C3, C6, H2, C5) | ✅ Yes | ✅ Yes | Our remotes use ESP-IDF |
| Arduino (ESP8266) | ✅ Yes | ✅ Yes | Both always generated |
| Arduino (ESP32) | ✅ Yes | ✅ Yes | Both always generated |

Both `.factory.bin` and `.ota.bin` should always exist after a successful compile. Handle the missing case gracefully but don't expect it.

### `inject_timestamp()` behavior

`inject_timestamp()` (in `bin_parser.py`) modifies the binary file in-place. In `compile_worker.py:121`, it's called on `ota_path` (the build output file), then the file is copied again to `active_path`. This modifies the build artifact. **Fix in A5**: call `inject_timestamp()` on `active_path` (the destination copy) instead, and remove the redundant second `shutil.copy2`.

### `clean_artifacts()` path bug

Current code cleans `self.devices_root / ".esphome"` which resolves to `/data/esp_tree/devices/.esphome/` — a single shared directory. But build artifacts live at `/data/esp_tree/devices/{name}/.esphome/` — per-device directories. **Fix in A4**: glob all per-device `.esphome` directories.