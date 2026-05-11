# ESP-NOW Tree Bridge API v1

This document is the source of truth for the ESP-NOW Tree bridge management API.
It defines the transport-neutral message protocol used by the ESP-NOW bridge
firmware and clients such as the Home Assistant add-on or bridge-hosted browser
UI.

The first implementation target is the bridge firmware in this repo. The add-on
repo should reference this document rather than redefining the protocol. The
first required transport profile is WebSocket. A future serial transport should
reuse the same message model. A future Home Assistant integration should talk to
the add-on, not directly to the bridge, unless a later protocol version
explicitly adds multi-client bridge support.

## Goals

- Replace the add-on's dependence on bridge HTTP/JSON polling and HTTP OTA chunk
  endpoints.
- Provide an authenticated, versioned, persistent bridge management channel.
- Reduce bridge/add-on glue code by making topology, state, cache, and OTA
  operations first-class API messages.
- Give the add-on a clean source of topology, schema, state, and OTA data that
  can later be exposed to a custom Home Assistant integration.
- Allow the bridge to function without Home Assistant by serving a local browser
  UI that uses the same bridge API when the add-on is not connected.
- Keep the protocol open to a future serial transport so the bridge can avoid
  joining the Home Assistant WiFi network and keep ESP-NOW on its own channel.
- Keep MQTT available as an optional legacy/export path for non-HA or low
  dependency users.

## Non-Goals

- Do not fork ESPHome or Home Assistant.
- Do not change the ESPHome native API protocol.
- Do not make ESP-NOW remotes pretend to be independently reachable ESPHome API
  nodes.
- Do not make the bridge API a multi-client API in v1.
- Do not have a future Home Assistant integration connect directly to the bridge
  in v1.
- Do not implement serial transport in the first WebSocket API slice.
- Do not make the bridge-hosted browser UI equal to the add-on for queued OTA,
  retained firmware storage, or long-term history in v1.
- Do not implement pairing, multiple users, or role-based authorization in v1.
- Do not guarantee OTA resume after bridge restart or WS disconnect in v1. OTA
  aborts on disconnect; the add-on must start a new job.

## Design Philosophy: Fragmented Topology

`topology.get` returns a **lightweight snapshot** of the bridge and all known remote
nodes — network/route/diagnostic metadata only. It intentionally omits:

- **`schema`** — entity definitions per node (fetched on-demand per node via `node.schema.get`)
- **`state`** — current entity values (fetched on-demand per node via `node.state.get`)

This separation prevents the bridge from running out of heap memory when serving
topology for many remotes with many entities. The alternative — embedding schema and
state in every topology response — would require multi-megabyte JSON allocations on
a device with ~320 KB DRAM.

`schema_hash` is retained in the `identity` block because it changes only when the
remote's firmware changes (like `project_name`, `project_version`, names, etc.),
making it a natural companion to identity metadata.

Live state updates are delivered via **`remote.state`** push events, but these are
**opt-in per node** via `node.state.subscribe`. This prevents the bridge from
generating and transmitting state event frames for nodes the client does not
actively monitor.

## API Core and Transport Profiles

The bridge API has a transport-neutral core:

- authentication message types
- message envelope and error model
- bridge info
- topology requests and events
- per-node schema and state (on-demand, not embedded in topology)
- state subscription (opt-in per node)
- OTA control messages
- OTA binary chunk frame format

Each transport profile defines how those messages are framed and carried.

### WebSocket Transport

WebSocket is the first required transport profile.

The WebSocket profile uses one authenticated WebSocket hosted by the bridge:

```text
ws://<bridge_host>:<web_server_port>/esp-tree/v1/ws
```

For v1 this endpoint may be registered through ESPHome's existing
`web_server`/`web_server_base` plumbing. The API implementation must stay
separate from the legacy HTTP handlers so it can be split later if needed.

The add-on v2 requires this WebSocket API. It does not fall back to legacy HTTP.
If connection, authentication, or version negotiation fails, bridge features are
unavailable until the bridge firmware/configuration is fixed.

Legacy HTTP endpoints may remain in bridge firmware for manual compatibility:

- `/topology.json`
- `/api/ota/start`
- `/api/ota/status`
- `/api/ota/chunk`
- `/api/ota/abort`

The add-on must not depend on those endpoints once migrated to API v1.

### Bridge-Hosted Browser UI

The bridge may serve a standalone browser UI for users who do not want Home
Assistant or the add-on.

The browser UI uses **HTTP polling** (not WebSocket) for data. This allows the
browser UI and the add-on WebSocket client to coexist — the WS API remains
single-client while HTTP endpoints are stateless and support any number of
concurrent clients.

**Transport separation:**

```text
WebSocket:  ws://<bridge>:<port>/esp-tree/v1/ws   (add-on, single client)
HTTP:       http://<bridge>:<port>/api/v2/topology     (browser, any number of clients)
```

The browser UI does not connect via WebSocket. It polls `/api/v2/topology` at
regular intervals (default 5 seconds) and renders the topology snapshot. Because
polling is not real-time, the browser UI is suitable for topology viewing and
node diagnostics — not for latency-sensitive control loops.

