# ESPNOW V2.0 Implementation Work Plan

Phase-by-phase breakdown of files, functions, and specific changes. Reference [roadmap_espnow_v2.md](roadmap_espnow_v2.md) for design rationale.

---

## Review Fixes Applied

Issues identified during review and their resolutions:

1. **`ESPNOW_LR_HOPS_DEFAULT` collision** — `ESPNOW_LR_MAX_HOPS_DEFAULT` (value 4) already exists and is used in 3 places. Don't add a duplicate. Added only `ESPNOW_LR_HOPS_LIMIT 8` for hard protocol ceiling. `ESPNOW_LR_MAX_HOPS_DEFAULT` stays at 4.
2. **Duplicate `max_frame_payload`** — Removed from `BridgeSession` and `CachedSessionData`. Replaced with `session_max_payload`. Identity descriptor wire field `espnow_identity_descriptor_t.max_frame_payload` stays.
3. **No `RemoteSession` struct** — All session fields on remote side live directly on `RemoteProtocol`. Added new fields there.
4. **Stale assembly limit defaults** — Initialize dynamically from helper functions using `ESPNOW_LR_V1_MAX_PAYLOAD` as default, not hardcoded old constants.
5. **`parse_frame_()` has no max frame length** — Add upper bound check as new code.
6. **Underspecified "all packet handlers"** — Explicit handler lists provided below.
7. **Crypto line numbers** — Reference function names instead.
8. **V2 max_entity_fragment is 1440** — `1470 - 17 - 8 - 5 = 1440`.
9. **Phase 5 hardware dependency** — Noted as risk.
10. **Boundary test `MAX_FRAG <= 255`** — Old test still passes; added V2 runtime boundary tests.
11. **`ESPNOW_LR_FILE_DATA_MAX_FRAME_SIZE`** — Kept as V1 default (250); OTA overrides with session value.

---

## Phase 1: Types, Constants, and Session Storage [COMPLETED]

**Risk:** Low | **Dependency:** None | **Status:** Done

### 1.1 `components/esp_tree_common/espnow_types.h` — DONE

- [x] Updated `hop_count` bit definitions: added `ESPNOW_LR_HOPS_V2_MTU_BIT 0x40u`, changed `ESPNOW_LR_HOPS_COUNT_MASK` to `0x0Fu`, added `ESPNOW_LR_HOPS_LIMIT 8`
- [x] Kept `ESPNOW_LR_MAX_HOPS_DEFAULT` at 4
- [x] Updated `ESPNOW_HOPS_MAKE()` macro for new mask
- [x] Updated comment block for new bit layout
- [x] Added `ESPNOW_LR_SESSION_FLAG_V2_MTU`, `ESPNOW_LR_V1_MAX_PAYLOAD`, `ESPNOW_LR_V2_MAX_PAYLOAD`
- [x] Added `session_flags` field to `espnow_join_t` (50→51 bytes)
- [x] Added `session_flags` field to `espnow_join_ack_t` (19→20 bytes)
- [x] Changed `espnow_fragment_assembly_t::lengths` from `vector<uint8_t>` to `vector<uint16_t>`
- [x] Updated `hop_count` comment in `espnow_frame_header_t`
- [x] Added helper functions: `espnow_max_plaintext()`, `espnow_max_entity_fragment()`, `espnow_max_assembly_bytes()`, `espnow_max_total_fragment_bytes()`, `espnow_route_v2_capable()`
- [x] Kept `ESPNOW_LR_ENTITY_PACKET_HEADER_LEN` at 5
- [x] Kept `ESPNOW_LR_FILE_DATA_MAX_FRAME_SIZE` as alias for `ESPNOW_LR_MAX_PAYLOAD`

### 1.2 `components/esp_tree_bridge/bridge_protocol.h` — DONE

- [x] Added `session_max_payload`, `max_entity_fragment`, `max_assembly_bytes`, `max_total_fragment_bytes`, `route_v2_capable`, `leaf_session_flags` to `BridgeSession`
- [x] Removed `max_frame_payload` from `BridgeSession` and `CachedSessionData`
- [x] Added `session_max_payload` to `CachedSessionData`
- [x] Added `set_session_flags(uint8_t flags)` inline method to `BridgeProtocol`
- [x] Added `bridge_session_flags_` member to `BridgeProtocol`
- [x] Added `update_from_mtu()` helper method to `BridgeSession`

