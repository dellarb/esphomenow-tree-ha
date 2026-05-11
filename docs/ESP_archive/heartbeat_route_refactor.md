# Heartbeat + Route TTL Refactor

**Status:** In Progress
**Network:** V3 (all nodes must be reflashed together — heartbeat encryption change)

---

## Phase 1 — Encrypt Heartbeat Uniformly

Heartbeat (`PKT_HEARTBEAT`) joins the encrypted packet set. Relay forwards ciphertext opaquely. Bridge decrypts before processing. Remote sends encrypted heartbeat.

### 1.1 `espnow_types.h` — Add HEARTBEAT to encrypted set

| Item | Description | Status |
|------|-------------|--------|
| A | Add `case PKT_HEARTBEAT:` to `is_encrypted_packet()` return-true set (line ~142) | **Done** |

### 1.2 `remote_protocol.cpp` — Send heartbeat encrypted

| Item | Description | Status |
|------|-------------|--------|
| B | Change `send_frame_(..., false)` → `send_frame_(..., true)` in `send_heartbeat_()` (line ~1350) | **Done** |

### 1.3 `bridge_protocol.cpp` — Handle encrypted heartbeat

| Item | Description | Status |
|------|-------------|--------|
| C | `handle_heartbeat_()`: add `validate_session_packet_()` call to decrypt before casting payload | **Done** |
| D | Replace direct `reinterpret_cast<const espnow_heartbeat_t *>(payload)` with cast from decrypted plaintext | **Done** |
| E | Update `payload_len` size check to use `plaintext.size()` | **Done** |

### 1.4 `remote_protocol.cpp` — Relay no longer reads heartbeat payload

| Item | Description | Status |
|------|-------------|--------|
| F | `handle_upstream_()` PKT_HEARTBEAT case: remove payload deserialization for TTL — just refresh + forward | **Done** |

### 1.5 Phase 1 Verification

| Check | Description | Status |
|-------|-------------|--------|
| V1 | `PKT_HEARTBEAT` is in `is_encrypted_packet()` return-true set | **Done** |
| V2 | `send_heartbeat_()` passes `encrypted=true` | **Done** |
| V3 | Bridge `handle_heartbeat_()` validates session tag and decrypts before casting | **Done** |
| V4 | Relay `handle_upstream_()` for heartbeat does NOT attempt to read payload | **Done** |

---

## Phase 2 — Flat 48h Route TTL

Dynamic TTL (heartbeat_interval × 3, clamped) replaced with single YAML-configurable constant. Route entry simplified.

### 2.1 `espnow_types.h` — Replace TTL constants

| Item | Description | Status |
|------|-------------|--------|
| A | Remove `ESPNOW_LR_JOIN_ROUTE_TTL_SECONDS` (line 59) | **Done** |
| B | Remove `ESPNOW_LR_MIN_ROUTE_TTL_SECONDS` (line 63) | **Done** |
| C | Remove `ESPNOW_LR_MAX_ROUTE_TTL_SECONDS` (line 64) | **Done** |
| D | Add `#define ESPNOW_LR_ROUTE_TTL_DEFAULT_SECONDS 172800U` | **Done** |

### 2.2 `remote_protocol.h` — Simplify route entry

| Item | Description | Status |
|------|-------------|--------|
| E | Remove `ttl_ms`, `long_ttl_s`, `leaf_interval_seconds` from `RemoteRouteEntry` (lines 27-35) | **Done** |
| F | Remove `compute_route_ttl_seconds_()` declaration (line 161) | **Done** |
| G | Change `refresh_route_()` signature: remove `ttl_ms` param (line 146) | **Done** |
| H | Add `uint32_t route_ttl_seconds_{ESPNOW_LR_ROUTE_TTL_DEFAULT_SECONDS};` member | **Done** |

### 2.3 `remote_protocol.cpp` — Route operations

| Item | Description | Status |
|------|-------------|--------|
| I | Delete `compute_route_ttl_seconds_()` function (lines ~1886-1890) | **Done** |
| J | Simplify `open_route_()`: use `route_ttl_seconds_` directly, no compute call | **Done** |
| K | Simplify `refresh_route_()`: remove `ttl_ms` param, compute `expiry_ms` from `route_ttl_seconds_`, remove min-ttl floor | **Done** |
| L | Simplify `prune_routes_()`: remove ESP_LOGW, remove ttl/interval/heartbeats_missed calc — silent erase | **Done** |
| M | Simplify `handle_upstream_()` PKT_JOIN case: no payload read, no `long_ttl_s`/`leaf_interval_seconds` update | **Done** |
| N | Simplify `handle_upstream_()` PKT_HEARTBEAT case: no payload read, no `long_ttl_s`/`leaf_interval_seconds` update | **Done** |
| O | Simplify `handle_upstream_()` generic case: remove `long_ttl_s` fallback | **Done** |
| P | Update `forward_packet_()` downstream refresh: remove `route->ttl_ms` arg from `refresh_route_()` call | **Done** |
| Q | Update `set_relay_config()`: remove `max_children` usage | **Done** |

