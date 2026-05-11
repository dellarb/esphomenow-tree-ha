# Roadmap: ESP82xx Broadcast Parent-Check Protocol

**Date:** 2026-05-09
**Status:** Design approved
**Protocol version:** V3 (incremental change, not V4)

---

## 1. Background

### 1.1 The ESP82xx Unicast Problem

ESP8266/ESP-12E modules running the Arduino ESP-NOW stack cannot reliably transmit ESP-NOW **unicast** frames. They can transmit broadcast frames and receive both unicast and broadcast frames. See `findings_8266_unicast.md` for the full investigation.

**Current mitigation:** All ESP82xx outbound frames are sent as 802.11 broadcast regardless of destination. The ESP-NOW header still contains the correct `leaf_mac` and protocol fields, so relay routing based on `leaf_mac` works. However, this creates a relay storm: every relay node in RF range receives and processes every upstream packet from an ESP82xx node, even if only one relay is on the path to the bridge.

### 1.2 Relay Storm Impact

When an ESP82xx leaf sends a broadcast (e.g., HEARTBEAT, STATE), all relay nodes in range:
1. Receive the frame
2. Check `should_handle_locally_()` — the leaf_mac doesn't match their own, so they skip local processing
3. Call `forward_packet_()` to relay upstream to their parent

If 3 relay nodes are in range, the bridge receives 3 copies of the same packet. Each relay also wastes airtime forwarding redundant copies and creating ACK/retry traffic.

This gets worse with multiple ESP82xx leaves: N broadcast-type leaves × M in-range relays = N×M redundant packets per send interval.

### 1.3 Why This Can't Be Solved at the 802.11 Layer

The unicast TX failure is in the ESP8266 ESP-NOW SDK below our protocol layer. We can't fix it. Broadcast TX is the only reliable path. The solution must be in our application-layer protocol.

---

## 2. Objectives

1. **Eliminate relay storms** — Only the selected parent relay processes and forwards packets from broadcast-type (ESP82xx) leaves. Other relays in range drop them.
2. **No new packet types** — Use an extended header bit and trailer instead of adding PKT_PARENT_SELECT or similar.
3. **Minimal protocol change** — Keep `leaf_mac[6]` in the main header. No node_id scheme. No dual header formats. No crypto changes.
4. **Remove V2 MTU per-path signaling** — Since broadcast-type nodes (ESP82xx) cannot be relays, all relays are ESP32 and thus V2-capable. Per-path MTU learned from hop_count bits is unnecessary. MTU is negotiated per-session via `session_flags`.
5. **Downstream unchanged** — Downstream is always unicast (relay→leaf). ESP82xx nodes receive unicast fine. No extended header on downstream frames.
6. **Self-documenting routing** — Every upstream packet from a broadcast-type node carries its parent's MAC in the extended header. No routing table needed on intermediate relays. The parent relay zeros the parent MAC and keeps the parent_check bit set so subsequent relays forward normally.

---

## 3. Protocol Changes

### 3.1 `hop_count` Byte Redefinition

**V3 current:**
```
bit 7    = direction        (0=upstream, 1=downstream)
bit 6    = V2_MTU path flag (1=V2-capable path, 0=V1 path)
bits 5-4 = reserved         (send as 0)
bits 3-0 = hop count        (0..15, hard limit ESPNOW_HOPS_LIMIT=8)
```

**V3 new:**
```
bit 7    = direction         (0=upstream, 1=downstream)            — unchanged
bit 6    = PARENT_CHECK      (1 = extended header follows)         — replaces V2_MTU
bits 5-4 = reserved          (send as 0)                           — unchanged
bits 3-0 = hop count         (0..15, hard limit ESPNOW_HOPS_LIMIT=8) — unchanged
```

### 3.2 Extended Header

When `PARENT_CHECK` bit is set in `hop_count`, a 6-byte `parent_mac` field is inserted immediately after `espnow_frame_header_t` (before payload):

```
Encrypted upstream from broadcast-type node:
[espnow_frame_header_t 17B] [parent_mac 6B] [encrypted payload] [session_tag 8B]

After parent relay processes and forwards:
[espnow_frame_header_t 17B] [parent_mac 6B (all zeros)] [encrypted payload] [session_tag 8B]
```

| Field | Size | Description |
|-------|------|-------------|
| parent_mac | 6 bytes | MAC of the selected parent relay. Set to the parent's MAC by the sending leaf. Zeroed by the parent relay after processing. |

**Frame size budget with PARENT_CHECK:**

| Component | Size |
|-----------|------|
| Frame header (incl PSK tag) | 17 |
| parent_mac (when PARENT_CHECK=1) | 6 |
| session_tag (encrypted packets) | 8 |
| **Total overhead (encrypted, broadcast)** | **31** |
| **Total overhead (encrypted, unicast/no PARENT_CHECK)** | **25** |
| **Available encrypted payload (V1, broadcast)** | 250 - 31 = **219** |
| **Available encrypted payload (V1, unicast)** | 250 - 25 = **225** |
| **Available encrypted payload (V2, broadcast)** | 1470 - 31 = **1439** |
| **Available encrypted payload (V2, unicast)** | 1470 - 25 = **1445** |

### 3.3 Relay Processing Rules for PARENT_CHECK

