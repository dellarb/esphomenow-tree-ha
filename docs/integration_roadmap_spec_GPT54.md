# ESPNow Tree Home Assistant Integration Roadmap And Protobuf Runtime Spec

> Session date: 2026-05-05
> Status: Implementation-ready design spec
> Scope: New bundled Home Assistant custom integration, new protobuf bridge runtime API, add-on bootstrap/provisioning flow, minimal bridge and remote changes

## 1. Purpose

This document defines the next major architecture step for the ESPNow Tree project:

- keep the existing Home Assistant add-on as the admin, provisioning, compile, topology, and OTA tool
- add a bundled Home Assistant custom integration that owns Home Assistant devices, entities, and runtime state
- add a new direct bridge runtime API for the integration using protobuf over a persistent WebSocket
- keep changes to radio/remotes minimal by reusing existing join/session/heartbeat/state behavior wherever possible

This spec is intentionally pragmatic. It avoids distributed-systems cleverness unless it is required by the real data flow already present in the radio protocol.

## 2. Summary Of Agreed Decisions

- The custom integration owns Home Assistant config entries, device registry, entity registry, state updates, and service calls.
- The add-on remains for bridge provisioning, bridge flashing, OTA, compile/build tooling, topology/admin UI, and diagnostics.
- The integration connects directly to each bridge.
- The integration runtime API is 100% protobuf from day one.
- The current JSON/HTTP and JSON/WebSocket bridge APIs remain for add-on/admin use and migration support.
- One Home Assistant config entry exists per bridge.
- Bridges are exposed as Home Assistant devices with diagnostic entities.
- Remote devices and remote entities are not tied to a bridge.
- Canonical remote identity is `remote_mac`.
- Canonical remote entity identity is `remote_mac + object_id`.
- Bridge remains authoritative for topology, availability, schema, and command execution semantics.
- A remote talks to one bridge/relay session at a time.
- The integration overlays multiple bridge feeds for the same remote pragmatically:
  - live remote traffic defines the current active bridge
  - stale offline events from old bridges are ignored
  - `session_id` plus `tx_counter` is used to order traffic safely enough
- Removed entities are not auto-deleted on first schema change; they become unavailable and require user-conscious cleanup.
- Startup is a full snapshot pull from each bridge.
- Schema reconciliation is eager on schema change.
- Bridge credentials are per-bridge long API keys.
- Add-on may provision credentials and push a one-time pairing/import into the integration, but the integration owns its final config entry.

## 3. Non-Goals

- Do not replace the radio protocol.
- Do not make Home Assistant infer topology or availability from raw radio packet streams.
- Do not make the add-on the runtime proxy for Home Assistant entity updates.
- Do not require lockstep radio changes across all remotes just to support the integration.
- Do not auto-delete missing entities aggressively.
- Do not build an over-engineered multi-writer consistency protocol between bridges.

## 4. Target Architecture

```text
Home Assistant
  Custom Integration: espnow_tree
    One config entry per bridge
    Persistent protobuf WS client per bridge
    HA device/entity registry owner
    Multi-bridge remote overlay store
    HA services -> bridge commands

  Add-on: esphome-espnow-tree-ha
    Ingress UI
    Bridge flashing/provisioning
    OTA / compile / topology / diagnostics
    One-time pairing/import helper for integration
    Optional install/export helper for bundled integration files

Bridge Firmware
  Existing radio/session/topology logic
  Existing admin APIs retained
  New protobuf runtime WS API for HA integration
  Bridge-side session/availability/schema authority
```

## 5. Responsibility Split

### 5.1 Add-on Responsibilities

- Flash and provision bridges.
- Generate or capture per-bridge API keys.
- Present bridge diagnostics and topology/admin UI.
- Handle OTA and compile workflows.
- Offer a one-time import flow to the integration for newly provisioned bridges.
- Optionally help install/export the bundled custom integration files.

### 5.2 Integration Responsibilities

- Own Home Assistant config entries.
- Own Home Assistant devices and entities.
- Maintain one persistent bridge client per config entry.
- Merge multiple bridge views of the same remote.
- Expose state and availability in Home Assistant.
- Route commands to the currently active bridge for a remote.
- Persist last-known descriptors and remote metadata in HA storage.
- Surface repair issues for version/auth/network mismatch.