The API key must not be embedded in the served HTML or JavaScript. For v1, the
browser UI should ask the user to enter the API key for the session. A pairing or
local unlock flow may be added later. Auth for HTTP endpoints uses session cookies
set by `/api/auth/login` or the `?api_key=` query parameter.

**Browser UI scope:**

- topology and state views (via HTTP polling)
- remote diagnostics
- immediate browser-selected OTA (via WebSocket on the OTA v2 page)
Standalone browser UI non-scope:

- queued OTA
- retained firmware storage
- add-on SQLite history
- Home Assistant device/entity ownership

### Planned Serial Transport

A future serial transport should carry the same API core over USB/UART so the
bridge can connect directly to the Home Assistant host PC without joining the HA
WiFi network.

Motivation:

- ESP-NOW can stay on its own WiFi channel.
- The bridge avoids channel hopping between infrastructure WiFi and ESP-NOW.
- The add-on can talk to `/dev/ttyUSB...` or similar instead of a LAN host.

Serial transport is not required for the first WebSocket implementation. When
added, it should define:

- framing for JSON messages, for example COBS, SLIP, or length-prefixed frames
- framing for OTA binary chunk frames
- reconnect/reset behavior
- serial device discovery/configuration in the add-on
- whether HMAC auth is still required or replaced by local device permissions

The message types and payloads should remain shared with the WebSocket profile
unless the spec explicitly defines a serial-only extension.

## Configuration

V1 uses a single bridge-wide API key configured in ESPHome YAML and in the
add-on.

Bridge-side example:

```yaml
esp_tree_bridge:
  api_key: !secret espnow_tree_api_key
```

Add-on-side settings:

```yaml
bridge_host: "192.168.1.50"
bridge_port: 80
bridge_api_key: "..."
```

The add-on may generate an API key and show a YAML snippet, but bridge-side
credential storage remains user-managed through ESPHome secrets in v1.

## Authentication

The API key must not be sent directly over the WebSocket. V1 uses
challenge-response HMAC-SHA256.

1. Client opens the WebSocket.
2. Bridge sends `auth.challenge`.
3. Client replies with `auth.response`.
4. Bridge replies with `auth.ok` or closes the socket after `auth.failed`.

Challenge:

```json
{
  "v": 1,
  "type": "auth.challenge",
  "payload": {
    "server_nonce": "hex-or-base64-random",
    "protocol": "esp-tree-ws",
    "min_version": 1,
    "max_version": 1
  }
}
```

Response:

```json
{
  "v": 1,
  "id": "1",
  "type": "auth.response",
  "payload": {
    "client": "ha-addon",
    "client_nonce": "hex-or-base64-random",
    "hmac": "hex-hmac-sha256"
  }
}
```

The HMAC input is:

```text
esp-tree-ws|v1|<client>|<server_nonce>|<client_nonce>
```

The HMAC key is the configured API key bytes. Hex output should be lowercase.

Successful auth:

```json
{
  "v": 1,
  "id": "1",
  "type": "auth.ok",
  "payload": {
    "api_version": 1,
    "server": "esp-tree-bridge"
  }
}
```

Failed auth:

```json
{
  "v": 1,
  "id": "1",
  "type": "error",
  "payload": {
    "code": "auth_failed",
    "message": "Authentication failed"
  }
}
```

After failed authentication the bridge closes the socket.

## Message Envelope

All text frames after authentication are JSON objects with this envelope:

```json
{
  "v": 1,
  "id": "optional-request-id",
  "type": "message.type",
  "payload": {}
}
```

Rules:

- `v` is required and must be `1`.
- `type` is required and is a human-readable string.
- `id` is required for request/response messages initiated by the client.
- `id` is omitted for unsolicited bridge events.
- Unknown message types return an `error` response if an `id` is present.
- Invalid JSON or invalid envelopes may close the socket after an error.

## Connection Model

V1 supports **two transport profiles** with different connection models:

### WebSocket — single client

The WebSocket transport supports **one authenticated client at a time**. That client is
expected to be the Home Assistant add-on.

If a second client attempts to authenticate while another authenticated client is
connected, the bridge returns `client_already_connected` and closes the new
socket. This keeps bridge firmware simple and avoids ownership coordination for OTA.

All authenticated operations are available to the single WebSocket client. There is no
management ownership or read-only mode in v1.

A future Home Assistant integration should receive devices/entities through an
add-on API owned by the add-on. A later bridge API version may add multi-client
read-only access if direct bridge integration becomes necessary.

### HTTP — stateless, any number of clients

The HTTP transport provides **stateless read access** to the same data available over
WebSocket (topology snapshots, bridge info, per-node state). No WebSocket
connection is required. Any number of clients can make concurrent requests.

HTTP endpoints are intended for the bridge-hosted browser UI and for lightweight
debugging clients. They do not support:
- real-time push events (`remote.state`, `remote.availability`, etc.)
- OTA operations (OTA uses WebSocket for binary chunk transfer)
- state subscriptions

Requests must be authenticated (see Authentication section).

