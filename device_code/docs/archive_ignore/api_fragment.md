# Bridge API Memory Refactor — Schema/State Fragmentation

> **Status:** Proposed
> **Date:** 2026-05-03
> **Files affected:** `components/esp_tree_bridge/bridge_api_types.h`, `bridge_api_ws.cpp`, `bridge_api_router.cpp`, `bridge_api_messages.cpp`, `esp_tree_bridge.cpp`

---

## Executive Summary

`topology.get` currently embeds per-node `schema` (entity definitions) and `state` (current values) in every snapshot response. With 50 remotes at 100 entities each, the bridge needs ~2.8 MB of heap just for the JSON reserve calculation — physically impossible on an ESP32 with ~320 KB DRAM.

The fix is to remove schema and state from `topology.get` entirely and replace them with two new on-demand, per-node request types over the existing WebSocket channel. This reduces the topology response from ~2.8 MB to ~128 KB in the same worst case, while preserving full functionality for clients that need schema or state.

---

## 1. The Problem

### 1.1 Memory math

`api_topology_snapshot_json` (`esp_tree_bridge.cpp:1573–1744`) uses a fixed per-entity and per-session reserve:

```
kReserveBytes = 16384 + num_sessions × 2048 + total_entities × 512
```

Additionally, the state loop iterates `mqtt_entities_` (which holds all entities for all remotes) **for each node** in the response — an O(nodes × total_entities) inner loop that compounds the issue.

| Scenario | Sessions | Entities | kReserveBytes | Actual needed |
|----------|----------|----------|---------------|---------------|
| 10 remotes, 20 entities | 10 | 200 | ~136 KB | ~36 KB |
| 20 remotes, 50 entities | 20 | 1000 | ~660 KB | ~56 KB |
| 50 remotes, 100 entities | 50 | 5000 | ~2.8 MB | ~128 KB |

The 2.8 MB figure exceeds the entire available DRAM of the target ESP32-C5 (~320 KB).

### 1.2 What actually causes memory pressure

The heap check at line 1593 (`free_heap < kReserveBytes + 8192`) prevents actual allocation of impossible sizes, but the failure mode is a `{"error":"insufficient_heap"}` JSON response — not a graceful degradation. With remotes that have moderate entity counts (20–50 entities), the code works but leaves the bridge operating dangerously close to OOM.

### 1.3 Root cause

Schema and state are embedded in topology because the original API design had no separate mechanism to fetch them. The assumption that "topology = everything in one snapshot" is fundamentally incompatible with a memory-constrained embedded device serving large multi-entity remotes.

---

## 2. The Solution

### 2.1 Philosophy

- **`topology.get`** becomes a lightweight network/route/diagnostic snapshot only. It tells the client which remotes exist, how they are connected, and their radio health — without entity schema or live state.
- **Schema and state are on-demand per-node resources.** Clients request them explicitly for the node they care about.
- **Live push events for state are opt-in per node.** Clients subscribe to `remote.state` and `remote.schema_changed` events only for nodes they actively monitor.

### 2.2 Changes to `topology.get` response

**Removed from each node object:**

- `"schema": { "complete": ..., "total_entities": ..., "entities": [...] }` — full entity definitions
- `"state": { "entity_key": value, ... }` — current values for all entities

**Moved into `identity` block:**

- `"schema_hash": "sha256:..."` — moved from top-level node object to `identity`, because it describes the firmware's entity definitions (which change on firmware update alongside `project_name`, `project_version`, names, etc.)

**Kept in each node object:**

- `"identity": { esphome_name, node_label, project_name, project_version, firmware_epoch, chip_model, build_date, build_time, **schema_hash** }`
- `"session": { joined, schema_complete, state_complete, route_v2_capable, session_flags, max_payload, max_entity_fragment, refresh_pending }`
- `"radio": { rssi, last_seen_ms, hops_to_bridge, parent_rssi }`
- `"diagnostics": { dirty_count, retry_count, last_error }`

**New node object structure:**

```json
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
  "last_seen_ms": 12345678,
  "identity": {
    "esphome_name": "kitchen_sensor",
    "node_label": "Kitchen Sensor",
    "project_name": "espnow-remote",
    "project_version": "2026.5.1",
    "firmware_epoch": 123456789,
    "chip_model": 23,
    "build_date": "May 01 2026",
    "build_time": "10:30:00",
    "schema_hash": "sha256:..."
  },
  "session": { ... },
  "radio": { ... },
  "diagnostics": { ... }
}
```

