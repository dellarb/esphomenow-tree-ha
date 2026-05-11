# ESPNOW V2.0 Support Roadmap

## Overview

Add support for ESP-NOW V2 radio (ESP32-C5/C6, ~1470 byte max payload) with coexistence of V1 and V2 radio capabilities on the same network. The design uses **per-path MTU discovery via the V2_MTU bit in the frame header's `hop_count` byte**: each bridge↔leaf pair dynamically discovers the maximum frame size the path supports, based on whether any V1 relay is in the path.

**All devices must run the new firmware.** This is a wire-format change (JOIN/JOIN_ACK gain a `session_flags` byte, `hop_count` bit layout changes), not a protocol version bump — `ESPNOW_LR_PROTOCOL_VER` stays at 3 and all devices will be reflashed. "V1 compatibility" means V1 radio capability after reflashing new firmware, not interoperability with old firmware.

**Design principle: V1 relays are allowed.** V1 devices CAN relay. The `hop_count` V2_MTU bit automatically downgrades the path MTU when a V1 relay is in the path. V2 relays preserve the bit; V1 relays naturally strip it (current relay code only preserves the direction bit). No relay payload modification is needed — the frame header bit does all the work.

**No protocol version bump.** `ESPNOW_LR_PROTOCOL_VER` stays at 3. All devices will be reflashed during development. The V2 radio capability is a transport-layer property discovered per-path, not a protocol revision.

---

## Current State (Protocol V3)

| Constant | Value | Notes |
|----------|-------|-------|
| `ESPNOW_LR_MAX_PAYLOAD` | 250 | Hardcoded, global |
| `ESPNOW_LR_MAX_ENCRYPTED_PLAINTEXT` | 225 | `250 - 17 (header) - 8 (session_tag)` |
| `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` | 220 | `225 - 5 (entity header)` |
| Protocol version | 3 | Hard check on every frame; mismatched = drop |

All pre-session packets (DISCOVER, DISCOVER_ANNOUNCE, JOIN, JOIN_ACK) are well under 250 bytes. Session-keyed packets (STATE, COMMAND, HEARTBEAT, SCHEMA_PUSH, etc.) use the hardcoded 250-byte limit for fragmentation.

---

## V2.0 Protocol Design

### Per-Path MTU Discovery via hop_count V2_MTU Bit

The V2_MTU path flag lives in the frame header's `hop_count` byte — it is present on **every frame**, not just JOIN/JOIN_ACK. Both endpoints observe this bit on received frames to dynamically track path V2 capability.

**New `hop_count` byte encoding:**

```
bit 7   : direction flag — 0 = upstream (leaf→bridge), 1 = downstream (bridge→leaf)
bit 6   : V2_MTU path flag — 1 = V2-capable path, 0 = V1 path
bits 5-4: reserved (send as 0)
bits 3-0 : hop count value (0..15, hard protocol limit of 8)
```

Previous encoding was bit 7 = direction, bits 6-0 = hop count (0..127). The new encoding reduces max hops from 127 to 15 (hard limit 8), with `ESPNOW_LR_HOPS_DEFAULT` remaining at 5.

**How the V2_MTU bit works:**

1. **Sender** sets V2_MTU bit if the device is V2-capable (`local_session_flags & ESPNOW_LR_SESSION_FLAG_V2_MTU`)
2. **V2 relay** preserves V2_MTU bit when forwarding (adds `header.hop_count & ESPNOW_LR_HOPS_V2_MTU_BIT` to reconstructed hop_count)
3. **V1 relay** strips V2_MTU bit — current `forward_frame_()` code naturally strips it because it only preserves the direction bit
4. **Receiver** observes V2_MTU bit on every received frame, maintaining `session.route_v2_capable`

**MTU derivation:**

```
session_max_payload = session.route_v2_capable ? ESPNOW_LR_V2_MAX_PAYLOAD : ESPNOW_LR_V1_MAX_PAYLOAD
```

**Update rules:**
- **Downgrade immediately** when any frame arrives with V2_MTU=0
- **Upgrade immediately** when any frame arrives with V2_MTU=1
- **Start at V1** (250 bytes) — no assumption about path capability until frames are observed

