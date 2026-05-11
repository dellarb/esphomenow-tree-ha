# Phase 1: Shared DB + Multi-Bridge Addon + Auto-Sync Integration

## Decisions Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | DB location | `/share/esp_tree/esp_tree.db` | HAOS convention for cross-addon data; docker-compose uses shared bind mount |
| 2 | DB scope | Full DB on `/share/`, integration only reads bridge tables | One DB, simple; since addon+integration always deploy together, full schema exposure is fine |
| 3 | Integration finds DB path | Hardcode `/share/esp_tree/esp_tree.db` | Deterministic in HAOS; docker users override via env later if needed |
| 4 | Config flow for bridges | Remove entirely (auto from DB) | No existing users; fresh start; addon UI is sole control surface |
| 5 | Config entry unique ID | Bridge UUID (DB primary key) | Survives delete/re-add cycles unlike auto-increment |
| 6 | UUID implementation | Replace `id` with `uuid TEXT PRIMARY KEY` | Cleaner than adding a separate column |
| 7 | Default bridge concept | Remove; replaced by `is_active` boolean | No default, just active - the one the addon WS is connected to |
| 8 | Multi-bridge addon | Phase 1 = one active WS at a time, schema supports multiple | Architecting for multi-bridge; one active connection for now |
| 9 | `is_active` column | Add `is_active INTEGER DEFAULT 0`; only one bridge can be `is_active=1` | Explicit selection via addon UI "Activate" button |
| 10 | Integration follows `is_active`? | No - integration connects to ALL bridges independently | Long-term vision: integration owns datastream; decoupled from addon connection state |
| 11 | Integration connects directly to bridges | Yes, via existing `/esp-tree/v2/pb` protobuf endpoint on ESP32 | No change to protobuf API; integration already talks directly to ESP32 bridge firmware |
| 12 | Config entry content | Stores only `{"bridge_uuid": "..."}` as bookmark | All connection data (host, port, api_key, name) comes from DB on each entry setup |
| 13 | Bridge removed from DB | Remove config entry + disconnect client | DB is source of truth; clean removal |
| 14 | Bridge changed in DB | Reload config entry via `async_reload()` | Simplest; brief disconnect is acceptable for rare config changes |
| 15 | Cold start handling | Retry with backoff - DB may not exist yet | No ordering dependency between addon and integration startup |
| 16 | BridgeManager class | Remove entirely | Was wrapper around two discovery paths (bridge_config + HA states) that no longer exist |
| 17 | ha_client.py | Keep - used for HA state discovery in addon UI | Discovery stays as addon UI feature; BridgeManager removed but discovery helpers remain |
| 18 | bridge_config table | Remove entirely | All bridge config lives in `bridges` table now |
| 19 | Schema migration | Drop and recreate tables (no existing users) | Clean slate; no migration needed |
| 20 | Addon UI for bridges | Multiple bridge management with activate button | User controls all bridge add/remove/activate via addon UI |
| 21 | Polling interval | 10 seconds | Integration polls DB for bridge list changes |
| 22 | Integration auto-discovery flow | Zero-step auto-detect flow | Checks for DB at known path; auto-submits if found; error if not |

---

## Part 1: Addon DB Migration

### 1.1 Move DB to `/share/`

- Add `share` map to `config.yaml`:
  ```yaml
  map:
    - type: homeassistant_config
      read_only: false
    - type: share
      read_only: false
  ```
- Change default DB path in `config.py` from `/data/esp_tree.db` to `/share/esp_tree/esp_tree.db`
- Ensure `/share/esp_tree/` directory is created on startup if it doesn't exist
- Add startup script or init to `mkdir -p /share/esp_tree`

### 1.2 Schema: Replace `bridges` table with UUID PK + `is_active`

Drop `bridge_config` and `bridges` tables, recreate `bridges`:

```sql
CREATE TABLE IF NOT EXISTS bridges (
    uuid TEXT PRIMARY KEY,
    name TEXT,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 80,
    discovered_via TEXT DEFAULT 'manual',
    api_key TEXT DEFAULT '',
    network_id TEXT DEFAULT '',
    is_active INTEGER DEFAULT 0,
    last_connected_at INTEGER,
    created_at INTEGER
);
```

