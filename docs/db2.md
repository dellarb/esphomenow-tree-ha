# DB Migration & Architecture Redesign

## Motivation

The SQLite DB currently lives at `/share/esp_tree/esp_tree.db`, which persists after addon uninstall. Moving it to `/data/` ensures it's deleted when the user selects "delete data on uninstall." This requires the HA integration to stop reading the DB directly and instead receive bridge entries via a WebSocket API from the addon.

This redesign also simplifies the data flow: the integration becomes the primary bridge client, and the addon reduces its direct bridge connection to discovery, auth, and OTA only.

## Architecture

```
Bridge (ESP32)
   │
   ├── HTTP ────────────────► Addon (discovery, auth check only)
   ├── WS v1 JSON ───────────► Addon (OTA only, on-demand connection)
   │
   └── WS v2 Protobuf ──────► Integration (everything else: topology, events, config commands)

Addon ◄──── /ws/integration ────► Integration
         │
         ├── addon→integration: bridge.snapshot, bridge.changed, bridge.discovered
         ├── integration→addon: topology.push, topology.changed, config.command, config.result
         └── auth: supervisor token
```

### Data Flows

| Direction | Channel | Message Types |
|-----------|---------|---------------|
| Addon → Integration | `/ws/integration` | `bridge.snapshot`, `bridge.changed`, `bridge.discovered` |
| Integration → Addon | `/ws/integration` | `topology.push`, `topology.changed`, `config.command`, `config.result` |
| Addon → Bridge | HTTP | Discovery, auth check (`POST /api/auth/login`) |
| Addon → Bridge | WS v1 JSON | OTA (start, chunk, status, abort) — on-demand only |
| Integration → Bridge | WS v2 Protobuf | Topology, events, config commands (reboot, heartbeat_interval, force_rediscover, set_parent_mac, relay) |
| Integration → Addon | `/ws/integration` | Per-bridge metadata (network_id, last_seen, uptime) via `topology.push` |

### Config Command Relay

When a user triggers a config command from the addon UI (reboot, heartbeat, rediscover, parent, relay):

1. Addon UI calls addon HTTP API endpoint (e.g. `POST /api/devices/{mac}/reboot`)
2. Addon server sends `config.command` over `/ws/integration` to the integration
3. Integration relays the command to the bridge via v2 protobuf
4. Bridge responds to the integration
5. Integration sends `config.result` back over `/ws/integration` to the addon
6. Addon UI receives the response

If the integration is not connected when a config command is triggered, the **addon immediately returns an error** to the UI ("cannot reach integration"). No queuing, no fallback to direct bridge connection.

### Topology Source

All topology data now flows from the integration only. The addon no longer fetches topology from the bridge directly. The addon's `/ws/topology` endpoint simply rebroadcasts what it receives from the integration via `/ws/integration`.

### OTA Independence

OTA remains fully independent: addon ↔ bridge via v1 JSON WS. The integration has no visibility into OTA operations. The addon's v1 WS connection to the bridge is **on-demand** — connected only when an OTA operation is active, disconnected when it completes. This minimizes persistent connections on the bridge.

### Bridge Removal & Remote Entity Survival

When `bridge.changed` with `action: "remove"` arrives:
- Integration disconnects its v2 protobuf connection to that bridge
- Bridge device/entity is removed from HA
- **Remote entities are NOT destroyed** — they may roam to another bridge
- Remote entities are set unavailable until they reconnect via another bridge

## New Endpoint: `/ws/integration`

The addon exposes a single dedicated WebSocket endpoint at `/ws/integration` for the HA integration to connect to. All bridge events are multiplexed over this single connection using bridge UUIDs.

### Protocol

- **Format**: JSON (not protobuf — protobuf stays on the integration↔bridge v2 connection)
- **Single connection**: One WS link between addon and integration, multiplexed by bridge UUID

### Authentication

- Integration sends HA supervisor token on connect
- Addon validates the token by calling the supervisor `/auth` endpoint
- No HMAC or shared secrets required — leverages existing HA infrastructure

### Integration Resilience

The integration caches bridge data in memory. If the `/ws/integration` connection drops:

- **Grace period**: 5 minutes — entities remain available during this window (covers addon upgrades/restarts)
- **After 5 minutes**: All bridge entities set to `available=False` (not removed, not destroyed)
- **On reconnect**: Addon sends `bridge.snapshot`, integration rebuilds v2 connections, entities come back alive

The grace timer starts the moment the `/ws/integration` connection drops. If a reconnect + `bridge.snapshot` arrives within 5 minutes, the timer resets and everything continues normally.

### Integration Reconnection to Addon

The integration connects to `ws://localhost:8099/ws/integration`:
- Retry every **5 seconds** initially
- After **60 seconds** of failure, backoff to every **15 seconds**
- No special supervisor event listening — simple fixed interval with backoff

