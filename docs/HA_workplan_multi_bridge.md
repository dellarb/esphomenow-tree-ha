# Workplan: Multi-Bridge Support

## Objective

Remove the single-active-bridge constraint so the addon can maintain concurrent WebSocket connections to multiple ESP-NOW LR bridges simultaneously. Commands and config changes route to the bridge that most recently handled live traffic for a given remote.

## Scope

### In Scope

- DB schema: remove `is_active` concept, keep `enabled` as user-intent flag
- `BridgeWsManager`: refactor from single `_client` to dict of concurrent clients
- `server.py`: remove activate/deactivate endpoints, add enable/disable, update OTA routing
- `db.py`: remove `set_active_bridge` / `clear_active_bridge`, add `get_enabled_bridges()`
- UI: remove activate/deactivate, add per-bridge connect status, enable/disable toggle
- OTA: route to correct bridge client per target remote

### Out of Scope

- HA integration changes (already multi-bridge aware via `BridgeV2Manager`)
- `BridgeV2Manager` changes (already multi-bridge with `_routes` and `_clients`)
- Firmware changes
- Phase 3/4 from original workplan (integration writes to DB, integration owns bridge config)

## Approach

### Two Routing Systems — No Duplication

The addon has two independent bridge communication paths:

1. **`BridgeV2Manager`** (protobuf, `bridge_v2_client.py`) — already multi-bridge. Manages `_clients: dict[str, BridgeV2Client]` and `_routes: dict[str, RemoteRoute]`. Routes config commands and integration frames to the correct bridge via `_route_for_remote(mac)`.

2. **`BridgeWsManager`** (JSON WebSocket, `bridge_ws_client.py`) — currently single-bridge. Manages one `_client`. Used for OTA and as a secondary transport for some WS-mode features.

Both systems will be multi-bridge. They maintain **separate connection state** (each bridge has both a protobuf WS and a JSON WS) but **share no routing table**. Each derives remote-to-bridge mapping from its own topology events. This is correct because:
- BridgeV2Client receives protobuf snapshots → populates `_routes`
- BridgeWsClient receives JSON topology → populates its own `_topology_cache`
- Both see the same remotes through the same bridge, so their mappings naturally agree

### Dynamic Routing

For a given remote MAC, commands route to the bridge that most recently delivered live traffic for that remote. This is already implemented in `BridgeV2Manager._routes` (updated on snapshots, `remote.availability`, `remote.state` events). The WS manager will use the same principle: find which WsClient has the remote in its topology cache.

### Enabled vs. Active

- **`enabled`** (DB column, user intent): `1` = "connect to this bridge on startup". `0` = "keep config but don't connect".
- Remove `is_active` entirely. No more single-active constraint.
- New bridges default to `enabled=1`, meaning they're connected immediately.
- Connection state (`connected`, `error`, `disconnected`) is **runtime only**, never stored in DB.

---

## Phases

### Phase 1: DB Schema & Methods

Refactor `db.py` to remove single-active logic and add multi-bridge queries.

#### Tasks

1.1. **Remove `is_active` from `_bridge_row()`** — stop setting `data["is_active"] = data["enabled"]`. The `is_active` key should no longer appear in bridge rows.

1.2. **Remove `get_active_bridge()`** — no longer needed. Callers will use `get_enabled_bridges()` or select a specific bridge by UUID.

1.3. **Remove `set_active_bridge()`** — was setting `enabled=1` on one bridge while implying all others were disabled. No longer valid.

1.4. **Remove `clear_active_bridge()`** — was setting `enabled=0` on one or all bridges. No longer valid.

1.5. **Remove `list_enabled_bridges()`** if it only returns one — replace with a version that returns all enabled bridges without the `LIMIT 1` pattern. Current implementation already returns all, just verify the query.

1.6. **Add `toggle_bridge(uuid, enabled)`** — sets `enabled` to 0 or 1 for a specific bridge. Returns the updated row.

1.7. **Update `add_bridge()`** — new bridges default to `enabled=1`. Remove the `api_key` condition on `last_connected_at` (set it always on add, or leave null until first connection).

1.8. **Add migration** — add a `SchemaMigration` that drops `is_active` column if it exists (or no-op since current schema uses `enabled` to simulate `is_active`). Actual schema doesn't need ALTER — the column was always `enabled`. Just ensure the application layer stops treating `enabled` as single-active.

**Validation:** All `db.py` tests should pass. No external callers should reference `is_active`, `get_active_bridge`, `set_active_bridge`, or `clear_active_bridge`.

---

### Phase 2: BridgeWsManager Multi-Client Refactor

Refactor from single `_client` to `dict[str, BridgeWsClient]`.

#### Tasks