On any node receiving a frame with `PARENT_CHECK` bit set:

```
if (hop_count & ESPNOW_HOPS_PARENT_CHECK_BIT) {
    parse parent_mac from 6 bytes after espnow_frame_header_t

    if (parent_mac is not all-zeros) {
        if (memcmp(parent_mac, my_mac, 6) != 0) {
            // Not my child — drop entirely, do not forward
            return;
        }
        // I am the parent — handle locally
        handle_locally(header, payload...);

        // Zero parent_mac before forwarding upstream
        memset(parent_mac_in_frame, 0, 6);

        // Forward upstream to my parent (unicast)
        forward_packet_upstream(header, payload...);
        return;
    }

    // parent_mac is all-zeros — parent already handled this packet,
    // forward normally (same as non-PARENT_CHECK upstream relay)
    forward_packet_upstream(header, payload...);
}
```

### 3.4 ESP82xx Sender Behavior

Every encrypted upstream packet from an ESP82xx node sets:
- `hop_count |= ESPNOW_HOPS_PARENT_CHECK_BIT`
- `parent_mac = my_parent_mac_` (the selected parent from DISCOVER_ANNOUNCE)

DISCOVER is the only packet sent without PARENT_CHECK — it's pre-session and the node has no parent yet. DISCOVER is broadcast by spec for all node types.

### 3.5 Downstream: No Change

Downstream packets are unicast from relay/bridge to the ESP82xx leaf. ESP82xx can receive unicast fine. No PARENT_CHECK bit, no extended header on downstream frames.

### 3.6 V2 MTU Removal from `hop_count`

The V2_MTU bit (bit 6) is repurposed as PARENT_CHECK. MTU capability moves entirely to session negotiation:

- `ESPNOW_SESSION_FLAG_V2_MTU` (0x01) remains in the `session_flags` byte of JOIN/JOIN_ACK
- Bridge and remote negotiate `session_max_payload` at session setup based on V2 capability
- **No per-path MTU upgrade/downgrade** — all relays are ESP32 (V2-capable), so the path is either direct or via V2-capable relays only. MTU is determined once at JOIN and held for the session.

**What this means in practice:**
- If both bridge and leaf are V2-capable → `session_max_payload = 1470`
- If either is V1-only → `session_max_payload = 250`
- No dynamic MTU changes based on observed V2_MTU bit in hop_count

### 3.7 ESP82xx Nodes Cannot Be Relays

This is already the case in the current codebase (ESP82xx doesn't set the relay capability flag in DISCOVER). With the PARENT_CHECK mechanism, it's even more important: an ESP82xx relay would need to receive broadcast packets, check `parent_mac`, and re-broadcast — but it can't send unicast, so its downstream forwarding would also be broadcast, creating cascading storms. **ESP82xx nodes are leaf-only.**

If an ESP82xx node is configured as a relay (misconfiguration), its DISCOVER will not include the relay capability flag, and no other node will select it as a parent for relay purposes.

### 3.8 DISCOVER_ANNOUNCE `flags` Field

The `flags` field in `espnow_discover_announce_t` is currently always 0. It could be used in the future for capabilities like "accepts broadcast-type children" but no change is needed now. Any ESP32 relay can serve as a parent for a broadcast-type leaf — the PARENT_CHECK mechanism handles routing without requiring advance advertisement.

### 3.9 Network Recovery on Parent Loss

When an ESP82xx leaf loses its parent (no heartbeat ACK, repeated timeouts), it re-discovers the entire network:
1. Sends DISCOVER (broadcast, no PARENT_CHECK)
2. Collects DISCOVER_ANNOUNCE responses
3. Selects best parent via `select_parent_candidate_()`
4. Sends JOIN with PARENT_CHECK + new parent_mac
5. Resumes normal operation

The old parent's route table entry for this leaf expires via TTL (default 172800s / 48h). No explicit deselect packet is needed because:
- The old parent stops seeing the leaf's packets (they now have a different parent_mac → old parent drops them)
- Route entries are only created/refreshed when a leaf's packets are actually forwarded through a relay
- The bridge learns the new route from the JOIN, so downstream works immediately

### 3.10 PSK Tag and Session Tag Coverage

**PSK tag** is computed over `bytes[2..12] || payload`, which covers `pkt_type(1) + leaf_mac(6) + tx_counter(4)`. The `parent_mac` in the extended header is **not** covered by the PSK tag. This is acceptable because:
- The parent MAC is transit metadata, not authenticated content
- A modified parent MAC in transit would redirect the packet to a different relay, which would then fail session tag verification (wrong session key)
- The attack surface is limited to denial-of-service, not data forgery

**Session tag** covers `bytes[2..12] || ciphertext`, same authenticated region. The parent MAC is outside the session tag coverage. Same reasoning: modifying parent_mac in transit can only redirect packets to a relay that will fail decryption.

Both tags remain unchanged in their computation. No crypto changes required.

---

## 4. Constant and Type Changes

### 4.1 `espnow_types.h`

**Remove:**
```c
#define ESPNOW_HOPS_V2_MTU_BIT   0x40u
#define ESPNOW_SESSION_FLAG_V2_MTU  0x01  // (keep this one — moved to session_flags)
static inline bool espnow_route_v2_capable(uint8_t hop_count) { ... }
```

Wait — `ESPNOW_SESSION_FLAG_V2_MTU` is **kept**. It moves from per-hop signaling to per-session negotiation. Only the `hop_count` bit is removed.

**Add:**
```c
#define ESPNOW_HOPS_PARENT_CHECK_BIT 0x40u
#define ESPNOW_PARENT_MAC_LEN        6
```

**Modify `hop_count` comment:**
```c
// bit 7    : direction flag — 0=upstream, 1=downstream
// bit 6    : parent_check flag — 1=extended header with parent_mac[6] follows
// bits 5-4 : reserved (send as 0)
// bits 3-0 : hop count value (0..15; hard limit ESPNOW_HOPS_LIMIT)
```

**Modify `PacketLogEntry`:** Remove `bool v2_mtu{false}` and `bool v1_downgrade{false}`. Add `bool parent_check{false}`.

### 4.2 `espnow_frames.h`

**Frame assembly:** Functions that build frames for broadcast-type (ESP82xx) nodes must:
1. Check if PARENT_CHECK should be set
2. Insert `parent_mac[6]` after the header when PARENT_CHECK is set
3. Compute PSK tag over `bytes[2..12] || payload` (unchanged — parent_mac is not in the authenticated region)

**Frame parsing:** `parse_received_header()` and `parse_frame_()` must:
1. Check `hop_count & ESPNOW_HOPS_PARENT_CHECK_BIT`
2. If set, extract `parent_mac[6]` from the 6 bytes after `espnow_frame_header_t`
3. Adjust payload pointer and length accordingly

**`assemble_plain_frame()`**: Add optional `parent_mac` parameter. When non-null, set PARENT_CHECK bit and insert parent_mac after header.

### 4.3 Relay Forwarding Changes

**`forward_frame_()`** in both `esp_tree_remote` and `espnow_82xx_remote`:
- When forwarding an upstream frame with PARENT_CHECK set:
  - If `parent_mac == my_mac` (I am the parent): zero the parent_mac in the frame buffer, keep PARENT_CHECK bit set, forward upstream to my parent
  - If `parent_mac == all-zeros`: forward upstream unchanged (parent already processed)
  - If `parent_mac != my_mac && != all-zeros`: should not happen (frame would have been dropped at receive)

**`should_handle_locally_()`** must be extended:
- For upstream frames: if PARENT_CHECK is set and parent_mac doesn't match my MAC, return false (drop immediately, don't relay)
- PARENT_CHECK with parent_mac matching my MAC: return true (I am the parent, handle locally)