### 2.4 `esp_tree_remote.h` — YAML setter for route_ttl

| Item | Description | Status |
|------|-------------|--------|
| R | Add `uint32_t route_ttl_seconds_{...}` member | **Done** |
| S | Add `void set_route_ttl(...)` setter | **Done** |
| T | Add `protocol_.set_route_ttl(route_ttl_)` in `setup_transport_()` | **Done** |

### 2.5 `remote_protocol.cpp` — Protocol setter for route_ttl

| Item | Description | Status |
|------|-------------|--------|
| U | Add `void set_route_ttl(uint32_t route_ttl) { route_ttl_seconds_ = route_ttl; }` | **Done** |

### 2.6 `__init__.py` — Add route_ttl YAML config

| Item | Description | Status |
|------|-------------|--------|
| V | Add `CONF_ROUTE_TTL = "route_ttl_seconds"` | **Done** |
| W | Add config schema: `cv.Optional(CONF_ROUTE_TTL, default=172800): cv.int_range(min=60, max=604800),` | **Done** |
| X | Add to `to_code()`: `cg.add(var.set_route_ttl(config[CONF_ROUTE_TTL]))` | **Done** |

### 2.7 Phase 2 Verification

| Check | Description | Status |
|-------|-------------|--------|
| V5 | All references to removed TTL constants gone | **Done** |
| V6 | `RemoteRouteEntry` has no `ttl_ms`, `long_ttl_s`, `leaf_interval_seconds` | **Done** |
| V7 | `compute_route_ttl_seconds_()` deleted | **Done** |
| V8 | `refresh_route_()` takes 2 params (leaf_mac, next_hop_mac) | **Done** |
| V9 | `prune_routes_()` is silent — no log on expiry | **Done** |
| V10 | YAML `route_ttl_seconds` propagates from config to protocol | **Done** |

---

## Phase 3 — Remove Child Limit

Route table is unbounded. `max_children_` removed. Relays always announce unlimited capacity.

### 3.1 `remote_protocol.h`

| Item | Description | Status |
|------|-------------|--------|
| A | Remove `uint8_t max_children_{6};` member (line 192) | **Done** |
| B | Remove `can_accept_child_()` declaration (line 164) | **Done** |

### 3.2 `remote_protocol.cpp`

| Item | Description | Status |
|------|-------------|--------|
| C | Delete `can_accept_child_()` function (lines ~1892-1897) | **Done** |
| D | Remove `can_accept_child_()` call from `handle_discover_()` (lines ~885-888) | **Done** |
| E | Set `child_capacity_remaining = 0xFF` in `handle_discover_()` announce (lines ~900-906) | **Done** |
| F | Update `set_relay_config()`: remove `max_children` usage | **Done** |

### 3.3 `esp_tree_remote.h`

| Item | Description | Status |
|------|-------------|--------|
| G | Remove `uint8_t max_children_{6};` member (line 172) | **Done** |
| H | Remove `void set_max_children()` setter (line 78) | **Done** |
| I | Remove Max Children from `dump_config()` (line ~830) | **Done** |
| J | Update `set_relay_config()` call in `setup_transport_()`: remove `max_children_` arg | **Done** |

### 3.4 `__init__.py`

| Item | Description | Status |
|------|-------------|--------|
| K | Remove `CONF_MAX_CHILDREN` constant (line 32) | **Done** |
| L | Remove `max_children` from CONFIG_SCHEMA (line 51) | **Done** |
| M | Remove `cg.add(var.set_max_children(...))` in to_code() (line 73) | **Done** |

### 3.5 Phase 3 Verification

| Check | Description | Status |
|-------|-------------|--------|
| V11 | `max_children_` removed from both classes | **Done** |
| V12 | `can_accept_child_()` deleted | **Done** |
| V13 | Relay announces `child_capacity_remaining = 0xFF` | **Done** |
| V14 | `direct_child_count_()` still exists (needed for heartbeat telemetry) | **Done** |
| V15 | `__init__.py` no longer exposes `max_children` | **Done** |

---

## Build Verification

| Check | Description | Status |
|-------|-------------|--------|
| BUILD | `./compile.sh espnow-remote b` compiles cleanly | **Done** |

---

## Notes

- **Wire compat:** `espnow_heartbeat_t` struct layout unchanged. `child_capacity_remaining` field in `espnow_discover_announce_t` stays on wire — only the value written by relays changes (always 0xFF).
- **Full reflash required:** Heartbeat encryption change means old and new nodes cannot interoperate. All network nodes must be reflashed together.
- **`route_ttl_seconds` future use:** Exposed via YAML for potential live update via config packet (future work).
