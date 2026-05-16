# Workplan: Multi-Bridge Support

## Objective

Remove the single-active-bridge constraint so the addon can maintain concurrent connections to multiple ESP-NOW LR bridges simultaneously. `BridgeV2Manager` already supports multiple bridge clients — the constraint lives entirely in `db.py` (singular `get_active_bridge`), `server.py` (activate/deactivate endpoints, singular `active_bridge` in `/api/config`), and the UI (activate/deactivate buttons, singular `active_bridge` check). Remove that constraint and let all enabled bridges connect concurrently.

## Scope

### In Scope

- **`db.py`**: Remove `is_active` alias, `get_active_bridge`, `set_active_bridge`, `clear_active_bridge`. Add `toggle_bridge()`.
- **`server.py`**: Remove activate/deactivate endpoints. Add enable/disable. Replace singular `active_bridge` in `/api/config` and `/api/setup-status` with per-bridge connection status. Update OTA routing (already per-remote via `bridge_manager.ota_client_for_remote()`). Remove `POST /api/bridge/select`.
- **`ota_worker.py`**: Fix `bridge_manager.connected` check to be target-bridge-specific instead of "any bridge". Handle bridge disconnection during OTA.
- **UI**: Remove activate/deactivate. Add enable/disable toggle and per-bridge connection status.

### Out of Scope

- **HA integration changes** — already multi-bridge aware via `BridgeV2Manager`
- **`BridgeV2Manager` changes** — already multi-bridge with `_routes` and `_clients`
- **`BridgeWsManager` refactor** — this class doesn't exist; the only bridge transport is `BridgeV2Manager`
- **Firmware changes**
- **`bridge_config.py` removal** — already gone
- **`BridgeManager` class removal** — already gone

## Approach

### Single Routing System

The addon has one bridge communication path: **`BridgeV2Manager`** (protobuf WebSocket, `bridge_v2_client.py`). It already manages `_clients: dict[str, BridgeV2Client]` and `_routes: dict[str, RemoteRoute]`. Commands and OTA route to the correct bridge via `_route_for_remote(mac)`. No second transport layer exists.

The bottleneck is that `db.py` and `server.py` treat `enabled` as a single-active flag — only one bridge can be enabled at a time, and `get_active_bridge()` returns `LIMIT 1`. The fix is straightforward: let all enabled bridges connect, remove the singular active concept, and expose per-bridge status.

### Enabled vs. Active

- **`enabled`** (DB column, user intent): `1` = "connect to this bridge on startup". `0` = "keep config but don't connect".
- Remove `is_active` entirely. No more single-active constraint.
- New bridges default to `enabled=1`, connected immediately.
- Connection state (`connected`, `error`, `disconnected`) is **runtime only**, derived from `bridge_manager._clients` and never stored in DB.

### Implementation Strategy: Backend First, Then UI

Combine all backend changes (db, server, OTA worker, cleanup) into one pass, then UI as a separate pass. This reduces integration friction — the backend API changes are all deployed together, and the UI adapts to the new API shape.

---

## Phases

### Phase 1: Backend (db.py + server.py + ota_worker.py + cleanup)

All backend changes in one pass. Each file change is independent but should be committed together.

#### 1A. `db.py`

1A.1. **Remove `is_active` from `_bridge_row()`** — remove the line `data["is_active"] = data["enabled"]`. Bridge rows should not contain `is_active`.

1A.2. **Remove `get_active_bridge()`** — no longer needed. Callers use `get_enabled_bridges()` or `get_bridge(uuid)`.

1A.3. **Remove `set_active_bridge()`** — was setting `enabled=1` on one bridge. No longer valid in multi-bridge world.

1A.4. **Remove `clear_active_bridge()`** — was disabling one or all bridges. No longer valid.

1A.5. **Verify `list_enabled_bridges()`** — confirm it returns all enabled bridges (no `LIMIT 1`). Current implementation already does this — just verify the query.

1A.6. **Add `toggle_bridge(uuid, enabled)`** — sets `enabled` to 0 or 1 for a specific bridge. Returns the updated row.

1A.7. **Update `add_bridge()`** — verify that new bridges default to `enabled=1` (they already do). No other changes needed.

1A.8. **Migration** — no schema change needed. The DB column was always `enabled`; `is_active` was only a computed alias in `_bridge_row()`. Removing it from the Python layer is sufficient.

**Validation:** All `db.py` tests should pass. No callers should reference `is_active`, `get_active_bridge`, `set_active_bridge`, or `clear_active_bridge`.

#### 1B. `server.py`

1B.1. **Remove `PUT /api/bridges/{uuid}/activate`** — replaced by enable endpoint.