### 5.3 Bridge Responsibilities

- Remain source of truth for:
  - remote online/offline
  - topology and parent/hop data
  - current remote schema
  - command execution semantics
  - current bridge-local session state
- Expose direct protobuf runtime API for HA.
- Preserve existing JSON/HTTP or JSON/WS admin APIs for the add-on.

## 6. Identity Model

### 6.1 Bridge Identity

Bridge identity is for config entry ownership and diagnostics, not for remote identity.

Required fields:

- `bridge_mac`
- `bridge_name`
- `friendly_name`
- `network_id`
- `project_name`
- `project_version`
- `firmware_build_date`
- `manufacturer`
- `model`

Recommended future field:

- `bridge_uid`

`bridge_uid` is recommended for future-proofing, but is not required to ship the first integration slice because remote identity is intentionally bridge-independent.

### 6.2 Remote Identity

Canonical remote identity:

- `remote_mac`

This identity is stable across:

- bridge roaming
- parent/relay changes
- bridge replacement
- network_id changes
- Home Assistant restarts

### 6.3 Entity Identity

Canonical Home Assistant entity identity:

- `remote_mac + object_id`

Rules:

- `object_id` must be stable for the logical entity across reflashes where that entity still exists
- display name is not part of identity
- Home Assistant `entity_id` is not a protocol input and must not be used as a stable key

### 6.4 Naming Model

Mirror ESPHome behavior pragmatically:

- `esphome_name`: stable technical node name where available
- `friendly_name`: mutable display name
- `object_id`: stable entity key
- HA `unique_id`: derived from remote identity + `object_id`

## 7. Runtime Overlay Rules Across Multiple Bridges

This is the minimum viable multi-bridge logic. Do not overcomplicate it.

### 7.1 Active Bridge Rule

For a given remote, the active bridge is whichever bridge last delivered real live remote traffic for the current remote session.

Live remote traffic means:

- state update from the remote
- heartbeat from the remote
- availability event marking the remote online, when backed by an active session

Do not update active bridge based on:

- schema refresh alone
- metadata-only update
- topology rebroadcast
- late offline event from an old bridge

### 7.2 Ordering Data

Each remote runtime event must carry:

- `remote_mac`
- `session_id`
- `tx_counter` when the event originated from a remote packet
- `bridge_mac`

Use them like this:

- `session_id` disambiguates old session vs new session after a remote rejoins
- `tx_counter` orders traffic within the same session
- wall-clock receive time is only a tiebreaker of last resort

### 7.3 Session ID Pragmatism

`session_id` does not need to be a globally monotonic counter.

It only needs to be:

- stable for the lifetime of one remote session
- different after a new join/session is established
- exposed in startup snapshots and runtime events

Recommended bridge implementation:

- derive `session_id` bridge-side from active session material
- example: truncated hash of `(bridge_nonce || remote_nonce || remote_mac || network_id)`

This avoids introducing a new radio-level field just for the integration.

### 7.4 Offline Rule

If bridge A later emits remote offline for a remote but bridge B has already emitted newer live traffic for that remote:

- ignore bridge A's offline event

If the currently active bridge emits offline and no newer live traffic has arrived elsewhere:

- mark the remote unavailable

### 7.5 Startup Rule

At startup:

- trust a bridge snapshot enough to populate bridge and remote state
- if snapshot says remote is online and includes current `session_id`, the entity is immediately commandable
- if snapshot says remote is offline, entity is unavailable

### 7.6 Seamless Roam Rule

If a remote starts sending live traffic through another bridge before the old bridge times it out:

- keep the same HA device and entities
- switch active bridge
- do not produce an availability blip

## 8. Repository Structure

This repo should own both the add-on and the bundled custom integration.

Recommended new layout:

```text
docs/
  integration_roadmap_spec.md

ha_integration/
  custom_components/
    espnow_tree/
      __init__.py
      manifest.json
      const.py
      config_flow.py
      repairs.py
      strings.json
      services.yaml
      protobuf/
        espnow_tree_runtime.proto
        generated/
      bridge_client.py
      bridge_runtime.py
      store.py
      registry.py
      command_router.py
      coordinator.py
      device_model.py
      entity_model.py
      diagnostics.py
      services.py
      sensor.py
      binary_sensor.py
      switch.py
      light.py
      button.py
      number.py
      select.py
      text.py
      climate.py
      lock.py
      cover.py
      fan.py
      update.py
      scene.py

esphome-espnow-tree-ha/
  app/
    pairing_store.py
    integration_bundle.py
    integration_import_api.py
```