2.1. **Replace `_client` with `_clients: dict[str, BridgeWsClient]`** — keyed by bridge UUID. Each value is an independently-connected `BridgeWsClient` instance.

2.2. **Replace `_ota_client` with per-bridge OTA state** — each `BridgeWsClient` already holds its own `BridgeWsOTAClient` when needed. Add a `get_ota_client(bridge_uuid)` method or make `ota_client` a dict keyed by UUID. The current lazy creation pattern in the `ota_client` property can be replicated per client.

2.3. **Implement `start_client(uuid, target)`** — creates a `BridgeWsClient` for a specific bridge, wires callbacks (topology, event, connection change) with the bridge UUID as context, starts the client, stores in `_clients[uuid]`.

2.4. **Implement `stop_client(uuid)`** — stops and removes `BridgeWsClient` for a specific bridge. Cleans up OTA state for that bridge.

2.5. **Implement `start_all()`** — reads `db.get_enabled_bridges()`, calls `start_client()` for each. Called at app startup.

2.6. **Implement `sync_clients(bridges)`** — compares the desired bridge list against `_clients`. Stops clients for bridges no longer in the list, starts clients for new bridges, restarts clients where `host`/`port`/`api_key` changed. This is analogous to `BridgeV2Manager.sync_bridges()`.

2.7. **Update `send_config(mac, command, params)`** — find the correct client for `mac` by iterating `_clients` and checking which client's `_topology_cache` contains that MAC. Falls back to first connected client if no match.

2.8. **Add `get_client_for_remote(mac) -> BridgeWsClient | None`** — scans `_clients` topology caches for the given MAC. Returns the client whose topology includes that remote. This is the OTA routing mechanism.

2.9. **Update `topology()` — merge topologies from all connected clients.** Currently returns a single client's topology. New version:
   - Iterate all connected clients.
   - Merge their `_topology_cache` values. Bridge entries are kept separate (each bridge is its own node). Remote entries: if the same MAC appears in multiple bridges' topologies, the one with the most recent `last_seen_s` or highest `uptime_s` wins.
   - Cache the merged result.

2.10. **Update `get_topology_list()`** — similar merge, but for the list format. Each node should include a `bridge_uuid` field indicating which bridge it's reachable through.

2.11. **Update `_on_topology()` callback** — must be per-client (include bridge UUID in closure). Each client's topology callback updates that client's `_topology_cache` in `_clients[uuid]`, then triggers a merged topology update.

2.12. **Update `_on_event()` callback** — must be per-client. Events are forwarded with the bridge UUID tag attached.

2.13. **Update `_on_connection_change()` callback** — must be per-client. Updates connection state for that specific bridge, emits bridge-specific connection events (e.g., `{"bridge_uuid": "...", "connected": true}`).

2.14. **Update `connected` property** — returns `True` if any client is connected. May also add `connected_bridges` property returning `dict[str, bool]` for per-bridge status.

2.15. **Update `refresh_once()`** — this creates a one-shot client. In multi-bridge mode, should accept a `bridge_uuid` parameter to target a specific bridge, or refresh all connected clients.

2.16. **Remove `set_target()` and `start(target)` single-bridge methods** — replaced by `start_client()` and `sync_clients()`.

#### Callback Architecture

Each `BridgeWsClient` created in `start_client()` receives closures that capture the bridge UUID:

```python
async def _make_callbacks(uuid: str):
    def on_topology(snapshot):
        # Store in clients[uuid]._topology_cache, trigger merge
        ...
    def on_event(event_type, payload):
        # Tag with bridge_uuid, forward
        ...
    def on_connection_change(connected):
        # Update clients[uuid] state, emit bridge.connection
        ...
    return on_topology, on_event, on_connection_change
```

**Validation:** Unit tests for `BridgeWsManager` with 2+ mock clients. Verify `send_config` routes to correct client. Verify `topology()` merges correctly. Verify `sync_clients` adds/removes/restarts appropriately.

---

### Phase 3: server.py Endpoints

Remove single-active-bridge endpoints, add enable/disable, update OTA routing.

#### Tasks

3.1. **Remove `PUT /api/bridges/{uuid}/activate`** — no longer needed, bridges connect when enabled.

3.2. **Remove `PUT /api/bridges/{uuid}/deactivate`** — replaced by disable.

3.3. **Add `PUT /api/bridges/{uuid}/enable`** — sets `enabled=1` in DB, calls `ws_manager.start_client(uuid, target)`, calls `bridge_manager.sync_bridges(db.list_enabled_bridges())`.

3.4. **Add `PUT /api/bridges/{uuid}/disable`** — sets `enabled=0` in DB, calls `ws_manager.stop_client(uuid)`, calls `bridge_manager.sync_bridges(db.list_enabled_bridges())`.