**Methods to remove from `db.py`:**
- `get_bridge_config()`
- `set_bridge_config()`
- `mark_bridge_validated()`
- `get_default_bridge()`
- `set_default_bridge()` (was broken - referenced non-existent `is_default` column)
- `get_bridge(bridge_id: int)` - replaced by UUID version
- `add_bridge()` - rewrite (remove `DELETE FROM bridges` line, generate UUID)
- `update_bridge(bridge_id: int, ...)` - rewrite to use UUID
- `delete_bridge(bridge_id: int)` - rewrite to use UUID
- `list_bridges()` - update return to include `is_active`

**Methods to add to `db.py`:**
- `get_bridge(uuid: str) -> dict | None`
- `get_active_bridge() -> dict | None` - returns bridge where `is_active = 1`
- `add_bridge(host, port, name, discovered_via, api_key, network_id) -> dict` - generates UUID, inserts
- `update_bridge(uuid: str, **values) -> dict | None`
- `delete_bridge(uuid: str) -> None`
- `set_active_bridge(uuid: str) -> dict | None` - sets `is_active=0` on all, then `is_active=1` on target

**Constraint:** Only one bridge may have `is_active=1`. Enforced in `set_active_bridge()`:
```sql
UPDATE bridges SET is_active = 0;
UPDATE bridges SET is_active = 1 WHERE uuid = ?;
```

### 1.3 Delete `bridge_config.py`

Remove `BridgeManager` class entirely. It was a wrapper around:
- `_resolve_from_db()` → read `bridge_config` table (gone)
- `_discover_ha()` → scan HA states for bridge (no longer used for resolution)

Replace all `bridge_manager.resolve()` calls with `db.get_active_bridge()`.

### 1.4 Update `server.py` endpoints

**Remove:**
- `GET /api/config` (read `bridge_config`)
- `PUT /api/config/bridge` (write `bridge_config`)
- `DELETE /api/config/bridge` (clear `bridge_config`)

**Keep and update (change `bridge_id` int → `uuid` string):**
- `GET /api/bridges` - list all, now includes `is_active`
- `POST /api/bridges` - add bridge, generates UUID, no more `DELETE FROM bridges`, validates connection if api_key provided
- `PUT /api/bridges/{uuid}` - update bridge, validates if host/port/api_key changed
- `DELETE /api/bridges/{uuid}` - delete bridge, if it was active, deactivate and disconnect WS
- `POST /api/bridge/select` - select discovered bridge, generates UUID, auto-activate if no other bridge active

**Add:**
- `PUT /api/bridges/{uuid}/activate` - sets `is_active=1`, sets all others to `is_active=0`, reconnects WS to this bridge

**Update `reconnect_ws_manager()`:**
- Replace `bridge_manager.resolve()` with: read `db.get_active_bridge()`, convert to `BridgeTarget`, start WS
- Remove `BridgeManager` import and instantiation from app setup

**Add new config endpoint (replacing deleted `/api/config`):**
- `GET /api/config` - rework to return active bridge info from `bridges` table + WS status (no more `bridge_config`)

### 1.5 Update Pydantic models in `server.py`

- `BridgeAddRequest`: no change (host, port, name, api_key)
- `BridgeUpdateRequest`: no change (name, host, port, api_key)
- `BridgeSelectRequest`: no change
- Remove: `BridgeConfigUpdate` (was for legacy `PUT /api/config/bridge`)

### 1.6 Update `bridge_ws_client.py`

- `BridgeWsManager.get_default_bridge()` references → `db.get_active_bridge()`
- No other changes to the WS client classes themselves

---

## Part 2: Addon UI Update

### 2.1 Update `ui/src/api/client.ts`

**Type changes:**
```typescript
interface ConfiguredBridge {
  uuid: string;          // was id: number
  name: string;
  host: string;
  port: number;
  discovered_via: string;
  api_key?: string;
  network_id?: string;
  is_active: boolean;    // new
  last_connected_at?: number;
  created_at?: number;
}
```

**Methods to update:**
- `api.addBridge(host, port, name?, apiKey?)` → returns bridge with `uuid`
- `api.updateBridge(uuid, name?, host?, port?, apiKey?)` → uuid param
- `api.deleteBridge(uuid)` → uuid param

**Methods to add:**
- `api.activateBridge(uuid: string)` → `PUT /api/bridges/{uuid}/activate`