Notes:

- `ha_integration/` is the authoritative source for the Home Assistant custom integration.
- The add-on may package or export this folder, but the integration must remain usable even if the add-on is not running.
- Do not hide integration code inside add-on-only folders.

## 9. Bundling And Installation Model

### 9.1 Source Of Truth

The integration source lives in this repo and ships on the same release train as the add-on.

### 9.2 Installation Modes

Support both:

- bundled path:
  - user installs add-on and integration from the same release bundle
  - add-on can help export/copy the integration into HA `custom_components`
  - add-on can provision bridges and push one-time imports
- manual path:
  - user installs integration manually
  - user adds an existing bridge directly by host/port/key

### 9.3 Important Boundary

The add-on may help install or import, but the integration must not depend on reading live runtime config from the add-on after setup.

## 10. Add-on To Integration Pairing Flow

### 10.1 Provisioning Flow For New Bridge

1. Add-on flashes bridge firmware.
2. Add-on provisions or captures:
   - bridge host
   - bridge port
   - bridge API key
   - network ID
   - bridge display metadata if known
3. Add-on stores a short-lived pending import record.
4. Integration setup flow discovers pending imports and lets the user confirm.
5. Integration creates its own config entry and stores final credentials in Home Assistant.

### 10.2 Pending Import Lifetime

- TTL: 10 minutes recommended
- One-time use
- Delete after successful import

### 10.3 Existing Bridge Manual Flow

If the bridge already exists:

- user enters host, port, and API key directly in integration config flow
- add-on is not required

## 11. Home Assistant Integration Design

### 11.1 Domain

Suggested HA domain:

- `espnow_tree`

### 11.2 Config Entry Model

One config entry per bridge, storing:

- host
- port
- API key
- bridge MAC
- network ID
- optional display name
- protocol version/capability snapshot

### 11.3 Shared Domain Runtime

Because remotes can roam between bridges, the integration must maintain both:

- per-config-entry bridge client state
- a domain-level remote registry shared across all config entries

Recommended pattern:

- domain singleton runtime manager
- one bridge client task per entry
- one shared remote/entity model keyed by `remote_mac`

### 11.4 Persistent Storage

Persist in HA storage:

- bridge metadata
- remote metadata
- last-known remote descriptor sets
- schema hashes
- last-known object IDs for cleanup comparison

Do not rely on memory-only discovery.

### 11.5 Entity Lifecycle

On descriptor discovery:

- create entities for new `object_id`s
- update metadata for existing `object_id`s
- if an old `object_id` disappears after schema change, mark the entity unavailable and flagged as missing from current schema
- do not auto-delete immediately

### 11.6 Bridge Devices

Expose each bridge as a Home Assistant device with mostly diagnostic entities, for example:

- bridge online
- firmware version
- uptime
- Wi-Fi RSSI
- remote count
- route capability flags
- API/protocol version

### 11.7 Remote Devices

Expose each remote as a Home Assistant device keyed by `remote_mac`.

Device metadata should include:

- manufacturer
- model
- firmware version
- build date
- current bridge
- hops to bridge
- last RSSI
- relay flags

## 12. Protobuf Runtime API

### 12.1 Transport

Protocol name:

- `espnow-tree-pb`

Transport:

- protobuf messages as raw WebSocket binary frames

Endpoint:

- `ws://<bridge_host>:<bridge_port>/espnow-tree/v2/pb`

Rules:

- no text frames
- one protobuf message per WebSocket binary frame
- keep admin HTTP/JSON endpoints separate

### 12.2 Client Model

This runtime endpoint is for the Home Assistant integration.

Recommended connection policy:

- one authenticated protobuf runtime client at a time per bridge
- stateless HTTP admin endpoints remain concurrent

This keeps implementation simpler and avoids runtime fanout complexity.

### 12.3 Versioning

Use explicit protocol versioning.

Required fields in auth challenge:

- `min_version`
- `max_version`

If unsupported:

- integration marks bridge unavailable
- all entities sourced only from that bridge become unavailable
- integration raises a repair issue

## 13. Authentication

Reuse the existing HMAC challenge-response idea, but encode it in protobuf.

### 13.1 Handshake

1. Client opens WebSocket.
2. Bridge sends `AuthChallenge`.
3. Client replies `AuthResponse`.
4. Bridge sends `AuthOk` or `AuthFailed`.
5. Client sends `ClientHello`.
6. Bridge sends `FullSnapshot`.

### 13.2 HMAC Input

Input string:

```text
espnow-tree-pb|v2|<client_kind>|<server_nonce>|<client_nonce>
```

HMAC:

- HMAC-SHA256
- key: per-bridge API key bytes
- output: raw 32 bytes or lowercase hex; raw bytes are preferred in protobuf

### 13.3 Auth Failure Behavior

On auth failure:

- bridge replies `AuthFailed` with code/message and closes socket
- integration records bridge unavailable and raises repair issue

## 14. Protobuf Schema

This section defines the implementation contract. Actual `.proto` files should follow this structure closely.

### 14.1 File Layout

Recommended files:

- `ha_integration/custom_components/espnow_tree/protobuf/espnow_tree_runtime.proto`
- optional split later into:
  - `common.proto`
  - `bridge.proto`
  - `remote.proto`
  - `commands.proto`

### 14.2 Proto Package

```proto
syntax = "proto3";
package espnow.tree.runtime.v2;
```

### 14.3 Top-Level Envelope

```proto
message Envelope {
  string request_id = 1;
  uint32 api_version = 2;
  oneof msg {
    AuthChallenge auth_challenge = 10;
    AuthResponse auth_response = 11;
    AuthOk auth_ok = 12;
    AuthFailed auth_failed = 13;
    ClientHello client_hello = 14;
    FullSnapshot full_snapshot = 15;
    EventBatch event_batch = 16;
    CommandRequest command_request = 17;
    CommandResult command_result = 18;
    Ping ping = 19;
    Pong pong = 20;
    Error error = 21;
  }
}
```

Notes:

- `request_id` is optional for purely push events, but required for request/response messages
- bridge-initiated events can leave `request_id` empty

### 14.4 Authentication Messages

```proto
message AuthChallenge {
  bytes server_nonce = 1;
  uint32 min_version = 2;
  uint32 max_version = 3;
  string protocol = 4; // "espnow-tree-pb"
  string bridge_mac = 5;
}

message AuthResponse {
  string client_kind = 1; // "ha_integration"
  string client_name = 2;
  bytes client_nonce = 3;
  bytes hmac_sha256 = 4;
}

message AuthOk {
  uint32 negotiated_version = 1;
  string server_name = 2;
  BridgeIdentity bridge = 3;
  BridgeCapabilities capabilities = 4;
}

message AuthFailed {
  string code = 1;
  string message = 2;
}
```

### 14.5 Client Hello

```proto
message ClientHello {
  bool request_full_snapshot = 1;
  string integration_version = 2;
  repeated KnownRemoteSchema known_remote_schemas = 3;
}

message KnownRemoteSchema {
  string remote_mac = 1;
  string schema_hash = 2;
}
```

Implementation note:

- startup should still return a full logical snapshot
- `known_remote_schemas` is advisory for future optimization only

### 14.6 Snapshot

```proto
message FullSnapshot {
  BridgeIdentity bridge = 1;
  BridgeRuntime bridge_runtime = 2;
  repeated RemoteSnapshot remotes = 3;
  uint64 snapshot_unix_ms = 4;
}
```

### 14.7 Bridge Metadata

```proto
message BridgeIdentity {
  string bridge_mac = 1;
  string bridge_name = 2;
  string friendly_name = 3;
  string network_id = 4;
  string manufacturer = 5;
  string model = 6;
  string project_name = 7;
  string project_version = 8;
  string firmware_build_date = 9;
  string api_server = 10;
}

message BridgeCapabilities {
  bool supports_runtime_v2 = 1;
  bool supports_commands = 2;
  bool supports_schema_push = 3;
  bool supports_state_push = 4;
  bool supports_topology = 5;
}

message BridgeRuntime {
  bool online = 1;
  sint32 wifi_rssi = 2;
  uint32 uptime_s = 3;
  uint32 remote_count = 4;
}
```