3.5. **Update `POST /api/bridges`** — after creating bridge, if `enabled=1` (default), immediately call `ws_manager.start_client(uuid, target)`. Also call `bridge_manager.sync_bridges()`.

3.6. **Update `PUT /api/bridges/{uuid}`** — if host/port/api_key changed, call `ws_manager.sync_clients()` to restart that client. Also `bridge_manager.sync_bridges()`.

3.7. **Update `DELETE /api/bridges/{uuid}`** — call `ws_manager.stop_client(uuid)` before deleting from DB. Also `bridge_manager.sync_bridges()`.

3.8. **Remove `POST /api/bridge/select`** — was a convenience endpoint for discovered bridges. Replaced by `POST /api/bridges` with discovery info.

3.9. **Replace `reconnect_ws_manager()`** — currently reads `db.get_active_bridge()`, stops old client, creates one new `BridgeWsManager`. Replace with:
   ```python
   async def sync_bridge_connections():
       enabled_bridges = db.get_enabled_bridges()
       await ws_manager.sync_clients(enabled_bridges)
       bridge_manager.sync_bridges(enabled_bridges)
   ```
   Called at startup and whenever the bridge list changes.

3.10. **Update `GET /api/config`** — remove `active_bridge` field. Add:
    - `bridges`: list of all bridges with per-bridge connection status derived from `ws_manager._clients` and `bridge_manager._clients`.
    - Each bridge entry: `{uuid, host, port, name, ws_connected, v2_connected}`.

3.11. **Update OTA routing** — currently uses `ws_manager.ota_client` (single bridge). Change to:
    ```python
    client = ws_manager.get_client_for_remote(mac)
    if not client:
        raise HTTPException(404, "no bridge connected for remote")
    ota_client = BridgeWsOTAClient(client)
    ```
    This applies to all OTA endpoints: `/api/ota/start`, `/api/ota/chunk`, `/api/ota/status`, `/api/ota/abort`.

3.12. **Update `GET /api/bridge/topology.json`** — currently uses `control_manager()` (BridgeV2Manager). Verify it still works correctly with multiple bridges. The merged topology from both V2 and WS managers should be merged correctly.

3.13. **Update `POST /api/bridge/ws/refresh`** — should trigger refresh on all connected WS clients, not just one.

3.14. **Update `ws_manager` initialization** — remove `BridgeWsManager(settings, db)` followed by `set_target()` + `start()`. Replace with `BridgeWsManager(settings, db)` then `start_all()` at startup.

**Validation:** Manual testing with 2 bridges. Verify config commands route to correct bridge via `bridge_manager`. Verify OTA starts on correct bridge. Verify enable/disable connects/disconnects individual bridges. Verify `/api/config` shows per-bridge status.

---

### Phase 4: OTA Worker Multi-Bridge

The `OTAWorker` currently holds a reference to `ws_manager` and uses `ws_manager.ota_client`. With multi-bridge, it must route OTA to the correct bridge.

#### Tasks

4.1. **Update `OTAWorker`** — instead of `ws_manager.ota_client`, use `ws_manager.get_client_for_remote(job.mac)` to find the correct WS client for the target remote.

4.2. **Handle bridge disconnection during OTA** — if the bridge handling an OTA job disconnects, the job should be marked as errored (not lost). The `BridgeWsClient` reconnection loop will eventually reconnect, but the OTA session on the bridge side is gone. Mark the job as failed with `"bridge_disconnected"` or similar.

4.3. **Handle remote appearing on different bridge** — if a remote moves to a different bridge mid-OTA (unlikely but possible), the OTA should fail and not be silently redirected. The old bridge loses the session, so the job should error.

4.4. **Update `ota_worker.ws_manager` assignment** — confirm it references the multi-client `BridgeWsManager` and routes through `get_client_for_remote()`.

**Validation:** Start OTA for a remote, verify it uses the correct bridge. Disconnect bridge during OTA, verify job errors cleanly.

---

### Phase 5: UI Changes

Remove activate/deactivate, add enable/disable and per-bridge status.

#### Tasks

5.1. **Update `ui/src/api/client.ts`**:
    - Remove `activateBridge(uuid)` method.
    - Remove `deactivateBridge(uuid)` method.
    - Add `enableBridge(uuid)` → `PUT /api/bridges/{uuid}/enable`.
    - Add `disableBridge(uuid)` → `PUT /api/bridges/{uuid}/disable`.
    - Update `ConfigResponse` type: remove `active_bridge`, add `bridges` with per-bridge connection status.
    - Update `Bridge` type: remove `is_active`, keep `enabled`.