Since DISCOVER, DISCOVER_ANNOUNCE, JOIN, and JOIN_ACK all carry V2_MTU in their frame headers, both sides know path capability before any data packets are sent. A V2 leaf joining through a V2 path effectively starts at V2 MTU right after the JOIN/JOIN_ACK exchange — the upgrade happens on those very first frames.

### session_flags in JOIN / JOIN_ACK (Diagnostic Only)

`session_flags` is added to JOIN and JOIN_ACK payloads for **diagnostics only** — it tells the other side what the device *could* do, separate from what the path *can* do. It is never used to compute session MTU.

```c
#define ESPNOW_LR_SESSION_FLAG_V2_MTU  0x01  // bit 0: device is V2-capable
// bits 1-7: reserved for future use
```

A device sets `ESPNOW_LR_SESSION_FLAG_V2_MTU` in its `session_flags` if it has an ESP-NOW V2 radio (C5/C6). This is purely informational — the UI can show "V2 device behind V1 relay" to help users diagnose path bottlenecks or reconfigure relay topology.

### Packet Sizing Invariant

- **All control packets must fit within V1 MTU (250 bytes).** This includes DISCOVER, DISCOVER_ANNOUNCE, JOIN, JOIN_ACK, ACK, HEARTBEAT, DEAUTH, and SCHEMA_REQUEST.
- **Only payload-bearing entity/session data packets are allowed to fragment.** In the current protocol this means STATE, COMMAND, and SCHEMA_PUSH.
- **Fragmentation is automatic and session-scoped.** If a fragmentable packet exceeds the session's max payload, it must be split into fragments sized against that session's `max_payload`.
- **Single-frame packets remain single-frame.** Small control packets should never rely on fragmentation to be valid.

### MTU Constants

```c
#define ESPNOW_LR_V1_MAX_PAYLOAD  250
#define ESPNOW_LR_V2_MAX_PAYLOAD  1470
```

### Per-Session Dynamic Fragmentation Constants

Replace the current hardcoded compile-time constants with per-session runtime values:

| Current (compile-time) | V2 (per-session runtime) |
|------------------------|--------------------------|
| `ESPNOW_LR_MAX_PAYLOAD` (250) | `session.max_payload` (250 or 1470) |
| `ESPNOW_LR_MAX_ENCRYPTED_PLAINTEXT` (225) | `session.max_plaintext = session.max_payload - 17 - 8` |
| `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` (220) | `session.max_entity_fragment = session.max_plaintext - 5` |

Entity header stays 5 bytes. No entity payload format changes.

### Relay Behavior

- **V1 devices CAN relay.** A V1 relay naturally strips the V2_MTU bit from the frame header when forwarding, causing both endpoints to see V1 path capability and use 250-byte frames.
- **V2 relays preserve the V2_MTU bit.** The `forward_frame_()` function must be updated to preserve `ESPNOW_LR_HOPS_V2_MTU_BIT` when reconstructing the `hop_count` byte.
- **No relay payload modification.** Relays never touch payload bytes — only the frame header `hop_count` byte. This is unchanged from current behavior, just the bit preservation logic changes.
- **Relay capability bit in DISCOVER** is NOT gated on V2 hardware. Any device with `relay_enabled: true` can advertise relay capability.

### Dynamic Path Changes

The V2_MTU bit is observed on every frame, enabling automatic MTU adjustment when the path changes:

- **V2 leaf on V1 path → V2 relay appears with shorter path:** Leaf switches to new relay, sees V2_MTU=1 on downstream frames, upgrades session MTU to 1470 immediately. No re-join required.
- **V2 leaf on V2 path → V2 relay goes away, path routes through V1 relay:** Leaf sees V2_MTU=0 on downstream frames, downgrades session MTU to 250 immediately. No data loss (next frame is already 250 or smaller).
- **Bridge observes V2_MTU bit on upstream frames from leaf:** Upgrades/downgrades symmetrically.

---

## Protocol Changes

### 1. `espnow_types.h` — New Constants and hop_count Redefinition