### 14.8 Remote Snapshot

```proto
message RemoteSnapshot {
  RemoteIdentity identity = 1;
  RemoteRuntime runtime = 2;
  RemoteDescriptorSet descriptor_set = 3;
  repeated EntityState states = 4;
}
```

### 14.9 Remote Identity

```proto
message RemoteIdentity {
  string remote_mac = 1;
  string esphome_name = 2;
  string friendly_name = 3;
  string manufacturer = 4;
  string model = 5;
  string project_name = 6;
  string project_version = 7;
  string firmware_build_date = 8;
  string firmware_md5 = 9;
  string schema_hash = 10;
  uint32 entity_count = 11;
  string chip_name = 12;
  bool can_relay = 13;
  bool relay_enabled = 14;
}
```

### 14.10 Remote Runtime

```proto
message RemoteRuntime {
  bool online = 1;
  string bridge_mac = 2;
  string parent_mac = 3;
  uint32 hops_to_bridge = 4;
  sint32 rssi = 5;
  uint32 offline_s = 6;
  uint64 last_seen_unix_ms = 7;
  string session_id = 8;
  uint32 last_tx_counter = 9;
}
```

### 14.11 Descriptor Set

```proto
message RemoteDescriptorSet {
  string schema_hash = 1;
  repeated EntityDescriptor entities = 2;
}
```

### 14.12 Entity Descriptor

```proto
message EntityDescriptor {
  string object_id = 1;
  string platform = 2;
  string friendly_name = 3;
  string icon = 4;
  string device_class = 5;
  string state_class = 6;
  string unit_of_measurement = 7;
  string entity_category = 8;
  bool disabled_by_default = 9;
  bool diagnostic = 10;
  bool writable = 11;
  repeated Option options = 12;
  CommandDescriptor command = 13;
}

message Option {
  string key = 1;
  string label = 2;
}

message CommandDescriptor {
  repeated string supported_commands = 1;
  repeated ArgumentDescriptor arguments = 2;
}

message ArgumentDescriptor {
  string name = 1;
  string value_type = 2; // bool, int, float, string
  bool required = 3;
  double min_value = 4;
  double max_value = 5;
  double step = 6;
}
```

This command model is intentionally generic. It avoids having to bake a huge HA service enum into the bridge protocol.

### 14.13 Entity State

```proto
message EntityState {
  string object_id = 1;
  bool available = 2;
  uint64 observed_unix_ms = 3;
  oneof value {
    bool bool_value = 10;
    sint64 int_value = 11;
    double float_value = 12;
    string string_value = 13;
  }
}
```

This is enough for the first integration slice. If later needed, attributes or richer types can be added compatibly.

### 14.14 Runtime Events

```proto
message EventBatch {
  repeated Event events = 1;
}

message Event {
  oneof kind {
    BridgeHeartbeat bridge_heartbeat = 10;
    RemoteAvailabilityEvent remote_availability = 11;
    RemoteStateEvent remote_state = 12;
    RemoteSchemaChangedEvent remote_schema_changed = 13;
    RemoteMetadataChangedEvent remote_metadata_changed = 14;
    TopologyChangedEvent topology_changed = 15;
  }
}
```

### 14.15 Availability Event

```proto
message RemoteAvailabilityEvent {
  string remote_mac = 1;
  bool online = 2;
  string bridge_mac = 3;
  string session_id = 4;
  uint32 tx_counter = 5;
  uint64 observed_unix_ms = 6;
  sint32 rssi = 7;
  uint32 hops_to_bridge = 8;
  string reason = 9;
}
```

`tx_counter` may be `0` for bridge-generated offline transitions. That is acceptable.

### 14.16 State Event

```proto
message RemoteStateEvent {
  string remote_mac = 1;
  string bridge_mac = 2;
  string session_id = 3;
  uint32 tx_counter = 4;
  repeated EntityState states = 5;
  uint64 observed_unix_ms = 6;
}
```

### 14.17 Schema Changed Event