## HTTP Transport

### Endpoints

All HTTP endpoints use the same authentication mechanism (cookie session or
`?api_key=` query parameter). Responses are JSON.

```text
GET /api/v1/topology
    Returns: full topology snapshot (same payload shape as WS `topology.snapshot`)
    Auth: session cookie or ?api_key=

GET /api/v1/bridge/info
    Returns: bridge metadata (same payload shape as WS `bridge.info.result`)
    Auth: session cookie or ?api_key=

GET /api/v1/node/<mac>/state
    Returns: current entity values for the specified node (same as WS `node.state.result`)
    Auth: session cookie or ?api_key=
    Errors: 400 invalid path, 404 node not found, 401 unauthorized
```

`<mac>` in the URL may contain colons, dashes, or spaces — all are accepted and
normalized internally. Example:

```
GET /api/v1/node/11:22:33:44:55:66/state
GET /api/v1/node/11-22-33-44-55-66/state?api_key=...
```

### Authentication

HTTP endpoints support two authentication methods, checked in this order:

1. **`?api_key=<key>` query parameter** — the API key is passed directly in the URL.
   Example: `GET /api/v2/topology?api_key=your_api_key_here`
2. **Session cookie** — client first POSTs to `/api/auth/login` with `api_key` form
   field, bridge sets `espnow_session` cookie, subsequent requests include that cookie.

When `api_key` is configured on the bridge, at least one auth method must succeed.
If no `api_key` is configured on the bridge (empty string), all HTTP endpoints are
accessible without authentication.

### Response format

Successful responses return `200 OK` with `Content-Type: application/json` and the
JSON body. Error responses:

```json
// 401 Unauthorized
{ "error": "unauthorized" }

// 400 Bad Request (invalid path format)
{ "error": "invalid path" }

// 404 Not Found (node unknown)
{ "error": "node not found" }
```

### Browser UI polling

The `/v2/topology` page served by the bridge uses HTTP polling instead of
WebSocket. It fetches `/api/v1/topology` every 5 seconds, renders the topology,
and redirects to `/login` if it receives a 401. This allows the browser UI and the
add-on WebSocket client to operate concurrently without the single-client WS
constraint.

## Reconnect Behavior

The add-on should reconnect with capped exponential backoff after bridge reboot,
WiFi drop, serial disconnect, or WebSocket close.

Recommended backoff:

- 1 second
- 2 seconds
- 5 seconds
- 10 seconds max

On disconnect, the add-on should mark the bridge offline and may display the
last successful topology snapshot as stale. On reconnect, the add-on should:

1. authenticate,
2. call `bridge.info`,
3. call `topology.get`,
4. for each discovered node: call `node.schema.get` if the node is new or has an unknown schema hash,
5. call `node.state.subscribe` for each active node to enable live events,
6. resume normal event processing.

If OTA was active during disconnect, the bridge aborts the job. The add-on
should mark it failed and start a new OTA job after reconnecting.

Error envelope:

```json
{
  "v": 1,
  "id": "request-id-if-any",
  "type": "error",
  "payload": {
    "code": "invalid_request",
    "message": "Human-readable summary",
    "details": {}
  }
}
```

Error codes:

- `auth_failed`
- `invalid_json`
- `invalid_envelope`
- `unsupported_version`
- `unknown_type`
- `invalid_payload`
- `bridge_not_ready`
- `remote_not_found`
- `node_not_found`
- `ota_busy`
- `ota_not_active`
- `ota_invalid_chunk`
- `ota_aborted`
- `client_already_connected`
- `internal_error`

## Bridge Info

Client request:

```json
{
  "v": 1,
  "id": "2",
  "type": "bridge.info",
  "payload": {}
}
```

Bridge response:

```json
{
  "v": 1,
  "id": "2",
  "type": "bridge.info.result",
  "payload": {
    "api_version": 1,
    "name": "espnow-bridge-c5",
    "mac": "AA:BB:CC:DD:EE:FF",
    "firmware": {
      "name": "espnow-bridge-c5",
      "version": "2026.5.1",
      "esphome_version": "..."
    },
    "features": {
      "topology": true,
      "events": true,
      "ota_ws": true,
      "config_ws": true,
      "mqtt_export": true,
      "legacy_http": true
    },
    "limits": {
      "max_json_bytes": 8192,
      "max_ws_chunk_size": 2048,
      "ota_max_increment_kb": 8
    }
  }
}
```

## Topology

The bridge is authoritative for current topology, online/offline status, active
parent/route, live session state, and identity metadata (including schema hash).
Schema definitions and entity state values are **not** embedded in topology — they
are fetched on-demand per node.

The add-on may cache schemas, last-known metadata, friendly labels, OTA history,
firmware artifacts, and UI annotations. Add-on cache is a performance and
recovery aid, not the source of truth.

The bridge is not responsible for durable history. It may keep RAM caches for
schema/session performance, but those caches can be lost on bridge reboot. The
add-on owns durable schema cache, retained last-known state, availability
history, OTA history, user labels, and manual deletion.