### 2.3 New per-node endpoints

All new message types use the existing WebSocket channel at `/esp-tree/v1/ws`. They share the same JSON envelope format as existing API messages.

#### `node.schema.get`

Fetch the full entity schema for one specific remote node.

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

**Bridge response:**
```json
{
  "v": 1,
  "id": "schema-1",
  "type": "node.schema.result",
  "payload": {
    "mac": "11:22:33:44:55:66",
    "schema_hash": "sha256:...",
    "schema": {
      "complete": true,
      "total_entities": 5,
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
        }
      ]
    }
  }
}
```

If the node is unknown or has not yet sent its schema, the response has `schema: null` with no error code — the client can infer the node doesn't exist or hasn't joined yet.

#### `node.state.get`

Fetch the current state (all entity values) for one specific remote node.

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

If the node has no cached state yet, `state` is `{}` (empty object, not an error).

#### `node.state.subscribe`

Opt-in to receive `remote.state` push events for a specific node. Without a subscription, `remote.state` events are not sent to that client for that node.

**Client request:**
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

The operation is idempotent — subscribing to an already-subscribed node returns the same response. No error is raised.

#### `node.state.unsubscribe`

Stop receiving `remote.state` events for a specific node.

**Client request:**
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

Idempotent — unsubscribing from a node not currently subscribed returns the same response.

#### `remote.state` (existing, gated)

When a remote sends a state update, the bridge checks whether the authenticated client has an active subscription for that node's MAC. If subscribed, the event is sent. If not subscribed, it is silently dropped for that client.

**Bridge push (when subscribed):**
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

#### `remote.schema_changed` (existing, gated)

Same as `remote.state` — only sent to clients subscribed to that node. The client should then call `node.schema.get` to refresh.

**Bridge push (when subscribed):**
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

---

## 3. Memory Savings

After removing schema and state from `topology.get` and its reserve calculation:

| Scenario | Before (with schema+state) | After (without) | Saved | Savings % |
|----------|---------------------------|-----------------|-------|-----------|
| 10 remotes, 20 entities | ~136 KB | ~36 KB | ~100 KB | ~74% |
| 20 remotes, 50 entities | ~660 KB | ~56 KB | ~604 KB | ~91% |
| 50 remotes, 100 entities | ~2.8 MB | ~128 KB | ~2.7 MB | ~96% |

The O(nodes × total_entities) inner loop over `mqtt_entities_` is also eliminated entirely — that loop iterated all entity records for all remotes for each node in the topology response.

---

## 4. Implementation Details

### 4.1 Files changed

| File | Change |
|------|--------|
| `bridge_api_types.h` | Add 6 new message type constants, `NodeSubscriptions` struct |
| `bridge_api_ws.cpp` | Add `client_subscriptions_` map; gate `remote.state` and `remote.schema_changed` by subscription |
| `bridge_api_router.cpp` | Add 4 new handlers; accept pointer to subscriptions map; update `route_request_()` |
| `bridge_api_router.h` | Add 4 handler declarations; add `client_subscriptions_` pointer member |
| `bridge_api_messages.cpp` / `.h` | Add 4 new `BridgeApiMessages` static methods |
| `esp_tree_bridge.cpp` | Refactor `api_topology_snapshot_json`; add `api_node_schema_json()` and `api_node_state_json()` |
| `esp_tree_bridge.h` | Add `api_node_schema_json()` and `api_node_state_json()` declarations |

### 4.2 Subscription tracking

Subscriptions are stored per WebSocket client (per `client_id`):

```cpp
struct NodeSubscriptions {
  std::set<std::string> state_subscribed_nodes;  // node_key (no colons)
};

std::map<uint32_t, NodeSubscriptions> client_subscriptions_;  // in BridgeApiWsTransport::Impl
```

Memory per client: `10 clients × 128 nodes × ~20 bytes/node` ≈ **25 KB worst case** — negligible.

Subscriptions are cleared on client disconnect (`finish_session()` already clears session state).

### 4.3 Gate logic

`emit_remote_state()` and `emit_remote_schema_changed()` are called with a `client_id`. The gate check:

```cpp
bool is_node_subscribed(uint32_t client_id, const std::string &node_key) {
  auto it = client_subscriptions_.find(client_id);
  if (it == client_subscriptions_.end()) return false;
  return it->second.state_subscribed_nodes.count(node_key) > 0;
}
```

`topology.changed` and `remote.availability` are **not** gated by subscription — these are network-level events that all clients should receive.

