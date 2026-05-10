# Architecture Redesign — Single Bridge Connection

## Motivation

1. **Bridge load**: The ESP32 bridge currently serves two connections (addon v1 JSON WS + integration v2 protobuf). Goal: one v2 protobuf connection per bridge.
2. **Clean uninstall**: DB moves to `/data/` so it's deleted when user selects "delete data on uninstall" in Supervisor. Integration stops reading the shared DB entirely.
3. **Simplify**: Remove the dual-path `control_manager()` preference logic, the `IntegrationWsManager` HA polling, and every piece of bridge management from the integration.
4. **Auto-cleanup**: Old HA entries and old `/share/esp_tree` state are removed automatically where possible during the breaking-change upgrade.

**This is a breaking change.** No migration path — fresh install required. Legacy installs will not be supported. Code stays clean: no `CONF_TYPE = "bridge"`, no `BridgeWatcher`, no shared DB.

## Architecture

```
Bridge 0 ──v2 protobuf──┐
Bridge 1 ──v2 protobuf──┤
Bridge N ──v2 protobuf──┼──► Addon (host_network)
                         │      │
                         │      ├── TopologyBroadcast ──► /ws/topology (JSON) ──► Addon UI
                         │      │
                         │      └── /esp-tree/integration/v1/pb (protobuf) ──► Integration ──► HA remote entities
                         │             • JSON auth handshake (addon-generated token)
                         │             • Binary protobuf frames — identical proto spec to bridge
                         │
                         └── OTA v1 WS (on-demand) ──► Addon (OTA only, disconnected when idle)
```

- **Addon** is the sole bridge client. One v2 protobuf connection per bridge. Handles topology, events, config commands, heartbeats.
- **Integration** is a thin protobuf client. Connects to the discovered addon URL using an addon-generated token. Creates remote entities only. No bridge config entries. No direct bridge connections.
- **Proto spec**: unchanged. `Envelope`, `FullSnapshot`, `EventBatch`, `CommandRequest`, `ConfigCommandRequest`, etc. remain identical. The addon is a transparent proxy.
- **OTA**: addon ↔ bridge via v1 JSON WS, on-demand only (connect for OTA, disconnect when done). No integration involvement.
- **Routing table**: addon owns `remote_mac → (bridge_uuid, bridge_mac)` and uses it for integration commands, addon UI config commands, OTA bridge selection, and bridge-disconnect offline events.

## Data Flows

| Direction | Path | Content |
|---|---|---|
| Bridge → Addon | v2 protobuf | FullSnapshot, EventBatch, heartbeats |
| Addon → Integration | `/esp-tree/integration/v1/pb` | FullSnapshot, EventBatch (forwarded transparently) |
| Integration → Addon | `/esp-tree/integration/v1/pb` | CommandRequest, ConfigCommandRequest |
| Addon → Bridge | v2 protobuf | CommandRequest, ConfigCommandRequest (routed to correct bridge) |
| Addon → UI | `/ws/topology` (JSON) | TopologyBroadcast for frontend |
| Addon → Bridge | v1 WS (on-demand) | OTA start, chunk, status, abort |

### Config commands

```
Addon UI → POST /api/devices/{mac}/reboot → server.py → remote routing table → BridgeV2Client.send_config() → v2 protobuf → Bridge → Remote
```

No integration relay. Direct addon→bridge.

### OTA

```
Addon UI → POST /api/ota/upload → OTAWorker → BridgeWsClient (v1 WS, on-demand) → Bridge
```

Fully independent from integration. v1 WS connects only during active OTA operations.

## Protocol: `/esp-tree/integration/v1/pb`

### Auth

JSON handshake before binary frames begin:

```
Integration → Addon:  {"type": "auth", "token": "<addon_integration_token>"}
Addon → Integration:  {"type": "auth_ok"}
```

Addon generates a long-lived integration token on first run, stores it under `/data/`, and passes `addon_url` + token through Supervisor discovery into the hub config entry. Addon validates the token locally. No Supervisor-token auth and no hardcoded localhost contract. On failure, close with error. After auth, connection switches to binary protobuf frames only.

### Data frames

All frames are `pb.Envelope` (binary protobuf) — **identical to the bridge v2 spec**. No new message types. The addon is a transparent proxy:

- **Addon → Integration**: forwards `FullSnapshot` and `EventBatch` from all connected bridges
- **Integration → Addon**: receives `CommandRequest` and `ConfigCommandRequest`; addon routes to correct bridge based on remote→bridge topology mapping

### Error handling