`schema_hash` is the 32-byte hash already computed by the remote during join and
sent in `espnow_join_t::schema_hash`. The bridge API exposes that value as a
lowercase hex string prefixed with `sha256:`.

V1 must not require remotes to compute a new API-specific hash. If the remote
hash algorithm changes in a future radio protocol version, the bridge API should
continue to expose the remote-provided hash and include enough protocol/version
metadata for clients to treat it as a cache validator.

### Topology Request

Client request:

```json
{
  "v": 1,
  "id": "topo-1",
  "type": "topology.get",
  "payload": {}
}
```

`payload` must be an empty object `{}`. The bridge ignores any additional fields.

Bridge response:

```json
{
  "v": 1,
  "id": "topo-1",
  "type": "topology.snapshot",
  "payload": {
    "bridge": {
      "mac": "AA:BB:CC:DD:EE:FF",
      "node_key": "aabbccddeeff",
      "device_unique_id": "esp_tree_aabbccddeeff",
      "name": "espnow-bridge-c5",
      "friendly_name": "ESP-NOW LR Bridge",
      "manufacturer": "ESPHome",
      "model": "esp_tree_bridge",
      "sw_version": "2026.5.1",
      "online": true,
      "parent_mac": "",
      "hop_count": 0,
      "rssi": "N.A.",
      "last_seen_s": 12345678,
      "uptime_s": 12345,
      "identity": {
        "esphome_name": "espnow-bridge-c5",
        "node_label": "ESP-NOW LR Bridge",
        "project_name": "espnow-bridge",
        "project_version": "2026.5.1",
        "firmware_epoch": 123456789,
        "chip_model": 23,
        "build_date": "May 01 2026",
        "build_time": "10:30:00",
        "firmware_md5": "00000000000000000000000000000000",
        "schema_hash": "N.A."
      },
      "session": {
        "joined": true,
        "schema_complete": true,
        "state_complete": true,
        "route_v2_capable": true,
        "session_flags": 1,
        "max_payload": 0,
        "max_entity_fragment": 0,
        "refresh_pending": false
      },
      "radio": {
        "rssi": "N.A.",
        "last_seen_s": 12345678,
        "hops_to_bridge": 0,
        "parent_rssi": "N.A."
      },
      "diagnostics": {
        "dirty_count": 0,
        "retry_count": 0,
        "last_error": "",
        "uptime_s": 12345
      }
    },
    "nodes": [
      {
        "mac": "11:22:33:44:55:66",
        "node_key": "112233445566",
        "device_unique_id": "esp_tree_112233445566",
        "name": "kitchen_sensor",
        "friendly_name": "Kitchen Sensor",
        "manufacturer": "ESPHome",
        "model": "esp_tree_remote",
        "sw_version": "2026.5.1",
        "online": true,
        "parent_mac": "AA:BB:CC:DD:EE:FF",
        "hop_count": 1,
        "rssi": -61,
        "last_seen_s": 12345678,
        "uptime_s": 12345,
        "direct_child_count": 0,
        "total_child_count": 0,
        "can_relay": true,
        "relay_enabled": false,
        "identity": {
          "esphome_name": "kitchen_sensor",
          "node_label": "Kitchen Sensor",
          "project_name": "espnow-remote",
          "project_version": "2026.5.1",
          "firmware_epoch": 123456789,
          "chip_model": 23,
          "build_date": "May 01 2026",
          "build_time": "10:30:00",
          "firmware_md5": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
          "schema_hash": "sha256:abcdef012345..."
        },
        "session": {
          "joined": true,
          "schema_complete": true,
          "state_complete": true,
          "route_v2_capable": true,
          "session_flags": 1,
          "max_payload": 1470,
          "max_entity_fragment": 1448,
          "refresh_pending": false
        },
        "radio": {
          "rssi": -61,
          "last_seen_s": 12345678,
          "hops_to_bridge": 1,
          "parent_rssi": -61
        },
        "diagnostics": {
          "dirty_count": 0,
          "retry_count": 0,
          "last_error": "",
          "uptime_s": 12345
        }
      }
    ]
  }
}
```

The `bridge` object uses the same structural shape as each node in `nodes[]` so
clients can process both with a shared code path. Fields that do not apply to
the bridge take sentinel values: `rssi` and `parent_rssi` are the string
`"N.A."` (the bridge has no parent and no RSSI measurement in the ESP-NOW
mesh); `schema_hash` is `"N.A."` (the bridge has no entity schema); and
`max_payload` / `max_entity_fragment` are `0`.

`schema_hash` lives inside `identity` because it changes only when the remote's
firmware changes — it belongs alongside `project_name`, `project_version`, and
other firmware identity fields. For the bridge, `schema_hash` is `"N.A."`. The
`session` block retains `schema_complete` and `state_complete` flags as indicators
of whether the remote has finished sending its schema and current state to the
bridge; for the bridge these are always `true`.

`session.refresh_pending` is always `false` in v1 (the field is a placeholder for
future lazy-refresh behavior).

`state` and `schema` blocks are **not** present in topology. Clients that need
schema or state for a specific node must call `node.schema.get` and
`node.state.subscribe` respectively.