```proto
message RemoteSchemaChangedEvent {
  string remote_mac = 1;
  string bridge_mac = 2;
  string session_id = 3;
  string old_schema_hash = 4;
  RemoteSnapshot snapshot = 5;
}
```

This event should eagerly include the fresh descriptor set and current states. Do not force a second round trip unless payload size becomes a real problem in practice.

### 14.18 Metadata Changed Event

```proto
message RemoteMetadataChangedEvent {
  RemoteIdentity identity = 1;
  RemoteRuntime runtime = 2;
}
```

### 14.19 Topology Changed Event

```proto
message TopologyChangedEvent {
  string remote_mac = 1;
  string bridge_mac = 2;
  string parent_mac = 3;
  uint32 hops_to_bridge = 4;
  sint32 rssi = 5;
  uint64 observed_unix_ms = 6;
}
```

### 14.20 Command Request

```proto
message CommandRequest {
  string remote_mac = 1;
  string object_id = 2;
  string command = 3;
  repeated CommandArgument args = 4;
}

message CommandArgument {
  string name = 1;
  oneof value {
    bool bool_value = 10;
    sint64 int_value = 11;
    double float_value = 12;
    string string_value = 13;
  }
}
```

### 14.21 Command Result

```proto
message CommandResult {
  string remote_mac = 1;
  string object_id = 2;
  string command = 3;
  string bridge_mac = 4;
  string session_id = 5;
  CommandStatus status = 6;
  string error_code = 7;
  string error_message = 8;
}
```

### 14.22 Health Messages

```proto
message BridgeHeartbeat {
  string bridge_mac = 1;
  uint64 bridge_unix_ms = 2;
  uint32 uptime_s = 3;
}

message Ping {
  uint64 unix_ms = 1;
}

message Pong {
  uint64 unix_ms = 1;
}

message Error {
  string code = 1;
  string message = 2;
}
```

## 15. Bridge Runtime Behavior

### 15.1 Startup Snapshot

On successful `ClientHello`, bridge sends one `FullSnapshot` containing:

- bridge identity and runtime data
- all currently known remotes
- each remote's current descriptor set
- each remote's current state values

This is intentionally simpler than fragmented bootstrap.

### 15.2 Live Events

Bridge pushes:

- bridge heartbeat
- remote availability changes
- remote state updates
- schema changes with fresh descriptor/state snapshot
- topology changes when parent/hops/RSSI change materially

### 15.3 State Push Scope

Bridge only pushes state for remotes currently talking to that bridge. This matches the existing radio/session reality and avoids duplicate multi-writer traffic.

### 15.4 Availability Authority

Bridge remains primary authority for remote availability.

The existing heartbeat-miss rule stays in bridge firmware. The integration mirrors it; it does not recompute primary availability itself.

## 16. Home Assistant Runtime Behavior

### 16.1 Bridge Disconnect

On bridge socket drop:

- start reconnect loop
- if not reconnected within 15 seconds, mark the bridge unavailable
- mark as unavailable only the remotes currently sourced from that bridge and not superseded elsewhere

### 16.2 Active Source Assignment

When live remote traffic arrives:

- if same `session_id` and higher `tx_counter`, accept it
- if different `session_id`, treat it as a new active session and switch source to that bridge
- if an old bridge later emits offline for a stale session, ignore it

### 16.3 Command Routing

Commands route to the bridge that most recently produced live traffic for that remote's active session.

Rules:

- no active session => fail fast, entity unavailable
- online startup snapshot with current session => commandable immediately
- do not fan commands out to multiple bridges

### 16.4 Removed Entities

When schema changes:

- retained `object_id` => update in place
- new `object_id` => create new entity
- missing `object_id` => mark unavailable and annotate missing-from-current-schema

Cleanup policy:

- no automatic hard delete in the first implementation
- manual cleanup service or UI flow later

## 17. Required Bridge Changes

These are bridge firmware changes required for the protobuf integration API.

### 17.1 New Protobuf WS Endpoint

Add:

- `/espnow-tree/v2/pb`

### 17.2 Authentication

Add protobuf auth handshake equivalent to current HMAC model.

### 17.3 Snapshot Builder

Bridge must be able to assemble a full runtime snapshot with:

- bridge metadata
- remote metadata/runtime
- full entity descriptors
- current entity states

### 17.4 Runtime Event Publisher

