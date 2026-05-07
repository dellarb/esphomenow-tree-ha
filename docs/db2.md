# DB Migration & Architecture Redesign

## Motivation

The SQLite DB currently lives at `/share/esp_tree/esp_tree.db`, which persists after addon uninstall. Moving it to `/data/` ensures it's deleted when the user selects "delete data on uninstall." This requires the HA integration to stop reading the DB directly and instead receive bridge entries via a WebSocket API from the addon.

This redesign also simplifies the data flow: the integration becomes the primary bridge client, and the addon reduces its direct bridge connection to discovery, auth, and OTA only.

## Architecture

```
Bridge (ESP32)
   │
   ├── HTTP ────────────────► Addon (discovery, auth check only)
   ├── WS v1 JSON ───────────► Addon (OTA only)
   │
   └── WS v2 Protobuf ──────► Integration (everything else: topology, events, config commands)

Addon ◄──── /ws/integration ────► Integration
         │
         ├── addon→integration: bridge.snapshot, bridge.changed, bridge.discovered
         ├── integration→addon: topology.push, topology.changed, config.command
         └── auth: supervisor token
```

### Data Flows

| Direction | Channel | Message Types |
|-----------|---------|---------------|
| Addon → Integration | `/ws/integration` | `bridge.snapshot`, `bridge.changed`, `bridge.discovered` |
| Integration → Addon | `/ws/integration` | `topology.push`, `topology.changed`, `config.command` |
| Addon → Bridge | HTTP | Discovery, auth check |
| Addon → Bridge | WS v1 JSON | OTA (start, chunk, status, abort) |
| Integration → Bridge | WS v2 Protobuf | Topology, events, config commands (reboot, heartbeat_interval, force_rediscover, set_parent_mac, relay) |
| Integration → Addon | `/ws/integration` | Config commands originating from addon UI: Addon UI → addon server → /ws/integration → integration → bridge |

### Config Command Relay

When a user triggers a config command from the addon UI (reboot, heartbeat, rediscover, parent, relay):

1. Addon UI calls addon HTTP API endpoint (e.g. `POST /api/devices/{mac}/reboot`)
2. Addon server sends `config.command` over `/ws/integration` to the integration
3. Integration relays the command to the bridge via v2 protobuf
4. Bridge responds to the integration
5. Integration sends `config.result` back over `/ws/integration` to the addon
6. Addon UI receives the response

## New Endpoint: `/ws/integration`

The addon exposes a dedicated WebSocket endpoint at `/ws/integration` for the HA integration to connect to.

### Authentication

- Integration sends HA supervisor token on connect
- Addon validates the token by calling the supervisor `/auth` endpoint
- No HMAC or shared secrets required — leverages existing HA infrastructure

### Message Protocol

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
      "discovered_via": "auto|manual",
      "api_key": "...",
      "network_id": "...",
      "is_active": true,
      "last_connected_at": 1715058000,
      "created_at": 1715050000
    }
  ]
}
```

**`bridge.changed`**
Sent when a bridge is added, updated, or removed in the addon DB. Includes the full bridge object for add/update, or just the UUID for removal.

```json
{
  "type": "bridge.changed",
  "action": "add|update|remove",
  "bridge": { ... }  // absent for "remove"
  "uuid": "..."      // always present
}
```

**`bridge.discovered`**
Sent when addon discovers a new bridge via HTTP discovery scan. Contains minimal info (host, port, name) for the integration to potentially connect.

```json
{
  "type": "bridge.discovered",
  "host": "192.168.1.50",
  "port": 80,
  "name": "ESP Bridge",
  "network_id": "..."
}
```

#### Integration → Addon

**`topology.push`**
Full topology snapshot. Replaces the current 10s polling via IntegrationWsManager. Sent on connect and when significant changes occur.

```json
{
  "type": "topology.push",
  "nodes": [ ... ]
}
```

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

### Lifecycle

1. Integration connects to `ws://addon:8099/ws/integration`
2. Integration sends `{ "type": "auth", "token": "<supervisor_token>" }`
3. Addon validates token with supervisor
4. Addon sends `{ "type": "auth_ok" }`
5. Addon sends `bridge.snapshot`
6. Integration sends `topology.push`
7. Ongoing: both sides push events as they occur

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
| `app/db.py` | Path change flows through from config — no structural change needed |

### Migration Path

1. **Phase 1**: Add `/ws/integration` endpoint to addon with auth + `bridge.snapshot`/`bridge.changed`/`bridge.discovered`
2. **Phase 2**: Add integration WS client connecting to `/ws/integration`, replace `BridgeWatcher` DB polling with event-driven bridge updates
3. **Phase 3**: Move DB to `/data/`, remove `bridge_db.py`, remove `/share` from `config.yaml` map
4. **Phase 4**: Add `topology.push`/`topology.changed` from integration→addon, replace `IntegrationWsManager` polling
5. **Phase 5**: Add `config.command`/`config.result` relay, remove config command paths from `BridgeWsClient` (keep only OTA + discovery)
6. **Phase 6**: Strip `BridgeWsClient` down to discovery, auth, and OTA only

## What Gets Removed

| Component | Reason |
|-----------|--------|
| `IntegrationWsManager` | Addon no longer polls HA for topology — integration pushes to addon instead |
| `bridge_db.py` (integration) | Integration no longer reads DB directly |
| `BridgeWatcher` DB polling | Replaced by event-driven bridge updates over `/ws/integration` |
| `SHARED_DB_PATH` / `SHARED_LOG_PATH` constants | DB moved to `/data/`, integration doesn't access filesystem |

## What Changes

| Component | Change |
|-----------|--------|
| `BridgeWsClient` / `BridgeWsManager` | Stripped to discovery, auth check, and OTA only. Remove topology and config command handling. |
| `server.py` `control_manager()` | Remove preference logic for integration vs direct. Always uses data from `/ws/integration` for topology. |
| `server.py` config command endpoints | Route through `/ws/integration` instead of BridgeWsClient or IntegrationWsManager |
| `bridge_watcher.py` | Rewritten as WS event listener instead of DB poller |
| `config.yaml` | Remove `share` from `map`; DB lives in `/data/` now |
| DB file location | `/share/esp_tree/esp_tree.db` → `/data/esp_tree/esp_tree.db` |

## What Stays the Same

- Bridge v1 JSON WS protocol (used by addon for OTA only)
- Bridge v2 protobuf protocol (used by integration for topology, events, config commands)
- OTA end-to-end: addon ↔ bridge via v1 JSON WS
- Discovery and auth check: addon ↔ bridge via HTTP
- Addon web UI `/ws/topology` broadcast (still serves the frontend)
- Integration's `BridgeRuntimeClient` v2 protobuf connection to bridge