5.2. **Update `ui/src/components/settings.ts`**:
    - Remove `isBridgeActive()` and `isBridgeConnected()` — replaced by per-bridge status from `config.bridges`.
    - Remove activate/deactivate buttons.
    - Add enable/disable toggle per bridge (writes `enabled` flag).
    - Show per-bridge connection status: green "Connected" / red "Disconnected" / yellow "Error" badge.
    - Show which remotes belong to each bridge (from topology data).
    - Update `active-badge` CSS class to work with per-bridge status instead of global active row.

5.3. **Update `ui/src/app.ts`**:
    - Remove checks for `config.active_bridge`.
    - Use `config.bridges` for startup logic (e.g., "at least one bridge is connected").

**Validation:** UI shows all bridges with independent status. Enabling/disabling a bridge connects/disconnects it. No references to `is_active` or `activateBridge`.

---

### Phase 6: Integration & Cleanup

Final wiring, removal of dead code, and end-to-end verification.

#### Tasks

6.1. **Remove `bridge_target_from_row()` helper** — was used only in `reconnect_ws_manager()` to convert a DB row to `BridgeTarget` for the single active bridge. The multi-bridge `sync_clients()` will iterate all enabled bridges and construct `BridgeTarget` per row.

6.2. **Remove `bridge_config.py`** — if it still exists and hasn't been cleaned up yet. Per original workplan, it should already be gone.

6.3. **Remove `BridgeManager` class** — if it still exists. Per original workplan, it should already be replaced by `db.get_active_bridge()`. Now replaced by `db.get_enabled_bridges()`.

6.4. **Update startup sequence** (`server.py` app init):
    ```python
    ws_manager = BridgeWsManager(settings, db)
    await ws_manager.start_all()  # connects to all enabled bridges
    bridge_manager = BridgeV2Manager(db)
    bridge_manager.sync_bridges(db.list_enabled_bridges())
    ```

6.5. **Update shutdown sequence** — `await ws_manager.stop_all()` instead of `await ws_manager.stop()`.

6.6. **Search and destroy all `is_active` references** — grep for `is_active`, `active_bridge`, `get_active_bridge`, `set_active_bridge`, `clear_active_bridge`. Remove or replace every occurrence.

6.7. **Search and destroy all `activate`/`deactivate` endpoint references** — grep for `activate`, `deactivate`, `/activate`, `/deactivate` in server.py, UI code, and tests.

6.8. **End-to-end test** — start addon with 2 bridges configured. Verify:
    - Both connect via WS.
    - Config commands route to correct bridge per remote.
    - OTA starts on correct bridge per remote.
    - Disabling one bridge disconnects it, other stays connected.
    - Enabling it reconnects without restart.
    - Topology merges remotes from both bridges.
    - `/api/config` shows per-bridge status.

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Two bridges report the same remote MAC | Last-write-wins by `uptime_s`/`last_seen_s`. BridgeV2Manager already handles this. WS manager merge must use the same rule. |
| OTA job targets remote on disconnected bridge | OTA endpoints already validate `ws_manager.connected`. With multi-bridge, `get_client_for_remote()` returns `None` if no connected client has that remote. Return 404/503. |
| Bridge reconnects mid-OTA | OTA session on bridge side is lost. `BridgeWsOTAClient` handles timeouts. OTA worker will see the failure and mark job as errored. |
| Topology merge conflicts | Both V2 and WS paths observe the same physical network. If two bridges report the same remote, the more recent report wins. This matches physical reality — the remote is reachable via both bridges. |
| Performance of scanning all clients for remote lookup | With typically <5 bridges, iterating `_clients` is O(B×N) where B=bridges, N=remotes per bridge. Negligible. Can optimize later with a MAC→UUID index if needed. |

## File Change Summary

| File | Change |
|------|--------|
| `app/db.py` | Remove `is_active`, `set_active_bridge`, `clear_active_bridge`, `get_active_bridge`. Add `toggle_bridge()`. Update `_bridge_row()`. |
| `app/bridge_ws_client.py` | Refactor `BridgeWsManager` from single client to dict. Add `start_client`, `stop_client`, `start_all`, `sync_clients`, `get_client_for_remote`. Merge topologies. Per-client callbacks. |
| `app/server.py` | Remove activate/deactivate endpoints. Add enable/disable. Replace `reconnect_ws_manager()` with `sync_bridge_connections()`. Update OTA routing. Update `/api/config`. |
| `app/ota_worker.py` | Route OTA via `ws_manager.get_client_for_remote(mac)`. |
| `ui/src/api/client.ts` | Remove `activateBridge`/`deactivateBridge`. Add `enableBridge`/`disableBridge`. Update types. |
| `ui/src/components/settings.ts` | Remove activate/deactivate UI. Add enable/disable. Show per-bridge status. |
| `ui/src/app.ts` | Remove `active_bridge` checks. Use `bridges` array. |