**Add:**
```c
#define ESPNOW_LR_SESSION_FLAG_V2_MTU  0x01
#define ESPNOW_LR_V1_MAX_PAYLOAD  250
#define ESPNOW_LR_V2_MAX_PAYLOAD  1470

// hop_count byte encoding (V2):
// bit 7   : direction flag (ESPNOW_LR_HOPS_DIR_BIT)
// bit 6   : V2_MTU path flag (ESPNOW_LR_HOPS_V2_MTU_BIT)
// bits 5-4: reserved (0)
// bits 3-0: hop count (0..15, hard protocol limit 8)
#define ESPNOW_LR_HOPS_V2_MTU_BIT  0x40u
#define ESPNOW_LR_HOPS_COUNT_MASK  0x0Fu
#define ESPNOW_LR_HOPS_MAX         8
#define ESPNOW_LR_HOPS_DEFAULT     5
```

**Update macros:**
```c
#define ESPNOW_HOPS_MAKE(dir, count) \
    ((uint8_t)(((dir) & ESPNOW_LR_HOPS_DIR_BIT) | ((count) & ESPNOW_LR_HOPS_COUNT_MASK)))
#define ESPNOW_HOPS_COUNT(h) ((uint8_t)((h) & ESPNOW_LR_HOPS_COUNT_MASK))
// ESPNOW_HOPS_DIR_BIT, ESPNOW_HOPS_IS_UPSTREAM, ESPNOW_HOPS_IS_DOWNSTREAM unchanged
```

**Keep** `ESPNOW_LR_MAX_PAYLOAD` as the default (250) for use in pre-session packet validation where no session context exists yet.

**Keep** `ESPNOW_LR_PROTOCOL_VER` at 3.

**Keep** `ESPNOW_LR_ENTITY_PACKET_HEADER_LEN` at 5. Entity payload format is unchanged.

### 2. `espnow_join_t` — Add `session_flags` Field

**Current (50 bytes):**
```c
typedef struct __attribute__((packed)) {
    uint8_t remote_nonce[16];    // 16
    uint8_t schema_hash[32];     // 32
    uint8_t hops_to_bridge;      // 1
    uint8_t dirty_count;         // 1
} espnow_join_t;                 // = 50
```

**New (51 bytes):**
```c
typedef struct __attribute__((packed)) {
    uint8_t remote_nonce[16];    // 16
    uint8_t schema_hash[32];     // 32
    uint8_t hops_to_bridge;      // 1
    uint8_t dirty_count;         // 1
    uint8_t session_flags;       // 1  — diagnostic: ESPNOW_LR_SESSION_FLAG_V2_MTU etc.
} espnow_join_t;                 // = 51
```

50 → 51 bytes. Well under 250-byte pre-session limit. Leaf declares its device capabilities (diagnostic only, not used for MTU).

### 3. `espnow_join_ack_t` — Add `session_flags` Field

**Current (19 bytes):**
```c
typedef struct __attribute__((packed)) {
    uint8_t accepted;            // 1
    uint8_t reason;              // 1
    uint8_t stage;               // 1
    uint8_t bridge_nonce[16];    // 16
} espnow_join_ack_t;            // = 19
```

**New (20 bytes):**
```c
typedef struct __attribute__((packed)) {
    uint8_t accepted;            // 1
    uint8_t reason;              // 1
    uint8_t stage;               // 1
    uint8_t bridge_nonce[16];    // 16
    uint8_t session_flags;       // 1  — diagnostic: ESPNOW_LR_SESSION_FLAG_V2_MTU etc.
} espnow_join_ack_t;            // = 20
```

19 → 20 bytes. Still well under 250. Bridge declares its device capabilities (diagnostic only).

### 4. DISCOVER / DISCOVER_ANNOUNCE — No Wire Format Changes

No new bits are added to `capability_flags` or `flags`. These packets are local (1-hop) and don't carry the V2_MTU path signal — that comes from the `hop_count` V2_MTU bit on relayed packets (JOIN, JOIN_ACK, HEARTBEAT, etc.).

The relay capability bit in DISCOVER `capability_flags` is NOT gated on V2 hardware. Any device with `relay_enabled: true` can advertise relay capability.

### 5. Entity Payload — No Changes

The entity packet header (`espnow_entity_packet_header_t`) stays at 5 bytes. `value_len` stays `uint8_t`. No wire format changes to entity payloads.

For V2 sessions where a fragment's actual value length exceeds 255 bytes, the receiver derives the authoritative length from `plaintext_len - sizeof(espnow_entity_packet_header_t)`. The `value_len` field in the header is informational — it is set to `min(actual_length, 255)` by the sender. The receiver always uses the frame-derived length as the authoritative value.