### 4.4 Bridge Receive Changes

The bridge processes all upstream frames addressed to it. When it receives a frame with PARENT_CHECK set:
- The parent_mac will be all-zeros (parent relay already zeroed it)
- Bridge can ignore parent_mac (session lookup is by leaf_mac as before)
- Bridge sets `session_max_payload` based on `session_flags & ESPNOW_SESSION_FLAG_V2_MTU` at session creation, no per-path changes

### 4.5 ESP82xx Remote Send Changes

All outbound encrypted frames from ESP82xx remote must:
1. Set `PARENT_CHECK` bit in `hop_count`
2. Insert `parent_mac[6]` (the selected parent MAC from DISCOVER_ANNOUNCE) after the header
3. Send as broadcast (already the case)

Pre-session frames (DISCOVER) are sent without PARENT_CHECK and without extended header.

---

## 5. V2 MTU Removal Scope

### 5.1 What's Removed

| Item | Location |
|------|----------|
| `ESPNOW_HOPS_V2_MTU_BIT` constant | `espnow_types.h` |
| `espnow_route_v2_capable()` inline | `espnow_types.h` |
| `bool route_v2_capable` field | `bridge_protocol.h`, `remote_protocol.h` (both ESP32 and 82xx variants) |
| `bool v2_mtu` / `bool v1_downgrade` fields | `PacketLogEntry` in `espnow_types.h` |
| `session_max_payload` dynamic MTU switching | `bridge_protocol.h`, `remote_protocol.h` |
| `update_session_mtu_()` method | `bridge_protocol.cpp` |
| V2_MTU bit OR'd into outgoing `hop_count` | All `remote_protocol.cpp` variants, `bridge_protocol.cpp` |
| V2_MTU bit extraction from incoming `hop_count` | All `remote_protocol.cpp` variants, `bridge_protocol.cpp` |
| `downstream_hop_count_session()` / downstream V2 bit | `bridge_protocol.cpp` |
| JSON API `route_v2_capable` field | `esp_tree_bridge.cpp` |

### 5.2 What's Kept

| Item | Note |
|------|------|
| `ESPNOW_SESSION_FLAG_V2_MTU 0x01` | Stays in `session_flags` for per-session MTU negotiation |
| `ESPNOW_V1_MAX_PAYLOAD` / `ESPNOW_V2_MAX_PAYLOAD` | Constants remain |
| `session_max_payload` field | Remains, but set once at session creation based on `session_flags`, never dynamically changed |
| `update_from_mtu()` | Remains but called once at session setup, not on every received frame |

### 5.3 MTU After Removal