Push:

- bridge heartbeats
- remote availability
- remote state
- remote schema changed with snapshot payload
- topology updates

### 17.5 Session ID Exposure

Expose `session_id` per remote session through the protobuf API.

Recommended implementation:

- derive from existing join/session material
- do not add a brand-new radio packet field unless necessary

### 17.6 TX Counter Exposure

Expose last observed remote `tx_counter` on live packet-derived events and current runtime snapshots.

### 17.7 Bridge Device Metadata

Expose enough bridge metadata for HA bridge device creation.

### 17.8 Backward Compatibility

Keep current admin interfaces working:

- current HTTP topology/admin endpoints
- current OTA/admin flow used by add-on
- current JSON/WebSocket bridge API until explicitly retired

## 18. Required Radio Or Remote Changes

Preferred answer: minimal or none.

### 18.1 No New Required Radio-Level Identity Field

Do not add a new remote identifier just for HA.

Use existing:

- `remote_mac`
- `network_id`
- `tx_counter`
- current join/session material

### 18.2 No New Required Radio Availability Logic

Keep the existing remote heartbeat and bridge timeout behavior.

### 18.3 No New Required Remote Session Marker Field

If bridge can derive `session_id` from current join/session state, do that.

Only add a new remote-side field if bridge derivation proves insufficient.

### 18.4 Entity Object ID Stability

Remote-side schema generation must keep stable `object_id` behavior for logical entities across reflashes where the entity still exists.

This is the one area where developer discipline matters more than transport.

## 19. Add-on Changes

### 19.1 Pairing Store

Add short-lived storage for pending bridge imports:

- bridge host
- port
- API key
- bridge MAC
- network ID
- friendly display name
- expiry

### 19.2 Pairing API

Add add-on endpoints for:

- create pending bridge import
- list pending imports for local HA use
- consume pending import

These endpoints are local add-on helper APIs, not general public APIs.

### 19.3 Bundled Integration Export

Optional but recommended:

- package the bundled custom integration folder with the add-on release
- provide UI guidance or export helper for installation into `custom_components`

Do not make runtime depend on this automation existing.

## 20. Migration Plan

### 20.1 Bridge Side

- keep MQTT discovery/state available during transition
- allow users to enable integration-based runtime without immediately removing MQTT
- once integration parity is proven, MQTT can move to optional/legacy mode

### 20.2 Add-on Side

- keep existing add-on functionality intact
- do not block add-on work on immediate migration to protobuf

### 20.3 User Migration

Suggested rollout:

1. ship integration and bridge protobuf runtime in parallel with existing MQTT/admin flows
2. prove parity on common entity types
3. default new installs toward integration runtime
4. later reduce MQTT reliance

## 21. Implementation Phases

This is the recommended execution plan.

### Phase 1: Protobuf Contract And Shared Tooling

Goal:

- freeze the runtime protocol and code generation pipeline

Steps:

1. Add `ha_integration/custom_components/espnow_tree/protobuf/espnow_tree_runtime.proto`.
2. Add protobuf generation workflow for Python integration code.
3. Add bridge-side protobuf generation or hand-written serializer strategy.
4. Add protocol version constants in both repos.
5. Add golden fixture tests for auth challenge/response, snapshot, and state events.

Deliverables:

- checked-in `.proto`
- generated Python classes
- bridge-side serialization plan
- fixture tests

### Phase 2: Bridge Protobuf Runtime Endpoint

Goal:

- bridge can accept one authenticated runtime client and send a full snapshot

Steps:

1. Add WS endpoint `/espnow-tree/v2/pb`.
2. Implement protobuf auth handshake.
3. Expose bridge metadata/capabilities.
4. Build full snapshot from current bridge caches.
5. Add runtime heartbeats.
6. Add disconnect/reconnect cleanup.

Deliverables:

- manual test client can auth and receive `FullSnapshot`

### Phase 3: Bridge Runtime Events

Goal:

- bridge streams useful live changes without polling

Steps:

1. Push `RemoteAvailabilityEvent`.
2. Push `RemoteStateEvent`.
3. Push `RemoteSchemaChangedEvent` including fresh descriptor/state snapshot.
4. Push `TopologyChangedEvent`.
5. Attach `session_id`, `bridge_mac`, and `tx_counter` where relevant.

