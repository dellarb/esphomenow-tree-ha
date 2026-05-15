# Bridge Flash Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Flash New Bridge" tab to the setup wizard so users can configure, compile, and serial-flash a bridge ESP32 directly from the add-on UI, then auto-detect the flashed bridge and complete setup.

**Architecture:** Three-tab setup wizard Step 1 (Discover | Manual | Flash New Bridge). The flash tab is a sub-wizard: config form → chip detection → compile+serial flash → post-flash bridge detection. Backend generates bridge YAML scaffold, merges secrets, creates placeholder MAC bridge DB record, triggers compile, and auto-activates the bridge when it appears on the network.

**Tech Stack:** Python (FastAPI), SQLite, TypeScript (Lit), ESPHome/esptool

---

## File Change Summary

| File | Action | Purpose |
|------|--------|---------|
| `app/yaml_scaffold.py` | Modify | Extend `generate_scaffold()` to handle bridge wizard params (wifi, web_server, ota, api_key, sdkconfig_options) |
| `app/yaml_store.py` | Modify | Add `merge_secrets()` method |
| `app/compiler.py` | Modify | Add `detect_chip_on_port()` async method |
| `app/db.py` | Modify | Add migration v16 for `flash_wizard_pending` column on bridges; add `get_provisioning_bridge()` and `cleanup_stale_provisioning()` methods |
| `app/server.py` | Modify | Add 3 new endpoints (`detect-chip`, `submit`, `status`); add auto-activation in scan flow; add startup cleanup for stale provisioning records |
| `app/network_discovery.py` | Modify | Return extra fields from bridge discovery (api_key would be needed, but bridges don't expose it – we match by network name + later HMAC validation) |
| `ui/src/pages/setup-page.ts` | Modify | Refactor Step 1 to 3-tab layout; add flash wizard sub-wizard state machine |
| `ui/src/components/compile-flash-panel.ts` | Create | Extracted reusable compile/flash panel component |
| `ui/src/pages/config-page.ts` | Modify | Refactor to use shared `compile-flash-panel` component |
| `ui/src/api/client.ts` | Modify | Add `detectChip()`, `submitFlashWizard()`, `getFlashWizardStatus()` API methods |

---

### Task 1: Backend — Extend `generate_scaffold()` for bridge wizard

**Files:**
- Modify: `app/yaml_scaffold.py:69-140`

- [ ] **Step 1: Write failing test**

Add a test in `device_code/tests/` (or create `test/test_yaml_scaffold.py`) that verifies `generate_scaffold()` can produce a full bridge YAML with wifi, web_server, ota, api_key, and sdkconfig_options when `is_bridge=True` and the new bridge wizard params are provided:

```python
def test_generate_bridge_scaffold_with_wifi_and_api_key():
    node = {
        "esphome_name": "espnow-bridge",
        "is_bridge": True,
        "chip_name": "ESP32-C5",
        "espnow_mode": "lr",
        "wifi_ssid_secret": "wifi_ssid",
        "wifi_password_secret": "wifi_password",
        "ota_password": "!secret ota_password",
        "api_key": "!secret bridge_api_key",
        "web_server_port": 80,
        "sdkconfig_options": {
            "CONFIG_FREERTOS_USE_TRACE_FACILITY": "y",
            "CONFIG_ESP_MAIN_TASK_STACK_SIZE": "12288",
        },
    }
    yaml_str, unknown = generate_scaffold(node)
    assert unknown is False
    assert "esphome:" in yaml_str
    assert "espnow-bridge" in yaml_str
    assert "wifi:" in yaml_str
    assert "ssid: !secret wifi_ssid" in yaml_str
    assert "web_server:" in yaml_str
    assert "ota:" in yaml_str
    assert "api_key: !secret bridge_api_key" in yaml_str
    assert "CONFIG_FREERTOS_USE_TRACE_FACILITY" in yaml_str
    assert "esp_tree_bridge:" in yaml_str
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/test_yaml_scaffold.py -v`
Expected: FAIL — `generate_scaffold()` doesn't produce wifi/ota/web_server/api_key blocks

- [ ] **Step 3: Implement bridge scaffold extension**

Modify `generate_scaffold()` in `app/yaml_scaffold.py` to accept additional node keys for the bridge wizard case. When `is_bridge=True`, add:

- `wifi:` block with `ssid: !secret wifi_ssid` and `password: !secret wifi_password` (keys from `node.get("wifi_ssid_secret", "wifi_ssid")` and `node.get("wifi_password_secret", "wifi_password")`)
- `web_server:` block with `port: 80`
- `ota:` block with `password: !secret ota_password`
- `api_key: !secret bridge_api_key` inside the `esp_tree_bridge:` block (from `node.get("api_key", "!secret bridge_api_key")`)
- `espnow_mode:` from `node.get("espnow_mode", "lr")` instead of hardcoded "lr"
- `sdkconfig_options` inside the platform block (from `node.get("sdkconfig_options")`)

The modified `generate_scaffold()` signature stays the same — it just reads more keys from the `node` dict. The bridge YAML should match the design spec:

```yaml
esphome:
  name: espnow-bridge
  friendly_name: espnow-bridge

external_components:
  - source:
      type: local
      path: /opt/esp-tree/components
    components: [esp_tree_bridge, esp_tree_common]

esp32:
  board: esp32-c5-devkitc-1
  variant: esp32c5
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
  espnow_mode: lr
  ota_over_espnow: true
  api_key: !secret bridge_api_key
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/test_yaml_scaffold.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/yaml_scaffold.py test/test_yaml_scaffold.py
git commit -m "feat: extend generate_scaffold() with bridge WiFi/OTA/api_key/sdkconfig support"
```

---

### Task 2: Backend — Add `merge_secrets()` to YAMLStore

**Files:**
- Modify: `app/yaml_store.py:6-56`
- Test: `test/test_yaml_store.py` (create if needed)

- [ ] **Step 1: Write failing test**

```python
def test_merge_secrets_creates_new_file(tmp_path):
    store = YAMLStore(tmp_path)
    store.merge_secrets({"espnow_network_id": "mynet", "wifi_ssid": "HomeWiFi"})
    content = store.get_secrets()
    assert "espnow_network_id" in content
    assert "mynet" in content
    assert "wifi_ssid" in content
    assert "HomeWiFi" in content

def test_merge_secrets_preserves_existing_keys(tmp_path):
    store = YAMLStore(tmp_path)
    store.save_secrets("espnow_network_id: oldnet\nmy_custom_key: custom_value\n")
    store.merge_secrets({"espnow_network_id": "newnet", "wifi_ssid": "HomeWiFi"})
    content = store.get_secrets()
    assert "newnet" in content
    assert "HomeWiFi" in content
    assert "custom_value" in content  # preserved
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/test_yaml_store.py -v`
Expected: FAIL — `merge_secrets()` doesn't exist

- [ ] **Step 3: Implement `merge_secrets()`**

Add to `YAMLStore` class in `app/yaml_store.py`:

```python
def merge_secrets(self, new_values: dict[str, str]) -> None:
    import yaml
    path = self.root / "secrets.yaml"
    existing: dict = {}
    if path.exists():
        try:
            existing = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception:
            existing = {}
    if not isinstance(existing, dict):
        existing = {}
    existing.update(new_values)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.dump(existing, default_flow_style=False), encoding="utf-8")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/test_yaml_store.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/yaml_store.py test/test_yaml_store.py
git commit -m "feat: add merge_secrets() to YAMLStore for bridge wizard secrets merge"
```

---

### Task 3: Backend — Add `detect_chip_on_port()` to ESPHomeCompiler

**Files:**
- Modify: `app/compiler.py:38-536`
- Test: `test/test_compiler.py` (create if needed)

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.asyncio
async def test_detect_chip_on_port_known_chip():
    compiler = ESPHomeCompiler(Path("/tmp/test_devices"), Path("/tmp/test_cache"))
    # Mock esptool output
    with patch("asyncio.create_subprocess_exec") as mock_exec:
        mock_proc = AsyncMock()
        mock_proc.stdout.readline = AsyncMock(side_effect=[
            b"Chip is ESP32-C5 (chip id: 0x00000000)\n", b""
        ])
        mock_proc.wait = AsyncMock(return_value=0)
        mock_proc.returncode = 0
        mock_exec.return_value = mock_proc
        result = await compiler.detect_chip_on_port("/dev/ttyUSB0")
        assert result["chip_name"] == "ESP32-C5"
        assert result["board_info"]["platform"] == "esp32"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest test/test_compiler.py -v`
Expected: FAIL — `detect_chip_on_port()` doesn't exist

- [ ] **Step 3: Implement `detect_chip_on_port()`**

Add to `ESPHomeCompiler` class in `app/compiler.py`:

```python
async def detect_chip_on_port(self, port: str) -> dict[str, Any]:
    from .yaml_scaffold import CHIP_NAME_TO_BOARD
    try:
        await self._ensure_esphome(Path(f"{self.devices_root}/chip_detect_log"))
    except Exception:
        pass
    try:
        proc = await asyncio.create_subprocess_exec(
            self._esptool_bin(),
            "chip_id",
            "--port", port,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subDOUT,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        output = stdout.decode("utf-8", errors="replace")
        if proc.returncode != 0:
            return {"chip_name": "unknown", "board_info": None, "error": output.strip()}
        for line in output.splitlines():
            lower = line.lower()
            for chip_name in CHIP_NAME_TO_BOARD:
                if chip_name.lower() in lower:
                    return {"chip_name": chip_name, "board_info": CHIP_NAME_TO_BOARD[chip_name]}
        return {"chip_name": "unknown", "board_info": None, "raw_output": output.strip()}
    except asyncio.TimeoutError:
        return {"chip_name": "unknown", "board_info": None, "error": "chip detection timed out (10s)"}
    except Exception as exc:
        return {"chip_name": "unknown", "board_info": None, "error": str(exc)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest test/test_compiler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/compiler.py test/test_compiler.py
git commit -m "feat: add detect_chip_on_port() to ESPHomeCompiler for wizard chip detection"
```

---

### Task 4: Backend — DB migration for `flash_wizard_pending` + provisioning queries

**Files:**
- Modify: `app/db.py`

- [ ] **Step 1: Add migration v16**

Add at the end of `app/db.py`:

```python
@register_migration(version=16, description="Add flash_wizard_pending to bridges table")
def migration_016_add_flash_wizard_pending(conn: sqlite3.Connection) -> None:
    _add_column_if_not_exists(conn, "bridges", "flash_wizard_pending", "INTEGER DEFAULT 0")
```

- [ ] **Step 2: Add provisioning query methods**

Add to `Database` class in `app/db.py`:

```python
def get_provisioning_bridge(self) -> dict[str, Any] | None:
    with self.connect() as conn:
        row = conn.execute(
            "SELECT * FROM bridges WHERE flash_wizard_pending = 1 LIMIT 1"
        ).fetchone()
        return self._bridge_row(row)

def cleanup_stale_provisioning(self) -> int:
    with self.connect() as conn:
        cursor = conn.execute(
            "DELETE FROM bridges WHERE flash_wizard_pending = 1 AND mac = 'FF:FF:FF:FF:FF:FF'"
        )
        return cursor.rowcount
```

- [ ] **Step 3: Update `add_bridge()` to accept `mac` and `flash_wizard_pending` params**

Modify `add_bridge()` signature and INSERT to support `mac` and `flash_wizard_pending` kwargs:

```python
def add_bridge(self, host: str, port: int, name: str | None = None, discovered_via: str = "manual",
               api_key: str = "", network_id: str = "", hostname: str = "",
               mac: str = "", flash_wizard_pending: int = 0) -> dict[str, Any]:
```

Add `mac` and `flash_wizard_pending` to the INSERT column list and values tuple.

- [ ] **Step 4: Test DB init with migration**

Start the server (or write a unit test) and verify the `bridges` table now has `flash_wizard_pending` column and `get_provisioning_bridge()` / `cleanup_stale_provisioning()` work correctly.

- [ ] **Step 5: Commit**

```bash
git add app/db.py
git commit -m "feat: add flash_wizard_pending column and provisioning queries to Database"
```

---

### Task 5: Backend — API endpoints (`detect-chip`, `submit`, `status`) + auto-activation

**Files:**
- Modify: `app/server.py`

- [ ] **Step 1: Add request models for flash wizard**

Near the other request models (around line 299-349), add:

```python
class FlashWizardDetectChipRequest(BaseModel):
    port: str

class FlashWizardSubmitRequest(BaseModel):
    name: str
    network_id: str
    psk: str
    wifi_ssid: str
    wifi_password: str
    api_key: str = ""
    espnow_mode: str = "lr"
    ota_password: str = ""
    chip_name: str
    board_info: dict[str, str]
    serial_port: str = ""
```

- [ ] **Step 2: Add `POST /api/bridge/flash-wizard/detect-chip` endpoint**

```python
@app.post("/api/bridge/flash-wizard/detect-chip")
async def flash_wizard_detect_chip(body: FlashWizardDetectChipRequest) -> dict[str, Any]:
    result = await compiler.detect_chip_on_port(body.port)
    return result
```

- [ ] **Step 3: Add `POST /api/bridge/flash-wizard/submit` endpoint**

This endpoint:
1. Cancels any existing compile for the placeholder MAC
2. Calls `generate_scaffold()` with bridge params
3. Saves YAML config via `yaml_store.save_config()`
4. Merges secrets via `yaml_store.merge_secrets()`
5. Creates a placeholder bridge DB record (MAC `FF:FF:FF:FF:FF:FF`, `flash_wizard_pending=1`, `enabled=0`)
6. Creates/updates device entry for placeholder MAC with `esphome_name`
7. Triggers compile via existing compile endpoint logic
8. Returns `{status, mac, esphome_name}`

```python
@app.post("/api/bridge/flash-wizard/submit")
async def flash_wizard_submit(body: FlashWizardSubmitRequest) -> dict[str, Any]:
    from .yaml_scaffold import generate_scaffold, esphome_platform_key
    PLACEHOLDER_MAC = "FF:FF:FF:FF:FF:FF"
    
    # Cancel any existing compile for this device
    existing_job = db.active_job_for_device(PLACEHOLDER_MAC)
    if existing_job:
        await compiler.cancel_compile(PLACEHOLDER_MAC)
    
    # Generate bridge scaffold
    board_info = body.board_info
    node = {
        "esphome_name": body.name,
        "is_bridge": True,
        "chip_name": body.chip_name,
        "espnow_mode": body.espnow_mode,
        "sdkconfig_options": {
            "CONFIG_FREERTOS_USE_TRACE_FACILITY": "y",
            "CONFIG_ESP_MAIN_TASK_STACK_SIZE": "12288",
        },
    }
    yaml_content, _ = generate_scaffold(node)
    yaml_store.save_config(body.name, yaml_content)
    
    # Merge secrets
    yaml_store.merge_secrets({
        "espnow_network_id": body.network_id,
        "espnow_psk": body.psk,
        "wifi_ssid": body.wifi_ssid,
        "wifi_password": body.wifi_password,
        "bridge_api_key": body.api_key,
        "ota_password": body.ota_password,
    })
    
    # Create placeholder bridge record (idempotent: delete existing first)
    existing_prov = db.get_provisioning_bridge()
    if existing_prov:
        db.delete_bridge(existing_prov["uuid"])
    api_key = body.api_key or secrets.token_urlsafe(24)
    bridge = db.add_bridge(
        host="0.0.0.0",
        port=0,
        name=body.name,
        discovered_via="flash_wizard",
        api_key=api_key,
        mac=PLACEHOLDER_MAC,
        flash_wizard_pending=1,
    )
    
    # Ensure device entry exists for placeholder MAC
    db.upsert_devices_from_topology([{
        "mac": PLACEHOLDER_MAC,
        "label": body.name,
        "esphome_name": body.name,
        "chip_name": body.chip_name,
        "is_bridge": True,
    }], "flash_wizard")
    
    # Trigger compile
    if not yaml_store.has_config(body.name):
        raise HTTPException(status_code=404, detail="config not found after save")
    nm = normalize_mac(PLACEHOLDER_MAC)
    active = db.active_job_for_device(nm)
    if active:
        raise HTTPException(status_code=409, detail=f"device already has an active job ({active['status']})")
    job = db.create_job({
        "mac": nm,
        "status": COMPILE_QUEUED,
        "esphome_name": body.name,
        "firmware_name": f"{body.name}.ota.bin",
        "percent": 0,
    })
    compile_worker.wake()
    
    return {"status": "compiling", "mac": nm, "esphome_name": body.name, "job_id": job["id"]}
```

- [ ] **Step 4: Add `GET /api/bridge/flash-wizard/status` endpoint**

```python
@app.get("/api/bridge/flash-wizard/status")
async def flash_wizard_status() -> dict[str, Any]:
    prov = db.get_provisioning_bridge()
    if not prov:
        return {"provisioning": False}
    mac = "FF:FF:FF:FF:FF:FF"
    esphome_name = prov.get("name") or ""
    compile_status = {}
    if esphome_name:
        compile_status = compiler.compile_status(esphome_name) or {}
    serial_status = compiler.serial_flash_status(esphome_name) if esphome_name else {}
    # Check if bridge has been detected (not placeholder MAC anymore)
    return {
        "provisioning": True,
        "esphome_name": esphome_name,
        "mac": mac,
        "compile_status": compile_status.get("status", "idle"),
        "serial_flash_status": serial_status.get("status", "idle"),
        "bridge_detected": prov.get("host", "0.0.0.0") not in ("", "0.0.0.0"),
        "detected_bridge": None if prov.get("host") == "0.0.0.0" else {
            "host": prov.get("host"),
            "port": prov.get("port", 80),
            "name": prov.get("name"),
        },
    }
```

- [ ] **Step 5: Add auto-activation logic in bridge discovery**

In the `_run_bridge_scan()` callback or `discover_bridges()` endpoint, after scanning, check if any discovered bridge matches a provisioning DB record. Since the bridge doesn't expose its API key in bridge.json, we match by trying HMAC validation against each discovered bridge.

Add a helper function:

```python
async def _try_auto_activate_provisioned_bridge(discovered: list[dict]) -> bool:
    prov = db.get_provisioning_bridge()
    if not prov:
        return False
    api_key = prov.get("api_key") or ""
    if not api_key:
        return False
    for bridge in discovered:
        host = bridge["host"]
        port = int(bridge.get("port", 80))
        result = await validate_bridge_key_pb(host, port, api_key)
        if result.get("valid"):
            # Update bridge with real info
            db.update_bridge(prov["uuid"], host=host, port=port, enabled=1, flash_wizard_pending=0)
            await reconnect_bridge()
            return True
    return False
```

Call this after `_run_bridge_scan()` saves discovered bridges:

```python
# At the end of _run_bridge_scan():
await _try_auto_activate_provisioned_bridge(discovered)
```

- [ ] **Step 6: Add startup cleanup for stale provisioning records**

In `create_app()`, after DB init:

```python
cleaned = db.cleanup_stale_provisioning()
if cleaned:
    logger.info("Cleaned up %d stale flash wizard provisioning record(s)", cleaned)
```

- [ ] **Step 7: Verify all three endpoints work via curl**

Test each endpoint manually or write integration tests.

- [ ] **Step 8: Commit**

```bash
git add app/server.py
git commit -m "feat: add flash wizard endpoints and auto-activation for bridge provisioning"
```

---

### Task 6: Backend — Make `compile_device_config` and `flash_serial` work with placeholder MAC

**Files:**
- Modify: `app/server.py:2245-2279` (compile endpoint)
- Modify: `app/server.py:2567-2615` (serial flash endpoint)

- [ ] **Step 1: Verify compile works with placeholder MAC**

The compile endpoint (`POST /api/devices/{mac}/compile`) looks up the device by MAC, gets `esphome_name`, and checks config exists. With the `submit` endpoint creating a device entry with `esphome_name` for MAC `FF:FF:FF:FF:FF:FF`, this should work. Verify by tracing the code path:

1. `db.get_device("FF:FF:FF:FF:FF:FF")` → returns device with `esphome_name="espnow-bridge"`
2. `yaml_store.has_config("espnow-bridge")` → True (we just saved it)
3. `db.create_job(...)` → creates compile job
4. Compile worker picks it up, compiles the YAML

No changes needed — verify this works or make minimal adjustments.

- [ ] **Step 2: Verify serial flash works with placeholder MAC**

The serial flash endpoint (`POST /api/devices/{mac}/flash/serial`) likewise looks up device by MAC → gets `esphome_name` → finds factory binary. After a successful compile, the factory binary will be at `devices_root/espnow-bridge/espnow-bridge.factory.bin`. This should work as-is.

No changes needed — verify in testing.

- [ ] **Step 3: Commit any adjustments**

```bash
git add app/server.py
git commit -m "fix: ensure compile and serial flash endpoints work with placeholder MAC"
```

---

### Task 7: Frontend — API client methods for flash wizard

**Files:**
- Modify: `ui/src/api/client.ts`

- [ ] **Step 1: Add flash wizard API methods**

Add to the `api` object in `client.ts`:

```typescript
detectChip: (port: string) =>
  request<{ chip_name: string; board_info: Record<string, string> | null; error?: string }>('/api/bridge/flash-wizard/detect-chip', {
    method: 'POST',
    body: JSON.stringify({ port }),
  }),

submitFlashWizard: (config: {
  name: string;
  network_id: string;
  psk: string;
  wifi_ssid: string;
  wifi_password: string;
  api_key: string;
  espnow_mode: string;
  ota_password: string;
  chip_name: string;
  board_info: Record<string, string>;
  serial_port: string;
}) =>
  request<{ status: string; mac: string; esphome_name: string; job_id: number }>('/api/bridge/flash-wizard/submit', {
    method: 'POST',
    body: JSON.stringify(config),
  }),

getFlashWizardStatus: () =>
  request<{
    provisioning: boolean;
    esphome_name?: string;
    mac?: string;
    compile_status?: string;
    serial_flash_status?: string;
    bridge_detected?: boolean;
    detected_bridge?: { host: string; port: number; name: string } | null;
  }>('/api/bridge/flash-wizard/status'),
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/api/client.ts
git commit -m "feat: add flash wizard API client methods"
```

---

### Task 8: Frontend — Refactor Step 1 to 3-tab layout

**Files:**
- Modify: `ui/src/pages/setup-page.ts`

- [ ] **Step 1: Add tab state and refactor `renderStep1()`**

Add new `@state()` properties for the flash wizard:

```typescript
@state() private flashTab: 'discover' | 'manual' | 'flash' = 'discover';
@state() private flashStage: 'config' | 'compiling' | 'flashing' | 'detecting' | 'complete' | 'error' = 'config';
@state() private flashName = 'espnow-bridge';
@state() private flashNetworkId = '';
@state() private flashPsk = '';
@state() private flashWifiSsid = '';
@state() private flashWifiPassword = '';
@state() private flashApiKey = '';
@state() private flashEspnowMode = 'lr';
@state() private flashOtaPassword = '';
@state() private flashSerialPort = '';
@state() private flashChipName = '';
@state() private flashBoardInfo: Record<string, string> | null = null;
@state() private flashChipDetecting = false;
@state() private flashChipDetectError = '';
@state() private flashCompileError = '';
@state() private flashSerialError = '';
@state() private flashDetectError = '';
@state() private flashDetectElapsed = 0;
@state() private flashSecretsPreloaded = false;
@state() private flashSecretsWarning = '';
@state() private flashMac = '';
@state() private flashJobId = 0;
@state() private serialPorts: SerialPortInfo[] = [];
private flashDetectTimer: ReturnType<typeof setInterval> | null = null;
private flashCompilePollTimer: ReturnType<typeof setInterval> | null = null;
```

Refactor `renderStep1()` to show 3 tab buttons ("Discover" | "Manual" | "Flash New Bridge") above the content. Existing scan/manual content goes inside the first two tabs. New flash wizard content goes in the "Flash" tab.

- [ ] **Step 2: Wire up tab switching**

Add tab click handlers that toggle `flashTab` and reset flash wizard state when entering the flash tab.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "feat: add 3-tab layout to setup wizard Step 1"
```

---

### Task 9: Frontend — Flash wizard config form (Stage A + B)

**Files:**
- Modify: `ui/src/pages/setup-page.ts`

- [ ] **Step 1: Build config form with pre-fill**

The config form renders when `flashStage === 'config'` and `flashTab === 'flash'`:

- On mount (when entering flash tab for first time), call `GET /api/secrets` and `GET /api/serial/ports` to pre-fill.
- Pre-fill: `espnow_network_id` → `flashNetworkId`, `espnow_psk` → `flashPsk`, `wifi_ssid` → `flashWifiSsid`, `wifi_password` → `flashWifiPassword`, `bridge_api_key` → `flashApiKey`, `ota_password` → `flashOtaPassword`.
- Auto-generate `flashApiKey` (24-char base64) and `flashOtaPassword` (32-char random) if not pre-filled.
- Show warning if secrets had existing network_id/PSK values: "Changing these values will break communication with any existing remotes on this network".
- Serial port dropdown populated from serial ports API. If empty, show help about USB passthrough.
- ESP-NOW mode dropdown: `lr` (default) / `regular`.

- [ ] **Step 2: Add chip detection on port selection**

When user selects a serial port:
1. Set `flashChipDetecting = true`, `flashChipDetectError = ''`
2. Call `api.detectChip(port)`
3. On success: set `flashChipName`, `flashBoardInfo`, clear detecting spinner
4. On failure: set `flashChipDetectError`, show board picker dropdown with all `CHIP_NAME_TO_BOARD` entries (hardcoded in frontend or fetched from an endpoint)

- [ ] **Step 3: Add form validation**

- Required fields: name, network_id, psk, wifi_ssid, wifi_password, serial_port, (chip detected or board picked)
- PSK: validate 64 hex chars
- Name: validate ESPHome name format (lowercase, no spaces, alphanumeric + hyphens)
- Show inline error messages on validation failure

- [ ] **Step 4: Wire "Next: Prepare Firmware" button**

Validate all fields, then call `api.submitFlashWizard(config)` with all form values. On success, store `flashMac` and `flashJobId`, transition to `flashStage = 'compiling'`.

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "feat: add flash wizard config form with pre-fill and chip detection"
```

---

### Task 10: Frontend — Compile & flash panel extraction and integration

**Files:**
- Create: `ui/src/components/compile-flash-panel.ts`
- Modify: `ui/src/pages/setup-page.ts`
- Modify: `ui/src/pages/config-page.ts`

- [ ] **Step 1: Create `compile-flash-panel.ts`**

Extract a reusable Lit element `<compile-flash-panel>` from the compile/flash section of config-page.ts. Props:

```typescript
@property({ type: String }) esphomeName = '';
@property({ type: String }) mac = '';
@property({ type: String }) serialPort = '';
@property({ type: String }) mode: 'full' | 'wizard' = 'full';
```

The component manages:
- Compile status polling (`api.getCompileStatus(mac)`)
- Compile log streaming (`api.streamCompileLogs(mac)`)
- Serial flash status polling (`api.getSerialFlashStatus(mac)`)
- Serial flash log streaming (`api.streamSerialFlashLogs(mac)`)
- Phase state machine: `idle → compiling → compiled → flashing → complete | failed`

In "wizard" mode: no YAML editor, no OTA option, streamlined progress UI.
In "full" mode: current config page behavior.

- [ ] **Step 2: Integrate panel into setup-page.ts flash wizard**

When `flashStage === 'compiling'` or `flashStage === 'flashing'`:

```html
<compile-flash-panel
  .esphomeName=${this.flashName}
  .mac=${this.flashMac}
  .serialPort=${this.flashSerialPort}
  mode="wizard"
  @compile-success=${this._onCompileSuccess}
  @flash-success=${this._onFlashSuccess}
  @error=${this._onFlashError}
></compile-flash-panel>
```

- [ ] **Step 3: Refactor config-page.ts to use shared panel**

Replace inline compile/flash UI in config-page.ts with `<compile-flash-panel>` in "full" mode. This is a refactor — same behavior, extracted component.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/compile-flash-panel.ts ui/src/pages/setup-page.ts ui/src/pages/config-page.ts
git commit -m "feat: extract compile-flash-panel component and integrate into setup wizard"
```

---

### Task 11: Frontend — Post-flash bridge detection (Stage D)

**Files:**
- Modify: `ui/src/pages/setup-page.ts`

- [ ] **Step 1: Implement detection state UI**

When `flashStage === 'detecting'`:
- Show spinner + "Waiting for bridge..." + elapsed timer
- Trigger `api.triggerScan()` immediately
- Poll `api.getFlashWizardStatus()` every 2 seconds
- When `bridge_detected === true`: transition to `flashStage = 'complete'`

- [ ] **Step 2: Implement timeout (90 seconds)**

Track elapsed seconds. After 90s, transition to detection error state with:
- "Retry Scan" button → re-trigger scan, reset timer
- "Skip" button → dismiss sub-wizard, return to Step 1 Discover tab
- Help text about WiFi connectivity

- [ ] **Step 3: Implement successful detection flow**

When bridge is detected:
1. Show success: "Bridge detected and connected!"
2. Wait 1.5 seconds
3. Set `step1 = 'complete'`
4. Advance to Step 2

- [ ] **Step 4: Cleanup on component disconnect**

Clear all flash wizard timers (`flashDetectTimer`, `flashCompilePollTimer`) in `disconnectedCallback()`.

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "feat: add post-flash bridge detection UI with timeout and retry"
```

---

### Task 12: Integration — End-to-end testing and polish

**Files:**
- Modify: `app/server.py` (startup cleanup)
- Modify: `Dockerfile` (verify esptool availability — should already be present via ESPHome venv)

- [ ] **Step 1: Verify esptool in Docker container**

The `_ensure_esphome()` method creates the ESPHome venv which installs esptool. The `_esptool_bin()` method already locates it. For `detect_chip_on_port()`, we need esptool available before a compile has ever happened. Call `_ensure_esphome()` at the start of `detect_chip_on_port()` to ensure esptool exists.

- [ ] **Step 2: Test full flow end-to-end**

Manually test:
1. Fresh add-on install → setup wizard → "Flash New Bridge" tab
2. Fill config → select port → chip detected → submit → compile → serial flash → detect → Step 1 complete
3. Verify bridge appears in topology after Step 3 completes

- [ ] **Step 3: Test backward navigation**

1. Go back from compile stage → change config → re-submit → verify scaffold overwritten, secrets merged, new compile starts
2. Go back from flash stage → re-flash → verify no duplicate compile
3. Switch to Discover/Manual tab → compile should continue in background

- [ ] **Step 4: Test edge cases**

1. No serial ports found → "No serial ports found" message with USB passthrough help
2. Chip detection failure → board picker dropdown
3. Compile failure → error log shown, "Retry" button
4. Serial flash failure → "Retry Flash" button
5. Abandoned wizard → stale provisioning record cleaned on restart

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: bridge flash wizard end-to-end polish and edge case handling"
```

---

## Risk & Mitigation (from spec)

| Risk | Mitigation |
|------|------------|
| esptool not available before first compile | `_ensure_esphome()` called at start of `detect_chip_on_port()` |
| USB passthrough not configured in HA | "No serial ports" help text with HA docs link |
| Chip auto-detect fails | Fallback board picker with all `CHIP_NAME_TO_BOARD` entries |
| Bridge takes >90s to appear | "Retry Scan" + "Skip" options on timeout |
| Secrets.yaml merge corrupts keys | YAML safe_load/dump; test with complex secrets files |
| Placeholder MAC collision | `FF:FF:FF:FF:FF:FF` is not a valid ESP32 MAC |
| Compile takes long (5+ min first build) | SSE streaming log shown during compile |
| Provisioning DB records accumulate | Cleanup on startup; stale records with placeholder MAC deleted |