Instead of per-path MTU derived from `hop_count` bits:
- At session creation (JOIN/JOIN_ACK), both sides set `ESPNOW_SESSION_FLAG_V2_MTU` if their radio supports V2
- Bridge computes `session_max_payload` from the session flags:
  ```
  session_max_payload = (leaf_session_flags & ESPNOW_SESSION_FLAG_V2_MTU) &&
                         (bridge_session_flags & ESPNOW_SESSION_FLAG_V2_MTU)
                         ? ESPNOW_V2_MAX_PAYLOAD : ESPNOW_V1_MAX_PAYLOAD;
  ```
- This value is fixed for the session lifetime
- For broadcast-type (ESP82xx) leaves: always V1 (250 bytes) since ESP8266 only supports V1 ESP-NOW
- For ESP32 leaves: V2 (1470 bytes) if bridge is also V2-capable

---

## 6. Implementation Plan

### Phase 1: V2 MTU Removal — **COMPLETED**

Remove the V2_MTU bit from `hop_count` and all associated dynamic MTU logic. Replace with session-fixed MTU. This is a prerequisite for reusing bit 6 as PARENT_CHECK.

**Done:**
- `components/esp_tree_common/espnow_types.h` — removed `ESPNOW_HOPS_V2_MTU_BIT`, `espnow_route_v2_capable()`, updated `hop_count` comment, updated `PacketLogEntry` (replaced `v2_mtu`/`v1_downgrade` with `parent_check`), added `ESPNOW_HOPS_PARENT_CHECK_BIT`, `ESPNOW_PARENT_MAC_LEN`
- `components/esp_tree_common/espnow_frames.h` — removed V2_MTU bit from `make_schema_push_frame`, removed `session_flags` param
- `components/esp_tree_bridge/bridge_protocol.h` — removed `route_v2_capable`, `v2_mtu`/`v1_downgrade` from `queue_log_`, removed `update_session_mtu_()`
- `components/esp_tree_bridge/bridge_protocol.cpp` — removed all V2_MTU bit extraction/OR'ing, `downstream_hop_count_*()` no longer include V2_MTU, session MTU set once at JOIN time
- `components/esp_tree_bridge/esp_tree_bridge.cpp` — removed `route_v2_capable` from JSON API
- `components/esp_tree_remote/remote_protocol.h` — removed `route_v2_capable_`, `v2_mtu`/`v1_downgrade` from `queue_log_`
- `components/esp_tree_remote/remote_protocol.cpp` — removed all V2_MTU bit from outgoing frames, `forward_frame_()` now preserves `PARENT_CHECK_BIT`
- `components/espnow_82xx_remote/remote_protocol.h` — same
- `components/espnow_82xx_remote/remote_protocol.cpp` — same
- `components/82xx_standalone/src/remote_protocol.h` — same
- `components/82xx_standalone/src/remote_protocol.cpp` — same
- `tests/b7c_boundary_test.cpp` — updated V2_MTU tests to PARENT_CHECK tests
- `tests/bridge_api_router_test.cpp` — removed `route_v2_capable` from JSON test data

**Not yet done:**
- Full compile verification (requires Docker build environment)

### Phase 2: PARENT_CHECK Constants and Frame Parsing — **COMPLETED**

**Done:**
- `components/esp_tree_common/espnow_types.h` — `ESPNOW_HOPS_PARENT_CHECK_BIT`, `ESPNOW_PARENT_MAC_LEN`, `espnow_max_plaintext_with_parent()` added
- `components/esp_tree_common/espnow_frames.h` — `parse_received_header()` updated with parent_mac output parameter, `verify_frame_psk_tag()` updated to take explicit payload/payload_len, `is_parent_mac_all_zeros()` helper added
- `components/esp_tree_bridge/bridge_protocol.h/.cpp` — `parse_frame_()` updated with parent_mac, PARENT_CHECK filtering added in `on_espnow_frame()`
- `components/esp_tree_remote/remote_protocol.h/.cpp` — `parse_frame_()` updated with parent_mac, PARENT_CHECK filtering and `forward_frame_()` updated for extended header
- `components/espnow_82xx_remote/remote_protocol.h/.cpp` — `parse_frame_()`, `send_frame_()`, `forward_frame_()` all updated for PARENT_CHECK extended header
- `components/82xx_standalone/src/remote_protocol.cpp` — same changes as 82xx remote

### Phase 3: Relay PARENT_CHECK Receive/Forward Logic — **COMPLETED**

**Done:**
- All three `on_espnow_frame()` handlers check PARENT_CHECK before `should_handle_locally_()`
- Relays drop packets where `parent_mac != self && parent_mac != all-zeros`
- Bridge drops packets where `parent_mac != bridge_mac && parent_mac != all-zeros`
- `forward_frame_()` in all three remotes preserves PARENT_CHECK bit, allocates space for parent_mac, zeros parent_mac on forward

### Phase 4: 82xx Sender PARENT_CHECK — **COMPLETED**

**Done:**
- `send_frame_()` in 82xx remote and standalone: inserts parent_mac after header when PARENT_CHECK bit is set, adjusts crypto and payload pointers
- All upstream send calls OR in `ESPNOW_HOPS_PARENT_CHECK_BIT` when `parent_valid_` is true (JOIN, HEARTBEAT, STATE, ACK, DEAUTH, SCHEMA_PUSH, etc.)
- DISCOVER remains without PARENT_CHECK (pre-session)
- `espnow_max_plaintext_with_parent()` used for payload size validation on PARENT_CHECK frames