For V1 sessions, `value_len` accurately reflects the fragment length (always ≤ 220). No behavioral change for V1.

### 6. `espnow_fragment_assembly_t::lengths` Type Change

`lengths` changes from `std::vector<uint8_t>` to `std::vector<uint16_t>` — internal only, not a wire format change. V2 fragments can have value lengths > 255 which don't fit in `uint8_t`.

### 7. Frame Header — No Structural Changes

The `espnow_frame_header_t` struct stays at 17 bytes with the same fields. The only change is the **interpretation** of the `hop_count` byte (new bit layout with V2_MTU bit and 4-bit count).

---

## Implementation Phases

### Phase 1: Types, Constants, and Session Storage

**Files:** `espnow_types.h`, `bridge_protocol.h`, `remote_protocol.h`

1. Add hop_count bit constants (`ESPNOW_LR_HOPS_V2_MTU_BIT`, `ESPNOW_LR_HOPS_COUNT_MASK`, `ESPNOW_LR_HOPS_MAX`, `ESPNOW_LR_HOPS_DEFAULT`)
2. Update `ESPNOW_HOPS_MAKE` and `ESPNOW_HOPS_COUNT` macros for new 4-bit count field
3. Add `ESPNOW_LR_SESSION_FLAG_V2_MTU`, `ESPNOW_LR_V1_MAX_PAYLOAD`, `ESPNOW_LR_V2_MAX_PAYLOAD` constants
4. Add `session_flags` field to `espnow_join_t` (50→51 bytes) and `espnow_join_ack_t` (19→20 bytes)
5. Change `espnow_fragment_assembly_t::lengths` from `std::vector<uint8_t>` to `std::vector<uint16_t>`
6. Add to `BridgeSession`:
   - `bool route_v2_capable{false}` — learned from V2_MTU bit on received frames
   - `uint8_t leaf_session_flags{0}` — diagnostic, learned from JOIN
   - `uint16_t session_max_payload{ESPNOW_LR_V1_MAX_PAYLOAD}` — derived from `route_v2_capable`
7. Add to `RemoteSession` / `RemoteProtocol`:
   - `bool route_v2_capable{false}` — learned from V2_MTU bit on received frames
   - `uint8_t local_session_flags{0}` — set by component layer after hardware detection
   - `uint8_t bridge_session_flags{0}` — diagnostic, learned from JOIN_ACK
   - `uint16_t session_max_payload{ESPNOW_LR_V1_MAX_PAYLOAD}` — derived from `route_v2_capable`
8. Add helper functions:
   ```c
   static inline uint16_t espnow_max_plaintext(uint16_t max_payload) {
       return max_payload - ESPNOW_LR_HEADER_WITH_PSK_TAG_LEN - ESPNOW_LR_SESSION_TAG_LEN;
   }
   static inline uint16_t espnow_max_entity_fragment(uint16_t max_payload) {
       return espnow_max_plaintext(max_payload) - ESPNOW_LR_ENTITY_PACKET_HEADER_LEN;
   }
   ```
9. Update `static_assert` for `espnow_join_t` (51 bytes) and `espnow_join_ack_t` (20 bytes)
10. Update `static_assert` for `espnow_entity_packet_header_t` — stays 5 bytes, unchanged

### Phase 2: hop_count V2_MTU Bit and session_flags Exchange

**Files:** `bridge_protocol.cpp`, `remote_protocol.cpp`

1. **All senders**: Set V2_MTU bit in `hop_count` on outgoing frames if the device is V2-capable. This applies to ALL packet types (DISCOVER, JOIN, JOIN_ACK, STATE, COMMAND, HEARTBEAT, etc.) — every frame carries the device's V2 capability.

2. **All receivers**: Extract V2_MTU bit from the received frame's `hop_count`. Update `session.route_v2_capable`:
   - V2_MTU=1 observed → `route_v2_capable = true`, `session_max_payload = ESPNOW_LR_V2_MAX_PAYLOAD`
   - V2_MTU=0 observed → `route_v2_capable = false`, `session_max_payload = ESPNOW_LR_V1_MAX_PAYLOAD`
   - **Downgrade immediately** on V2_MTU=0, **upgrade immediately** on V2_MTU=1