### Node Schema Get

Fetches the full entity schema for one specific remote node. Schema is not
embedded in topology to avoid large heap allocations when many remotes have many
entities.

**Client request:**

```json
{
  "v": 1,
  "id": "schema-1",
  "type": "node.schema.get",
  "payload": {
    "mac": "11:22:33:44:55:66"
  }
}
```

`mac` may contain colons, dashes, or spaces — all are accepted and normalized.

**Bridge response** (node known):

```json
{
  "v": 1,
  "id": "schema-1",
  "type": "node.schema.result",
  "payload": {
    "mac": "11:22:33:44:55:66",
    "schema_hash": "sha256:abcdef012345...",
    "schema": {
      "complete": true,
      "total_entities": 3,
      "entities": [
        {
          "key": "temperature",
          "entity_id": "temperature",
          "unique_id": "esp_tree_112233445566_temperature",
          "entity_index": 0,
          "stable_identity": true,
          "platform": "sensor",
          "name": "Temperature",
          "unit": "°C",
          "native_type": "float"
        },
        {
          "key": "humidity",
          "entity_id": "humidity",
          "unique_id": "esp_tree_112233445566_humidity",
          "entity_index": 1,
          "stable_identity": true,
          "platform": "sensor",
          "name": "Humidity",
          "unit": "%",
          "native_type": "float"
        }
      ]
    }
  }
}
```

**Bridge response** (node unknown or schema not yet received):

```json
{
  "v": 1,
  "id": "schema-1",
  "type": "node.schema.result",
  "payload": {
    "mac": "11:22:33:44:55:66",
    "schema_hash": null,
    "schema": null
  }
}
```

Not an error. The client can infer the node does not exist in the topology or
has not yet sent its schema. The `mac` field is always echoed back for
correlation.

Entity identity follows the same rules as the original topology spec. The
persistent entity key is the remote-reported `entity_id` combined with the remote
device MAC. `entity_index` is a transport field only; clients must not use it as
a durable identifier.

### Node State Subscribe / Unsubscribe

`remote.state` and `remote.schema_changed` push events are **opt-in per node**.
The client must subscribe to a node to receive events for it. This prevents the
bridge from generating and transmitting event frames for nodes the client does
not monitor.

**Subscribe:**

```json
{
  "v": 1,
  "id": "sub-1",
  "type": "node.state.subscribe",
  "payload": {
    "mac": "11:22:33:44:55:66"
  }
}
```

**Bridge response:**

```json
{
  "v": 1,
  "id": "sub-1",
  "type": "node.state.subscribed",
  "payload": {
    "mac": "11:22:33:44:55:66"
  }
}
```

The operation is idempotent — subscribing to an already-subscribed node returns the
same response without error.

**Unsubscribe:**

```json
{
  "v": 1,
  "id": "unsub-1",
  "type": "node.state.unsubscribe",
  "payload": {
    "mac": "11:22:33:44:55:66"
  }
}
```

**Bridge response:**

```json
{
  "v": 1,
  "id": "unsub-1",
  "type": "node.state.unsubscribed",
  "payload": {
    "mac": "11:22:33:44:55:66"
  }
}
```

Idempotent — unsubscribing from a node not currently subscribed returns the same
response without error.

Subscribing to an unknown or offline node is accepted silently. When the node
appears and sends state, events will flow. Subscriptions are cleared when the
WebSocket client disconnects.

### Node State Get

Fetches a point-in-time snapshot of all entity values for one specific node.
Use this on reconnect before live events have arrived, or to verify current
values without maintaining a subscription.

**Client request:**

```json
{
  "v": 1,
  "id": "state-1",
  "type": "node.state.get",
  "payload": {
    "mac": "11:22:33:44:55:66"
  }
}
```

**Bridge response:**

```json
{
  "v": 1,
  "id": "state-1",
  "type": "node.state.result",
  "payload": {
    "mac": "11:22:33:44:55:66",
    "state": {
      "temperature": 22.4,
      "humidity": 58.1
    }
  }
}
```

If the node has no cached state yet (no entity values have been received), `state`
is `{}` — an empty object, not an error. The `mac` is always echoed back.

State values use the same `state_value_json` encoding as the original API:
sensor/number as raw floats, switch/binary/button as `true`/`false`, light as a
JSON object with `state`, `brightness`, `color`, `color_temp`, `effect`, etc.,
fan as a JSON object with `state`, `speed_level`, `oscillating`, `direction`,
etc.

### Node State Result

The `node.state.result` response payload format is:

```json
{
  "mac": "11:22:33:44:55:66",
  "state": {
    "entity_key": <value>,
    ...
  }
}
```

`entity_key` matches the `key` field from `node.schema.result` for the same
entity.

## Events

After authentication, the bridge may send unsolicited events on the same socket.

**Bridge heartbeat:**

```json
{
  "v": 1,
  "type": "bridge.heartbeat",
  "payload": {
    "uptime_ms": 12345678
  }
}
```

The bridge sends a heartbeat every ~30 seconds. The add-on uses heartbeat to
detect stale connections and reconnect.