| Scenario | Action |
|---|---|
| Integration sends data before `auth_ok` | Close connection |
| Invalid protobuf frame | Close connection |
| Integration sends `CommandRequest` for unknown remote | Send `CommandResult` with error |
| Bridge disconnects | Emit synthetic offline `EventBatch` for each remote last seen on that bridge |

## Integration Side

### What the integration has

- **Minimal hub config entry** storing `addon_url` and `integration_token` so HA loads the integration. It creates no entities.
- **One WS client** connecting to `{addon_url}/esp-tree/integration/v1/pb`
- **Remote entities only** — sensor, binary_sensor, switch, button, number, select, text
- **Remote config entries** — one per discovered remote (existing discovery flow, unchanged)
- **Uninstall detection** — when WS disconnects for >5 minutes, mark all remote entities `available=False` (user deletes config entries manually)

### What the integration does NOT have

| Removed | Replaced by |
|---|---|
| Bridge config entries (`CONF_TYPE = "bridge"`) | — nothing, bridges invisible to HA |
| Bridge entities (`bridge_sensor`, `bridge_binary_sensor`) | — addon UI shows bridge data |
| `BridgeRuntimeClient` (v2 protobuf per bridge) | Single `IntegrationWSClient` to addon |
| `BridgeWatcher` (DB polling every 10s) | WS connection to addon |
| `BridgeDB` (`bridge_db.py`) | — no DB access |
| `SHARED_DB_PATH` / `SHARED_LOG_PATH` | — removed |
| `websocket_api.py` topology/config command relays | Status-only HA WS endpoint remains for addon health checks |
| `BRIDGE_PLATFORMS` | — removed |
| Old hub behavior | Minimal hub entry with `addon_url` + `integration_token`, no entities |
| `cleanup_integration()` | — no shared DB to clean up |

### Connection lifecycle

```
1. Integration loads hub config entry with `addon_url` + `integration_token`
2. Integration connects to `{addon_url}/esp-tree/integration/v1/pb`
3. Integration sends {"type": "auth", "token": "<integration_token>"}
4. Addon validates locally, sends {"type": "auth_ok"}
5. Connection switches to binary protobuf
6. Addon replays last FullSnapshot for each connected bridge
7. Ongoing: EventBatch frames forwarded as bridges emit them
8. Integration sends CommandRequest/ConfigCommandRequest; addon routes via `remote_mac → bridge`
9. On disconnect: 5-minute grace → entities unavailable
```

## Addon Side

### New: `app/bridge_v2_client.py`

- One instance per bridge, managed by `BridgeV2Manager`
- Connects to `ws://{bridge_host}:{bridge_port}/esp-tree/v2/pb`
- HMAC-SHA256 challenge-response auth (reuses implementation from removed `BridgeRuntimeClient`)
- Receives `FullSnapshot` → pushes to TopologyBroadcast + forwards to connected integration WS clients
- Receives `EventBatch` → pushes to TopologyBroadcast + forwards to integration
- Sends `CommandRequest`/`ConfigCommandRequest` (routed from integration or addon UI)
- Sends `config_command()` for addon UI config commands (reboot, heartbeat, etc.)
- Reconnect with exponential backoff (1s, 2s, 5s, 10s)
- On bridge disconnect, emits synthetic `RemoteAvailabilityEvent(online=false)` for remotes last seen on that bridge.

### New: `/esp-tree/integration/v1/pb` endpoint (in `server.py`)

- WS endpoint, accept+auth, then binary relay
- Auth uses addon-generated integration token passed through Supervisor discovery
- Replays last `FullSnapshot` per bridge to reconnecting integration clients
- Maintains `remote_mac → (bridge_uuid, bridge_mac)` routing table
- Stores connected integration WS clients (set of websockets)
- On `bridge.changed` (addon adds/removes a bridge): addon connects/disconnects BridgeV2Client for that bridge
- Forward: BridgeV2Client frames → integration WS clients
- Receive: integration frames → route to correct BridgeV2Client

### Stripped: `app/bridge_ws_client.py` → OTA only

| Removed from BridgeWsClient | Kept |
|---|---|
| Topology request/event handling | HMAC auth |
| `_schedule_topology_refresh` | `ota_start()`, `ota_status()`, `ota_abort()` |
| `_update_availability_in_cache` | `send_binary_frame()` (chunk upload) |
| Config command handling (`send_config`) | `BridgeWsOTAClient` wrapper |
| `_on_topology`, `_on_event` callbacks for topology | |
| `get_topology()` | |

### Removed: `app/integration_ws_client.py`

`IntegrationWsManager` — the addon no longer polls HA for topology via `esp_tree/topology`. Topology comes directly from bridges via v2 protobuf.