3. **Bridge `handle_join_()`**: Read `session_flags` from JOIN payload (diagnostic storage). Observe V2_MTU bit from JOIN frame's `hop_count`. Store `session.route_v2_capable`. Log path capability.

4. **Bridge `send_join_ack_()`**: Set `session_flags` in JOIN_ACK payload (diagnostic). Set V2_MTU bit in frame `hop_count` based on `session.route_v2_capable` (path-derived, matching the session context).

5. **Remote `handle_join_ack_()`**: Read `session_flags` from JOIN_ACK payload (diagnostic storage). Observe V2_MTU bit from JOIN_ACK frame's `hop_count`. Store `route_v2_capable`. Log path capability.

6. **Remote `forward_frame_()`**: Preserve V2_MTU bit when forwarding:
   ```cpp
   hdr->hop_count = ESPNOW_HOPS_MAKE(
       header.hop_count & ESPNOW_LR_HOPS_DIR_BIT,
       ESPNOW_HOPS_COUNT(header.hop_count) + hop_count_delta
   ) | (header.hop_count & ESPNOW_LR_HOPS_V2_MTU_BIT);
   ```
   V2 relays preserve the bit. V1 relays naturally strip it because current code only preserves direction bit — no change needed to V1 relay code.

7. **`set_session_flags()`**: Both `BridgeProtocol` and `RemoteProtocol` get a `set_session_flags(uint8_t flags)` method called by the component layer after hardware detection. This sets `local_session_flags_` which determines whether V2_MTU bit is set on outgoing frames.

8. **Terminal logging**: Log V2_MTU path capability changes and session_flags at JOIN/JOIN_ACK.

9. **Initial session MTU**: Both sides start at V1 (250 bytes). After observing V2_MTU bit on JOIN/JOIN_ACK frames, upgrade immediately if bit is set. Since JOIN/JOIN_ACK traverse the full path, the V2_MTU observation on these frames is authoritative for the full route.

### Phase 3: Dynamic Fragmentation

**Files:** `bridge_protocol.cpp`, `remote_protocol.cpp`, `espnow_types.h`

This is the core change. Every place that currently uses `ESPNOW_LR_MAX_PAYLOAD`, `ESPNOW_LR_MAX_ENCRYPTED_PLAINTEXT`, or `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` must be converted to use per-session values.

#### Bridge side:

1. **`send_encrypted_()` / `send_encrypted_with_tx_counter_()`:** Validate `plaintext_len` against `session.max_payload`-derived plaintext limit. Frame length must not exceed `session.max_payload`.

2. **`send_command_fragments_()`:** Replace `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` with `espnow_max_entity_fragment(session.session_max_payload)`.

3. **`parse_frame_()` — two-level frame validation:**
   - Transport-level: Accept frames up to `ESPNOW_LR_V2_MAX_PAYLOAD` (1470). This global ceiling allows V2 frames from any source.
   - Session-level: After session lookup, validate that frame length does not exceed `session.session_max_payload`. Reject oversized frames with a log warning.
   - `ESPNOW_LR_MAX_PAYLOAD` (250) becomes the pre-session default only.

4. **Fragment assembly limits per-session:**

   | Parameter | V1 | V2 | Formula |
   |-----------|-----|-----|---------|
   | `max_assembly_bytes` | 1,326 | 8,646 | `max_entity_fragment * 6` |
   | `max_total_fragment_bytes` | 5,304 | 34,584 | `max_assembly_bytes * 4` |

   These are computed per-session from `session_max_payload`. Assembly uses worst-case reservation (`fragment_count * max_entity_fragment`) — single code path for V1 and V2 (Option A).

5. **`store_fragment_()` and `assemble_fragment_payload_()`:** Accept `max_entity_fragment` parameter. Replace `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` with the parameter for offset calculations and reservation. Update `lengths` vector from `uint8_t` to `uint16_t` assignments.

6. **`handle_state_()` / `handle_schema_push_()`:** Use per-session `max_entity_fragment` when parsing entity payloads.

7. **Session-level assembly byte tracking:** Use `session.max_entity_fragment` for reservation (`fragment_count * max_entity_fragment`). Compare against per-session `max_total_fragment_bytes`.

#### Remote side:

1. **`send_state_()`:** Replace `ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN` with `espnow_max_entity_fragment(session_max_payload_)`.

2. **`send_schema_push_()` / `send_identity_descriptor_()`:** Use per-session max for fragmentation decisions.

3. **`send_frame_()`:** Validate frame length against `session_max_payload_` for encrypted packets, 250 for pre-session packets.

4. **`handle_command_()`:** Use per-session max for fragment reassembly.

5. **Relay `forward_frame_()`:** Update to preserve V2_MTU bit (Phase 2 change). No frame size changes — relays forward whatever they receive.

6. **`parse_frame_()`:** Same two-level validation as bridge side.

#### Component layer (both bridge and remote):

1. **Stack buffers in `esp_tree_remote.cpp`:** The 21 `uint8_t value[ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN]` allocations stay at 220 bytes. Do NOT resize for V2. These encode tiny fixed-width values (1-5 bytes) and the MTU-sized buffer is just convenience. Tightening to actual payload sizes is separate cleanup.

2. **Bridge `esp_tree_bridge.cpp` line 651:** `value.resize(ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN)` for NUMBER entity stays as-is. Do not resize for V2.

3. **Crypto layer `espnow_crypto.cpp`:** Lines 233 and 279 allocate `std::vector<uint8_t> data(11 + ESPNOW_LR_MAX_PAYLOAD)`. Change to `11 + ESPNOW_LR_V2_MAX_PAYLOAD` (fixed upper bound of 1481 bytes). No session coupling needed.

4. **`value_len` derivation for V2:** In `parse_entity_payload()` and fragment assembly, the authoritative fragment length is `plaintext_len - sizeof(espnow_entity_packet_header_t)`. The `value_len` field in the entity header is informational (capped at 255 for V2). Receiver always uses the frame-derived length.

### Phase 4: OTA V2 Chunk Scaling

**Files:** `bridge_ota_manager.h`, `bridge_ota_manager.cpp`, `esp_tree_bridge.cpp`

1. `ESPNOW_LR_FILE_DATA_MAX_FRAME_SIZE` becomes per-session — use `session.max_payload` instead of hardcoded `ESPNOW_LR_MAX_PAYLOAD`.

2. `clamp_chunk_size_()` already accepts `remote_max_frame_payload` — feed `session.max_payload` through it.

3. V2 sessions send up to ~1462-byte chunks (1470 frame - 8 bytes file data header overhead), ~6.7x throughput improvement for firmware updates.

### Phase 5: V2 Radio Detection (Component Layer)

**Files:** `esp_tree_bridge.cpp`, `esp_tree_remote.cpp`

The component layer owns hardware detection. After `esp_now_init()`, detect V2 capability and pass to protocol engine:

```c
uint32_t espnow_version = 1;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 4, 0)
esp_now_get_version(&espnow_version);
#endif
if (espnow_version >= 2) {
    protocol_.set_session_flags(ESPNOW_LR_SESSION_FLAG_V2_MTU);
}
```

**Three runtime scenarios:**

| IDF Version | Chip | `esp_now_get_version()` | Result |
|-------------|------|-------------------------|--------|
| >= v5.4 | C5/C6 | Returns 2 | V2 capable |
| >= v5.4 | ESP32 (original) | Returns 1 | V1 only |
| < v5.4 | Any | Not available (compile-time skip) | V1 only |

This is the highest-risk phase — requires actual C5/C6 hardware to verify that `esp_now_send()` works with frames > 250 bytes and the receive callback handles `data_len` up to 1470.

### Phase 6: Diagnostics — Topology Badge and Diagnostic Entity

**Files:** `esp_tree_bridge.cpp`, `esp_tree_bridge.h`, web server topology handler

#### Topology page badge

Add to each remote's JSON entry:
- `session_max_payload` (uint16_t) — current session MTU
- `route_v2_capable` (bool) — current path V2 capability
- `leaf_session_flags` (uint8_t) — leaf device capabilities
- `bridge_session_flags` (uint8_t) — bridge device capabilities (same for all remotes)

The web UI renders a badge showing V1/V2 path status per remote.

#### Diagnostic per-remote

The `session_flags` in JOIN/JOIN_ACK enable a diagnostic showing "V2-capable device behind V1 relay" — useful for users to identify path bottlenecks and consider reconfiguring relay topology.