**Topology changed:**

```json
{
  "v": 1,
  "type": "topology.changed",
  "payload": {
    "reason": "node_joined",
    "mac": "11:22:33:44:55:66"
  }
}
```

`topology.changed` is sent to all authenticated clients regardless of
subscription state — it is a network-level event.

Initial reason strings:

- `node_joined`
- `node_offline`
- `route_changed`
- `node_removed`

**Remote availability:**

```json
{
  "v": 1,
  "type": "remote.availability",
  "payload": {
    "mac": "11:22:33:44:55:66",
    "online": true,
    "reason": "joined",
    "offline_s": 0,
    "parent_mac": "AA:BB:CC:DD:EE:FF",
    "hop_count": 1,
    "rssi": -61
  }
}
```

`offline_s` is the number of seconds the node has been offline. When `online` is true, `offline_s` is 0.

`remote.availability` is sent to all authenticated clients regardless of
subscription state — availability is a network-level concern.

`remote.availability.reason` describes **why the node online/offline state changed**.
It must not be used as a generic reason for schema refresh, route change, or other
node events.

Initial reason strings:

- `joined` — first-time join
- `rejoined` — reconnection after being offline
- `timeout` — heartbeat/schema/command timeout
- `evicted` — RAM pressure eviction
- `manual` — MQTT force-invalidation

**Remote state (pushed, gated by subscription):**

```json
{
  "v": 1,
  "type": "remote.state",
  "payload": {
    "mac": "11:22:33:44:55:66",
    "state": {
      "temperature": 22.5
    }
  }
}
```

`remote.state` is **only sent to clients subscribed to that node**. A client
that has not called `node.state.subscribe` for a node will not receive
`remote.state` events for that node. This is the key change from v1 original:
events are scoped per-client and per-node.

The client should call `node.state.subscribe` for each node it wants to receive
live state events from.

**Remote schema changed (pushed, gated by subscription):**

```json
{
  "v": 1,
  "type": "remote.schema_changed",
  "payload": {
    "mac": "11:22:33:44:55:66",
    "schema_hash": "sha256:..."
  }
}
```

`remote.schema_changed` is also gated by subscription — the client must have
subscribed to the node to receive this event. When received, the client should
call `node.schema.get` again to refresh the cached schema.

## OTA Over WebSocket

OTA migration is a fast follow after auth/topology/events. The API should reserve
the OTA contract in v1 so the add-on can remove HTTP OTA without another
protocol break.

V1 OTA rules:

- Same authenticated WebSocket as management traffic.
- JSON control messages.
- Binary WebSocket frames for firmware chunks.
- One active OTA job globally per bridge.
- The add-on sends chunks in strictly ascending sequence order starting from
  `next_sequence` reported by `ota.status`.
- The add-on should poll `ota.status` to track progress and determine how many
  chunks the bridge is ready to accept. `next_sequence` and `window_size` in
  the status response are the authoritative flow control signals.
- OTA aborts on bridge restart.
- OTA aborts on WebSocket disconnect. No resume or grace period in v1.
  The add-on must start a new OTA job after reconnecting.

There are two distinct chunk sizes:

- WebSocket add-on-to-bridge chunk size, controlled by bridge RAM/backpressure.
- ESP-NOW radio fragment size, controlled internally by bridge/remote protocol.

The API exposes the WebSocket chunk/window constraints, not low-level radio
fragment details.

### Start

The `ota.start` response is deferred until the bridge hears back from the
target remote. When the add-on sends `ota.start`, the bridge sends a FILE_ANNOUNCE
to the remote over ESP-NOW. The remote responds with FILE_ACCEPT (or FILE_REJECT).
Only then does the bridge send `ota.accepted` (or an error) back to the add-on.

The add-on must not send binary chunks until it receives `ota.accepted`.

Client request:

```json
{
  "v": 1,
  "id": "ota-1",
  "type": "ota.start",
  "payload": {
    "target_mac": "11:22:33:44:55:66",
    "size": 912384,
    "md5": "hex-md5",
    "sha256": "hex-sha256",
    "filename": "remote.ota.bin",
    "preferred_chunk_size": 4096
  }
}
```

Bridge response (deferred until FILE_ACCEPT from remote):

```json
{
  "v": 1,
  "id": "ota-1",
  "type": "ota.accepted",
  "payload": {
    "job_id": "b7f1",
    "target_mac": "11:22:33:44:55:66",
    "max_chunk_size": 2048,
    "window_size": 4,
    "next_sequence": 0
  }
}
```

The add-on should begin sending binary chunks starting at `next_sequence` after
receiving `ota.accepted`. The `max_chunk_size` is the bridge-side WebSocket chunk
limit (`kMaxWsChunkSize`, typically 2048). The bridge rechunks internally for the
radio link using the remote's negotiated `session_max_payload`, so this value is
not the remote's radio fragment size. If the add-on's `preferred_chunk_size` is
smaller, the bridge will use the smaller value.

If another OTA job is active:

```json
{
  "v": 1,
  "id": "ota-1",
  "type": "error",
  "payload": {
    "code": "ota_busy",
    "message": "An OTA job is already active",
    "details": {
      "active_job_id": "b7f1"
    }
  }
}
```

If the target remote is not found or not online:

```json
{
  "v": 1,
  "id": "ota-1",
  "type": "error",
  "payload": {
    "code": "remote_not_found",
    "message": "Target remote is not online",
    "details": {
      "target_mac": "11:22:33:44:55:66"
    }
  }
}
```

If the remote rejects the transfer (FILE_REJECT):

```json
{
  "v": 1,
  "id": "ota-1",
  "type": "error",
  "payload": {
    "code": "ota_not_active",
    "message": "Remote rejected the transfer",
    "details": {
      "reason": "busy"
    }
  }
}
```

### Binary Chunk Frame

Firmware bytes are sent in binary WebSocket frames after `ota.accepted`.

Chunks must be sent in strictly ascending sequence order starting from
`next_sequence`. The bridge rejects out-of-order chunks.

Header layout:

```text
offset  size  field
0       2     magic: ASCII "ET"
2       1     version: 1
3       1     header_length: 24
4       4     job_id_u32
8       4     sequence
12      4     firmware_offset
16      2     payload_length
18      2     flags
20      4     crc32(payload)
24      N     payload bytes
```

Multi-byte integer fields are little-endian.

`job_id_u32` is the numeric form assigned by the bridge. If the JSON `job_id`
is displayed as hex, it should represent this same value.

Initial flags:

- `0x0001`: final chunk

The bridge rejects chunks with:

- wrong magic/version/header length
- unknown job id
- no active OTA job (`ota_not_active`)
- sequence outside the OTA manager's current window
- payload length over current `max_chunk_size`
- CRC mismatch

If `on_source_chunk()` rejects the chunk, the bridge sends a JSON error with
`ota_invalid_chunk`.

### Flow Control

The add-on should poll `ota.status` to determine when to send more chunks.
The `next_sequence` and `window_size` fields in the status response tell the
add-on which sequence the bridge is ready for next and how many chunks may be
in flight. When `next_sequence` advances past the last sent sequence, the
add-on may send more chunks.

The bridge does not push `ota.ack`, `ota.nack`, or `ota.flow` events in v1.
These are deferred to a future API version. Polling `ota.status` is the only
flow control mechanism.

### Status

Client request:

```json
{
  "v": 1,
  "id": "ota-status-1",
  "type": "ota.status",
  "payload": {}
}
```

Bridge response/event:

```json
{
  "v": 1,
  "id": "ota-status-1",
  "type": "ota.status.result",
  "payload": {
    "active": true,
    "job_id": "b7f1",
    "target_mac": "11:22:33:44:55:66",
    "state": "transferring",
    "bytes_received": 262144,
    "size": 912384,
    "percent": 28,
    "next_sequence": 128,
    "window_size": 2,
    "max_chunk_size": 2048,
    "message": ""
  }
}
```

Valid states:

- `idle` — no active OTA job
- `waiting_for_leaf` — `ota.start` received, waiting for remote to accept (FILE_ACCEPT)
- `transferring` — remote accepted, firmware chunks in transit
- `verifying` — all chunks sent, remote verifying MD5
- `success` — transfer complete
- `failed` — transfer failed (remote rejected, MD5 mismatch, timeout, etc.)
- `aborted` — transfer aborted by client or disconnect

`next_sequence` in the status response indicates the last sequence the bridge
has received from the add-on that the remote has acknowledged over radio. The
add-on should use `next_sequence` combined with `window_size` to determine
which chunks to send next. Sequences `next_sequence` through
`next_sequence + window_size - 1` may be sent.

### Abort

Client request:

```json
{
  "v": 1,
  "id": "ota-abort-1",
  "type": "ota.abort",
  "payload": {
    "job_id": "b7f1",
    "reason": "user"
  }
}
```

Bridge response:

```json
{
  "v": 1,
  "id": "ota-abort-1",
  "type": "ota.aborted",
  "payload": {
    "job_id": "b7f1",
    "reason": "user"
  }
}
```

## Client Workflow Summary

A client connecting to the bridge for the first time, or reconnecting after a
disconnect, should perform these steps in order:

```
1. open WebSocket
2. wait for auth.challenge
3. send auth.response
4. wait for auth.ok
5. send bridge.info
6. send topology.get
7. for each node in topology.nodes:
     a. compare identity.schema_hash against cached schema
     b. if missing or changed: send node.schema.get for that mac
8. for each node to monitor:
     send node.state.subscribe
9. event loop: receive remote.state, remote.availability,
   topology.changed, remote.schema_changed, bridge.heartbeat
```

For a node whose state is needed once rather than continuously:

```
1. send node.state.get
2. use the values from node.state.result
```

To update a node's schema after a `remote.schema_changed` event:

```
1. send node.schema.get (mac from the event)
2. replace cached schema for that node
```

## Implementation Phases

### Phase 1: Spec and Bridge API Skeleton