**Methods to remove:**
- `api.setBridge(host, port)` → legacy `PUT /api/config/bridge`
- `api.clearBridge()` → legacy `DELETE /api/config/bridge`
- `api.setDefaultBridge(id)` → was 404 anyway

### 2.2 Update `ui/src/components/settings.ts`

**Bridge list rendering:**
- Show `is_active` badge on active bridge (green dot / "Active" label)
- Show "Activate" button on inactive bridges
- Show "Deactivate" option on active bridge (sets `is_active=0`, disconnects WS)
- Show connection status per bridge by comparing against `config.active_bridge`

**Discovery flow:**
- No change: discover → select → add with api_key
- After adding, auto-activate if no other bridge is active

**Remove:**
- Any legacy bridge config UI (host/port form for `PUT /api/config/bridge`)

**Bridge edit:**
- Edit API key works as before, but with UUID
- Edit host/port/name also works, triggers re-validation

---

## Part 3: Integration Shared DB Reader

### 3.1 Add SQLite dependency

Add to `manifest.json`:
```json
"requirements": ["protobuf>=4.25.0", "aiosqlite>=0.20.0"]
```

### 3.2 Create `bridge_db.py` in integration

```python
class BridgeDB:
    DB_PATH = "/share/esp_tree/esp_tree.db"

    async def get_bridges(self) -> list[BridgeRow]:
        # Open DB read-only: sqlite:///path?mode=ro
        # Query: SELECT * FROM bridges
        # Return list of BridgeRow dataclasses
        # If DB file missing: return []

    async def get_bridge(self, uuid: str) -> BridgeRow | None:
        # SELECT * FROM bridges WHERE uuid = ?
```

Uses `aiosqlite` with `mode=ro` for safe concurrent reads. WAL mode (set by addon) handles read/write concurrency.

### 3.3 Update `const.py`

```python
CONF_BRIDGE_UUID = "bridge_uuid"
SHARED_DB_PATH = "/share/esp_tree/esp_tree.db"
```

### 3.4 Create auto-discovery config flow

`config_flow.py` - zero-step flow:
- `async_step_user()` auto-submits with no fields
- Sets unique ID to `"esp_tree_shared_db"`
- Creates entry with `data={"bridge_uuid": ""}` (placeholder, will be replaced per-bridge)
- Actually: integration entry is ONE entry for the whole system, with bridge-level entries managed programmatically

**Better approach:** The integration has one "hub" config entry (auto-created, zero-step). Bridge config entries are created/removed programmatically by the watcher, each with `data={"bridge_uuid": "..."}`.

### 3.5 Create bridge watcher

New file: `bridge_watcher.py`

```python
class BridgeWatcher:
    def __init__(self, hass, runtime, db):
        self._cached_bridges: dict[str, BridgeRow] = {}
        self._remove_timer = None

    async def start(self):
        # Start 10-second polling via async_track_time_interval
        self._remove_timer = async_track_time_interval(
            self.hass, self._tick, timedelta(seconds=10)
        )

    async def _tick(self, _now=None):
        bridges = await self.db.get_bridges()
        current_uuids = {b.uuid for b in bridges}

        # New bridges: not in cached list
        new = [b for b in bridges if b.uuid not in self._cached_bridges]

        # Removed bridges: in cached list but not in DB
        removed = [uuid for uuid in self._cached_bridges if uuid not in current_uuids]

        # Changed bridges: same UUID but different host/port/api_key
        changed = [b for b in bridges
                   if b.uuid in self._cached_bridges
                   and self._bridge_changed(b, self._cached_bridges[b.uuid])]

        for bridge in new:
            await self._add_bridge_entry(bridge)
        for uuid in removed:
            await self._remove_bridge_entry(uuid)
        for bridge in changed:
            await self._reload_bridge_entry(bridge)

        self._cached_bridges = {b.uuid: b for b in bridges}
```

### 3.6 Update `bridge_runtime.py`

**`add_entry()` changes:**
- Read `bridge_uuid` from `entry.data`
- Look up bridge from `BridgeDB` by UUID
- Create `BridgeRuntimeClient` with host/port/api_key/name from DB row
- If DB row not found (bridge deleted before entry setup), log warning, skip

**`remove_entry()` changes:**
- No change - still stops the client by entry_id