---

## Fragment Assembly Scaling

### Per-Session Derived Limits

| Parameter | V1 | V2 | Formula |
|-----------|-----|-----|---------|
| `max_assembly_bytes` | 1,326 | 8,646 | `max_entity_fragment * 6` |
| `max_total_fragment_bytes` | 5,304 | 34,584 | `max_assembly_bytes * 4` |
| `MAX_PENDING_FRAGMENT_ASSEMBLIES` | 8 | 8 | unchanged |

These are per-session derived values, not compile-time constants. The `max_entity_fragment` parameter is passed into `store_fragment_()` and used for reservation and limit checks.

### Assembly Strategy: Worst-Case Reservation (Option A)

Assembly uses worst-case reservation: `data.assign(fragment_count * max_entity_fragment, 0)`. Single code path for V1 and V2. Offset calculation stays `fragment_index * max_entity_fragment`. Simple, consistent with current code.

For V1, `max_entity_fragment` = 220, so reservation is cheap. For V2, `max_entity_fragment` = 1440, so a 4-fragment assembly reserves ~5760 bytes. With 8 pending assemblies max, theoretical V2 peak is ~46 KB. This is acceptable because assemblies are short-lived (5-second timeout) and typical concurrent assembly count is 1-2.

### `lengths` Vector Type Change

`espnow_fragment_assembly_t::lengths` changes from `std::vector<uint8_t>` to `std::vector<uint16_t>`. V2 fragments can have value lengths > 255 which don't fit in `uint8_t`.

### Session-Level Byte Budget Tracking

Both bridge and remote track per-session reserved bytes (`state_reserved_bytes_`, `schema_reserved_bytes_`). After V2:
- Reservation: `fragment_count * session.max_entity_fragment`
- Limit: `session.max_total_fragment_bytes` (= `session.max_assembly_bytes * 4`)

---

## V1 <-> V2 Coexistence Matrix

| Bridge | Leaf | Path | Session MTU | Relay? | Notes |
|--------|------|------|-------------|--------|-------|
| V2 | V2 | via V2 relay | 1470 | Yes | V2_MTU bit preserved end-to-end |
| V2 | V2 | via V1 relay | 250 | Yes (V1 relay) | V2_MTU bit stripped by V1 relay |
| V2 | V2 | direct | 1470 | N/A | V2_MTU bit set on all frames |
| V2 | V1 | any | 250 | Yes | Leaf never sets V2_MTU bit |
| V1 | V2 | any | 250 | Yes (V1 can relay) | Bridge never sets V2_MTU bit |
| V1 | V1 | any | 250 | Yes | Current behavior |

Path can change dynamically. If a V1 relay goes away and traffic routes through a V2 relay, V2_MTU bit starts arriving set → session auto-upgrades to 1470. If path degrades to V1, V2_MTU bit cleared → session auto-downgrades to 250.

Multiple leaves on the same bridge can have different session MTUs. The bridge tracks this per-session.

---

## Summary of Wire Format Changes

| Struct | Current Size | New Size | Change |
|--------|-------------|----------|--------|
| `espnow_join_t` | 50 | 51 | +1 byte `session_flags` |
| `espnow_join_ack_t` | 19 | 20 | +1 byte `session_flags` |
| `hop_count` byte encoding | bits 7=dir, 6-0=count | bits 7=dir, 6=V2_MTU, 5-4=res, 3-0=count | reinterpretation only, no size change |

All other packet structures are unchanged. Entity payload format is unchanged. `ESPNOW_LR_PROTOCOL_VER` stays at 3. Frame header stays 17 bytes.

## Documentation Follow-Through

When implementation begins, update the master protocol/spec documentation to reflect:

- `hop_count` byte bit layout change (V2_MTU bit, 4-bit count)
- Per-path MTU discovery via V2_MTU bit
- `session_flags` in JOIN/JOIN_ACK (diagnostic, not used for MTU)
- The control-packet sizing invariant
- `value_len` derivation from frame length for V2 fragments
- Which packet types may fragment and which must always remain single-frame
- Maximum hop count is now 8 (hard protocol limit)

---

## Resolved Questions