- Add this spec.
- Add bridge WebSocket endpoint at `/esp-tree/v1/ws`.
- Add single-key HMAC challenge-response.
- Add message envelope parsing and error responses.
- Add `bridge.info`.
- Add host-side tests for auth/envelope/error behavior.

### Phase 2: Topology, Events, and Subscription Model

- Refactor `topology.get` to remove `schema` and `state` blocks.
- Move `schema_hash` into `identity`.
- Add `node.schema.get`, `node.state.get`, `node.state.subscribe`, `node.state.unsubscribe`.
- Implement subscription gating on `remote.state` and `remote.schema_changed`.
- Emit topology, availability, state, and schema-change events.
- Add host-side tests for topology snapshot shape, per-node schema, and
  subscription gating.

### Phase 3: Add-on WebSocket Transport

- Add `bridge_api_key` to add-on configuration.
- Replace add-on HTTP bridge client with WebSocket API client.
- Require bridge API v1; no HTTP fallback.
- Add key generation helper if cheap.
- Store schema cache keyed by remote MAC/node key and schema hash.
- Add per-device clear cache UI.
- Implement the client workflow: subscribe to active nodes on connect/reconnect.

### Phase 4: OTA Over WebSocket

- Add `ota.start`, `ota.status`, `ota.abort`.
- Add binary chunk frame decoder.
- Defer `ota.accepted` until remote FILE_ACCEPT.
- Polling-based flow control via `ota.status`.
- No `ota.ack`, `ota.nack`, `ota.flow` push events in v1.
- Enforce one active OTA per bridge.
- Abort on restart; abort on WebSocket disconnect.
- Replace add-on HTTP OTA worker with WebSocket OTA sender.
- Add host-side tests for chunk decoding, status polling, and OTA state
  transitions.

### Phase 5: Add-on API for HA Integration

- Add an add-on-hosted API/event stream for a future Home Assistant integration.
- Let the add-on remain the single bridge API client.
- Expose normalized remote device/entity schemas, state, availability, and
  diagnostics from add-on cache/live bridge events.
- Keep MQTT as optional legacy/export support.

### Phase 6: HA Integration

- Build a custom Home Assistant integration against the add-on API.
- Model each ESP-NOW remote as its own HA device with entities attached to that
  remote device.
- Use add-on-provided topology/schema/state derived from the bridge API as the
  source of truth.
- Keep add-on as management UI, firmware store, history, and diagnostics.

## Test Requirements

Host-side tests should cover pure protocol behavior before hardware flashing:

- HMAC challenge-response verification.
- Envelope validation.
- Error envelope generation.
- Topology snapshot JSON shape from fake bridge data — verify no `schema` or `state` blocks.
- Per-node schema JSON shape.
- Per-node state JSON shape.
- Subscription subscribe/unsubscribe/dupe/idempotent behavior.
- `remote.state` event gated by subscription.
- `remote.schema_changed` event gated by subscription.
- Schema hash negotiation.
- OTA binary chunk decode.
- OTA start/accepted/abort state transitions.
- OTA abort-on-disconnect behavior.
- Deferred `ota.accepted` after remote FILE_ACCEPT.

Hardware tests should cover integration behavior:

- WebSocket connects and authenticates.
- `bridge.info` reports API version and limits.
- `topology.get` returns real nodes without `schema`/`state`.
- `node.schema.get` returns entity definitions for a known node.
- `node.schema.get` returns `schema: null` for an unknown node.
- `node.state.subscribe` + `remote.state` event flow.
- `node.state.unsubscribe` stops `remote.state` events.
- `node.state.get` returns current values.
- Events arrive without topology polling.
- OTA transfers a real `.ota.bin` after the OTA phase lands.

## Add-on API Direction

The bridge API v1 is not the public API for Home Assistant entity ownership.
The add-on should later expose a separate local API/event stream for a custom
Home Assistant integration.

The add-on API should be read/event focused at first:

- remote device list
- entity schemas
- current entity state
- availability
- 30-day online/offline availability transition history
- diagnostics
- topology/route metadata
- state and availability events

The add-on API should not initially expose full management operations:

- OTA remains in the add-on UI/backend.
- firmware artifact storage remains in the add-on.
- bridge configuration remains in the add-on settings.

This keeps the Home Assistant integration focused on owning devices/entities in
HA while the add-on remains the management surface.

When a previously known entity disappears from a refreshed schema, the add-on
should keep the entity record and mark it unavailable/removed rather than
deleting it immediately. Durable entity history and user customizations should be
preserved across transient schema failures or partial joins.

When a previously known remote disappears from topology, the add-on should mark
the remote offline/unavailable and retain its cached schema, state, and
availability history. Remote/device deletion should be an explicit user action in
the add-on UI, not an automatic consequence of missing topology.

## Open Questions

These questions should be resolved as implementation reaches them:

- Exact maximum JSON frame size for ESP32-C5 and other bridge targets.
- Whether OTA CRC32 should cover only payload or header plus payload.
- Whether legacy HTTP endpoints should be compile-time optional, YAML optional,
  or left as-is until after add-on migration.
- Whether `node.schema.subscribe` (subscribe to schema change events without
  subscribing to state) should be added as a separate type.