### Phase 5: Tests — **COMPLETED**

**Done:**
- `tests/b7c_boundary_test.cpp` — PARENT_CHECK bit tests, `espnow_max_plaintext_with_parent()` tests
- `tests/bridge_api_router_test.cpp` — `route_v2_capable` removed from JSON test data

### Phase 3: Relay PARENT_CHECK Receive/Forward Logic — **COMPLETED**

Implemented the receive-side PARENT_CHECK processing in all relay code paths.

**Done:**
- `components/esp_tree_remote/remote_protocol.cpp` — PARENT_CHECK filtering before `should_handle_locally_()`, `forward_frame_()` handles extended header
- `components/espnow_82xx_remote/remote_protocol.cpp` — same
- `components/esp_tree_bridge/bridge_protocol.cpp` — PARENT_CHECK filtering drops non-matching broadcasts

### Phase 4: ESP82xx Sender PARENT_CHECK — **COMPLETED**

Set PARENT_CHECK + parent_mac on all encrypted upstream frames from ESP82xx.

**Done:**
- `components/espnow_82xx_remote/remote_protocol.cpp` — all upstream sends OR in `ESPNOW_HOPS_PARENT_CHECK_BIT` when `parent_valid_`, `send_frame_()` inserts parent_mac
- `components/espnow_82xx_remote/remote_protocol.h` — `parse_frame_()` parent_mac parameter added
- `components/82xx_standalone/src/remote_protocol.cpp` — same changes

### Phase 5: Testing — **COMPLETED**

- `tests/b7c_boundary_test.cpp` — PARENT_CHECK bit tests, `espnow_max_plaintext_with_parent()` tests, `is_parent_mac_all_zeros()` available
- `tests/bridge_api_router_test.cpp` — `route_v2_capable` removed
- Verify relay storm suppression: place 2 ESP32 relays and 1 ESP82xx leaf in range, confirm only 1 relay processes the leaf's packets
- Verify parent relay zeroing: parent relay correctly zeros parent_mac and forwards upstream
- Verify subsequent relay forwarding: relay after parent forwards parent_mac=all-zeros frames normally
- Verify session MTU: ESP32 leaves get V2 MTU, ESP82xx leaves get V1 MTU
- Verify rejoin on parent loss: leaf re-discovers and joins new parent
- Verify coexistence: ESP32 leaves (no PARENT_CHECK) and ESP82xx leaves (PARENT_CHECK) on same network

---

## 7. Specification Updates Required

The following sections of `espnow_v3_spec.md` need updates:

| Section | Change |
|---------|--------|
| Section 6.1 (Frame Layout) | Add PARENT_CHECK bit to hop_count byte description, replace V2_MTU bit. Add extended header row for parent_mac[6]. |
| Section 6.2 (PSK Tag) | Document that parent_mac is not covered by PSK tag. |
| Section 6.3 (Session Tag) | Document that parent_mac is not covered by session tag. |
| Section 6.5 (Frame Size Budget) | Add rows for PARENT_CHECK overhead (6 bytes). Update encrypted payload sizes. |
| V2_MTU Bit Behavior subsection | Remove entirely. Replace with "MTU Negotiation" subsection describing per-session MTU from session_flags. |
| Section 8.1 (Packet Type Reference) | Update direction column for broadcast-type nodes: "Leaf → Bridge (broadcast, PARENT_CHECK)" for relevant types. |
| Section 9 (hop_count) | Update bit layout to show PARENT_CHECK replacing V2_MTU. |
| New section: Broadcast Relay Filtering | Describe PARENT_CHECK receiving rules, parent relay zeroing, and downstream behavior. |
| Section on MTU | Remove per-path MTU. Describe per-session MTU from session_flags. |

---

## 8. Edge Cases, Warnings, and Implementation Pitfalls

### 8.1 CRITICAL: All `parse_frame_()` variants must handle PARENT_CHECK

There are **three** separate `parse_frame_()` implementations that must be updated:

| File | Line | Current behavior |
|------|------|-----------------|
| `espnow_82xx_remote/remote_protocol.cpp` | ~537 | `payload = frame + sizeof(header)` |
| `esp_tree_remote/remote_protocol.cpp` | ~537 | `payload = frame + sizeof(header)` |
| `esp_tree_bridge/bridge_protocol.cpp` | ~574 | `payload = frame + sizeof(header)` |