### 3.7 Update `__init__.py`

- On `async_setup()`: create `BridgeDB` instance, start `BridgeWatcher`
- On `async_setup_entry()`: pass bridge UUID to runtime; runtime reads connection details from DB

### 3.8 Update `strings.json`

Remove form field labels (host, port, api_key, name). The step becomes auto-complete with no user-visible form.

---

## Part 4: Startup & Edge Cases

### 4.1 Cold start handling

- If DB file doesn't exist at integration startup, log info-level message, return empty bridge list
- Next 10s poll retries; once addon creates the DB, bridges appear
- No ordering dependency between addon and integration

### 4.2 DB read access

- All integration DB opens use `mode=ro` URI parameter
- WAL mode (set by addon's `PRAGMA journal_mode=WAL`) enables concurrent reads during writes
- If DB is locked/busy, catch `sqlite3.OperationalError`, retry after short delay

### 4.3 Docker-compose support

Both containers mount the same host directory:
```yaml
services:
  addon:
    volumes:
      - esp_tree_data:/share/esp_tree
  homeassistant:
    volumes:
      - esp_tree_data:/share/esp_tree:ro
volumes:
  esp_tree_data:
```

Add DB path env var override for flexibility: `ESP_TREE_DB` (addon already supports this).

---

## Part 5: Future Phases (Architecting For)

These are NOT in scope for Phase 1 but the schema and architecture should support them:

### Phase 2: Multiple active bridges (addon)
- `BridgeWsManager` manages multiple concurrent `BridgeWsClient` instances
- Multiple bridges can have `is_active=1` simultaneously
- `server.py` and workers updated to route commands via correct bridge
- UI shows per-bridge connection status independently

### Phase 3: Integration writes entity states to DB
- Integration writes entity state updates directly to shared DB tables
- Allows dropping the v2/pb WebSocket push channel from integration to HA
- Addon reads states from DB instead of receiving them via WS

### Phase 4: Integration owns bridge config writes
- Integration can add/remove bridges via HA UI
- Shared DB becomes read-write for both sides
- Addon may become a thin bridge-forwarder only

---

## Files Changed Summary

| Area | File | Change |
|------|------|--------|
| Addon Config | `config.yaml` | Add `share` map |
| Addon Config | `esphome-app/config.py` | Update default DB path to `/share/esp_tree/` |
| Addon Config | `rootfs/` | Add startup mkdir for `/share/esp_tree/` |
| Addon DB | `esphome-app/db.py` | New schema, remove `bridge_config` methods, UUID PK, `is_active`, `get_active_bridge()`, `set_active_bridge()` |
| Addon Config | `esphome-app/bridge_config.py` | **Delete file** |
| Addon Server | `esphome-app/server.py` | Remove legacy endpoints, UUID CRUD, add `/activate`, remove `BridgeManager` usage |
| Addon WS | `esphome-app/bridge_ws_client.py` | Update `BridgeWsManager` references to `get_active_bridge()` |
| Addon UI | `ui/src/api/client.ts` | UUID types, remove legacy methods, add `activateBridge()` |
| Addon UI | `ui/src/components/settings.ts` | UUID bridge list, activate button, remove legacy config, auto-activate on add |
| Integration | `ha_integration/custom_components/esp_tree/manifest.json` | Add `aiosqlite` requirement |
| Integration | `ha_integration/custom_components/esp_tree/const.py` | Add `CONF_BRIDGE_UUID`, `SHARED_DB_PATH` |
| Integration | **New**: `ha_integration/custom_components/esp_tree/bridge_db.py` | `BridgeDB` class for reading shared SQLite |
| Integration | **New**: `ha_integration/custom_components/esp_tree/bridge_watcher.py` | Polling 10s interval, diff bridges, create/remove/reload entries |
| Integration | `ha_integration/custom_components/esp_tree/config_flow.py` | Zero-step auto-submit flow |
| Integration | `ha_integration/custom_components/esp_tree/__init__.py` | Start bridge watcher on setup |
| Integration | `ha_integration/custom_components/esp_tree/bridge_runtime.py` | Read connection data from DB; `entry.data` = `{bridge_uuid}` only |
| Integration | `ha_integration/custom_components/esp_tree/strings.json` | Remove form fields, auto-step only |