The integration needs no other mechanism to discover the addon — the addon is always at `localhost:8099` (fixed via `host_network: true` and `ingress_port: 8099`).

### Message Protocol

#### Bridge Object (used in all bridge messages)

```json
{
  "uuid": "...",
  "name": "...",
  "host": "...",
  "port": 80,
  "discovered_via": "scan|manual",
  "api_key": "..."
}
```

Fields removed from previous design:
- `is_active` — all bridges in the DB are active; if it's in the DB, it's active
- `network_id` — comes from the bridge via v2 protobuf; flows through `topology.push` from the integration, not from the addon DB
- `last_connected_at` / `created_at` — addon doesn't know these; they're v2 connection metadata owned by the integration
- `host` — single field, can be IP address or hostname

#### Addon → Integration

**`bridge.snapshot`**
Sent on initial connection with the full list of bridge entries from the DB.

```json
{
  "type": "bridge.snapshot",
  "bridges": [
    {
      "uuid": "...",
      "name": "...",
      "host": "...",
      "port": 80,
      "discovered_via": "scan|manual",
      "api_key": "..."
    }
  ]
}
```

**`bridge.changed`**
Sent when a bridge is added, updated, or removed in the addon DB. **Always sends the full bridge object** for all action types (including `"remove"`). Any `bridge.changed` update triggers an integration v2 disconnect + reconnect.

```json
{
  "type": "bridge.changed",
  "action": "add|update|remove",
  "bridge": { ... },
  "uuid": "..."
}
```

**`bridge.discovered`**
Sent when addon discovers a bridge via HTTP scan or user enters IP directly. Integration auto-adds the bridge and auto-connects via v2 protobuf — no user interaction with the integration required. Rediscovery of an existing bridge triggers `bridge.changed` with `action: "update"` instead.

```json
{
  "type": "bridge.discovered",
  "host": "192.168.1.50",
  "port": 80,
  "name": "ESP Bridge",
  "api_key": "..."
}
```

#### Integration → Addon

**`topology.push`**
Full topology snapshot. Replaces the current 10s polling via IntegrationWsManager. Sent on connect and when significant changes occur. Includes per-bridge metadata sourced from the v2 protobuf connection.

```json
{
  "type": "topology.push",
  "bridges": [
    {
      "uuid": "...",
      "network_id": "...",
      "last_seen": 1715058000,
      "uptime": 3600
    }
  ],
  "nodes": [ ... ]
}
```

The addon stores `network_id` in its DB when received from `topology.push` — it's displayed to users in the addon UI and needs to persist across restarts.

**`topology.changed`**
Incremental topology update (single node changed).

```json
{
  "type": "topology.changed",
  "node": { ... }
}
```

**`config.command`**
Config command originating from addon UI, relayed through integration to bridge.

```json
{
  "type": "config.command",
  "request_id": "...",
  "mac": "...",
  "command": "reboot|heartbeat_interval|force_rediscover|set_parent_mac|relay",
  "params": { ... }
}
```

**`config.result`**
Response to a config command.

```json
{
  "type": "config.result",
  "request_id": "...",
  "success": true,
  "error": null
}
```

### Error Handling

| Scenario | Response |
|----------|----------|
| Integration sends message before `auth_ok` | **Close connection** with error code (protocol violation) |
| Integration sends `config.command` for unknown bridge UUID | **Send error response** (operational failure) |
| Addon receives `config.result` for unknown `request_id` | **Close connection** with error code (protocol violation) |
| Malformed message | **Close connection** with error code (protocol violation) |

Rule: protocol violations → disconnect. Operational failures → error response.

### Lifecycle

1. Integration connects to `ws://localhost:8099/ws/integration`
2. Integration sends `{ "type": "auth", "token": "<supervisor_token>" }`
3. Addon validates token with supervisor
4. Addon sends `{ "type": "auth_ok" }`
5. Addon sends `bridge.snapshot`
6. Integration auto-connects to each bridge via v2 protobuf using host/port/api_key from snapshot
7. Integration sends `topology.push` (includes per-bridge metadata and full topology)
8. Ongoing: both sides push events as they occur

## Discovery & Auth Check

### Discovery

- User-triggered from addon UI (scan or manual IP entry)
- `discovered_via`: `"scan"` = network scan found it, `"manual"` = user entered IP directly
- Rediscovery of existing bridge → `bridge.changed` with `action: "update"` (no duplicate `bridge.discovered`)

### Auth Check

Before storing a bridge, the addon validates the `api_key` by calling `POST /api/auth/login` on the bridge's HTTP endpoint:
- **200** → key valid, store bridge, send `bridge.discovered` to integration
- **401** → key invalid, reject, never pass to integration