**All three** must check for `PARENT_CHECK` bit and adjust the `payload` pointer by +6 bytes when set. If any one is missed, PSK tag verification will fail (the parent_mac bytes would be included in the "payload" for HMAC computation, but the sender didn't include them), and all payload parsing will be corrupt (off by 6 bytes).

The PARENT_CHECK check must happen **before** PSK tag verification, session tag extraction, and any payload parsing. Correct parse logic:

```cpp
memcpy(&header, frame, sizeof(header));
// ... validate protocol_version, packet_type ...

bool has_parent_check = (header.hop_count & ESPNOW_HOPS_PARENT_CHECK_BIT) != 0;
size_t header_size = sizeof(header) + (has_parent_check ? ESPNOW_PARENT_MAC_LEN : 0);

if (len < header_size) return false;  // too short

uint8_t parent_mac[6] = {};
if (has_parent_check) {
    memcpy(parent_mac, frame + sizeof(header), 6);
}

payload = frame + header_size;
payload_len = len - header_size;
session_tag = nullptr;
if (is_encrypted_packet(header.packet_type)) {
    if (payload_len < ESPNOW_SESSION_TAG_LEN) return false;
    session_tag = frame + len - ESPNOW_SESSION_TAG_LEN;
    payload_len -= ESPNOW_SESSION_TAG_LEN;
}
// PSK tag verified with payload pointing past parent_mac
if (espnow_crypto_verify_psk_tag(frame, payload, payload_len, header.psk_tag) == 0) return false;
```

**Warning:** The `espnow_crypto_verify_psk_tag()` function takes the full frame buffer (`frame`) to extract `bytes[2..12]` for HMAC computation, and `payload`/`payload_len` for the rest. The `payload` pointer must point to the actual payload (after parent_mac), not to parent_mac. The `frame` buffer pointer is still used to read the header bytes for the authenticated region.

### 8.2 CRITICAL: `forward_frame_()` must reconstruct frames with parent_mac

Current `forward_frame_()` builds: `[header][payload][session_tag]`

With PARENT_CHECK, the parent relay must build: `[header][parent_mac(6, zeroed)][payload][session_tag]`

**Two cases:**

1. **Parent relay forwarding upstream** — The relay receives a frame with `parent_mac == self`. It handles locally, then zeros `parent_mac` and forwards upstream. The forwarded frame must include the zeroed parent_mac.

2. **Subsequent relay forwarding (parent_mac already zeroed)** — The relay receives a frame with `parent_mac == all-zeros` and PARENT_CHECK bit set. It forwards unchanged. The `forward_frame_()` function must preserve the PARENT_CHECK bit and allocate space for the 6-byte zeroed parent_mac.

Current `forward_frame_()` code:
```cpp
std::vector<uint8_t> frame(sizeof(espnow_frame_header_t) + payload_len + ...);
```

Must become:
```cpp
bool has_parent_check = (header.hop_count & ESPNOW_HOPS_PARENT_CHECK_BIT) != 0;
size_t parent_mac_size = has_parent_check ? ESPNOW_PARENT_MAC_LEN : 0;
std::vector<uint8_t> frame(sizeof(espnow_frame_header_t) + parent_mac_size + payload_len + ...);
// ...
if (has_parent_check) {
    memset(frame.data() + sizeof(espnow_frame_header_t), 0, ESPNOW_PARENT_MAC_LEN);  // zeroed
}
uint8_t *payload_out = frame.data() + sizeof(espnow_frame_header_t) + parent_mac_size;
```

**PSK tag recomputation:** The PSK tag is `HMAC-SHA256(PSK, bytes[2..12] || payload)`. The `payload` for PSK tag computation must start after the parent_mac (i.e., `payload_out` above), not include parent_mac bytes. Since the relay reconstructs the frame and calls `espnow_crypto_psk_tag(frame.data(), payload_out, payload_len, hdr->psk_tag)`, this will be correct as long as `payload_out` points past parent_mac.

### 8.3 CRITICAL: Payload size calculation for 82xx sender

Current `espnow_max_plaintext(ESPNOW_V1_MAX_PAYLOAD) = 250 - 17 - 8 = 225` bytes.

With PARENT_CHECK, 82xx encrypted frames have 6 additional bytes of overhead:
```
250 - 17(header) - 6(parent_mac) - 8(session_tag) = 219 bytes max plaintext
```

**The 82xx remote must use a separate max_plaintext calculation when PARENT_CHECK is set:**

```cpp
static inline uint16_t espnow_max_plaintext_with_parent(uint16_t max_payload) {
    return max_payload - ESPNOW_HEADER_WITH_PSK_TAG_LEN - ESPNOW_PARENT_MAC_LEN - ESPNOW_SESSION_TAG_LEN;
}
```

For unencrypted frames (JOIN, DISCOVER), the overhead is different:
- DISCOVER: no PARENT_CHECK (pre-session) — no change
- JOIN with PARENT_CHECK: `250 - 17(header) - 6(parent_mac) - sizeof(espnow_join_t)` — must fit in 250 bytes

Current `espnow_join_t` is 51 bytes. `250 - 17 - 6 - 51 = 176` bytes remaining. This fits easily.

**But the max entity fragment size changes for 82xx:**
```
Current: espnow_max_entity_fragment(250) = 225 - 5 = 220 bytes
With PARENT_CHECK: 219 - 5 = 214 bytes
```

The 82xx sender's `session_max_payload_` must account for the parent_mac overhead. On 82xx remotes, set:
```cpp
session_max_payload_ = ESPNOW_V1_MAX_PAYLOAD;  // 250, unchanged (radio limit)
// But espnow_max_plaintext_for_session() must subtract parent_mac when PARENT_CHECK is active
```

**Simplest approach:** Override `espnow_max_plaintext()` on 82xx to subtract `ESPNOW_PARENT_MAC_LEN` when the node is in broadcast mode (parent_valid && is_82xx). Or use a virtual function / config flag.

### 8.4 CRITICAL: PARENT_CHECK frames arriving at the bridge

The bridge can receive PARENT_CHECK frames two ways:

1. **Via relay forward** — parent_mac is all-zeros (parent relay zeroed it). The bridge processes normally after skipping the 6-byte parent_mac.

2. **Directly from 82xx leaf** — If the bridge is in RF range, the leaf's broadcast arrives at the bridge with `parent_mac = bridge_mac`. The bridge must:
   - Check `parent_mac == bridge_mac` → this leaf selected the bridge as parent, process locally
   - Check `parent_mac != bridge_mac && parent_mac != all-zeros` → this leaf selected a different parent, **drop** the frame (relay storm suppression working correctly — the intended parent relay will forward a zeroed-parent_mac copy)

**The bridge must NOT process PARENT_CHECK frames where parent_mac is neither self nor all-zeros.** This would defeat the purpose of relay storm suppression.

### 8.5 IMPORTANT: PARENT_CHECK must only be set on upstream frames

PARENT_CHECK on downstream frames is undefined. Downstream frames are unicast from bridge/relay to leaf and don't need parent routing. Implementation must:

- **On receive:** If `ESPNOW_HOPS_IS_DOWNSTREAM(hop_count) && (hop_count & ESPNOW_HOPS_PARENT_CHECK_BIT)`, clear the PARENT_CHECK bit and log a warning, or drop the frame. Recommended: **drop with warning**, since a PARENT_CHECK bit on downstream is protocol violation.

- **On send:** 82xx nodes never set PARENT_CHECK on downstream frames (they're receive-only downstream). Bridge and relay never set PARENT_CHECK on downstream frames.

### 8.6 IMPORTANT: `should_handle_locally_()` must check PARENT_CHECK

Current `should_handle_locally_()` in remotes:
```cpp
if (memcmp(header.leaf_mac, leaf_mac_.data(), 6) == 0) return true;
if (packet_type == PKT_DISCOVER && relay_enabled_ && normal_) return true;
if (packet_type == PKT_DISCOVER_ANNOUNCE) return true;
return false;
```

With PARENT_CHECK, this must be extended. **Early return before `should_handle_locally_()`**:

```cpp
// Before should_handle_locally_() check:
if (has_parent_check) {
    if (memcmp(parent_mac, leaf_mac_.data(), 6) == 0) {
        // I am the parent — handle locally
    } else if (parent_mac_is_all_zeros(parent_mac)) {
        // Parent already handled — not my child, just forward
    } else {
        // Not my child and not forwarded — drop entirely
        return false;
    }
}
```

This check must happen **before** `should_handle_locally_()`, before route table refresh, and before any packet processing. A frame with `parent_mac != self` and `parent_mac != all-zeros` must be silently dropped — no logging of "providing relay", no route table update, no forwarding.

### 8.7 IMPORTANT: No protocol version bump needed

We stay at `ESPNOW_PROTOCOL_VER = 3`. The entire network will be reflashed simultaneously. Old V3 firmware will misinterpret the PARENT_CHECK bit (bit 6) as V2_MTU and will mis-parse the extended header. **All nodes must be updated before deploying this change.**

### 8.8 IMPORTANT: Route table won't learn from non-parent relays

With PARENT_CHECK, non-parent relays drop the broadcast frame before calling `refresh_route_()`. This means:
- Only the selected parent relay has a route entry for the 82xx leaf
- Other relays don't learn about the leaf (no stale routes)
- If the leaf re-discovers and selects a new parent, the old parent's route expires via TTL (172800s default)

This is correct behavior and eliminates the stale route problem entirely. But it means `has_logged_providing_relay` will only be logged by the actual parent relay, not by all relays in range.

### 8.9 IMPORTANT: Unencrypted PARENT_CHECK frames (JOIN)

JOIN is PSK-authenticated but not encrypted (no session_tag). The 82xx leaf sends JOIN with PARENT_CHECK + parent_mac. The parent relay must:

1. Receive the broadcast frame
2. Check `parent_mac == self` → process locally (will call `handle_upstream_()` → `forward_packet_()`)
3. Zero parent_mac and forward upstream to its parent via unicast

The PSK tag covers `bytes[2..12] || payload`. The parent_mac is between `psk_tag` (bytes 13-16) and the payload, so it's **not** in the authenticated region. This is correct — the parent relay zeroing parent_mac doesn't invalidate the PSK tag.

But the `parse_frame_()` function must correctly compute `payload_len` for PSK verification:
```
frame: [header 17B] [parent_mac 6B] [join_payload 51B]
psk_tag: bytes [13..16] of header
authenticated region: bytes [2..12] of header = pkt_type(1) + leaf_mac(6) + tx_counter(4)
payload for HMAC: join_payload (51B), NOT including parent_mac (6B)
```

Without the PARENT_CHECK adjustment, `payload` would point to `parent_mac[0]` and `payload_len` would be 57 (6+51), causing PSK tag mismatch.

### 8.10 Low: Logging and diagnostics

Remove `v2_mtu` and `v1_downgrade` from `PacketLogEntry` and all `queue_log_()` calls. Add `bool parent_check{false}` and optionally `uint8_t parent_mac[6]{}` to `PacketLogEntry` for diagnostic visibility.

### 8.11 Low: V2 MTU removal simplification

After removing per-path MTU:
- Bridge computes `session_max_payload` once at session creation: `(leaf_v2 && bridge_v2) ? 1470 : 250`
- Remote computes `session_max_payload` once at session creation based on `session_flags`
- No dynamic upgrade/downgrade on received frames
- `update_session_mtu_()` is removed; `update_from_mtu()` is called once at session creation
- `route_v2_capable` field is removed from `BridgeSession` and `RemoteProtocol`

### 8.12 Verification: V2 MTU still works per-session

After removing the V2_MTU bit from hop_count:
- ESP32 leaves set `ESPNOW_SESSION_FLAG_V2_MTU` in their `local_session_flags`
- Bridge reads `session_flags` from JOIN/JOIN_ACK and sets `session_max_payload` accordingly
- The bridge sends downstream frames sized for the session MTU
- The remote sends upstream frames sized for the session MTU
- **No frame will ever be larger than the session MTU** because both sides agree at JOIN time

This means V1 (ESP82xx) sessions will use 250-byte frames and V2 (ESP32) sessions will use 1470-byte frames. The relay in between just forwards whatever size frame arrives — it doesn't need to know the MTU of the path.

---

## 9. Implementation Status

**Date:** 2026-05-10
**Build status:** All 9 demos compile successfully (bridge, 7 ESP32 remotes, 2 ESP8266 remotes)
**Test status:** `b7c_boundary_test` and `hop_encoding_test` pass. `bridge_api_router_test` has pre-existing API signature mismatches unrelated to PARENT_CHECK.

### Phase 1: V2 MTU Removal — COMPLETED

All V2_MTU references removed:
- `ESPNOW_HOPS_V2_MTU_BIT` → replaced with `ESPNOW_HOPS_PARENT_CHECK_BIT 0x40u`
- `espnow_route_v2_capable()` → removed
- `bool route_v2_capable` removed from `BridgeSession` and `RemoteProtocol`
- `bool v2_mtu` / `bool v1_downgrade` removed from `PacketLogEntry` → replaced with `bool parent_check`
- `update_session_mtu_()` removed from bridge
- `upstream_hop_count_capable()` / `downstream_hop_count_relay()` removed from remotes
- `route_v2_capable` removed from bridge JSON API
- `ESPNOW_SESSION_FLAG_V2_MTU` retained for per-session MTU negotiation
- Session MTU set once at JOIN time from `session_flags`, never dynamically changed

### Phase 2: PARENT_CHECK Constants and Frame Parsing — COMPLETED

- `ESPNOW_HOPS_PARENT_CHECK_BIT`, `ESPNOW_PARENT_MAC_LEN`, `espnow_max_plaintext_with_parent()`, `espnow_max_entity_fragment_with_parent()`, `espnow_is_parent_mac_all_zeros()` added to `espnow_types.h`
- `PacketLogEntry` updated: `v2_mtu`/`v1_downgrade` → `parent_check`
- `parse_received_header()` in `espnow_frames.h` updated with `parent_mac_out` parameter
- `verify_frame_psk_tag()` updated with explicit payload/payload_len parameters
- All 3 `parse_frame_()` variants (bridge, ESP32 remote, 82xx remote) updated with parent_mac extraction
- `make_schema_push_frame()` removed `session_flags` parameter and V2_MTU bit

### Phase 3: PARENT_CHECK Filtering and Forward Logic — COMPLETED

- All `on_espnow_frame()` handlers check PARENT_CHECK before `should_handle_locally_()`
- Bridge drops PARENT_CHECK frames where `parent_mac != bridge_mac && parent_mac != all-zeros`
- ESP32 remote drops PARENT_CHECK frames where `parent_mac != self && parent_mac != all-zeros`
- 82xx remote drops PARENT_CHECK frames where `parent_mac != self && parent_mac != all-zeros`
- `forward_frame_()` in ESP32 remote preserves PARENT_CHECK bit, allocates parent_mac space, zeros parent_mac
- 82xx remote does not forward (leaf-only, no relay capability)

### Phase 4: 82xx Sender PARENT_CHECK — COMPLETED

- `send_frame_()` in 82xx remote inserts parent_mac after header when PARENT_CHECK bit is set
- `send_frame_()` in 82xx remote accepts `pre_ciphertext` optional parameter to avoid double-encryption
- All upstream sends OR in `ESPNOW_HOPS_PARENT_CHECK_BIT` when `parent_valid_` is true
- DISCOVER excluded from PARENT_CHECK (pre-session, no parent)
- `espnow_max_plaintext_with_parent()` used for payload size validation on PARENT_CHECK frames
- ESP32 remote `send_frame_()` also supports `pre_ciphertext` parameter

### Phase 5: Tests — COMPLETED

- `b7c_boundary_test.cpp`: PARENT_CHECK bit tests, `espnow_max_plaintext_with_parent()` tests, `espnow_is_parent_mac_all_zeros()` tests, correct plaintext sizes (225/219/1445/1439)
- `hop_encoding_test.cpp`: Updated for 4-bit count mask (0x0F), PARENT_CHECK bit tests
- `bridge_api_router_test.cpp`: `route_v2_capable` removed from JSON; FakeBridge/FakeOutbound updated for new API signatures (some pre-existing API mismatches remain)