1B.2. **Remove `PUT /api/bridges/{uuid}/deactivate`** — replaced by disable endpoint.

1B.3. **Add `PUT /api/bridges/{uuid}/enable`** — calls `db.toggle_bridge(uuid, True)`, then `reconnect_bridge()` (which calls `bridge_manager.sync_bridges(db.list_enabled_bridges())`). Returns updated bridge row.

1B.4. **Add `PUT /api/bridges/{uuid}/disable`** — calls `db.toggle_bridge(uuid, False)`, then `reconnect_bridge()`. Returns updated bridge row.

1B.5. **Update `POST /api/bridges`** — after creating the bridge (which defaults to `enabled=1`), call `reconnect_bridge()` to sync the new bridge into `bridge_manager._clients`. This already happens — verify it works for multi-bridge.

1B.6. **Update `PUT /api/bridges/{uuid}`** — if host/port/api_key changed, call `reconnect_bridge()` to restart that bridge's client. This already happens — verify it works for multi-bridge.

1B.7. **Update `DELETE /api/bridges/{uuid}`** — call `reconnect_bridge()` after delete to remove the bridge from `bridge_manager._clients`. This already happens — verify.

1B.8. **Remove `POST /api/bridge/select`** — was a convenience endpoint for discovered bridges. Replaced by `POST /api/bridges` which already accepts discovery info.

1B.9. **Rename `reconnect_bridge()` to `sync_bridge_connections()`** — clarify that it syncs all enabled bridges, not just reconnecting one. Implementation stays the same: `await bridge_manager.sync_bridges(db.list_enabled_bridges())`.

1B.10. **Update `GET /api/config`** — remove `active_bridge` field (singular). Replace with per-bridge connection status from `bridge_manager._clients`:
     ```python
     bridges_status = []
     for b in db.list_bridges():
         uuid = b["uuid"]
         client = bridge_manager._clients.get(uuid)
         bridges_status.append({
             **b,
             "connected": client.connected if client else False,
             "transport": "bridge_v2_pb" if client else None,
         })
     ```

1B.11. **Update `GET /api/setup-status`** — replace the singular `bridge` block with multi-bridge awareness. At least one bridge connected = configured and connected. Show which bridges are connected.

1B.12. **Update OTA routing** — `ota_worker.py` already uses `bridge_manager.ota_client_for_remote(mac)` which routes per-remote. No change to routing logic. The check `bridge_manager.connected` should be refined (see Phase 1C).

1B.13. **Update `GET /api/bridge/topology.json`** — already uses `bridge_manager.topology()` which merges all bridges. No change needed, just verify.

#### 1C. `ota_worker.py`

1C.1. **Refine `bridge_manager.connected` check** — `_process_v2()` line 244-251 waits up to 15s for `bridge_manager.connected` (any bridge). Change to wait for the specific bridge serving the target remote:
     ```python
     # Instead of: while not self.bridge_manager.connected:
     # Use: wait until ota_client_for_remote() succeeds or timeout
     ota_client = None
     waited = 0
     while waited < 15:
         try:
             ota_client = self.bridge_manager.ota_client_for_remote(mac)
             break
         except RuntimeError:
             await asyncio.sleep(1.0)
             waited += 1
     if not ota_client:
         self._fail(current["id"], "no bridge connected for remote")
         return
     ```

1C.2. **Handle bridge disconnection during OTA** — if the bridge disconnects mid-OTA, the `BridgeV2OTAClient` will time out. The OTA worker already handles timeouts in `_process_v2()`. Verify that failure is marked as error (not lost). No new logic needed beyond the existing timeout handling.

1C.3. **Handle remote appearing on different bridge** — if a remote moves to a different bridge mid-OTA, the old bridge's OTA session is gone. The `BridgeV2OTAClient` will timeout, and the job will be marked as failed. No silent redirect — this is correct behavior. No new logic needed.

#### 1D. Cleanup

1D.1. **Remove `bridge_target_from_row()` helper** — search for it. If it exists, it was used only in `reconnect_ws_manager()` which doesn't exist. Replace usage with `BridgeTarget` construction inline (as `sync_bridges` already does).

1D.2. **Grep and destroy all `is_active` references** — in `db.py`, `server.py`, `ota_worker.py`, and any tests. Remove every occurrence.

1D.3. **Grep and destroy all `activate`/`deactivate` endpoint references** — in `server.py`, UI code, and tests.