No new endpoint needed — the existing bridge HTTP auth endpoint is reused.

## DB Migration

### Changes

| File | Change |
|------|--------|
| `app/config.py` | Change default `database_path` from `/share/esp_tree/esp_tree.db` to `/data/esp_tree/esp_tree.db` |
| `app/config.py` | Change default `shared_dir` references accordingly |
| `ha_integration/.../const.py` | Remove `SHARED_DB_PATH` and `SHARED_LOG_PATH` — no longer needed |
| `ha_integration/.../bridge_db.py` | Delete — integration no longer reads DB directly |
| `ha_integration/.../bridge_watcher.py` | Replace DB polling with listening to `bridge.snapshot`/`bridge.changed` events from `/ws/integration` |
| `config.yaml` | Remove `share` from `map` if no longer needed; keep `data` (already available by default) |
| `app/db.py` | Add `network_id` column — populated from `topology.push` received from integration |
| `app/db.py` | Remove `is_active` column |
| `app/db.py` | Remove `last_connected_at` / `created_at` columns (integration owns this data) |
| `app/db.py` | Path change flows through from config — no other structural change needed |

### Migration Path

1. **Phase 1**: Add `/ws/integration` endpoint to addon with auth + `bridge.snapshot`/`bridge.changed`/`bridge.discovered`
2. **Phase 2**: Add integration WS client connecting to `/ws/integration`, replace `BridgeWatcher` DB polling with event-driven bridge updates, implement in-memory cache + 5-min grace period
3. **Phase 3**: Move DB to `/data/` (fresh start, no migration of old data), remove `bridge_db.py`, remove `/share` from `config.yaml` map, remove `is_active`/`last_connected_at`/`created_at` columns, add `network_id` column
4. **Phase 4**: Add `topology.push`/`topology.changed` from integration→addon (including per-bridge metadata), replace `IntegrationWsManager` polling, addon stores `network_id` from `topology.push`
5. **Phase 5**: Add `config.command`/`config.result` relay, add error handling (immediate error if integration disconnected), remove config command paths from `BridgeWsClient`
6. **Phase 6**: Strip `BridgeWsClient` down to discovery, auth check, and OTA only; switch v1 WS to on-demand (connect for OTA, disconnect when done)

## What Gets Removed

| Component | Reason |
|-----------|--------|
| `IntegrationWsManager` | Addon no longer polls HA for topology — integration pushes to addon instead |
| `bridge_db.py` (integration) | Integration no longer reads DB directly |
| `BridgeWatcher` DB polling | Replaced by event-driven bridge updates over `/ws/integration` |
| `SHARED_DB_PATH` / `SHARED_LOG_PATH` constants | DB moved to `/data/`, integration doesn't access filesystem |
| `is_active` field | All bridges in DB are active by definition |
| `last_connected_at` / `created_at` in DB | Integration owns connection metadata; addon doesn't track these |
| `network_id` from bridge DB write path | Now received from integration via `topology.push` |
| `control_manager()` preference logic | No more fallback between integration vs direct — always integration push |

## What Changes

| Component | Change |
|-----------|--------|
| `BridgeWsClient` / `BridgeWsManager` | Stripped to discovery, auth check, and OTA only. Remove topology and config command handling. V1 WS connection becomes on-demand (connect for OTA, disconnect when done). |
| `server.py` `control_manager()` | Remove preference logic. Topology always sourced from `/ws/integration` (integration push). `/ws/topology` rebroadcasts integration data only. |
| `server.py` config command endpoints | Route through `/ws/integration` instead of BridgeWsClient or IntegrationWsManager. Return error immediately if integration not connected. |
| `bridge_watcher.py` | Rewritten as WS event listener instead of DB poller |
| `config.yaml` | Remove `share` from `map`; DB lives in `/data/` now |
| DB file location | `/share/esp_tree/esp_tree.db` → `/data/esp_tree/esp_tree.db` |
| DB schema | Remove `is_active`, `last_connected_at`, `created_at` columns; add/update `network_id` column from `topology.push` |
| Discovery flow | `api_key` validated via `POST /api/auth/login` before storing; rediscovery sends `bridge.changed` update instead of duplicate |

## What Stays the Same

- Bridge v1 JSON WS protocol (used by addon for OTA only, on-demand connection)
- Bridge v2 protobuf protocol (used by integration for topology, events, config commands)
- OTA end-to-end: addon ↔ bridge via v1 JSON WS (fully independent, integration not involved)
- Discovery and auth check: addon ↔ bridge via HTTP (`POST /api/auth/login`)
- Addon web UI `/ws/topology` broadcast (still serves the frontend, now rebroadcasts integration data)
- Integration's `BridgeRuntimeClient` v2 protobuf connection to bridge
- Integration auto-add mechanism (existing seamless config entry creation)