### Simplified: `server.py`

```python
def control_manager():
    return bridge_manager  # single source — no preference logic
```

Config command endpoints (`/api/devices/{mac}/reboot`, `/heartbeat`, `/rediscover`, `/parent`, `/relay`) route through `BridgeV2Client` directly.

### Multiple bridges

The addon manages multiple bridges already — the `bridges` table in `db.py` supports CRUD for multiple bridge entries, and `/api/bridges` endpoints exist for the addon UI. Each enabled bridge gets its own `BridgeV2Client` instance (one v2 protobuf connection per bridge). All bridge topology is multiplexed into a single `TopologyBroadcast` and forwarded to integration over the single `/esp-tree/integration/v1/pb` connection.

## DB Changes

| Change | Detail |
|---|---|
| `database_path` | `/share/esp_tree/esp_tree.db` → `/data/esp_tree/esp_tree.db` |
| `config.yaml` `map` | Remove `share` |
| `enabled` column | Add — `INTEGER DEFAULT 1`; every enabled bridge gets a v2 client |
| `is_active` column | Remove — replaced by `enabled` |
| `network_id` column | Add — populated from v2 protobuf `bridge.identity.network_id` |

## Phase Plan

### Phase 1: Cleanup + addon v2 protobuf + integration WS endpoint
- Best-effort auto-clean old HA ESP Tree entries and old `/share/esp_tree` data
- `app/bridge_v2_client.py` — v2 protobuf client (HMAC auth, FullSnapshot, EventBatch, commands)
- `BridgeV2Manager` in `server.py` — manages one v2 client per enabled bridge
- `/esp-tree/integration/v1/pb` WS endpoint — addon-token JSON auth + binary protobuf relay
- BridgeV2Client feeds `TopologyBroadcast` for addon UI
- Add routing table, synthetic bridge-disconnect offline events, v2→JSON adapter, and snapshot replay
- Addon generates and stores integration token, then advertises `addon_url` + token via Supervisor discovery

### Phase 2: Integration rewrite
- New `IntegrationWSClient` replacing `BridgeRuntimeClient` (connects to addon, identical proto)
- Keep minimal hub config entry with `addon_url` + `integration_token`
- Adapt `EspTreeRuntime` — single client, remove bridge device/entity creation
- Remove: `bridge_client.py`, `bridge_db.py`, `bridge_watcher.py`, `bridge_entity.py`, `bridge_sensor.py`, `bridge_binary_sensor.py`
- Keep `websocket_api.py` status-only for addon health checks; remove topology/config relays
- Remove: `BRIDGE_PLATFORMS`, `CONF_BRIDGE_UUID`, `SHARED_DB_PATH`, `SHARED_LOG_PATH` from `const.py`
- Simplify `__init__.py` — no bridge config entries; hub entry starts one addon WS client

### Phase 3: Strip v1 WS to OTA only
- `BridgeWsClient` → remove topology/events/config, keep OTA methods
- Remove `IntegrationWsManager` entirely (`integration_ws_client.py`)
- Simplify `control_manager()` in `server.py`
- Config commands routed through `BridgeV2Client`

### Phase 4: DB migration
- `database_path` → `/data/esp_tree/esp_tree.db`
- Remove `share` from config map
- Schema: remove `is_active`, add `enabled INTEGER DEFAULT 1`, add `network_id`

### Phase 5: Cleanup
- Remove bridge config flow from `config_flow.py`
- Remove `cleanup_integration()`
- Test: multi-bridge, HA restart, addon restart, bridge disconnect/reconnect, OTA, discovery, config commands

## What Goes (complete)

| File | Location | Reason |
|---|---|---|
| `bridge_client.py` | integration | BridgeRuntimeClient — replaced by IntegrationWSClient |
| `bridge_db.py` | integration | No DB access |
| `bridge_watcher.py` | integration | No DB polling |
| `websocket_api.py` | integration | No HA WS commands needed |
| `bridge_entity.py` | integration | No bridge entities |
| `bridge_sensor.py` | integration | No bridge entities |
| `bridge_binary_sensor.py` | integration | No bridge entities |
| `integration_ws_client.py` | addon | No HA WS polling |
| ~200 lines of `bridge_ws_client.py` | addon | Topology/events/config stripped to OTA only |
| `CONF_BRIDGE_UUID`, `BRIDGE_PLATFORMS`, `SHARED_DB_PATH`, `SHARED_LOG_PATH` | integration const | No longer needed |
| Hub/bridge config entry types | integration | No bridge/hub entries |
| `is_active` column | addon db | Redundant |
| `share` mount | config.yaml | DB in `/data/` |
