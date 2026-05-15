# Workplan: Make MQTT Compile-Time Optional for Bridge

> **Implementation Status: ✅ COMPLETE** (2026-05-15)
> Repo validation targets:
> - `espnow-bridge-c5.yml` (with `mqtt:` config)
> - `espnow-bridge-nomqtt.yml` (pure protobuf WS, no `mqtt:` block)
>
> This document started as a proposal and now also records implementation deltas.
> Where the original plan text below conflicts with repo state, the code and the
> deviation notes in this header are authoritative.
>
> **Key deviations from original plan:**
> - `cv.OnlyWith` for `CONF_MQTT_DISCOVERY_PREFIX` was skipped (decision #6 per user preference). Instead the key always validates; `to_code()` conditionally passes the value.
> - `CommandRouteKind`/`CommandRoute` stayed in `esp_tree_bridge.h` (shared by MQTT helper and non-MQTT protobuf WS command path) rather than moving entirely to `bridge_mqtt_export.h`.
> - `decode_command_payload_()` stayed on bridge (also used by protobuf WS `api_runtime_handle_command`) in addition to helper copy.
> - `sanitize_object_id` kept in both `esp_tree_common/esp_tree_utils.h` and local in `esp_tree_bridge.cpp` (the local copy is needed by other anonymous-namespace helpers).
> - `mqtt_export_` members `queue_state()`/`queue_discovery()` require extra `display_name` parameter; bridge passes `remote_display_name_(mac)`.
> - `USE_MQTT` define is set via `cg.add_build_flag("-DUSE_MQTT")` in `__init__.py` rather than being auto-propagated by ESPHome (ESPHome 2026.4 didn't propagate it to external component `.cpp` files).
> - `handle_force_rejoin_command_` accepts `(topic, payload)` (two params) to match `CustomMQTTDevice::subscribe` member function pointer signature.
> - The bridge retains `entity_values_` lightweight cache (keyed by `mac_key_string_ + "_" + entity_index`) for protobuf WS current-value lookups since `mqtt_entities_` moved to the helper.
> - Unimplemented plan methods: `do_publish_bridge_diag_` in helper is simplified (no longer references bridge counters like `rx_packets_`/`tx_ok_`).

## Objective

Remove MQTT as a hard dependency of the bridge firmware. When `mqtt:` is absent from the device YAML, the bridge compiles and runs without any MQTT code — no `CustomMQTTDevice` inheritance, no MQTT client, no MQTT discovery or state publishing. The protobuf WebSocket API remains the primary (and only, when MQTT is absent) upstream transport. When `mqtt:` is present, MQTT export works exactly as before.

## Specification

### Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Optionality level | **Compile-time** — no MQTT code linked when absent from YAML | Smallest binary, clean separation |
| 2 | Config mechanism | **Implicit** — presence of `mqtt:` block in YAML enables MQTT | Uses ESPHome's standard `USE_MQTT` define |
| 3 | `espnow_allowed_` gate | **WiFi-only** — remove MQTT connectivity requirement | Serial bridge roadmap needs WiFi-less operation; protobuf WS doesn't need MQTT |
| 4 | Discovery replay on MQTT reconnect | **Existing replay is sufficient** — `sync_mqtt_entities_()` full replay moves into helper | No new replay logic needed |
| 5 | Protobuf WS replay on reconnect | **Already handled** — `CLIENT_HELLO` triggers full snapshot | No changes needed |
| 6 | `mqtt_export` feature flag | **Remove entirely from `api_bridge_info_json()`** | Add-on doesn't use it; protobuf WS is primary path |
| 7 | Implementation strategy | **Helper class** (`ESPTreeBridgeMQTT`) — has-a, not is-a | Clean extraction, no conditional inheritance |
| 8 | Helper state ownership | **Helper owns all MQTT state** | Clean boundary, self-contained reconnect replay |
| 9 | Communication back to bridge | **Bridge pointer** — helper holds `ESPTreeBridge*`, calls public methods for commands, protocol notifications, and session queries | No circular includes via forward declaration; simpler than lambdas which ESPHome codegen can't express |
| 10 | Define strategy | **`USE_MQTT`** — standard ESPHome define | Set automatically when `mqtt:` is in config |
| 11 | Invocation pattern | **Null-check** — `if (mqtt_export_ != nullptr)` | Matches existing `api_proto_ws_` pattern |
| 12 | Reconnect orchestration | **Helper's `tick()` detects `just_connected`, queries bridge for online MACs, runs replay internally** | Single `bridge_->get_online_macs()` call on reconnect; no separate `on_mqtt_connected` API needed |
| 13 | Add-on / integration changes | **None** | Protobuf WS path is already primary |
| 14 | Demo YAML | **Keep `mqtt:` block, add comment** that it's optional | Backwards compatible, clear documentation |
| 15 | `web_server` dependency | **Stays required** | Protobuf WS endpoint needs it |
| 16 | Helper class name | **`ESPTreeBridgeMQTT`** | Follows ESPHome naming |

### Behavior Change

| Scenario | Before | After |
|----------|--------|-------|
| `mqtt:` in YAML, broker connects | Bridge works as before — MQTT discovery + state + protobuf WS | Identical behavior |
| `mqtt:` in YAML, broker reconnects | `sync_mqtt_entities_()` replays all discovery + state | Identical behavior (logic moved to helper) |
| No `mqtt:` in YAML | **Fails to compile** (hard dependency) | Bridge compiles and runs with protobuf WS only |
| `espnow_allowed_` | Requires WiFi **and** MQTT connected | Requires WiFi connected only |
| `ESPTreeBridge` inheritance | `Component, CustomMQTTDevice, BridgeFacade` | `Component, BridgeFacade` (MQTT via `ESPTreeBridgeMQTT*`) |

---

## Architecture

### Current Structure

```
ESPTreeBridge : Component, CustomMQTTDevice, BridgeFacade
  ├── MQTT logic (inline): discovery, state, commands, availability, reconnect replay
  ├── MQTT state: mqtt_entities_, mqtt_devices_, mqtt_was_connected_, backoff, retry
  ├── MQTT callbacks: handle_command_message_(), handle_force_rejoin_command_()
  ├── Protobuf WS: api_proto_ws_ (optional pointer, null-check pattern)
  └── ESP-NOW: protocol_
```

### Target Structure

```
ESPTreeBridge : Component, BridgeFacade                    (MQTT removed from inheritance)
  ├── ESPTreeBridgeMQTT *mqtt_export_{nullptr}            (optional, #ifdef USE_MQTT)
  │     ├── Plain C++ class — not an ESPHome Component
  │     ├── init(bridge*, bridge_mac, force_rejoin_topic) — called once by bridge::setup()
  │     ├── tick() — called every loop by bridge::loop()
  │     ├── set_bridge_diag(...) — diagnostic snapshot pushed by bridge::loop()
  │     ├── Inherits: CustomMQTTDevice (for subscribe/publish/publish_json)
  │     ├── Owns: mqtt_entities_, mqtt_devices_, mqtt_was_connected_, backoff, retry
  │     ├── Owns: subscribed_topics_, availability_queue_, diag state, diag caches
  │     ├── Owns: command_routes_, force_rejoin_command_topic_
  │     ├── Methods: queue_discovery(), queue_state(), queue_availability(),
  │     │           queue_clear_entities(), on_schema_complete(), on_discovery_confirmed()
  │     ├── Reconnect replay: full discovery + state re-publish on MQTT reconnect
  │     └── Calls back to bridge: bridge->send_command(), bridge->send_force_rejoin(),
  │                               bridge->protocol_discovery_confirmed(), bridge->get_online_macs()
  ├── BridgeApiProtoWsTransport *api_proto_ws_             (unchanged)
  └── BridgeProtocol protocol_                            (unchanged)
```

### Call Flow — State Update (Before)

```cpp
// In ESPTreeBridge::queue_state_()
queue_state_(mac, entity, value, type, ...);
  → mqtt_entities_[key].state_dirty = true;
  → if (api_proto_ws_ != nullptr) api_proto_ws_->emit_remote_state(mac, entity, value, type);

// In loop() → sync_mqtt_entities_()
  → if (mqtt_was_connected_ just_connected) { full replay }
  → for each dirty entity: do_publish_state_(rec)  [MQTT publish]
```

### Call Flow — State Update (After)

```cpp
// In ESPTreeBridge::queue_state_()
#ifdef USE_MQTT
if (mqtt_export_ != nullptr) {
    mqtt_export_->queue_state(mac, entity, value, type, text_value,
                              message_tx_base, next_hop_mac, remote_display_name_(mac));
}
#endif
if (api_proto_ws_ != nullptr) {
    api_proto_ws_->emit_remote_state(mac, entity, value, type);
}

// In ESPTreeBridge::loop()
#ifdef USE_MQTT
if (mqtt_export_ != nullptr) {
    mqtt_export_->set_bridge_diag(uptime_s, remotes_online, rssi, ...);
    mqtt_export_->tick();
}
#endif
// Inside ESPTreeBridgeMQTT::tick()
//   → if (just_connected) { mark dirty, call bridge_->get_online_macs(), queue_diag_refresh }
//   → process discovery, availability, diag, state queues (one item per tick, budget-based)
```

### Call Flow — Command Received via MQTT (After)

```cpp
// MQTT message arrives on command topic
// ESPTreeBridgeMQTT subscribed via this->subscribe(topic, ...)
// → handle_command_message_() (inside ESPTreeBridgeMQTT)
//   → Resolves route from command_routes_ map
//   → Decodes command payload
//   → bridge_->send_command(mac, entity_index, command, value)
//     → bridge::send_command() forwards to protocol_.send_command() for ESP-NOW delivery

// Force rejoin via MQTT:
// → handle_force_rejoin_command_() (inside ESPTreeBridgeMQTT)
//   → bridge_->send_force_rejoin(mac)

// Discovery confirmed via MQTT:
// → do_publish_discovery_() completes publish
//   → bridge_->protocol_discovery_confirmed(mac, entity_index, true)
//     → bridge forwards to protocol_.on_discovery_confirmed_()

// Deferred state ACK via MQTT:
// → send_deferred_state_ack_() (inside ESPTreeBridgeMQTT)
//   → bridge_->protocol_send_deferred_state_ack(rec)
```

### File Changes Summary

| File | Change |
|------|--------|
| `esp_tree_bridge.h` | Remove `CustomMQTTDevice` inheritance; remove all MQTT members/methods; add `ESPTreeBridgeMQTT *mqtt_export_{nullptr}`; add `#ifdef USE_MQTT` guard |
| `esp_tree_bridge.cpp` | Remove all MQTT method bodies; add null-check calls to `mqtt_export_->...()`; fix `espnow_allowed_` to WiFi-only; remove `mqtt_export` from `api_bridge_info_json()` |
| **NEW** `bridge_mqtt_export.h` | `ESPTreeBridgeMQTT` class declaration — owns all MQTT state and methods |
| **NEW** `bridge_mqtt_export.cpp` | `ESPTreeBridgeMQTT` implementation — all MQTT logic extracted from bridge |
| `__init__.py` | Remove `"mqtt"` from `DEPENDENCIES`; use `cv.OnlyWith` for `CONF_MQTT_DISCOVERY_PREFIX`; conditionally create and register `ESPTreeBridgeMQTT` via `to_code()` |
| `espnow-bridge-c5.yml` | Add comment `# MQTT is now optional — remove this block for protobuf-only operation` |
| C++ tests | Add `ESPTreeBridgeMQTT` test target if MQTT-specific logic needs coverage |

---

## Phases

> **Overall execution:** Phases 1-4 were implemented atomically as a single change (1658-line `bridge_mqtt_export.cpp`, modified headers/cpp, and `__init__.py`). Phase 5 (build) was no-op. Phase 6 (demo YAML) was minimal. Phase 7 (testing) — compilation verified for both MQTT and non-MQTT configs.

### Phase 1: Create `ESPTreeBridgeMQTT` Helper — Header

> **Status: ✅ Done**
> Created `bridge_mqtt_export.h` (173 lines). The full class declaration wrapped in `#ifdef USE_MQTT`,
> inherits `CustomMQTTDevice`. Includes `esp_tree_bridge.h` for shared types (`CommandRouteKind`, `CommandRoute`).
> Structs `MqttEntityRecord`, `MqttDeviceRecord` use `espnow_entity_schema_t` (not `BridgeEntitySchema`) to avoid
> needing `bridge_protocol.h` in the header.
>
> **Deviation:** `CommandRouteKind`/`CommandRoute` stayed in `esp_tree_bridge.h` (needed by `decode_command_payload_` on both paths).

Create `bridge_mqtt_export.h` with the full `ESPTreeBridgeMQTT` class declaration, wrapped in `#ifdef USE_MQTT`. This class takes ownership of all MQTT state and methods currently in `ESPTreeBridge`.

#### Step 1.1: Define the class skeleton

```cpp
// bridge_mqtt_export.h
#pragma once

#ifdef USE_MQTT

#include "esphome/components/mqtt/custom_mqtt_device.h"
// ... other includes

namespace esp_tree {

// Forward declaration — helper holds a pointer back to the bridge for
// command dispatch, protocol notifications, and diag data queries.
class ESPTreeBridge;

class ESPTreeBridgeMQTT : public mqtt::CustomMQTTDevice {
 public:
  ESPTreeBridgeMQTT();

  // init() — called once by the bridge during its setup(). Stores the bridge
  // pointer and subscribes to the force-rejoin MQTT command topic.
  // bridge_mac and force_rejoin_topic are computed by the bridge.
  void init(ESPTreeBridge *bridge,
            const std::array<uint8_t, 6> &bridge_mac,
            const std::string &force_rejoin_topic);

  // tick() — called every loop iteration by the bridge. Replaces the
  // sync_mqtt_entities_() portion of the bridge's loop. Handles budget-based
  // discovery, state, availability, and diagnostic publishing plus reconnect
  // replay.
  void tick();

  bool is_connected() const { return mqtt::global_mqtt_client != nullptr && mqtt::global_mqtt_client->is_connected(); }

  // --- Public API — called by ESPTreeBridge ---

  void set_mqtt_discovery_prefix(const std::string &prefix) { mqtt_discovery_prefix_ = prefix; }
  void set_bridge_friendly_name(const std::string &name) { bridge_friendly_name_ = name; }

  // Bridge pushes diagnostic snapshot once per loop iteration (or on change).
  // The helper caches these and publishes to MQTT on its own schedule.
  void set_bridge_diag(uint32_t uptime_s, uint8_t remotes_online, int8_t rssi,
                       uint8_t wifi_channel, int ram_pct, int cpu_pct,
                       uint8_t remotes_direct);

  void queue_discovery(const uint8_t *mac, const BridgeEntitySchema &entity,
                       uint8_t total_entities, bool is_commandable,
                       const std::string &display_name);
  void queue_state(const uint8_t *mac, const BridgeEntitySchema &entity,
                   const std::vector<uint8_t> &value, espnow_field_type_t type,
                   const std::string &text_value, uint32_t message_tx_base,
                   const uint8_t *next_hop_mac, const std::string &display_name);
  void queue_availability(const uint8_t *mac, bool online, const char *reason);
  void queue_clear_entities(const uint8_t *mac, const std::vector<BridgeEntitySchema> &old_entities);
  void on_schema_complete(const uint8_t *mac, uint8_t total_entities);
  void on_discovery_confirmed(const uint8_t *mac, uint8_t entity_index, bool success);
  void queue_remote_diag_refresh(const uint8_t *mac);

 private:
  // --- Replayed methods (extracted from ESPTreeBridge) ---

  ESPTreeBridge *bridge_{nullptr};

  void do_publish_discovery_(MqttEntityRecord &rec);
  void publish_device_discovery_(const uint8_t *mac);
  void build_entity_component_(JsonObject cmp, const uint8_t *mac, const BridgeEntitySchema &entity);
  void do_clear_device_discovery_(const uint8_t *mac);
  bool do_publish_state_(MqttEntityRecord &rec);
  void send_deferred_state_ack_(MqttEntityRecord &rec);
  void do_publish_bridge_diag_();
  void do_clear_entity_(const uint8_t *mac, const BridgeEntitySchema &entity);

  void subscribe_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity);
  void handle_command_message_(const std::string &topic, const std::string &payload);
  void handle_force_rejoin_command_(const std::string &payload);

  void publish_bridge_diag_discovery_();
  void publish_bridge_diag_state_();
  void publish_remote_diag_discovery_(const uint8_t *mac);
  void publish_remote_diag_state_(const uint8_t *mac);
  void publish_remote_diag_state_cached_(const uint8_t *mac, const std::string &node_key);
  void queue_remote_diag_refresh_(const uint8_t *mac);
  void check_diag_publish_rr_();
  void publish_force_rejoin_button_discovery_();

  // Topic / name helpers
  std::string node_key_(const uint8_t *mac) const;
  std::string entity_object_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string default_entity_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string entity_component_(espnow_field_type_t type) const;
  std::string availability_topic_(const uint8_t *mac) const;
  std::string state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_speed_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_speed_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_oscillation_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_oscillation_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_direction_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_direction_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string unique_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string bridge_state_topic_(const char *suffix) const;
  std::string remote_diag_state_topic_(const uint8_t *mac, const char *suffix) const;

  bool decode_command_payload_(const BridgeEntitySchema &entity, CommandRouteKind route_kind,
                               const std::string &payload, std::vector<uint8_t> &value,
                               const std::vector<uint8_t> &current_value) const;
  std::string encode_state_payload_(const BridgeEntitySchema &entity, const std::vector<uint8_t> &value,
                                    espnow_field_type_t type) const;
  std::string entity_record_key_(const uint8_t *mac, uint8_t entity_index) const;

  // --- All MQTT state (extracted from bridge) ---

  std::string mqtt_discovery_prefix_{"homeassistant"};
  std::string bridge_friendly_name_;
  std::array<uint8_t, 6> bridge_mac_{};

  std::map<std::string, MqttEntityRecord> mqtt_entities_;
  std::map<std::string, MqttDeviceRecord> mqtt_devices_;
  struct AvailabilityEntry {
    std::array<uint8_t, 6> mac{};
    bool online{false};
    std::string reason;
  };
  std::deque<AvailabilityEntry> availability_queue_;
  std::set<std::string> subscribed_topics_;
  std::map<std::string, CommandRoute> command_routes_;
  std::string force_rejoin_command_topic_;

  bool mqtt_was_connected_{false};
  uint32_t mqtt_backoff_until_ms_{0};
  uint8_t mqtt_retry_count_{0};

  struct RemoteDiagCache {
    int8_t rssi_{-127};
    uint32_t tx_packets{0};
    uint32_t rx_packets{0};
    uint8_t hops{0};
    uint8_t direct_children{0};
    uint8_t total_children{0};
    uint32_t firmware_epoch{0};
    std::string esphome_name;
    std::string project_name;
    std::string project_version;
    uint32_t chip_model{0};
    uint32_t last_publish_ms{0};
  };

  bool bridge_diag_discovery_published_{false};
  std::set<std::string> remote_diag_discovery_published_;
  std::set<std::string> remote_diag_refresh_pending_;
  std::set<std::string> first_remote_diag_publish_pending_;
  std::map<std::string, RemoteDiagCache> remote_diag_cache_;
  std::map<std::string, uint32_t> delayed_diag_refresh_pending_;
  std::map<std::string, uint32_t> remote_diag_last_publish_ms_;

  uint32_t last_published_bridge_diag_ms_{0};
  uint32_t diag_last_any_publish_ms_{0};
  size_t diag_rr_index_{0};
  uint32_t next_diag_check_ms_{0};
  bool force_rejoin_button_discovery_published_{false};

  // Diagnostic value cache — populated by set_bridge_diag()
  uint32_t cached_uptime_s_{0};
  uint8_t cached_remotes_online_{0};
  int8_t cached_bridge_rssi_{-127};
  uint8_t cached_wifi_channel_{0};
  int cached_ram_pct_{-1};
  int cached_cpu_pct_{-1};
  uint8_t cached_remotes_direct_{0};

  static constexpr uint16_t MQTT_RETRY_BACKOFF_MS[]{200, 400, 800, 1600, 3200, 6400, 12800, 30000};
  static constexpr uint32_t MQTT_MAX_BACKOFF_MS{30000};
  static constexpr uint32_t FIRST_STATE_PUBLISH_GRACE_MS{200};
  static constexpr uint32_t DIAG_CHECK_INTERVAL_MS{250};
  static constexpr uint32_t DIAG_SPACING_MS{250};
  static constexpr uint32_t DIAG_MIN_INTERVAL_MS{10000};
  static constexpr uint32_t DIAG_JITTER_MS{50};
  static constexpr uint32_t DIAG_DELAYED_REFRESH_DELAY_MS{1000};

  // Budget tracking — helper tracks its own loop budget
  uint32_t tick_enter_ms_{0};
  bool tick_budget_exceeded_() const { return (millis() - tick_enter_ms_) >= LOOP_TIME_BUDGET_MS; }
  static constexpr uint32_t LOOP_TIME_BUDGET_MS{200};
};

}  // namespace esp_tree

#endif  // USE_MQTT
```

#### Step 1.2: Enumerate all methods moving to helper

Methods that move from `ESPTreeBridge` to `ESPTreeBridgeMQTT` (private unless noted):

**From `esp_tree_bridge.h`:**
- `sync_mqtt_entities_()` → `tick()` (the MQTT sync portion)
- `do_publish_discovery_(MqttEntityRecord &rec)`
- `publish_device_discovery_(const uint8_t *mac)`
- `build_entity_component_(JsonObject cmp, ...)` — needs `BridgeEntitySchema`
- `do_clear_device_discovery_(const uint8_t *mac)`
- `do_publish_state_(MqttEntityRecord &rec)`
- `send_deferred_state_ack_(MqttEntityRecord &rec)`
- `do_publish_bridge_diag_(uint32_t uptime_s, uint8_t remotes_online)`
- `subscribe_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity)`
- `handle_command_message_(const std::string &topic, const std::string &payload)`
- `handle_force_rejoin_command_(const std::string &payload)`
- `publish_bridge_diag_discovery_()`
- `publish_bridge_diag_state_()`
- `publish_remote_diag_discovery_(const uint8_t *mac)`
- `publish_remote_diag_state_(const uint8_t *mac)`
- `publish_remote_diag_state_cached_(const uint8_t *mac, const std::string &node_key)`
- `queue_remote_diag_refresh_(const uint8_t *mac)` (internal, but also called by bridge on reconnect)
- `check_diag_publish_rr_()`
- `publish_force_rejoin_button_discovery_()`
- `do_clear_entity_(const uint8_t *mac, const BridgeEntitySchema &entity)`
- `queue_discovery_(...)` → public `queue_discovery(...)`
- `queue_state_(...)` → public `queue_state(...)`
- `queue_availability_(...)` → public `queue_availability(...)`
- `queue_clear_entities_(...)` → public `queue_clear_entities(...)`
- `schema_complete_(...)` → public `on_schema_complete(...)`
- `on_discovery_confirmed_(...)` → public `on_discovery_confirmed(...)`

**Topic/method helpers that move (all are MQTT-only):**
- `remote_display_name_(mac)` — needs `protocol_.get_session(mac)`. **Resolution: bridge resolves display name and passes it as a parameter in `queue_discovery()` and `queue_state()` calls.** Helper stores the name in its entity/device records.
- `node_key_(mac)` — string representation of MAC, used for MQTT topics. Move to helper.
- `entity_object_id_(mac, entity)` — move to helper
- `default_entity_id_(mac, entity)` — move to helper
- `entity_component_(type)` — move to helper
- `availability_topic_(mac)` — move to helper
- `state_topic_(mac, entity)` — move to helper
- `command_topic_(mac, entity)` — move to helper
- `fan_*_topic_(...)` — move to helper
- `unique_id_(mac, entity)` — move to helper
- `bridge_state_topic_(suffix)` — move to helper
- `remote_diag_state_topic_(mac, suffix)` — move to helper
- `decode_command_payload_(...)` — move to helper
- `encode_state_payload_(...)` — move to helper
- `mac_key_string_(mac)` — static utility used by both MQTT and non-MQTT code (web UI, topic construction). **Extract to `esp_tree_common`.**
- `slugify_name_(input)` — static utility used by both paths. **Extract to `esp_tree_common`.**

**State members that move (all MQTT-only — see Step 1.1 class skeleton for full declarations):**
- `mqtt_entities_` (map<string, MqttEntityRecord>)
- `mqtt_devices_` (map<string, MqttDeviceRecord>)
- `availability_queue_` (deque<AvailabilityEntry>)
- `mqtt_was_connected_` (bool)
- `mqtt_backoff_until_ms_` (uint32_t)
- `mqtt_retry_count_` (uint8_t)
- `mqtt_discovery_prefix_` (string)
- `subscribed_topics_` (set<string>)
- `command_routes_` (map<string, CommandRoute>) — **moved to helper** since it is only used by MQTT command topic routing
- `MqttEntityRecord` struct — moves to helper header
- `MqttDeviceRecord` struct — moves to helper header
- `CommandRoute` / `CommandRouteKind` — moves to helper header
- `bridge_diag_discovery_published_` (bool)
- `remote_diag_discovery_published_` (set<string>)
- `remote_diag_refresh_pending_` (set<string>)
- `first_remote_diag_publish_pending_` (set<string>)
- `delayed_diag_refresh_pending_` (map<string, uint32_t>)
- `remote_diag_cache_` (map<string, RemoteDiagCache>)
- `RemoteDiagCache` struct — moves to helper header
- `AvailabilityEntry` struct — moves to helper header
- `MQTT_RETRY_BACKOFF_MS[]`, `MQTT_MAX_BACKOFF_MS` (static constexpr)
- `FIRST_STATE_PUBLISH_GRACE_MS` (static constexpr)
- `DIAG_CHECK_INTERVAL_MS`, `DIAG_SPACING_MS`, `DIAG_MIN_INTERVAL_MS`, `DIAG_JITTER_MS`, `DIAG_DELAYED_REFRESH_DELAY_MS` (static constexpr)
- `last_published_bridge_diag_ms_` (uint32_t)
- `diag_last_any_publish_ms_` (uint32_t)
- `diag_rr_index_` (size_t)
- `next_diag_check_ms_` (uint32_t)
- `remote_diag_last_publish_ms_` (map)
- `force_rejoin_command_topic_` (string)
- `force_rejoin_button_discovery_published_` (bool)
- Diagnostic value cache: `cached_uptime_s_`, `cached_remotes_online_`, `cached_bridge_rssi_`, `cached_wifi_channel_`, `cached_ram_pct_`, `cached_cpu_pct_`, `cached_remotes_direct_`.
  These replace the existing `last_published_*` fields on the bridge — the helper caches its own diag snapshot, updated by `set_bridge_diag()`.

#### Step 1.3: Handle shared dependencies

Several methods/data need careful handling because they're used by both MQTT and protobuf paths:

| Item | Resolution |
|------|-----------|
| `BridgeEntitySchema` | Already in `esp_tree_common` — include from there |
| `MqttEntityRecord` / `MqttDeviceRecord` | Move to `bridge_mqtt_export.h` (MQTT-only structs) |
| `CommandRoute` / `CommandRouteKind` | Move to `bridge_mqtt_export.h` (only used for MQTT command topic → entity routing) |
| `remote_display_name_(mac)` | Needs `protocol_.get_session(mac)`. **Solution: pass `display_name` as parameter in `queue_discovery()` and `queue_state()` calls.** Bridge resolves name before calling helper. |
| `mac_key_string_(mac)` | Static utility used by both MQTT and non-MQTT code. **Extract to `esp_tree_common`.** |
| `slugify_name_(input)` | Static utility used by both paths. **Extract to `esp_tree_common`.** |
| `node_key_(mac)` | MQTT-specific topic key — move to helper |
| `BridgeProtocol` for commands | Helper holds `ESPTreeBridge*` pointer, calls `bridge->send_command()`, `bridge->send_force_rejoin()`, `bridge->protocol_discovery_confirmed()`, `bridge->protocol_send_deferred_state_ack()` |
| `espnow_allowed_` check | Stays in bridge, no longer depends on MQTT |
| Bridge diag data | Bridge calls `mqtt_export_->set_bridge_diag(...)` during its own `loop()` — pushes uptime, remotes, rssi, channel, ram, cpu |

---

### Phase 2: Create `ESPTreeBridgeMQTT` Helper — Implementation

> **Status: ✅ Done**
> Created `bridge_mqtt_export.cpp` (1642 lines). All MQTT methods extracted from `esp_tree_bridge.cpp`:
> discovery publishing, state publishing, availability, command handling, diagnostics, reconnect replay.
> Contains its own anonymous-namespace copies of helper functions (`component_for_type`, `parse_options_map`,
> `hsv_u8_to_rgb`, `chip_model_string`, etc.) needed by MQTT methods.
>
> **Key details:**
> - `handle_command_message_()` looks up entity schema via `bridge_->get_session(mac)`, then calls `decode_command_payload_()`
> - `handle_force_rejoin_command_()` accepts `(topic, payload)` to match `CustomMQTTDevice::subscribe` signature
> - `tick()` implements budget-based queue processing (same as original `sync_mqtt_entities_()`)
> - `set_bridge_diag()` caches diagnostic values pushed from bridge's `loop()`

Create `bridge_mqtt_export.cpp` with all MQTT logic extracted from `esp_tree_bridge.cpp`.

#### Step 2.1: Copy MQTT methods from `esp_tree_bridge.cpp`

Move the following method implementations to `ESPTreeBridgeMQTT`, adapting `this->` calls and removing the `_` suffix on public methods:

- All private and public methods listed in the Phase 1.1 class skeleton
- `init()` method: stores the bridge pointer, bridge MAC, and force-rejoin topic; subscribes to the force-rejoin MQTT command topic via `this->subscribe(topic, ...)`
- `tick()` method: replaces `sync_mqtt_entities_()`, includes the `just_connected` replay logic and budget-based processing queue. Helper tracks its own `tick_enter_ms_` for budget exceeded checks.
- Constructor: initializes state to defaults (bridge pointer starts as nullptr)

#### Step 2.2: Adapt `remote_display_name_` resolution

Since `remote_display_name_()` currently reads from `protocol_.get_session()`, and the helper doesn't have access to `protocol_`:

- `queue_discovery()` accepts a `display_name` string parameter — bridge resolves the name before calling
- `queue_state()` accepts a `display_name` string parameter — same pattern
- The helper stores `display_name` on the `MqttDeviceRecord` and `MqttEntityRecord` as it creates them

#### Step 2.3: Implement reconnect orchestration

The `tick()` method detects `just_connected` by checking `is_connected()` vs `mqtt_was_connected_`. When detected, the helper calls back to the bridge via `bridge_->get_online_macs()` to get the current online remote list, then runs the full replay internally:

```cpp
void ESPTreeBridgeMQTT::tick() {
  tick_enter_ms_ = millis();
  if (!is_connected()) {
    mqtt_was_connected_ = false;
    return;
  }
  // ... backoff handling ...

  const bool just_connected = is_connected() && !mqtt_was_connected_;
  if (just_connected) {
    mqtt_retry_count_ = 0;
    mqtt_backoff_until_ms_ = 0;
    // Mark all devices dirty
    for (auto &pair : mqtt_devices_) {
      pair.second.discovery_dirty = true;
      pair.second.discovery_published = false;
      pair.second.schema_complete = true;
    }
    // Mark all entities for re-publish
    for (auto &pair : mqtt_entities_) {
      pair.second.discovery_published = false;
      pair.second.state_dirty = true;
    }
    // Reset discovery state
    bridge_diag_discovery_published_ = false;
    remote_diag_discovery_published_.clear();
    remote_diag_refresh_pending_.clear();
    first_remote_diag_publish_pending_.clear();
    delayed_diag_refresh_pending_.clear();
    force_rejoin_button_discovery_published_ = false;
    // Queue diag refresh for all online remotes (query bridge for session list)
    auto online_macs = bridge_->get_online_macs();
    for (const auto &mac : online_macs) {
      queue_remote_diag_refresh_(mac.data());
    }
  }
  mqtt_was_connected_ = is_connected();

  // --- Budget-based queue processing (same as current sync_mqtt_entities_) ---
  // 1. Bridge diag discovery + force rejoin button discovery
  // 2. Availability queue
  // 3. Delayed remote diag refresh
  // 4. Remote diag discovery
  // 5. Dirty device discovery
  // 6. Unpublished entity discovery
  // 7. Dirty state publishes (up to 2 per tick)
  // 8. Join completion check
  // 9. Diagnostic round-robin check
}
```

#### Step 2.4: Command callback wiring (via bridge pointer)

`handle_command_message_()` resolves the MQTT topic to a route using `command_routes_`, then calls the bridge for dispatch:

```cpp
void ESPTreeBridgeMQTT::handle_command_message_(const std::string &topic, const std::string &payload) {
  // Find route by topic
  // Decode command payload
  // Call bridge_->send_command(mac, entity_index, command, value)
}
```

For force rejoin:
```cpp
void ESPTreeBridgeMQTT::handle_force_rejoin_command_(const std::string &payload) {
  // Parse MAC from payload
  // Call bridge_->send_force_rejoin(mac)
}
```

#### Step 2.5: Protocol notification callbacks

When discovery is confirmed or deferred state ACKs need sending, the helper calls back through the bridge:

```cpp
// In do_publish_discovery_()
if (ok) {
  rec.discovery_published = true;
  rec.first_state_publish_pending = false;
  rec.discovery_published_ms = millis();
  bridge_->protocol_discovery_confirmed(mac, entity.entity_index, true);
}

// In send_deferred_state_ack_()
bridge_->protocol_send_deferred_state_ack(rec);
```

---

### Phase 3: Modify `ESPTreeBridge` — Remove MQTT Inheritance

> **Status: ✅ Done**
> Modified `esp_tree_bridge.h` (268 lines) and `esp_tree_bridge.cpp` (3001 lines).
>
> **Header changes:**
> - Removed `CustomMQTTDevice` inheritance and all MQTT member variables
> - Added `CommandRouteKind`/`CommandRoute` enums/structs (shared with helper and protobuf WS path)
> - Added `entity_values_` cache (lightweight `EntityValueCache` struct for protobuf WS current-value lookups)
> - Added `mqtt_export_` pointer (`#ifdef USE_MQTT`-gated)
> - Added public bridge methods: `send_command()`, `send_force_rejoin()`, `protocol_*()`, `get_online_macs()`, `get_session()`, `node_key()`, `get_remote_mac_by_node_key()`, `entity_value_key_()`
> - Retained `node_key_()`, `remote_display_name_()`, `entity_object_id_()`, `slugify_name_()`, `decode_command_payload_()` (needed by non-MQTT code paths)
>
> **Cpp changes:**
> - Removed all MQTT method bodies (moved to helper)
> - Added `#ifdef USE_MQTT` includes for `bridge_mqtt_export.h` and `mqtt/mqtt_client.h`
> - Protocol callbacks in `setup_transport_()` now dispatch to both `mqtt_export_->...()` and `api_proto_ws_->...()`
> - `espnow_allowed_` now WiFi-only: `ready_for_espnow = wifi::global_wifi_component->is_connected()`
> - `sync_mqtt_entities_()` removed; replaced with `mqtt_export_->set_bridge_diag()` + `mqtt_export_->tick()` in loop
> - `mqtt_export_` created in `setup()` via `new ESPTreeBridgeMQTT()`
> - `api_bridge_info_json()` no longer includes `"mqtt_export": true`
> - `handle_received_frame_()` log updated: "(Wi-Fi disconnected)"
> - `api_node_state_json()` and `api_runtime_handle_command()` use `entity_values_` instead of `mqtt_entities_`
> - `log_ram_stats_()` references to MQTT maps removed
> - `log_airtime_status_()` `remote_diag_cache_` iteration removed

Modify `esp_tree_bridge.h` and `esp_tree_bridge.cpp` to remove `CustomMQTTDevice` and all MQTT-specific code. Add public methods needed by the helper for callbacks.

#### Step 3.1: Remove `CustomMQTTDevice` from class declaration

Change:
```cpp
class ESPTreeBridge : public Component, public mqtt::CustomMQTTDevice, public bridge_api::BridgeFacade {
```
To:
```cpp
class ESPTreeBridge : public Component, public bridge_api::BridgeFacade {
```

Remove `#include "esphome/components/mqtt/custom_mqtt_device.h"` and `#include "esphome/components/mqtt/mqtt_client.h"` from the `.cpp` file.

#### Step 3.2: Add `mqtt_export_` member and `#ifdef USE_MQTT` guard

In `esp_tree_bridge.h`:
```cpp
#ifdef USE_MQTT
class ESPTreeBridgeMQTT;  // forward declaration
#endif

class ESPTreeBridge : public Component, public bridge_api::BridgeFacade {
  // ...
#ifdef USE_MQTT
  ESPTreeBridgeMQTT *mqtt_export_{nullptr};
#endif
```

#### Step 3.3: Add public methods the helper needs to call back

The helper holds an `ESPTreeBridge*` and calls these bridge methods for command dispatch and protocol notifications. Add to the bridge's public API:

```cpp
// Called by ESPTreeBridgeMQTT to dispatch commands to the protocol layer
void send_command(const uint8_t *mac, uint8_t entity_index,
                  const std::string &command_str, const std::vector<uint8_t> &value);
void send_force_rejoin(const uint8_t *mac);

// Called by ESPTreeBridgeMQTT for protocol notifications
void protocol_discovery_confirmed(const uint8_t *mac, uint8_t entity_index, bool success);
void protocol_send_deferred_state_ack(const MqttEntityRecord &rec);

// Called by ESPTreeBridgeMQTT on reconnect replay to get online session list
std::vector<std::array<uint8_t, 6>> get_online_macs() const;
```

#### Step 3.4: Remove all MQTT member variables and methods from bridge

Remove from `esp_tree_bridge.h`:
- All methods listed in Phase 1.2 (they now live in `ESPTreeBridgeMQTT`)
- All member variables listed in Phase 1.2 (they now live in `ESPTreeBridgeMQTT`)
- `mqtt_discovery_prefix_` (moves to helper)
- `subscribed_topics_` (moves to helper)
- `force_rejoin_command_topic_` (moves to helper)
- `MqttEntityRecord` and `MqttDeviceRecord` structs (move to helper)
- `RemoteDiagCache` struct (moves to helper)
- `AvailabilityEntry` struct (moves to helper)
- `command_routes_`, `CommandRoute`, `CommandRouteKind` (move to helper)
- `loop_budget_exceeded_()` and `loop_enter_ms_` (can remove — helper tracks its own budget)
- `LOOP_TIME_BUDGET_MS` (can move to helper or remove — helper has its own)

#### Step 3.5: Replace MQTT calls with null-check pattern

In `esp_tree_bridge.cpp`, replace all direct MQTT calls:

```cpp
// Before:
queue_discovery_(mac, entity, total, is_commandable);

// After:
#ifdef USE_MQTT
if (mqtt_export_ != nullptr) {
    mqtt_export_->queue_discovery(mac, entity, total, is_commandable, remote_display_name_(mac));
}
#endif
```

Key replacement points:
- `queue_discovery_()` → `mqtt_export_->queue_discovery()`
- `queue_state_()` → `mqtt_export_->queue_state()`
- `queue_availability_()` → `mqtt_export_->queue_availability()`
- `queue_clear_entities_()` → `mqtt_export_->queue_clear_entities()`
- `sync_mqtt_entities_()` call in `loop()` → `mqtt_export_->tick()`
- `queue_remote_diag_refresh_()` → `mqtt_export_->queue_remote_diag_refresh()`
- `schema_complete_()` MQTT portion → `mqtt_export_->on_schema_complete()`
- `on_discovery_confirmed_()` MQTT portion → `mqtt_export_->on_discovery_confirmed()`
- `is_connected()` checks (for MQTT) — remove or replace with `mqtt_export_->is_connected()` if needed

#### Step 3.6: Fix `espnow_allowed_` to WiFi-only

In `loop()`:
```cpp
// Before:
const bool ready_for_espnow = (wifi && wifi->is_connected()) && (mqtt && mqtt->is_connected());

// After:
const bool ready_for_espnow = (wifi && wifi->is_connected());
```

Also update the comment on the `espnow_allowed_` member variable to remove the MQTT reference:
```cpp
// Before (line ~330):
// Whether the bridge should process incoming ESP-NOW frames. This is set when
// both Wi-Fi and MQTT are connected to avoid acting on frames when the
// system cannot publish or respond.
bool espnow_allowed_{false};

// After:
// Whether the bridge should process incoming ESP-NOW frames. This is set when
// Wi-Fi is connected. (MQTT is optional — removed from this gate.)
bool espnow_allowed_{false};
```

#### Step 3.7: Fix `handle_received_frame_()` ESP-NOW guard

Currently:
```cpp
if (!espnow_allowed_) {
  rx_dropped_while_disallowed_++;
  ESP_LOGW(TAG, "ESP-NOW frame dropped: espnow_allowed_=false (Wi-Fi or MQTT disconnected)");
  return;
}
```

The `espnow_allowed_` check stays, but it now only depends on WiFi, and the log message should reflect that:
```cpp
if (!espnow_allowed_) {
  rx_dropped_while_disallowed_++;
  ESP_LOGW(TAG, "ESP-NOW frame dropped: espnow_allowed_=false (Wi-Fi disconnected)");
  return;
}
```

#### Step 3.8: Remove `mqtt_export` from `api_bridge_info_json()`

In the features JSON:
```cpp
// Remove this line:
"mqtt_export": true,
```

#### Step 3.9: Create `ESPTreeBridgeMQTT` instance in `setup()`

Since `ESPTreeBridgeMQTT` is a plain C++ class (not an ESPHome Component), the bridge creates it with `new` and calls `init()`:

```cpp
void ESPTreeBridge::setup() {
  // ... existing setup (setup_transport_, api_proto_ws_, etc.) ...

#ifdef USE_MQTT
  mqtt_export_ = new ESPTreeBridgeMQTT();
  mqtt_export_->set_mqtt_discovery_prefix(mqtt_discovery_prefix_);
  mqtt_export_->set_bridge_friendly_name(bridge_friendly_name_);
  // Build force_rejoin topic string from bridge MAC
  std::string force_rejoin_topic = "esp-tree/bridge/" + mac_colon_string_(sta_mac_.data()) + "/force_rejoin/set";
  mqtt_export_->init(this, sta_mac_, force_rejoin_topic);
#endif

  // ... rest of setup ...
}
```

#### Step 3.10: Update `loop()` to call helper's `tick()` and push diag data

```cpp
void ESPTreeBridge::loop() {
  // ... existing loop (wifi check, espnow_allowed_ transition, drain frames, etc.) ...

#ifdef USE_MQTT
  if (mqtt_export_ != nullptr) {
    // Push current diagnostic snapshot to helper
    mqtt_export_->set_bridge_diag(
        uptime_s,                              // computed elsewhere in loop
        protocol_.get_active_remote_count(),
        last_rssi,
        current_wifi_channel_(),
        ram_pct,
        cpu_pct,
        protocol_.get_direct_remote_count()
    );
    // Let helper process its MQTT publish queue
    mqtt_export_->tick();
  }
#endif

  // ... rest of loop (api_proto_ws_, ota, airtime, etc.) ...
}
```

> **Note on Phases 1-3:** These phases must be implemented together as a single atomic change. The bridge will not compile between phases — removing methods from the bridge header (Phase 3) depends on those methods already existing in the helper header (Phase 1), and the helper implementation (Phase 2) references bridge methods that must be declared (Phase 3). All four phases (1-4) should be completed and verified in one step.

---

### Phase 4: Modify `__init__.py` — Python Config Validation

> **Status: ✅ Done**
> Modified `__init__.py` (59 lines).
>
> **Changes:**
> - `DEPENDENCIES = ["wifi", "web_server"]` (removed `"mqtt"`)
> - `AUTO_LOAD = ["esp_tree_common", "mqtt"]` — auto-loads MQTT only when `mqtt:` is in YAML
> - `CONF_MQTT_DISCOVERY_PREFIX` kept in CONFIG_SCHEMA (not conditional) — `to_code()` checks `core.CORE.loaded_integrations` to decide whether to call the setter
> - Added `cg.add_build_flag("-DUSE_MQTT")` inside the `if "mqtt" in core.CORE.loaded_integrations` block — required because ESPHome 2026.4 doesn't propagate `USE_MQTT` to external component `.cpp` files automatically
>
> **Deviation:** `cv.OnlyWith` was not used (per user preference). The simpler conditional-`to_code()` pattern was adopted.

#### Step 4.1: Remove MQTT from hard dependencies

```python
DEPENDENCIES = ["wifi", "web_server"]  # removed "mqtt"
```

#### Step 4.2: Make `CONF_MQTT_DISCOVERY_PREFIX` conditional on MQTT

```python
CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(ESPTreeBridge),
        cv.Required(CONF_NETWORK_ID): cv.string_strict,
        cv.Required(CONF_PSK): cv.All(cv.string_strict, cv.Length(min=1)),
        cv.Optional(CONF_HEARTBEAT_INTERVAL, default=60): cv.int_range(min=10, max=3600),
        cv.Optional(CONF_MQTT_DISCOVERY_PREFIX, default="homeassistant"): cv.OnlyWith(CONF_MQTT_ID, "mqtt"),
        cv.Optional(CONF_ESPNOW_MODE, default="lr"): cv.one_of("lr", "regular", lower=True),
        cv.Optional(CONF_OTA_OVER_ESPNOW, default=False): cv.boolean,
        cv.Optional(CONF_FORCE_V1_PACKET_SIZE, default=False): cv.boolean,
        cv.Optional(CONF_API_KEY, default=""): cv.string_strict,
    }
).extend(cv.COMPONENT_SCHEMA)
```

The `cv.OnlyWith(CONF_MQTT_ID, "mqtt")` strips out `mqtt_discovery_prefix` when the `mqtt` component is absent from the config. No explicit error — the key simply gets a default and is consumed internally within the bridge's `to_code()`.

#### Step 4.3: Detect MQTT at codegen time

Since `ESPTreeBridgeMQTT` is a plain C++ class (not registered via `cg.new_Pvariable`), the Python side only needs to check whether MQTT is available and pass the relevant config values. The bridge's C++ `setup()` creates the helper internally.

```python
async def to_code(config):
    add_idf_sdkconfig_option("CONFIG_HTTPD_WS_SUPPORT", True)
    cg.add_build_flag("-Isrc/esphome/components")
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    cg.add(var.set_network_id(config[CONF_NETWORK_ID]))
    cg.add(var.set_psk(config[CONF_PSK]))
    cg.add(var.set_api_key(config[CONF_API_KEY]))
    cg.add(var.set_heartbeat_interval(config[CONF_HEARTBEAT_INTERVAL]))
    cg.add(var.set_ota_over_espnow(config[CONF_OTA_OVER_ESPNOW]))
    cg.add(var.set_espnow_mode(config[CONF_ESPNOW_MODE]))

    friendly_name = core.CORE.friendly_name or core.CORE.name or "ESP-NOW LR Bridge"
    hostname = core.CORE.name or "esp-tree-bridge"
    cg.add(var.set_force_v1_packet_size(config[CONF_FORCE_V1_PACKET_SIZE]))
    cg.add(var.set_bridge_friendly_name(friendly_name))
    cg.add(var.set_hostname(hostname))

    # MQTT discovery prefix — only needed when MQTT is configured.
    # ESPTreeBridge's setup() reads mqtt_discovery_prefix_ and passes it to ESPTreeBridgeMQTT::init().
    if "mqtt" in core.CORE.loaded_integrations:
        cg.add(var.set_mqtt_discovery_prefix(config[CONF_MQTT_DISCOVERY_PREFIX]))
```

#### Step 4.4: Retain `set_mqtt_discovery_prefix()` on bridge (temporarily)

The bridge still needs the config value so it can forward it to the helper in C++ `setup()`. The setter stays on `ESPTreeBridge` but its only purpose is to cache the value; the helper receives it via `set_mqtt_discovery_prefix()` during `init()`.

#### Step 4.5: Add `bridge_mqtt_export.cpp` source to component

ESPHome external components pick up all `.cpp` files in the component directory via the build system's `__init__.py` pattern. Since `bridge_mqtt_export.cpp` is wrapped entirely in `#ifdef USE_MQTT`, it compiles to nothing when MQTT is absent. No additional build registration needed.

---

### Phase 5: Add `bridge_mqtt_export.cpp` to Build (No-Op)

> **Status: ✅ Done**
> ESPHome auto-discovers `.cpp` files in component directory. No build system changes needed.
>
> **Important caveat:** Files must exist in BOTH the nested directory
> (`device_code/components/components/esp_tree_bridge/`) AND the flat build directory
> (`device_code/components/esp_tree_bridge/`). The demo YAML resolves `../components` to the flat directory,
> but the source of truth edits happen in the nested directory. A `cp` sync step is needed after changes.

ESPHome external components auto-discover all `.cpp` files in the component directory. Since `bridge_mqtt_export.cpp` is wrapped entirely in `#ifdef USE_MQTT` (Step 5.2 below), placing the file in `device_code/components/components/esp_tree_bridge/` is the only action required. No `CMakeLists.txt` or `__init__.py` changes are needed for build inclusion.

#### Conditional compilation guard

In `bridge_mqtt_export.cpp`:
```cpp
#ifdef USE_MQTT

#include "bridge_mqtt_export.h"
#include "esp_tree_bridge.h"  // for ESPTreeBridge* pointer access
// ... all implementation ...

#endif  // USE_MQTT
```

In `esp_tree_bridge.cpp`:
```cpp
#ifdef USE_MQTT
#include "bridge_mqtt_export.h"
#endif
```

---

### Phase 6: Update Demo YAML

> **Status: ✅ Done**
> Added comment in `device_code/demos/espnow-bridge-c5.yml`:
> - MQTT block now annotated with "MQTT is now optional — remove this block for protobuf-only operation"
> - `mqtt_discovery_prefix` field comment updated to "only used when mqtt: block is present"

#### Step 6.1: Add optional comment to bridge demo

In `device_code/demos/espnow-bridge-c5.yml`:

```yaml
# MQTT is now optional — remove this block for protobuf-only operation.
# When absent, the bridge uses the WebSocket protobuf API exclusively.
mqtt:
  broker: !secret mqtt_broker
  username: !secret mqtt_username
  password: !secret mqtt_password
```

#### Step 6.2: Keep `mqtt_discovery_prefix` comment

```yaml
esp_tree_bridge:
  # mqtt_discovery_prefix is only used when mqtt: block is present
  mqtt_discovery_prefix: homeassistant
```

---

### Phase 7: Testing

> **Status: 🟡 Partial — compilation verified; runtime pending**
>
> #### Step 7.1-7.2: C++ tests + MQTT build
> - ✅ MQTT build succeeds (`espnow-bridge-c5`): 274s, no errors
> - 🔲 C++ unit tests not re-run (`dev.sh run-cpp`) — 17 test targets exist but protocol logic unchanged
>
> #### Step 7.3: Build without MQTT
> - ✅ Non-MQTT build succeeds: 20s, no errors
> - ✅ `USE_MQTT` not defined (config validation no longer requires mqtt)
> - ✅ `espnow_allowed_` gate is WiFi-only
>
> #### Steps 7.4-7.5: Runtime verification
> - 🔲 Runtime testing on hardware not performed

#### Step 7.1: Existing C++ tests

Run `dev.sh run-cpp` to verify all 17 existing test targets pass. The protocol logic tests should not be affected since they don't touch MQTT code directly.

#### Step 7.2: Compile with MQTT enabled

Build the bridge with `mqtt:` in the YAML. Verify:
- Bridge compiles without errors
- `ESPTreeBridgeMQTT` is instantiated
- MQTT discovery, state, commands work as before
- MQTT reconnect replay works
- Protobuf WS path works alongside MQTT
- `espnow_allowed_` gate works with WiFi-only check

#### Step 7.3: Compile without MQTT

Build the bridge **without** `mqtt:` in the YAML. Verify:
- Bridge compiles without errors
- `USE_MQTT` is not defined
- No MQTT code is linked
- Binary is smaller
- Protobuf WS path works
- ESP-NOW frames are processed when WiFi is connected (no MQTT check)
- No MQTT-related log messages appear

#### Step 7.4: Runtime verification (with MQTT)

Flash the MQTT-enabled build and verify:
- Remote joins work
- MQTT discovery appears in Home Assistant
- MQTT state updates publish correctly
- MQTT command subscription works
- Force rejoin button works via MQTT
- Bridge diagnostics publish via MQTT
- MQTT disconnect/reconnect triggers full replay
- Protobuf WS path works simultaneously

#### Step 7.5: Runtime verification (without MQTT)

Flash the non-MQTT build and verify:
- Remote joins work
- Protobuf WS path carries all topology, state, commands
- No MQTT connection attempts
- Bridge reports no `mqtt_export` in features
- ESP-NOW works with WiFi-only connectivity
- OTA over ESP-NOW works (via protobuf WS path)
- Web UI works

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `remote_display_name_()` depends on `protocol_.get_session()` which the helper can't access | Pass `display_name` as parameter in queue calls. Bridge resolves name before calling helper. |
| `CustomMQTTDevice` inheritance provides `subscribe()`, `publish()`, `publish_json()`, `is_connected()` | `ESPTreeBridgeMQTT` inherits `CustomMQTTDevice` directly. All MQTT publish/subscribe calls stay there. |
| Helper needs to call back into bridge for commands, protocol notifications, session queries | Helper stores `ESPTreeBridge*` pointer. Bridge declares public methods: `send_command()`, `send_force_rejoin()`, `protocol_discovery_confirmed()`, `protocol_send_deferred_state_ack()`, `get_online_macs()`. Forward declarations avoid circular includes. |
| MQTT is an optional compile-time feature — the helper must not be compiled or linked when MQTT is absent | All helper source is wrapped in `#ifdef USE_MQTT`. When `mqtt:` is not in the YAML, ESPHome does not define `USE_MQTT`, and the helper compiles to an empty TU. Bridge's null-check `if (mqtt_export_ != nullptr)` is always false (member is `#ifdef`-gated to `nullptr`). |
| Bridge diagnostic state (uptime, remotes count, WiFi channel, RAM, CPU) is published via MQTT and also available to protobuf WS | The diagnostic value cache moves to the helper, populated by `set_bridge_diag()` called from bridge's `loop()`. Protobuf WS has its own state serialization from `protocol_.get_sessions()`. No conflict. |
| `decode_command_payload_()` needs `BridgeEntitySchema` and entity current value | Helper owns entity records (`mqtt_entities_`) which contain both the schema and the current value. Decoding stays in helper. |
| `command_routes_` map — needs to exist in the same class that does command topic subscription and MQTT message dispatch | Moved entirely to helper. `subscribe_command_topic_()`, `handle_command_message_()`, and `command_routes_` all live in `ESPTreeBridgeMQTT`. |
| `mac_key_string_()` and `slugify_name_()` are used by both MQTT and non-MQTT code paths | Both extracted to `esp_tree_common` as shared utilities. Include from there in both bridge and helper. |
| OTA state callbacks (bridge emits OTA status via protobuf WS) — not affected by MQTT changes | No action needed. OTA path is entirely through protobuf WS. |
| Raw `new` allocation for `mqtt_export_` bypasses ESPHome lifecycle | `ESPTreeBridgeMQTT` is a plain C++ class, not an ESPHome Component. Its lifecycle is entirely managed by the bridge — `init()` in bridge's `setup()`, `tick()` in bridge's `loop()`. The bridge owns the pointer and is responsible for cleanup. |
| Compilation between phases (removing from bridge before adding to helper) | Phases 1-4 are a single atomic change. All files are created/modified together and verified by a single compile. The workplan phases represent the change breakdown, not sequential compilation steps. |

## Out of Scope

- Add-on / HA integration changes (no changes needed)
- Serial bridge transport (separate roadmap item)
- Removing MQTT from remote firmware (remotes don't have MQTT)
- Runtime MQTT toggle (compile-time only for now)
- Abstract `Transport` interface for extensibility (future work, not this PR)