1. ~~**ESP-NOW V2 API specifics?**~~ **Resolved.** No special V2 init needed — `esp_now_init()` auto-enables V2 on C5/C6. Use `esp_now_get_version()` for runtime detection. `esp_now_send()` transparently handles up to 1470 bytes. Receive callback gets `data_len` up to 1470. Peer management is identical. See Phase 5 for full details.

2. ~~**V2 frame reliability?**~~ **Resolved.** Keep current retry/backoff logic unchanged for both V1 and V2 sessions. The existing ACK/retry mechanism handles transmission failures. Tune later based on real-world testing if needed.

3. ~~**Assembly memory strategy?**~~ **Resolved.** Option A — worst-case reservation for both V1 and V2. Single code path, simple offset math. Assembly timeouts (5 seconds) limit peak memory usage.

4. ~~**`value_len` in entity header?**~~ **Resolved.** Not transmitted on the wire. The `value_len` field stays `uint8_t` in the struct. Authoritative fragment length is derived from `plaintext_len - sizeof(header)`. For V2, `value_len` is capped at 255 (informational). No entity header format change.

5. ~~**Protocol version bump?**~~ **Resolved.** Stay at 3. All devices will be reflashed during development. No interoperability with old firmware needed.

6. ~~**Crypto layer buffer sizing?**~~ **Resolved.** Use `ESPNOW_LR_V2_MAX_PAYLOAD` as fixed upper bound (1481 bytes). No session coupling needed.

7. ~~**Fragment assembly limits?**~~ **Resolved.** `max_entity_fragment * 6` for assembly, `* 4` for total per session. Max fragment count of 6 per assembly.

8. ~~**OTA chunk scaling?**~~ **Resolved.** Include in V2 work. Use per-session `max_payload` for file data frame size and chunk size negotiation.

9. ~~**V1 relay gating?**~~ **Resolved.** V1 devices CAN relay. The hop_count V2_MTU bit handles path downgrade automatically. No relay capability gating on V2 hardware.

10. ~~**V1 relay via session_flags rewrite?**~~ **Deleted.** Obsolete. The hop_count V2_MTU bit handles everything. Relays never modify payload bytes, only the frame header hop_count byte.

11. ~~**entity header expansion?**~~ **Deleted.** Entity payload format is unchanged. No `value_len` `uint8_t` → `uint16_t` expansion. No wire format change to entity payloads.

12. ~~**DISCOVER/ANNOUNCE changes?**~~ **No changes.** These are local 1-hop packets. The V2_MTU bit on their frame headers is set by the sender based on device capability. The authoritative path signal comes from JOIN/JOIN_ACK which traverse the full route.

13. ~~**Stack buffer sizing?**~~ **Resolved.** Leave `uint8_t value[ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN]` allocations as-is. Do not resize for V2. Tightening is separate cleanup.

14. ~~**`hops_to_bridge` in payload structs?**~~ **Unchanged.** Stays as a pure hop count for display purposes. No V2_MTU bit in payload fields — the bit is only in the frame header.

15. ~~**Maximum hop count?**~~ **Resolved.** Hard protocol limit of 8. `ESPNOW_LR_HOPS_DEFAULT` stays at 5. 4 bits (0-15) in the hop_count byte, with a runtime check at 8.

---

## Implementation Order

| Phase | Scope | Risk | Dependency |
|-------|-------|------|------------|
| 1 | Types, constants, session storage, hop_count redefinition | Low | None |
| 2 | V2_MTU bit handling, session_flags exchange, terminal logging | Low | Phase 1 |
| 3 | Dynamic fragmentation | Medium | Phases 1, 2 |
| 4 | OTA V2 chunk scaling | Low | Phase 3 |
| 5 | V2 radio detection and hardware validation | High | Phase 3 |
| 6 | Diagnostics — topology badge, diagnostic entity | Low | Phase 2 |

Phases 1 → 2 → 3 are the critical path. Phase 5 requires actual C5/C6 hardware with V2 IDF. Phases 4 and 6 can proceed in parallel with Phase 3.

**Recommended approach:** Implement Phases 1-3 first using V1 radio (250-byte sessions) to validate the per-session MTU logic. After Phase 3, temporarily force `session_max_payload = 1470` in a test build on V1 hardware to exercise the larger-fragment code paths. Then Phase 5 enables actual V2 radio on C5/C6 hardware.