1D.4. **Verify startup sequence** — `bridge_manager` is already created and `sync_bridges()` called at startup. No `ws_manager` initialization needed (it doesn't exist). Confirm `reconnect_bridge()` (now `sync_bridge_connections()`) is called after every bridge CRUD operation.

1D.5. **Verify shutdown sequence** — `bridge_manager.stop()` already stops all clients. No `ws_manager` cleanup needed.

**Validation:** Manual testing with 2 bridges. Verify:
- Both connect via `BridgeV2Manager`.
- Config commands route to correct bridge per remote.
- OTA starts on correct bridge per remote.
- Disabling one bridge disconnects it, other stays connected.
- Enabling it reconnects without restart.
- `/api/config` shows per-bridge connection status.
- `/api/setup-status` reflects multi-bridge state.

---

### Phase 2: UI

Update the frontend to use the new multi-bridge API shape.

#### 2A. `ui/src/api/client.ts`

2A.1. **Remove `activateBridge(uuid)`** method.

2A.2. **Remove `deactivateBridge(uuid)`** method.

2A.3. **Add `enableBridge(uuid)`** → `PUT /api/bridges/{uuid}/enable`.

2A.4. **Add `disableBridge(uuid)`** → `PUT /api/bridges/{uuid}/disable`.

2A.5. **Update `ConfiguredBridge` interface** — remove `is_active`, keep `enabled`. Add optional `connected?: boolean` and `transport?: string` fields for runtime status.

2A.6. **Update `AppConfig` interface** — remove `active_bridge`. The `bridge` field and `bridges` array now include per-bridge `connected` and `transport` fields from the updated `/api/config` response.

#### 2B. `ui/src/components/settings.ts`

2B.1. **Remove `isBridgeActive()`** — replaced by checking `bridge.enabled`.

2B.2. **Remove `isBridgeConnected()`** — replaced by checking `bridge.connected` (now included in the `/api/config` response per bridge).

2B.3. **Remove activate/deactivate buttons** — replace with enable/disable toggle.

2B.4. **Add enable/disable toggle** — calls `api.enableBridge(uuid)` / `api.disableBridge(uuid)` depending on current state.

2B.5. **Show per-bridge connection status** — green "Connected" / red "Disconnected" / yellow "Error" badge, using the `connected` field from `/api/config`.

2B.6. **Show which remotes belong to each bridge** — from topology data, if available.

2B.7. **Update CSS** — `active-badge` class should work with per-bridge `connected` status instead of global active state.

#### 2C. `ui/src/app.ts`

2C.1. **Remove `config.active_bridge` check** — replace with checking if any bridge in `config.bridges` has `connected: true`.

2C.2. **Update `bridgeConfigured` logic** — `!!(config.bridges?.some(b => b.connected))` instead of `!!(config.active_bridge && !config.active_bridge.error)`.

**Validation:** UI shows all bridges with independent status. Enabling/disabling a bridge connects/disconnects it. No references to `is_active`, `activateBridge`, or `deactivateBridge`.

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Two bridges report the same remote MAC | `BridgeV2Manager` already handles this — last-write-wins via `_routes` updated on each snapshot. |
| OTA job targets remote on disconnected bridge | `ota_client_for_remote()` returns `None`/raises if no route exists. OTA worker will fail the job with a clear error. |
| Bridge reconnects mid-OTA | OTA session on bridge side is lost. `BridgeV2OTAClient` handles timeouts. Job marked as errored. |
| `bridge_manager.connected` was "any bridge" | Changed to target-bridge-specific check via `ota_client_for_remote()`. If the remote's bridge isn't connected, the job fails immediately rather than waiting for any bridge. |
| UI expects `active_bridge` | Replace with `config.bridges` array. Each bridge has `connected` and `enabled` fields. |
| `/api/setup-status` singular `bridge` block | Rewrite to check: at least one bridge exists with `connected: true`. |

## File Change Summary

| File | Change |
|------|--------|
| `app/db.py` | Remove `is_active` alias, `get_active_bridge`, `set_active_bridge`, `clear_active_bridge`. Add `toggle_bridge()`. |
| `app/server.py` | Remove activate/deactivate/select endpoints. Add enable/disable. Replace `active_bridge` in `/api/config` and `/api/setup-status` with per-bridge status. Rename `reconnect_bridge()` to `sync_bridge_connections()`. |
| `app/ota_worker.py` | Refine `bridge_manager.connected` check to target-bridge-specific. No routing change needed (already per-remote). |
| `ui/src/api/client.ts` | Remove `activateBridge`/`deactivateBridge`. Add `enableBridge`/`disableBridge`. Update types. |
| `ui/src/components/settings.ts` | Remove activate/deactivate UI. Add enable/disable toggle. Show per-bridge status. |
| `ui/src/app.ts` | Remove `active_bridge` checks. Use `bridges` array with per-bridge `connected` field. |