Deliverables:

- live event stream verified against real bridge traffic

### Phase 4: Home Assistant Integration Skeleton

Goal:

- custom integration can add a bridge and maintain a persistent session

Steps:

1. Create `ha_integration/custom_components/espnow_tree/`.
2. Add `manifest.json`, config flow, constants, and entry setup.
3. Add protobuf bridge client.
4. Add reconnect loop and 15-second bridge grace handling.
5. Add HA storage for bridge and remote descriptor cache.
6. Raise repair issues for auth/version/network mismatch.

Deliverables:

- integration loads
- bridge config entry works
- snapshot stored and diagnostics visible

### Phase 5: Remote Registry And Overlay Engine

Goal:

- multiple bridge entries can represent one shared remote cleanly

Steps:

1. Add shared domain-level remote registry keyed by `remote_mac`.
2. Add source arbitration using:
   - live traffic source
   - `session_id`
   - `tx_counter`
3. Add stale offline suppression.
4. Add startup reconciliation with persisted cache.
5. Add active command route tracking.

Deliverables:

- remote can roam between bridges without entity recreation

### Phase 6: Entity Materialization

Goal:

- integration creates real HA entities for bridge and remotes

Steps:

1. Add bridge diagnostic entities.
2. Add remote device creation.
3. Add entity factory from descriptor sets.
4. Implement first entity platforms:
   - sensor
   - binary_sensor
   - switch
   - light
   - number
   - select
   - button
5. Extend to remaining supported types after core path is stable.
6. Implement unavailable-on-missing-schema behavior.

Deliverables:

- usable HA entities with stable unique IDs

### Phase 7: Command Routing

Goal:

- Home Assistant service calls route to the correct bridge session

Steps:

1. Add generic command request builder.
2. Map HA service calls to `CommandRequest`.
3. Route to active bridge for remote.
4. Surface `CommandResult` failures meaningfully.
5. Keep updates ack-driven by default.

Deliverables:

- writable entities behave correctly

### Phase 8: Add-on Pairing And Bundling

Goal:

- smooth install path for new bridge setups

Steps:

1. Add pairing store in add-on backend.
2. Add create/list/consume import endpoints.
3. Add bridge flash/provision step that creates pending import.
4. Add integration config flow support for pending imports.
5. Add bundled integration export/install helper if feasible.

Deliverables:

- new bridge flashed by add-on can be imported cleanly into integration

### Phase 9: Migration And Hardening

Goal:

- productionize behavior and reduce legacy reliance

Steps:

1. Run real-device soak tests with bridge restarts and remote roams.
2. Verify descriptor stability across reflashes.
3. Verify offline suppression across multi-bridge overlap.
4. Add diagnostics dumps for protocol/session inspection.
5. Document migration from MQTT runtime to integration runtime.
6. Decide whether to keep or later retire JSON/WebSocket runtime path.

Deliverables:

- stable end-to-end release candidate

## 22. Test Plan

Minimum required testing:

- auth success/failure
- protocol version mismatch
- startup full snapshot
- remote state push
- remote availability push
- schema change with entity removal/addition
- bridge disconnect and reconnect
- remote roam from bridge A to bridge B
- stale offline from old bridge ignored
- command routing to current active bridge
- manual bridge import
- add-on-provisioned pending import

## 23. Open Items That Do Not Block Phase 1

- whether to auto-install the bundled integration from the add-on or only export it
- whether bridge UID should be formalized in v1 of the protobuf API
- whether snapshots should later omit descriptor payloads when schema hash matches
- long-term retirement timing for MQTT discovery/state

## 24. Recommended First Cut

To avoid overcomplication, the first developer implementation should do this:

- full snapshot on connect
- protobuf auth + snapshot + availability + state + schema_changed + commands
- one config entry per bridge
- shared remote overlay keyed by `remote_mac`
- `session_id` derived bridge-side from existing join/session state
- `tx_counter` surfaced from real remote packets
- eager schema replacement with removed entities marked unavailable
- add-on one-time import helper only

Do not try to solve:

- perfect distributed ordering
- automatic entity garbage collection
- add-on auto-proxy runtime transport
- exhaustive protocol compression

That is the right complexity level for this project state.