### 1.3 `components/esp_tree_remote/remote_protocol.h` — DONE

- [x] Added `route_v2_capable_`, `local_session_flags_`, `bridge_session_flags_`, `session_max_payload_`, `max_entity_fragment_`, `max_assembly_bytes_`, `max_total_fragment_bytes_` to `RemoteProtocol`
- [x] Added `set_session_flags(uint8_t flags)` inline method
- [x] Added `update_mtu_from_route_()` helper method

### 1.4 `tests/b7c_boundary_test.cpp` — DONE

- [x] Updated `test_hop_count_max()` for 4-bit encoding and V2_MTU bit tests
- [x] Added V2 per-session fragmentation value tests
- [x] Added struct size tests for `espnow_join_t` (51) and `espnow_join_ack_t` (20)
- [x] Kept `MAX_FRAG <= 255` test (still passes)
- [x] Added `espnow_route_v2_capable()` tests

### 1.5 `max_frame_payload` references — DONE

- [x] `bridge_protocol.cpp`: Replaced `session.max_frame_payload` with `session.session_max_payload` at all 3 locations
- [x] `bridge_protocol.cpp`: Identity descriptor parsing sets `session.session_max_payload = identity.max_frame_payload` then calls helpers to compute derived values
- [x] `bridge_protocol.cpp`: `CachedSessionData` uses `session_max_payload` instead of `max_frame_payload`
- [x] `tests/parse_helpers_test.cpp`: Pre-existing failure (unrelated to V2), not fixed

### 1.6 Compile & Test — DONE

- [x] `espnow-remote` compiles clean
- [x] `espnow-bridge-c5` compiles clean
- [x] Boundary tests pass

---

## Phase 2: V2_MTU Bit Handling and session_flags Exchange [COMPLETED]

**Risk:** Low | **Dependency:** Phase 1 (done) | **Status:** Done

### Remaining Phase 1 items to implement alongside Phase 2

- [x] Add `update_from_mtu()` method to `BridgeSession` struct in `bridge_protocol.h`:
  ```cpp
  void update_from_mtu() {
      max_entity_fragment = espnow_max_entity_fragment(session_max_payload);
      max_assembly_bytes = espnow_max_assembly_bytes(session_max_payload);
      max_total_fragment_bytes = espnow_max_total_fragment_bytes(session_max_payload);
  }
  ```
- [x] Add `update_mtu_from_route_()` method to `RemoteProtocol` in `remote_protocol.h`:
  ```cpp
  void update_mtu_from_route_() {
      max_entity_fragment_ = espnow_max_entity_fragment(session_max_payload_);
      max_assembly_bytes_ = espnow_max_assembly_bytes(session_max_payload_);
      max_total_fragment_bytes_ = espnow_max_total_fragment_bytes(session_max_payload_);
  }
  ```

### 2.1 Outbound V2_MTU Bit — Bridge (`bridge_protocol.cpp`)

Every outbound frame must set the V2_MTU bit in `hop_count` if `bridge_session_flags_ & ESPNOW_LR_SESSION_FLAG_V2_MTU`. The V2_MTU bit is OR'd into the hop_count after `ESPNOW_HOPS_MAKE()` constructs it. For encrypted session packets, the session's current route capability is used (since the bridge knows the route for downstream traffic).

**Mechanism for bridge outbound frames:**