### 4.4 Refactored `kReserveBytes`

Old formula:
```cpp
const size_t kReserveBytes = 16384 + num_sessions * kSessionJsonSize + total_entities * kEntityJsonSize;
```

New formula:
```cpp
const size_t kReserveBytes = 16384 + num_sessions * 1024;  // session + identity + radio + diagnostics per node
```

`kEntityJsonSize` and `kSessionJsonSize` are reduced. The state and schema loops are deleted entirely from `api_topology_snapshot_json`.

### 4.5 New per-node functions

`api_node_schema_json(mac_colon)` — extracts the schema building loop from the old topology function, scoped to one session's `schema_entities`.

`api_node_state_json(mac_colon)` — iterates only `mqtt_entities_` records matching the target MAC (not all records for all nodes). Uses the same `state_value_json()` encoding as before.

### 4.6 New message types

```cpp
// bridge_api_types.h
namespace type {
  static constexpr const char *NODE_SCHEMA_GET = "node.schema.get";
  static constexpr const char *NODE_SCHEMA_RESULT = "node.schema.result";
  static constexpr const char *NODE_STATE_GET = "node.state.get";
  static constexpr const char *NODE_STATE_RESULT = "node.state.result";
  static constexpr const char *NODE_STATE_SUBSCRIBE = "node.state.subscribe";
  static constexpr const char *NODE_STATE_SUBSCRIBED = "node.state.subscribed";
  static constexpr const char *NODE_STATE_UNSUBSCRIBE = "node.state.unsubscribe";
  static constexpr const char *NODE_STATE_UNSUBSCRIBED = "node.state.unsubscribed";
}
```

---

## 5. Edge Cases

| Case | Behavior |
|------|----------|
| Subscribe to unknown/offline node | Accept silently. When the node appears and sends state, events flow. |
| `node.schema.get` for unknown node | Return `{"mac":"...","schema_hash":null,"schema":null}` — not an error |
| `node.state.get` for unknown node | Return `{"mac":"...","state":{}}` — empty state, not an error |
| Node goes offline | Subscription persists. When node reappears, events resume. |
| Schema changes while subscribed | `remote.schema_changed` fires only to subscribed clients. Client should re-call `node.schema.get`. |
| Client disconnects | Subscriptions cleared (`finish_session()` already resets session state). |
| Duplicate subscribe | Idempotent — just returns `node.state.subscribed`. |
| OTA running on node | State updates continue normally during OTA — no special handling needed. |

---

## 6. Client Migration Guide

### 6.1 Updated `topology.get` behavior

Clients previously relying on `topology.snapshot` nodes having `schema` and `state` blocks will find those fields absent. Clients must:

1. Call `topology.get` to get the node list and identify which nodes they need.
2. For each node of interest, call `node.schema.get` once (or when `remote.schema_changed` fires).
3. Call `node.state.subscribe` for nodes to be monitored.
4. Receive `remote.state` push events as they happen.
5. Optionally call `node.state.get` for a point-in-time snapshot (e.g., on reconnect before events have arrived).

### 6.2 On reconnect

```
1. authenticate
2. bridge.info
3. topology.get  → get node list, online status, schema_hash per node
4. for each node with new schema_hash: node.schema.get
5. node.state.subscribe for all active nodes
6. resume event processing
```

### 6.3 Caching strategy

Clients should cache `node.schema.result` keyed by `mac + schema_hash`. The `schema_hash` in `identity` block of the topology response acts as the cache validator — if the hash hasn't changed, the cached schema is still valid.

---

## 7. Backwards Compatibility

This change modifies the shape of `topology.snapshot` response. Clients built against API v1 before this change will break if they expect `schema` and `state` in node objects.

Mitigation: bump the API version minor number if this change lands before a client release. If clients are already deployed, this is a breaking change requiring a major version bump (`v2`) or a migration window.

---

## 8. Future Extensibility

### 8.1 Per-entity state subscribe

Currently `node.state.subscribe` subscribes to ALL entity state changes for that node. A future extension could allow `{"mac":"...","entities":["temperature","humidity"]}` to subscribe to a specific subset.

### 8.2 Bulk subscribe

A client with many nodes could send a single `nodes.subscribe` message with a MAC list to avoid N round-trips. Out of scope for initial implementation.

### 8.3 Schema-only subscribe

Currently `node.state.subscribe` does not implicitly subscribe to `remote.schema_changed`. A client might want schema change notifications without subscribing to state. Future: add a separate `node.schema.subscribe` type.