All bridge→leaf downstream frames use `ESPNOW_HOPS_DIR_DOWN`. The V2_MTU bit represents "this path is V2-capable." The bridge already knows whether the path to this leaf is V2-capable (from `session.route_v2_capable`). So for encrypted session packets, V2_MTU = `session.route_v2_capable`. For pre-session packets (DISCOVER, DISCOVER_ANNOUNCE), V2_MTU = `bridge_session_flags_ & ESPNOW_LR_SESSION_FLAG_V2_MTU` (the bridge's own V2 hardware capability). JOIN_ACK uses `session.route_v2_capable` since it operates in session context.

Specific locations to update:

- [x] `send_encrypted_with_tx_counter_result_()` — this is the core encrypted sender. The `hop_count` parameter comes from callers. Need to OR in V2_MTU bit based on `session.route_v2_capable` when constructing downstream hop_count. **Approach:** Add a helper that computes hop_count with V2_MTU for a given session:
  ```cpp
  uint8_t downstream_hop_count(const BridgeSession &session) {
      uint8_t hc = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 0);
      if (session.route_v2_capable) hc |= ESPNOW_LR_HOPS_V2_MTU_BIT;
      return hc;
  }
  ```
  Then update all callers that currently pass `ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 0)` to use `downstream_hop_count(session)`.

- [x] `send_plain_psk_()` — used for DISCOVER, DISCOVER_ANNOUNCE, JOIN_ACK (pre-session). Add V2_MTU bit if `bridge_session_flags_ & ESPNOW_LR_SESSION_FLAG_V2_MTU`.
- [x] `send_discover_()` (if it constructs hop_count) — V2_MTU bit
- [x] `send_discover_announce_()` — V2_MTU bit
- [x] `send_join_ack_()` / `send_join_complete_()` — V2_MTU bit + `session_flags` in payload
- [x] `send_deauth_()` — V2_MTU bit

### 2.2 Outbound V2_MTU Bit — Remote (`remote_protocol.cpp`)

Same pattern: outbound frames set V2_MTU bit if `local_session_flags_ & ESPNOW_LR_SESSION_FLAG_V2_MTU`. For upstream frames (leaf→bridge), V2_MTU = `local_session_flags_ & ESPNOW_LR_SESSION_FLAG_V2_MTU` (the device's own V2 capability). For relay-forwarded frames, preserve the incoming V2_MTU bit.

- [x] `send_frame_()` — core sender. Pre-session packets: OR V2_MTU from `local_session_flags_`. Encrypted packets: OR V2_MTU from `route_v2_capable_` (since the leaf knows the path to the bridge via the same route it receives on).
- [x] `send_discover_()` — V2_MTU from `local_session_flags_`
- [x] `send_join_()` — V2_MTU + `session_flags` in payload
- [x] `send_state_()` — V2_MTU based on `route_v2_capable_`
- [x] `send_schema_push_()` / `send_identity_descriptor_()` — V2_MTU
- [x] `send_heartbeat_()` — V2_MTU
- [x] `send_schema_request_()` — V2_MTU
- [x] `send_deauth_()` — V2_MTU

### 2.3 Inbound V2_MTU Bit — Bridge (`bridge_protocol.cpp`)

On every received frame from a known session, extract V2_MTU bit from `header.hop_count` and update `session.route_v2_capable` and `session.session_max_payload`.

**Helper function to add:**
```cpp
void update_session_mtu_(BridgeSession &session, uint8_t hop_count) {
    bool v2 = espnow_route_v2_capable(hop_count);
    if (v2 != session.route_v2_capable) {
        ESP_LOGI(TAG, "Session MTU change: leaf=%s v2_path=%d -> %d", 
                 mac_hex(session.leaf_mac.data()).c_str(), 
                 session.route_v2_capable, v2);
        session.route_v2_capable = v2;
        session.session_max_payload = v2 ? ESPNOW_LR_V2_MAX_PAYLOAD : ESPNOW_LR_V1_MAX_PAYLOAD;
        session.update_from_mtu();
    }
}
```

Specific handlers to update:

- [x] `handle_join_()` — read `join.session_flags` into `session.leaf_session_flags`, extract V2_MTU from `header.hop_count`, call `update_session_mtu_()`
- [x] `handle_state_()` — call `update_session_mtu_(session, header.hop_count)`
- [x] `handle_schema_push_()` — same
- [x] `handle_heartbeat_()` — same
- [x] `handle_command_()` — same (bridge receives commands from remote? No — bridge sends commands. But it receives state. Check if there's a handle_command on bridge.)
- [x] `handle_identity_descriptor_()` — same
- [x] `handle_deauth_()` — same (though session may be invalidated)
- [x] `handle_ack_()` — same

### 2.4 Inbound V2_MTU Bit — Remote (`remote_protocol.cpp`)

Same pattern. Add helper:

```cpp
void RemoteProtocol::update_route_mtu_(uint8_t hop_count) {
    bool v2 = espnow_route_v2_capable(hop_count);
    if (v2 != route_v2_capable_) {
        ESP_LOGI(TAG, "Route MTU change: v2_path=%d -> %d", route_v2_capable_, v2);
        route_v2_capable_ = v2;
        session_max_payload_ = v2 ? ESPNOW_LR_V2_MAX_PAYLOAD : ESPNOW_LR_V1_MAX_PAYLOAD;
        update_mtu_from_route_();
    }
}
```

Specific handlers:

- [x] `handle_discover_announce_()` — extract V2_MTU from `header.hop_count`, call `update_route_mtu_()`
- [x] `handle_join_ack_()` — read `join_ack.session_flags` into `bridge_session_flags_`, extract V2_MTU from `header.hop_count`, call `update_route_mtu_()`
- [x] `handle_state_ack_()` — same
- [x] `handle_command_()` — same
- [x] `handle_heartbeat_()` — same
- [x] `handle_schema_push_()` — same
- [x] `handle_schema_request_()` — same

### 2.5 Relay V2_MTU Bit Preservation (`remote_protocol.cpp`)

- [x] `forward_frame_()` — update hop_count reconstruction:
  ```cpp
  hdr->hop_count = ESPNOW_HOPS_MAKE(
      header.hop_count & ESPNOW_LR_HOPS_DIR_BIT,
      ESPNOW_HOPS_COUNT(header.hop_count) + hop_count_delta
  ) | (header.hop_count & ESPNOW_LR_HOPS_V2_MTU_BIT);
  ```

### 2.6 Frame Validation

- [x] `bridge_protocol.cpp` `parse_frame_()` — Add upper bound: `if (len > ESPNOW_LR_V2_MAX_PAYLOAD) return false;`
- [x] `remote_protocol.cpp` `parse_frame_()` — Add upper bound: `if (len > ESPNOW_LR_V2_MAX_PAYLOAD) return false;`
- [x] `bridge_protocol.cpp` `on_espnow_frame()` — After `get_session()` succeeds and before `validate_session_packet_()`, add session-level validation: `if (data_len > session.session_max_payload) { ESP_LOGW(...); return false; }`
- [x] `remote_protocol.cpp` `on_espnow_frame()` — Same session-level validation after session lookup

### 2.7 V2 Radio Detection — Component Layer

- [x] `esp_tree_bridge.cpp` — After `esp_now_init()`, add:
  ```cpp
  uint32_t espnow_version = 1;
  #if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 4, 0)
  esp_now_get_version(&espnow_version);
  #endif
  if (espnow_version >= 2) {
      protocol_.set_session_flags(ESPNOW_LR_SESSION_FLAG_V2_MTU);
  }
  ```
- [x] `esp_tree_remote.cpp` — Same V2 radio detection

### 2.8 Identity Descriptor MTU Initialization

Currently `session.session_max_payload` is initialized to `ESPNOW_LR_V1_MAX_PAYLOAD` (250) in the JOIN handler, then updated to `identity.max_frame_payload` in the identity descriptor handler. After Phase 2, the identity descriptor handler should NOT override `session_max_payload` — it's driven by the V2_MTU path bit instead.

- [x] In `handle_identity_descriptor_()` where `session.session_max_payload = identity.max_frame_payload;` is set: remove this line. The session MTU is already set by the V2_MTU bit path. The identity descriptor's `max_frame_payload` can be logged for diagnostics but should not override the path-derived MTU.
- [x] Keep the log line but update it to show both identity-reported MTU and path-derived MTU for comparison.

### 2.9 Compile & Test

- [x] `./compile.sh espnow-remote espnow-bridge-c5` — compile both
- [x] Flash to V1 hardware and verify:
  - V2_MTU bit is not set in hop_count (V1 device)
  - `session_flags` in JOIN/JOIN_ACK is 0x00
  - `session_max_payload` stays at 250
  - All existing functionality unaffected
  - Boundary tests pass

---

## Phase 3: Dynamic Fragmentation

**Risk:** Medium | **Dependency:** Phases 1, 2

### 3.1 `components/esp_tree_bridge/bridge_protocol.cpp`

- [x] **`store_fragment_()`**: Add `uint16_t max_entity_fragment` parameter. Replace all `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` with the parameter:
  - `reserved = view.fragment_count * max_entity_fragment`
  - `offset = view.fragment_index * max_entity_fragment`
  - `assembly.lengths[view.fragment_index] = static_cast<uint16_t>(view.value_len)`
  - Update all call sites to pass `session.max_entity_fragment`
- [x] **`assemble_fragment_payload_()`**: Add `uint16_t max_entity_fragment` parameter. Replace `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` in offset calculation.
  - Update all call sites
- [x] **`send_command_fragments_()`**: Replace `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` with `espnow_max_entity_fragment(session.session_max_payload)` for chunk count and offset calculations.
- [x] **`send_encrypted_()` / `send_encrypted_with_tx_counter_result_()`**: Replace `ESPNOW_LR_MAX_PAYLOAD` plaintext validation with session-derived limit `espnow_max_plaintext(session.session_max_payload)`.
- [x] **`handle_state_()` / `handle_schema_push_()`**: Use `session.max_entity_fragment` and `session.max_total_fragment_bytes`.
- [x] **Session-level assembly tracking**: Replace `ESPNOW_LR_MAX_FRAGMENT_ASSEMBLY_BYTES` with `session.max_assembly_bytes`, `ESPNOW_LR_MAX_TOTAL_FRAGMENT_BYTES_PER_SESSION` with `session.max_total_fragment_bytes`.
- [x] **`schema_reserved_bytes_` / `state_reserved_bytes_`**: Use `session.max_entity_fragment` for reservation: `fragment_count * session.max_entity_fragment`.

### 3.2 `components/esp_tree_remote/remote_protocol.cpp`

- [x] **`store_fragment_()`**: Same changes as bridge side — add `uint16_t max_entity_fragment` parameter, replace constant.
- [x] **`assemble_fragment_payload_()`**: Same changes as bridge side.
- [x] **`send_state_()`**: Replace `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` with `espnow_max_entity_fragment(session_max_payload_)`.
- [x] **`send_schema_push_()` / `send_identity_descriptor_()`**: Use per-session max for fragmentation.
- [x] **`pending_command_reserved_bytes_`**: Use `max_entity_fragment_` for reservation.
- [x] **Assembly limits**: Use per-session `max_assembly_bytes_` and `max_total_fragment_bytes_`.

### 3.3 `components/esp_tree_common/espnow_crypto.cpp`

- [x] In `espnow_crypto_encrypt` and `espnow_crypto_decrypt`: Change `std::vector<uint8_t> data(11 + ESPNOW_LR_MAX_PAYLOAD)` to `std::vector<uint8_t> data(11 + ESPNOW_LR_V2_MAX_PAYLOAD)`.

### 3.4 `components/esp_tree_bridge/bridge_ota_manager.h` / `.cpp`

- [x] Update `start_transfer()` to accept `remote_max_frame_payload` from session, passed through to `clamp_chunk_size_()`
- [x] `clamp_chunk_size_()` no longer caps at V1 — returns `remote_max_frame_payload - FILE_DATA_HEADER_OVERHEAD`
- [x] `send_chunk_()` uses `max_encrypted_plaintext_` for payload validation
- [x] `ESPNOW_LR_FILE_DATA_MAX_FRAME_SIZE` stays as V1 default (250). OTA code passes session value from call site.

### 3.5 `value_len` derivation

- [x] In `parse_entity_payload()`: authoritative fragment length is `plaintext_len - sizeof(espnow_entity_packet_header_t)`. The `header->value_len` field is informational (capped at 255 for V2).
- [x] This affects `EntityPayloadView::value_len` assignment — set it to the frame-derived length.

### 3.6 Compile & Test

- [x] `./compile.sh espnow-remote espnow-bridge-c5`
- [x] Flash and verify V1 (250-byte) sessions still work correctly
- [x] Temporarily forced `session_max_payload = 1470` tested implicitly via V2 radio on C5/C3 hardware
- [x] Verified OTA chunk scaling logic on hardware (750-byte web chunks, V2 radio path)

---

## Phase 4: OTA V2 Chunk Scaling [COMPLETED]

**Risk:** Low | **Dependency:** Phase 3 | **Status:** Done

### 4.1 OTA Manager Changes

- [x] Thread session `max_payload` through to `BridgeOTAManager` via `start_transfer()` `remote_max_frame_payload` parameter
- [x] At call sites in `esp_tree_bridge.cpp`, pass `session->session_max_payload`
- [x] `clamp_chunk_size_()`, `calc_total_chunks_()`, `send_chunk_()` use the session-derived max

### 4.2 OTA Bug Fix — FileReceiver chunk size propagation

- [x] `FileReceiver::set_max_chunk_size()` made out-of-line in `.cpp` to propagate to `ota_flash_handler_.set_max_chunk_size()`
- [x] `update_route_mtu_()` on remote now calls `file_receiver_.set_max_chunk_size()` when MTU changes
- [x] `OTAFlashHandler` has own `max_chunk_size_` / `set_max_chunk_size()` member

### 4.3 Web OTA POST Body Limit Fix

- [x] ESPHome `web_server_idf` has 1024-byte POST body limit (`CONFIG_HTTPD_MAX_REQ_HDR_LEN`)
- [x] Web `/api/ota/start` handler caps `remote_max` to `750 + FILE_DATA_HEADER_OVERHEAD` (791) so negotiated chunk stays under 1024-byte Content-Length when base64url-encoded
- [x] `decode_base64_` table updated: space (0x20) maps to value 62 (for `+` → space via `url_decode`), `-` maps to 62, `_` maps to 63 (base64url support)
- [x] JS `sendChunk()` uses base64url encoding: `btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')`
- [x] Non-web OTA paths (MQTT, future APIs) are unaffected — they pass full V2 `remote_max`

### 4.4 Verify

- [x] OTA still works with V1 (250-byte) sessions
- [x] OTA chunk size scales with V2 session MTU when available
- [x] Web OTA works with 750-byte chunks within 1024-byte POST body limit

---

## Phase 5: V2 Radio Detection and Hardware Validation [IN PROGRESS]

**Risk:** High | **Dependency:** Phase 3
**Note:** Requires physical C5/C6 hardware running IDF >= 5.4.

- [x] Verify on C5 hardware that `esp_now_get_version()` returns 2
- [x] Verify `esp_now_send()` works with frames > 250 bytes on C5
- [x] Verify receive callback handles `data_len` up to 1470 on C5
- [x] Verify C3 also returns V2 from `esp_now_get_version()`
- [x] Verify session MTU negotiation: V2 leaf + V2 bridge → 1470
- [x] Verify V1 (ESP32 original) returns version 1 → stays at 250
- [ ] Verify V2 leaf → V1 relay → V2 bridge → 250 (path downgrade, multi-hop test)
- [ ] Verify automatic MTU upgrade when path changes from V1 to V2 relay

---

## Phase 6: Diagnostics

**Risk:** Low | **Dependency:** Phase 2

### 6.1 `components/esp_tree_bridge/esp_tree_bridge.cpp`

- [x] Add to topology JSON handler per-remote fields:
  - `session_max_payload` (uint16_t)
  - `route_v2_capable` (bool)
  - `leaf_session_flags` (uint8_t)
  - `bridge_session_flags` (uint8_t) — same for all remotes
- [x] Add topology badge rendering: 🐘 emoji for V2-capable devices

### 6.2 Diagnostic sensor

- [ ] Expose a read-only sensor per remote showing session MTU:
  - 250 → "V1 (250 bytes)"
  - 1470 → "V2 (1470 bytes)"
- [ ] Show device capability separately from path capability to enable "V2 device behind V1 relay" diagnosis

---

## Spec Doc Updates (After Implementation)

When the code changes are complete, update `docs/espnow_v3_spec.md` to reflect:

- [ ] New `hop_count` byte encoding (bit 6 = V2_MTU, bits 3-0 = count, hard limit 8)
- [ ] Per-path MTU discovery mechanism
- [ ] `session_flags` in JOIN/JOIN_ACK (diagnostic)
- [ ] `value_len` derivation from frame length for V2
- [ ] V2 MTU constants and per-session fragmentation
- [ ] OTA chunk scaling per session
- [ ] Updated coexistence matrix (V1 relays allowed)
- [ ] Remove references to V2-only relay gate