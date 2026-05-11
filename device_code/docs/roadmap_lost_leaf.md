# Lost-Leaf Cascade Recovery (PKT_ROUTE_LOST): Roadmap & Architecture

## Goal

When a bridge loses the relay route to an infrequent-contact leaf (e.g. a sensor that transmits every 60+ seconds), the bridge proactively cascades a recovery signal through the entire tree so the leaf can fast-discover a new path and immediately resume traffic — without waiting for the leaf's next heartbeat or sensor transmission to time out.

Current worst-case recovery: **60–185 seconds** (heartbeat timeout → leaf self-discovers).  
Target with PKT_ROUTE_LOST: **~4–5 seconds** (cascade → fast discover → immediate heartbeat → command retry).

---

## Principles

1. **Session-preserving, not session-breaking.** PKT_ROUTE_LOST tells the leaf "your route is broken, find a new one" — it does NOT clear session keys or force a full rejoin. The leaf keeps its session, fast-discovers a new parent, and sends a heartbeat on the new route. The bridge updates its route table from the heartbeat and retries any pending command.

2. **Cascade, not flood.** The bridge sends PKT_ROUTE_LOST to all direct children. Each child forwards it to all of its children, and so on. The packet propagates through the tree in a controlled cascade, bounded by hop count and deduplication. This is NOT broadcast-to-the-world — it is structured tree-wide propagation.

3. **Triggered only on command timeout.** The bridge cascades PKT_ROUTE_LOST only when it has a pending command that exhausted all retries — i.e., the bridge actively needs to reach the leaf NOW. Heartbeat-timeout recovery still uses the existing slow path. This minimizes cascade traffic.

4. **PSK-only encryption.** Like DEAUTH, PKT_ROUTE_LOST uses PSK encryption, not session encryption. Intermediate relay nodes that forward this packet do not have the target leaf's session key and cannot re-compute a session tag. The payload contains no secrets — just MACs — so PSK-only is acceptable.

5. **Unicast per child.** Cascade forwarding uses unicast to each child, not ESP-NOW broadcast (FF:FF:FF:FF:FF:FF). This is consistent with the existing protocol, provides delivery confirmation, and avoids waking non-tree devices.

6. **Smart exclusion.** If the leaf receives PKT_ROUTE_LOST **from** the broken relay, that relay is alive and reachable — the leaf does NOT exclude it (it may have recovered its upstream by the time discovery runs). If the leaf receives PKT_ROUTE_LOST from a **different** relay, the broken relay did not/could not forward — the leaf MUST exclude it from parent candidates during fast discover.

7. **Graceful degradation.** If the cascade reaches no viable path to the leaf, the leaf falls back to the existing slow-heal (heartbeat timeout → self-discovery). If intermediate relay nodes don't understand PKT_ROUTE_LOST, they drop it and the cascade stops at that point — no crash, no corruption. The tree simply degrades to slow-heal behavior.

8. **Rate-limited and bounded.** A bridge cascades at most once per `ESPNOW_ROUTE_LOST_COOLDOWN_MS` (30 seconds) for the same leaf. Each node deduplicates by `cascade_id` with a 5-second expiry. Hop count limits propagation depth. The worst-case traffic is O(N) transmissions per cascade, rate-limited to 1 per 30 seconds per leaf.

---

## Rationale: Why This Architecture

### Why not just wait for heartbeat timeout?

With a 60-second heartbeat interval, the bridge marks a leaf offline after `max(60*1000 + 5000, expected_contact * 3000 + 5000)` ≈ 185 seconds. A sensor that reports every 5 minutes won't notice the break for 300+ seconds. If a user just toggled a switch (COMMAND), waiting 3 minutes for recovery is unacceptable.

### Why not use DEAUTH?

| | DEAUTH | PKT_ROUTE_LOST |
|--|--------|----------------|
| **When** | Bridge has no valid session for MAC | Bridge has valid session but route is broken |
| **Encryption** | PSK-only | PSK-only |
| **Delivery** | Unicast to known next_hop | Cascade through entire tree |
| **Leaf action** | Full rejoin (new session keys, full JOIN flow) | Fast discover + immediate heartbeat (keep session) |
| **Recovery time** | ~5–15s (full discovery + join) | ~1–3s (fast discover + heartbeat) |
| **Replay** | Relay forwards via route table lookup | Relay floods to ALL children (route table is broken) |

DEAUTH is for "I don't know who you are." PKT_ROUTE_LOST is for "I know who you are but I can't reach you." They coexist.

### Why not use ESP-NOW broadcast for the cascade?

- Non-tree devices on the channel also see the frame
- No delivery confirmation
- Current protocol never uses broadcast except for DISCOVER
- Unicast per child is consistent with all existing forwarding code

### Why PSK-only instead of session-encrypted?

The cascade must traverse relay nodes that are NOT on the leaf's route. Those relays don't have the leaf's session key. Existing relay forwarding preserves the session tag without decrypting, but that only works when the relay is on the route path. For a cascade, the packet goes through nodes that are NOT on the route — they need to be able to re-compute the PSK tag (which uses the network PSK), not the session tag.

---

## The Problem (Illustrated)

```
Bridge
  ├── R1 (relay, now unreachable) ──── Leaf-X  ← route broken, Leaf-X doesn't know
  └── R2 (relay, working) ──── Leaf-Y
```

- Leaf-X has a 60s heartbeat and infrequent sensors (minutes between transmissions)
- Bridge tries to send COMMAND to Leaf-X via R1 → times out after 4 retries (~3.2s)
- Under current protocol, Leaf-X only discovers the break when its next heartbeat fails or its next sensor send fails → could be 60+ seconds of silence
- Leaf-X may already be in radio range of R2 but has no reason to look for it

---

## Packet Specification

### PKT_ROUTE_LOST (0x14)

| Field | Size | Description |
|-------|------|-------------|
| `target_leaf_mac` | 6 bytes | The leaf MAC the bridge cannot reach |
| `broken_next_hop` | 6 bytes | The relay MAC whose route failed (bridge's direct child) |
| `cascade_id` | 4 bytes | Random nonce from bridge per cascade event (deduplication) |

**Total payload: 16 bytes.** Fits easily in a PSK-encrypted frame (max plaintext = `ESPNOW_MAX_PAYLOAD - ESPNOW_HEADER_WITH_PSK_TAG_LEN = 233 bytes`).

```c
#define PKT_ROUTE_LOST  0x14

typedef struct __attribute__((packed)) {
    uint8_t  target_leaf_mac[6];
    uint8_t  broken_next_hop[6];
    uint32_t cascade_id;
} espnow_route_lost_t;
// static_assert(sizeof == 16)
```

### Frame Header Fields

- `packet_type`: `0x14`
- `hop_count`: `ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 0)` — downstream direction, 0 hops at bridge. Each relay increments the count bits and preserves the direction bit.
- `leaf_mac`: Set to `target_leaf_mac` — tells relay forwarding logic which node this is about.
- `tx_counter`: Bridge's next tx counter.
- `psk_tag`: Computed over header + payload with the network PSK.

### Encryption

PSK-only (like DEAUTH, DISCOVER, DISCOVER_ANNOUNCE, JOIN, JOIN_ACK). NOT session-encrypted.

The `is_encrypted_packet()` function returns `false` for PKT_ROUTE_LOST. Relay nodes re-compute the PSK tag when forwarding (same as all PSK-only packets).

### Constants

```c
#define ESPNOW_ROUTE_LOST_COOLDOWN_MS    30000U   // Min time between cascades for same leaf
#define ESPNOW_CASCADE_DEDUP_EXPIRE_MS   5000U    // How long a node remembers a cascade_id
```

---

## Process Flow

### Happy Path: Bridge → Cascade → Leaf Recovery → Command Retry

```
Bridge                R1 (broken)           R2                    Leaf-X
  |                      |                    |                      |
  | COMMAND (retry 1) -->|  (no response)     |                      |
  | COMMAND (retry 2) -->|  (no response)     |                      |
  | COMMAND (retry 3) -->|  (no response)     |                      |
  | COMMAND (retry 4) -->|  (no response)     |                      |
  |                      |                    |                      |
  | ROUTE_LOST -------->|                    |                      |  (to all direct children)
  | ROUTE_LOST ----------------------------->|                      |
  |                      |                    |                      |
  |                      | ROUTE_LOST ------->| (R1 forwards to      |
  |                      |                    |  its children, but   |
  |                      |                    |  R1's route is dead) |
  |                      |                    |                      |
  |                      |                    | ROUTE_LOST --------->|  (R2 sends to target leaf
  |                      |                    |                      |   directly + its children)
  |                      |                    |                      |
  |                      |                    |                      |  Leaf-X receives ROUTE_LOST
  |                      |                    |                      |  Excludes R1 from discover
  |                      |                    |                      |  Starts fast discover
  |                      |                    |                      |
  |                      |                    | DISCOVER_ANNOUNCE<---|  (R2 responds)
  |                      |                    |                      |  Leaf-X picks R2
  |                      |                    |                      |
  |                      |                    |<--- HEARTBEAT -------|  (immediate, not waiting
  |                      |                    |                      |   for interval)
  |<---- HEARTBEAT ------+--------------------+                      |
  |                      |                    |                      |
  |  Bridge updates route: Leaf-X via R2     |                      |
  |  Retries COMMAND ----+------------------->+-------------------->|
  |                      |                    |                COMMAND arrives!
  |                      |                    |<--- ACK ------------|
  |<---- ACK ------------+--------------------+                      |
  |                      |                    |                      |
  |  Total: ~4-5 seconds from timeout to retry                       |
```

### Cascade Forwarding at a Relay Node

```
on_receive(PKT_ROUTE_LOST, target_leaf, broken_next_hop, cascade_id):

  1. Dedup check:
     if already_seen(cascade_id): DROP
     mark_seen(cascade_id, expire=5s)

  2. Broken relay self-recovery:
     if my_mac == broken_next_hop:
       // My upstream route to bridge is broken.
       // Start my own route recovery so I can heal too.
       start_route_recovery_cycle_()

  3. Direct delivery attempt:
     send_to(target_leaf_mac, this_packet)
     // Even if we have no route table entry for this leaf,
     // the leaf may be in radio range. Try direct unicast.

  4. Cascade to all children:
     for each child in route_table:
       if child.next_hop_mac != source_of_this_packet:  // don't echo back
         send_to(child.next_hop_mac, this_packet)
         // NOTE: sends to NEXT_HOP_MAC, not to child.leaf_mac.
         // The child's next_hop IS the child itself for direct children.

  5. Hop count limit:
     if HOPS_COUNT(header.hop_count) >= max_hops_: DROP
     // This is checked before forwarding; existing hop_count
     // enforcement in forward_packet_ handles this naturally.
```

**Key difference from existing forwarding:** Current `handle_downstream_()` looks up the route table for a specific `leaf_mac` next_hop. For PKT_ROUTE_LOST, we iterate ALL route table entries and forward to each child's next_hop — because the whole point is that the route table entry for the target leaf points to a broken relay.

### Leaf Behavior on Receipt

```
on_receive(PKT_ROUTE_LOST, sender_mac, broken_next_hop=B, cascade_id=N):

  1. Dedup:
     if already_handled(cascade_id): return

  2. Preserve session:
     // Do NOT clear session keys, nonces, or counters.
     // Do NOT transition to DISCOVERING state.
     // The session is still valid; only the route needs to change.

  3. Set discovery exclusion (smart):
     if sender_mac != B:
       // Broken relay did NOT forward this packet — it's dead or unreachable.
       // Exclude it from parent candidates during fast discover.
       route_lost_exclude_mac_ = B
     else:
       // Broken relay DID forward this packet — it's alive and reachable.
       // Its upstream is broken, but it may recover by the time we discover.
       // Do NOT exclude it.
       route_lost_exclude_mac_ = {}

  4. Fast discover:
     fast_rejoin_ = true
     discovery_current_channel_only_ = true
     discovery_resume_normal_after_success_ = true
     start_discovery_cycle_()

  5. During discover, exclude route_lost_exclude_mac_ from select_parent_candidate_():
     if route_lost_exclude_mac_ is set AND candidate_mac == route_lost_exclude_mac_:
       skip this candidate

  6. On finding a new parent:
     adopt_best_parent_candidate_(resume_normal_after_success=true)
     // This skips the full JOIN flow and directly resumes NORMAL.

  7. Immediate heartbeat:
     // Do NOT wait for heartbeat interval.
     // Send heartbeat immediately so the bridge learns the new route.
     send_heartbeat_()

  8. Clear exclusion:
     route_lost_exclude_mac_ = {0}  // clear after discover completes
```

**Critical:** The leaf sends an **immediate heartbeat**, not waiting for the interval timer. The heartbeat already carries topology info (`parent_mac`, `hops_to_bridge`, `direct_child_count`, `total_child_count`). When the bridge receives this heartbeat, it updates the session's `parent_mac`, `next_hop_mac` (from `sender_mac`), and `hops_to_bridge`. The bridge can now retry any pending command using the updated route.

### Bridge Behavior on Command Timeout

```
on_command_retry_exhausted(leaf_mac=L, next_hop=R):

  1. Rate limit:
     if last_route_lost_cascade_ms_[L] + COOLDOWN > now: SKIP
     last_route_lost_cascade_ms_[L] = now

  2. Generate cascade_id:
     cascade_id = esp_random()

  3. Build PKT_ROUTE_LOST:
     target_leaf_mac = L
     broken_next_hop = R
     cascade_id = cascade_id

  4. Cascade to all direct children:
     for each session in sessions_:
       if session is a direct child (session.parent_mac == bridge_mac
                                      OR session.next_hop_mac == session.leaf_mac):
         send_plain_psk_(session.next_hop_mac, L, PKT_ROUTE_LOST,
                         ESPNOW_HOPS_MAKE(DOWN, 0), tx_counter++,
                         payload, sizeof(espnow_route_lost_t))

  5. Keep session alive:
     // Do NOT mark session offline due to command timeout alone.
     // Set a flag indicating we're expecting a route update via heartbeat.
     session.pending_route_lost = true
     session.route_lost_since_ms = now

  6. Defer offline:
     // Normal heartbeat timeout still applies as a backstop.
     // But do NOT mark offline just because command retries failed.

  7. On next heartbeat from L:
     session.pending_route_lost = false
     session.route_lost_since_ms = 0
     // Update route from heartbeat (already done in handle_heartbeat_)
     // Retry any pending COMMAND(s) using the new next_hop
     retry_pending_commands(session)
```

**How to identify direct children:** The bridge can identify its direct children by checking `session.hops_to_bridge == 1` (the leaf is one hop away, meaning it talks directly to the bridge). Alternatively, `session.next_hop_mac == session.leaf_mac` means the sender was the leaf itself (no relay in between). A robust approach uses `hops_to_bridge <= 1`.

**Cascade to relays specifically:** For relay nodes (which have their own sessions and may have `hops_to_bridge == 1` but with `direct_child_count > 0`), the bridge must also send to them. The bridge iterates ALL sessions, not just leaf sessions, and sends to each one's `next_hop_mac`. Relay nodes are the ones that have child routes and will cascade further.

**Simplified approach:** Send to ALL sessions' `next_hop_mac` addresses. This includes direct children and relay nodes. Relay nodes will forward to their children. The dedup mechanism prevents any node from processing the same cascade twice. The extra transmissions to leaf nodes that aren't on the path are harmless — they'll see the cascade_id, note it, and drop it (they have no children to forward to).

### Bridge: Retry Pending Commands After Route Update

When the bridge receives a heartbeat from a leaf that had `pending_route_lost`:

```
on_heartbeat_with_pending_route_lost(session):

  1. Clear pending_route_lost flag

  2. Check command_queue_ for any entries matching this leaf_mac:
     for cmd in command_queue_:
       if cmd.leaf_mac == session.leaf_mac:
         // Update the next_hop from the session's new route
         cmd.next_hop_mac = session.next_hop_mac
         cmd.retry_count = 0
         cmd.last_tx_ms = now
         // The next loop() iteration will pick up the command
         // and send it on the new route
```

---

## Detailed Design: Data Structures and State

### Bridge Side: New BridgeSession Fields

```cpp
// In BridgeSession:
bool pending_route_lost{false};         // True after cascade sent, waiting for heartbeat
uint32_t route_lost_since_ms{0};        // When the cascade was sent (for timeout tracking)
```

### Bridge Side: New BridgeProtocol Members

```cpp
// In BridgeProtocol:
struct RouteLostCooldown {
  std::array<uint8_t, 6> leaf_mac{};
  uint32_t last_cascade_ms{0};
};
std::vector<RouteLostCooldown> route_lost_cooldowns_;

bool handle_route_lost_(const uint8_t *sender_mac, const espnow_frame_header_t &header,
                        const uint8_t *payload, size_t payload_len, int8_t rssi);
// Bridge receives PKT_ROUTE_LOST only if a relay sent it upstream (shouldn't happen
// in normal operation, but handle gracefully by logging and dropping).
bool send_route_lost_cascade_(const uint8_t *leaf_mac, const uint8_t *broken_next_hop);
```

### Remote Side: New RemoteProtocol Members

```cpp
// In RemoteProtocol:
std::array<uint8_t, 6> route_lost_exclude_mac_{};  // MAC to exclude during fast discover
uint32_t route_lost_cascade_id_{0};                 // Last processed cascade_id
uint32_t route_lost_cascade_expire_ms_{0};          // When cascade dedup expires

bool handle_route_lost_(const uint8_t *sender_mac, const espnow_frame_header_t &header,
                        const uint8_t *payload, size_t payload_len, int8_t rssi);

// Cascade dedup for relay nodes:
struct CascadeDedupEntry {
  uint32_t cascade_id{0};
  uint32_t expire_ms{0};
};
std::vector<CascadeDedupEntry> cascade_dedup_;
```

### Cascade Dedup Cache (Relay Nodes)

The cascade dedup cache is a small vector of `{cascade_id, expire_ms}` entries. On receiving a PKT_ROUTE_LOST:

1. Prune expired entries (`expire_ms <= now`)
2. Check if `cascade_id` is already in the cache → if so, drop
3. Add new entry with `expire_ms = now + ESPNOW_CASCADE_DEDUP_EXPIRE_MS`
4. Forward

The cache is per-receive, not per-forward. A node processes each cascade_id exactly once.

Expected size: at most a few entries at any time (cascade events are rare and the 5-second expiry is short). No hard cap needed, but a sanity cap of 16 entries is reasonable.

---

## Edge Cases

### Leaf is unreachable by any node

The cascade reaches no one. The bridge falls back to the normal heartbeat timeout → offline path. No worse than today. The `pending_route_lost` flag is cleared when the session times out normally.

### Cascade reaches leaf but no other parent available

Leaf fast-discovers, finds no candidates (or only the excluded broken relay), gives up. Next regular heartbeat interval will trigger the existing route-recovery cycle. Graceful degradation.

### Multiple cascades for different leaves simultaneously

Each cascade has its own `cascade_id`. Dedup is per-cascade. Rate limiting is per-leaf. No interaction between cascades for different leaves.

### Cascade loops

Impossible in a rooted tree. The hop count depth limit and the dedup cache prevent any re-processing. A node only forwards once per cascade_id.

### Broken relay receives cascade for itself

If a relay receives a PKT_ROUTE_LOST where `broken_next_hop == my_mac`, it means the bridge couldn't reach this relay's upstream. The relay should:

1. Forward the cascade to its children (they need to find new paths too)
2. Start its own route recovery cycle (`start_route_recovery_cycle_()`)
3. Its children may now need to find new routes — but that's handled by the relay's own recovery once it re-establishes its upstream path

### Leaf has `preferred_parents` configured

The leaf should still respect `preferred_parents` during fast discover. If the broken relay is in `preferred_parents` and the PKT_ROUTE_LOST came from a different relay (so the broken relay is excluded), the leaf must temporarily skip it. If no other preferred parent is available and none meets the RSSI threshold, fall through to normal selection. If the PKT_ROUTE_LOST came from the broken relay itself, the broken relay is NOT excluded and the leaf may re-select it.

### Old firmware nodes in the tree

Nodes running firmware that doesn't recognize PKT_ROUTE_LOST will drop it (the `is_valid_packet_type()` check fails, or the frame dispatch simply has no handler). The cascade stops at that node. The leaf falls back to slow-heal. This is graceful degradation — no crash, no corruption.

---

## Timing Analysis

| Event | Current (slow heal) | With PKT_ROUTE_LOST |
|-------|---------------------|---------------------|
| Bridge detects route break (command timeout) | ~3.2s | ~3.2s |
| Bridge sends cascade | N/A | ~0.05s (one TX per direct child) |
| Cascade propagation through tree | N/A | ~0.2–0.5s (2–3 hops × relay processing) |
| Leaf receives cascade | N/A | ~0.5s after cascade |
| Leaf fast discover | N/A | ~0.2–1s (current channel, 200ms collection window) |
| Leaf heartbeat on new route | N/A | ~0.2s |
| Bridge retries command | **60–185s** (waits for heartbeat timeout) | **~4–5s** total from timeout to retry |

**~30–40x improvement** in recovery time for infrequent-heartbeat leaves.

---

## Comparison with DEAUTH

| | DEAUTH | PKT_ROUTE_LOST |
|--|--------|----------------|
| **Trigger** | Bridge receives packet from MAC with no/invalid session | Bridge has valid session but command retries exhausted |
| **Encryption** | PSK-only | PSK-only |
| **Delivery** | Unicast to known next_hop (route table lookup) | Cascade to ALL children (flood tree) |
| **Leaf action** | Full rejoin: clear session, new discovery, new JOIN, new keys | Fast discover only: keep session, find new parent, heartbeat |
| **Recovery time** | ~5–15s (full discovery + join + schema + state) | ~1–3s (fast discover + heartbeat) |
| **Data loss** | Pending commands/states lost (session reset) | Pending commands preserved and retried on new route |
| **When to use** | Unknown leaf, corrupted session | Known leaf, broken route |

---

## Protocol Version Compatibility

PKT_ROUTE_LOST does **not** require a protocol version bump for the core frame format. It is a new packet type value (`0x14`) in the existing `packet_type` byte. The `hop_count` direction encoding (v3) is reused as-is.

However, for the cascade to work end-to-end, **all relay nodes in the path need to understand PKT_ROUTE_LOST**. If an intermediate relay doesn't recognize it, it drops the packet and the cascade stops at that node.

Recommendation: Do **not** bump `ESPNOW_PROTOCOL_VER`. Graceful degradation handles mixed-version trees. Document that full cascade coverage requires all relay nodes to support `PKT_ROUTE_LOST = 0x14`.

---

## Amplification and Rate Limiting

The biggest concern with any tree-wide cascade is packet amplification. With N nodes in the tree, each cascade generates O(N) transmissions.

**Mitigations built into the design:**

1. **Per-bridge rate limit:** At most 1 cascade per `ESPNOW_ROUTE_LOST_COOLDOWN_MS` (30s) for the same leaf MAC. Prevents cascade storms from repeated command failures.

2. **Per-node dedup:** The `cascade_id` ensures each node forwards each cascade exactly once within the 5-second dedup window.

3. **Per-node forwarding rate limit:** Each node should not forward more than 1 cascade per second. If a second cascade arrives within 1 second, drop it even if the cascade_id is new. This prevents burst amplification from multiple simultaneous cascades.

4. **Hop count limit:** The packet increments hop_count at each relay and is dropped at `max_hops_` (default 5). This naturally limits cascade depth.

5. **No re-cascade by target:** The leaf that receives PKT_ROUTE_LOST acts on it but does NOT forward it further. It has no children to forward to (it's a leaf).

**Worst-case traffic:** With a tree of 20 nodes and max_hops=5, a single cascade generates at most ~20 unicast transmissions. At 1 cascade per 30 seconds per leaf, this is negligible compared to heartbeat traffic (20 heartbeats per 60 seconds = 1 every 3 seconds on average).

---

## Security Considerations

- **PSK-only encryption** means any device with the network PSK can forge a PKT_ROUTE_LOST. An attacker could force leaves to unnecessarily rediscover. Mitigation: rate limiting on the leaf side (don't act on more than 1 cascade per 10 seconds).
- **No new key material** is exchanged. The session keys remain valid.
- **No denial-of-sleep vector.** PKT_ROUTE_LOST triggers a fast discover cycle, which is radio-active. But the leaf already has heartbeat-driven wake cycles, and the rate limit prevents repeated cascade abuse.
- **MAC addresses in the payload** are not sensitive — they're already visible in ESP-NOW frames at the L2 layer.

---

# Workplan: Lost-Leaf Cascade Recovery (PKT_ROUTE_LOST)

This plan implements the lost-leaf cascade recovery from the design above.

## Stage 1: Protocol Types and Constants

- [ ] 1.1 Add packet type in `components/esp_tree_common/espnow_types.h`:
  - `PKT_ROUTE_LOST = 0x14` in `espnow_packet_type_t` enum

- [ ] 1.2 Update protocol helpers in `espnow_types.h`:
  - `packet_type_name()` returns `"ROUTE_LOST"`.
  - `is_valid_packet_type()` accepts `PKT_ROUTE_LOST`.
  - `is_encrypted_packet()` returns `false` for `PKT_ROUTE_LOST` (PSK-only packet).

- [ ] 1.3 Add `espnow_route_lost_t` packed struct:
  ```c
  typedef struct __attribute__((packed)) {
      uint8_t  target_leaf_mac[6];
      uint8_t  broken_next_hop[6];
      uint32_t cascade_id;
  } espnow_route_lost_t;
  ```
  - Add `static_assert(sizeof(espnow_route_lost_t) == 16)`.

- [ ] 1.4 Add cascade constants:
  ```c
  #define ESPNOW_ROUTE_LOST_COOLDOWN_MS    30000U
  #define ESPNOW_CASCADE_DEDUP_EXPIRE_MS   5000U
  #define ESPNOW_CASCADE_FORWARD_RATE_LIMIT_MS  1000U
  ```

- [ ] 1.5 Do NOT bump `ESPNOW_PROTOCOL_VER`.

Verification:
- [ ] Compile both bridge and remote: `./compile.sh espnow-remote b && ./compile.sh espnow-bridge-c5 b`
- [ ] Confirm no compile errors from the new enum value, struct, and helpers.

---

## Stage 2: Bridge — Cascade Sender

- [ ] 2.1 Add `RouteLostCooldown` struct to `BridgeProtocol`:
  ```cpp
  struct RouteLostCooldown {
    std::array<uint8_t, 6> leaf_mac{};
    uint32_t last_cascade_ms{0};
  };
  std::vector<RouteLostCooldown> route_lost_cooldowns_;
  ```

- [ ] 2.2 Add `send_route_lost_cascade_()` private method to `BridgeProtocol`:
  - Generate `cascade_id = esp_random()`
  - Build `espnow_route_lost_t` payload with `target_leaf_mac`, `broken_next_hop`, `cascade_id`
  - Iterate ALL sessions in `sessions_` map
  - For each session that is online and has `session_key_valid`:
    - Send via `send_plain_psk_(session.next_hop_mac, leaf_mac, PKT_ROUTE_LOST, ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 0), tx_counter_++, payload, sizeof(espnow_route_lost_t))`
  - Log: `"ROUTE_LOST cascade sent for leaf %s, broken_next_hop=%s, cascade_id=0x%08X, sent to %u children"`
  - Record cooldown entry

- [ ] 2.3 Add `pending_route_lost` and `route_lost_since_ms` fields to `BridgeSession`:
  ```cpp
  bool pending_route_lost{false};
  uint32_t route_lost_since_ms{0};
  ```

- [ ] 2.4 Modify command retry exhaustion in `BridgeProtocol::loop()`:
  - Current behavior: `session->online = false; publish_availability_fn_(..., false); erase from queue;`
  - New behavior:
    - Before marking offline, call `send_route_lost_cascade_(leaf_mac, next_hop_mac)`
    - Set `session->pending_route_lost = true`
    - Set `session->route_lost_since_ms = now`
    - Do NOT set `session->online = false` yet
    - Do NOT erase the command from `command_queue_` — keep it for retry after route update
    - The normal heartbeat timeout still applies as a backstop (if no heartbeat arrives, the session goes offline via the existing timeout path)
  - Add rate-limit check: if `route_lost_cooldowns_` has an entry for this leaf MAC within the last `ESPNOW_ROUTE_LOST_COOLDOWN_MS`, skip the cascade and fall through to existing offline behavior

- [ ] 2.5 Modify `handle_heartbeat_()` for `pending_route_lost`:
  - After existing heartbeat processing (updating route info), check if `session.pending_route_lost`:
    - Clear `session.pending_route_lost = false`
    - Clear `session.route_lost_since_ms = 0`
    - Log: `"Route recovered for %s via new next_hop %s"`
    - Iterate `command_queue_` for entries matching this leaf MAC:
      - Update `cmd.next_hop_mac = session.next_hop_mac`
      - Reset `cmd.retry_count = 0`
      - Set `cmd.last_tx_ms = now` (or `now - COMMAND_RETRY_INTERVAL_MS` so it fires immediately)
    - The command will be picked up and sent on the new route in the next `loop()` iteration

- [ ] 2.6 Add `handle_route_lost_()` stub to `BridgeProtocol`:
  - Bridge should not receive PKT_ROUTE_LOST in normal operation (it's always downstream)
  - If received, log a warning and drop: `"Unexpected ROUTE_LOST received at bridge from %s"`
  - This prevents any confusion if a misconfigured relay echoes it upstream

- [ ] 2.7 Add PKT_ROUTE_LOST to `on_espnow_frame()` dispatch:
  - Add case for `PKT_ROUTE_LOST` in the switch/if dispatch
  - Route to `handle_route_lost_()`

- [ ] 2.8 Clean up cooldown entries:
  - In `loop()`, periodically prune `route_lost_cooldowns_` entries older than `2 * ESPNOW_ROUTE_LOST_COOLDOWN_MS`

Watch-outs:
- [ ] `send_plain_psk_()` must work for sending to any MAC, not just the session's `next_hop_mac`. The existing implementation sends to the first argument (destination MAC). Verify this.
- [ ] The `leaf_mac` field in the frame header should be `target_leaf_mac` so relay nodes can match it.
- [ ] Do NOT send the cascade to the broken relay's MAC specifically if it's also a direct child — the cascade goes to ALL direct children including the broken one (the broken relay may still have downstream children that need the packet).
- [ ] The command should remain in `command_queue_` when `pending_route_lost` is true. If `pending_route_lost` is cleared without a heartbeat (e.g., session cleanup), the command is erased then.

Verification:
- [ ] Compile bridge: `./compile.sh espnow-bridge-c5 b`
- [ ] Search for any other places where command timeout leads to offline marking — ensure they all go through the cascade path first.

---

## Stage 3: Remote — Leaf Handler

- [ ] 3.1 Add `route_lost_exclude_mac_` member to `RemoteProtocol`:
  ```cpp
  std::array<uint8_t, 6> route_lost_exclude_mac_{};  // zero-init = no exclusion
  ```

- [ ] 3.2 Add `route_lost_received_ms_` member (for rate-limiting on leaf side):
  ```cpp
  uint32_t route_lost_received_ms_{0};
  ```

- [ ] 3.3 Add `handle_route_lost_()` method to `RemoteProtocol`:
  - Parse payload as `espnow_route_lost_t` (validate `payload_len >= sizeof(espnow_route_lost_t)`)
  - Validate PSK tag (already done by the receive pipeline for PSK-only packets)
  - Check that `target_leaf_mac == leaf_mac_` (this packet is for us). If not, forward as relay (covered in Stage 4).
  - Rate limit: if `now - route_lost_received_ms_ < ESPNOW_CASCADE_FORWARD_RATE_LIMIT_MS`, drop
  - Set `route_lost_received_ms_ = now`
  - Set `route_lost_exclude_mac_` conditionally (smart exclusion):
    - If `memcmp(sender_mac, broken_next_hop, 6) != 0` → broken relay did NOT forward this packet → it's dead → `route_lost_exclude_mac_ = broken_next_hop`
    - If `memcmp(sender_mac, broken_next_hop, 6) == 0` → broken relay DID forward this packet → it's alive → `route_lost_exclude_mac_ = {}` (no exclusion)
  - Validate we're in NORMAL state and session is valid (otherwise, we're already in discovery)
  - If NOT in NORMAL state (`!normal_` or `!joined_`):
    - Log: `"ROUTE_LOST received but not in NORMAL state, ignoring"`
    - Return
  - Start fast discover with exclusion:
    ```cpp
    fast_rejoin_ = true;
    discovery_current_channel_only_ = true;
    discovery_resume_normal_after_success_ = true;
    normal_ = false;
    refresh_can_relay_();
    start_discovery_cycle_();
    ```
  - Log: `"ROUTE_LOST received: broken_next_hop=%s, sender=%s, excluding=%s, starting fast discover"`
    - Where `excluding` is the broken_next_hop MAC if excluded, or "none" if the broken relay forwarded the packet

- [ ] 3.4 Modify `select_parent_candidate_()` to respect exclusion:
  - After existing `is_allowed_parent_()` check, add:
    ```cpp
    if (route_lost_exclude_mac_ != std::array<uint8_t,6>{} &&
        memcmp(responder_mac, route_lost_exclude_mac_.data(), 6) == 0) {
      ESP_LOGD(TAG, "Skipping ROUTE_LOST excluded parent %s", mac_display(responder_mac).c_str());
      return;  // skip this candidate
    }
    ```
  - This applies during the fast discover triggered by PKT_ROUTE_LOST.
  - After the discover cycle completes (in `adopt_best_parent_candidate_()` or fallback), clear the exclusion.

- [ ] 3.5 Modify `adopt_best_parent_candidate_()` to send immediate heartbeat:
  - After adopting the new parent (existing code: setting `parent_mac_`, `hops_to_bridge_`, etc.):
    - If this adoption was triggered by PKT_ROUTE_LOST (check `route_lost_exclude_mac_` is non-zero):
      - Send heartbeat immediately: `send_heartbeat_()`
      - Log: `"Route recovered via ROUTE_LOST fast discover, sent immediate heartbeat"`
    - Clear `route_lost_exclude_mac_` to `{}`

- [ ] 3.6 Clear exclusion on discover failure:
  - In `start_discovery_cycle_()` (which starts a fresh full discover), clear `route_lost_exclude_mac_`:
    ```cpp
    route_lost_exclude_mac_.fill(0);
    ```
  - This ensures that if fast discover fails and falls back to full sweep, the exclusion is lifted and the leaf can try the broken relay again if it comes back.

- [ ] 3.7 Clear exclusion on session loss:
  - In `clear_session_state_()`, clear `route_lost_exclude_mac_`:
    ```cpp
    route_lost_exclude_mac_.fill(0);
    ```

- [ ] 3.8 Add PKT_ROUTE_LOST to `on_espnow_frame()` dispatch:
  - After PSK validation for PSK-only packets, add:
    ```cpp
    case PKT_ROUTE_LOST:
      if (should_handle_locally_(header)) {
        return handle_route_lost_(sender_mac, header, payload, payload_len, rssi);
      }
      // Not for us — relay it (covered in Stage 4)
      return handle_downstream_(sender_mac, header, payload, payload_len, session_tag, rssi);
    ```
  - PKT_ROUTE_LOST is downstream, so it goes through `handle_downstream_()` for relay forwarding.

- [ ] 3.9 Verify `should_handle_locally_()` includes PKT_ROUTE_LOST:
  - `should_handle_locally_()` checks if `leaf_mac == self_mac`. PKT_ROUTE_LOST sets `leaf_mac = target_leaf_mac`, so this check works correctly — if the leaf_mac matches, handle locally; otherwise, forward as relay.

Watch-outs:
- [ ] The leaf must NOT clear session keys or nonces. PKT_ROUTE_LOST is NOT a deauth.
- [ ] The `fast_rejoin_` flag makes discovery scan only the current channel first, which is much faster.
- [ ] `discovery_resume_normal_after_success_ = true` means the leaf skips the full JOIN flow and just adopts the parent. This only works if the session is still valid at the bridge — which it is, because the bridge didn't send DEAUTH.
- [ ] If the leaf is also a relay (has children), it should still cascade-forward the PKT_ROUTE_LOST before handling it locally. But if it's the target leaf, it should handle it and not forward further. The `should_handle_locally_()` check ensures this.

Verification:
- [ ] Compile remote: `./compile.sh espnow-remote b`
- [ ] Trace through the code path: PKT_ROUTE_LOST received → handle_route_lost_ → fast discover → select_parent_candidate_ (with exclusion) → adopt_best_parent_candidate_ → send_heartbeat_.

---

## Stage 4: Remote — Relay Cascade Forwarding

- [ ] 4.1 Add cascade dedup cache to `RemoteProtocol`:
  ```cpp
  struct CascadeDedupEntry {
    uint32_t cascade_id{0};
    uint32_t expire_ms{0};
  };
  std::vector<CascadeDedupEntry> cascade_dedup_;
  ```

- [ ] 4.2 Add `cascade_last_forward_ms_` for per-node rate limiting:
  ```cpp
  uint32_t cascade_last_forward_ms_{0};
  ```

- [ ] 4.3 Add `handle_route_lost_cascade_()` private method:
  - Extract `cascade_id` from the payload
  - Prune expired dedup entries: `cascade_dedup_.erase(remove_if(...))`
  - Check if `cascade_id` is already in `cascade_dedup_` → if so, drop
  - Rate limit: if `now - cascade_last_forward_ms_ < ESPNOW_CASCADE_FORWARD_RATE_LIMIT_MS`, drop
  - Add dedup entry: `cascade_dedup_.push_back({cascade_id, now + ESPNOW_CASCADE_DEDUP_EXPIRE_MS})`
  - Cap dedup size: if `cascade_dedup_.size() > 16`, prune oldest
  - Parse `target_leaf_mac` and `broken_next_hop` from payload
  - Check `can_relay_`: if not, still try direct delivery to target leaf but don't cascade to children
  - Check hop count: if `HOPS_COUNT(header.hop_count) >= max_hops_`, don't forward (drop after dedup)
  - Self-recovery: if `memcmp(broken_next_hop, leaf_mac_, 6) == 0`, call `start_route_recovery_cycle_()`
  - Direct delivery: send PKT_ROUTE_LOST to `target_leaf_mac` via `forward_frame_()` with hop+1
  - Cascade to all children:
    ```cpp
    for (const auto &route : routes_) {
      if (memcmp(route.next_hop_mac.data(), sender_mac, 6) == 0) continue;  // don't echo
      if (memcmp(route.leaf_mac.data(), leaf_mac_, 6) == 0) continue;       // skip self-route
      forward_frame_(route.next_hop_mac.data(), header, payload, payload_len,
                     session_tag, 1);  // hop_count_delta=1
    }
    ```
  - Set `cascade_last_forward_ms_ = now`
  - Log: `"ROUTE_LOST cascade forwarded for leaf %s, broken_next_hop=%s, cascade_id=0x%08X, forwarded to %u children"`

- [ ] 4.4 Modify `handle_downstream_()` to handle PKT_ROUTE_LOST:
  - Current `handle_downstream_()` looks up the route table for `header.leaf_mac` and forwards to that next_hop. For PKT_ROUTE_LOST, this would forward to the broken relay (wrong!).
  - Add a special case at the top of `handle_downstream_()`:
    ```cpp
    if (static_cast<espnow_packet_type_t>(header.packet_type) == PKT_ROUTE_LOST) {
      // PKT_ROUTE_LOST uses cascade forwarding, not route-table lookup
      return handle_route_lost_cascade_(sender_mac, header, payload, payload_len, session_tag, rssi);
    }
    ```
  - This intercepts PKT_ROUTE_LOST before the normal route-table-based forwarding.

- [ ] 4.5 Verify `forward_frame_()` works for PKT_ROUTE_LOST:
  - `forward_frame_()` re-computes the PSK tag and sends with incremented hop count. It preserves the ciphertext/session_tag for encrypted packets and recomputes the psk_tag for PSK-only packets.
  - PKT_ROUTE_LOST is PSK-only, so `forward_frame_()` should re-compute the PSK tag. Verify the existing implementation handles this correctly for PSK-only packets.
  - The `hop_count_delta` parameter increments the hop count. Set to 1 for each relay hop.

- [ ] 4.6 Handle the case where PKT_ROUTE_LOST is for this relay's own session:
  - If `should_handle_locally_(header)` returns true (target_leaf_mac == my MAC), the dispatch in `on_espnow_frame()` routes to `handle_route_lost_()` (leaf handler, Stage 3).
  - If NOT for this node, it goes to `handle_downstream_()` which calls `handle_route_lost_cascade_()`.
  - The relay might also be the target leaf in rare edge cases (a relay that lost its own route). In this case, both the leaf handler AND the cascade handler may need to run. But `should_handle_locally_()` returns true, so only `handle_route_lost_()` runs. This is correct — the relay handles its own recovery via the leaf path and doesn't need to cascade to itself.
  - However, if the relay IS the target AND has children, those children also need the cascade. Handle this in `handle_route_lost_()`:
    ```cpp
    // In handle_route_lost_(), after setting up fast discover:
    // Also cascade to children if we're a relay
    if (can_relay_ && !routes_.empty()) {
      // Call cascade forwarding logic to reach our children
      handle_route_lost_cascade_(sender_mac, header, payload, payload_len, nullptr, rssi);
    }
    ```
  - Actually, this is an edge case where the relay IS the lost leaf. In practice, the bridge sends cascades to all children including relay nodes, so relay nodes get the packet directly from the bridge, not as a "target leaf." The target_leaf_mac is always a leaf, not a relay. Skip this edge case for v1 and document as a known limitation.

- [ ] 4.7 Add pruning of cascade dedup entries in `loop()`:
  ```cpp
  // In loop(), alongside existing prune_routes_() call:
  uint32_t now = millis();
  cascade_dedup_.erase(
    std::remove_if(cascade_dedup_.begin(), cascade_dedup_.end(),
      [now](const CascadeDedupEntry &e) { return e.expire_ms <= now; }),
    cascade_dedup_.end());
  ```

Watch-outs:
- [ ] `forward_frame_()` MUST re-compute the PSK tag, not just copy the old one. The PSK tag includes the full header (including hop_count), which changes at each relay hop. Verify this in the existing `forward_frame_()` implementation.
- [ ] The `session_tag` parameter for PKT_ROUTE_LOST is null/unused (PSK-only packet). Ensure `forward_frame_()` handles this correctly.
- [ ] Do NOT forward to the sender of this packet (would create an echo loop in edge cases).
- [ ] The dedup cache must be checked BEFORE the hop count check. If a node sees the same cascade_id twice (e.g., from two different parents), the second should be dropped even if the hop count is fine.
- [ ] `routes_` may contain entries where `next_hop_mac` is the child itself (direct children) or a further relay. Both cases are handled by forwarding to `next_hop_mac`.

Verification:
- [ ] Compile remote: `./compile.sh espnow-remote b`
- [ ] Trace through: PKT_ROUTE_LOST received at relay → dedup check → cascade to all children → direct delivery to target leaf.

---

## Stage 5: Integration — Full Path Wiring

- [ ] 5.1 Verify frame dispatch in `BridgeProtocol::on_espnow_frame()`:
  - PKT_ROUTE_LOST is a PSK-only packet, so it goes through the PSK validation path (same as DISCOVER, DEAUTH, JOIN, etc.).
  - The dispatch should reach `handle_route_lost_()` (the stub from Stage 2.6).
  - Check the existing dispatch structure: PSK-only packets are typically handled in a section separate from encrypted packets.

- [ ] 5.2 Verify frame dispatch in `RemoteProtocol::on_espnow_frame()`:
  - PKT_ROUTE_LOST is PSK-only and downstream.
  - The dispatch should check `should_handle_locally_()` and route to either `handle_route_lost_()` (leaf) or `handle_downstream_()` (relay).
  - Verify the existing PSK-only packet dispatch code handles this correctly.

- [ ] 5.3 Verify `forward_frame_()` PSK tag recomputation:
  - Read the existing `forward_frame_()` implementation.
  - Confirm it re-computes `psk_tag` when forwarding PSK-only packets.
  - If it only handles encrypted packets, add PSK-only support:
    ```cpp
    // In forward_frame_():
    if (!is_encrypted_packet(static_cast<espnow_packet_type_t>(header.packet_type))) {
      // Re-compute PSK tag for the new header
      espnow_frame_header_t new_header = header;
      new_header.hop_count = ESPNOW_HOPS_MAKE(
        ESPNOW_HOPS_IS_DOWNSTREAM(header.hop_count) ? ESPNOW_HOPS_DIR_DOWN : ESPNOW_HOPS_DIR_UP,
        ESPNOW_HOPS_COUNT(header.hop_count) + hop_count_delta);
      // ... compute psk_tag over new_header + payload ...
    }
    ```

- [ ] 5.4 Add logging for the full path:
  - Bridge: `"ROUTE_LOST cascade initiated for %s (broken_next_hop=%s, cascade_id=0x%08X)"`
  - Relay: `"ROUTE_LOST cascade forwarded (cascade_id=0x%08X, target=%s, forwarded to %u children)"`
  - Leaf: `"ROUTE_LOST received (broken_next_hop=%s), starting fast discover"`
  - Leaf: `"Route recovered via ROUTE_LOST, heartbeat sent on new path via %s"`
  - Bridge: `"Route recovered for %s after ROUTE_LOST cascade (new next_hop=%s)"`

- [ ] 5.5 Add `PKT_ROUTE_LOST` to packet log entries:
  - The existing `queue_log_()` / `PacketLogEntry` system should pick up the new packet type name automatically (via `packet_type_name()`), but verify.

- [ ] 5.6 Test the full compile:
  ```bash
  ./compile.sh espnow-remote b
  ./compile.sh espnow-bridge-c5 b
  ```

Verification:
- [ ] Both compile cleanly.
- [ ] No warnings related to the new packet type.
- [ ] The `packet_type_name()` function is used in all log paths (not hardcoded strings for the packet type).

---

## Stage 6: Test Harness — Host-Side Unit Tests

- [ ] 6.1 Add tests for `espnow_route_lost_t` struct size and field layout:
  - `sizeof(espnow_route_lost_t) == 16`
  - `offsetof(espnow_route_lost_t, target_leaf_mac) == 0`
  - `offsetof(espnow_route_lost_t, broken_next_hop) == 6`
  - `offsetof(espnow_route_lost_t, cascade_id) == 12`

- [ ] 6.2 Add tests for new packet type helpers:
  - `is_valid_packet_type(PKT_ROUTE_LOST) == true`
  - `is_encrypted_packet(PKT_ROUTE_LOST) == false`
  - `packet_type_name(PKT_ROUTE_LOST) == "ROUTE_LOST"`

- [ ] 6.3 Add tests for cascade dedup logic:
  - Same cascade_id received twice → second dropped
  - Different cascade_id → both processed
  - Expired dedup entry → cascade_id re-processed

- [ ] 6.4 Add tests for route recovery flow:
  - Bridge command timeout → cascade sent → heartbeat received → command retried
  - Leaf receives ROUTE_LOST → excludes broken relay → finds new parent → immediate heartbeat

- [ ] 6.5 Add tests for rate limiting:
  - Bridge: two cascades for same leaf within cooldown → second skipped
  - Relay: two cascades within rate limit → second dropped
  - Leaf: two ROUTE_LOST within rate limit → second dropped

- [ ] 6.6 Add tests for edge cases:
  - Cascade reaches leaf with no other parent → falls back to existing recovery
  - PKT_ROUTE_LOST received at bridge → logged and dropped
  - Old firmware relay drops unknown packet type → cascade stops, no crash

Verification:
- [ ] Run protocol tests if available: `scripts/run_protocol_tests.sh`
- [ ] All new tests pass.

---

## Stage 7: Hardware Integration Test

- [ ] 7.1 Flash bridge and remotes:
  ```bash
  ./compile.sh espnow-bridge-c5 bf
  ./compile.sh espnow-remote bf
  ```

- [ ] 7.2 Set up a test topology:
  - Bridge + R1 (relay) + R2 (relay) + Leaf-X (connected via R1)
  - Leaf-X configured with long heartbeat (e.g., 120s) and infrequent sensor
  - R2 placed within radio range of Leaf-X

- [ ] 7.3 Start log monitoring:
  ```bash
  ./esplog-run.sh restart
  ./esplog-run.sh status
  ```

- [ ] 7.4 Test: Normal operation verification:
  - Confirm all nodes join and reach NORMAL state
  - Confirm Leaf-X heartbeat flows through R1
  - Confirm bridge sees Leaf-X with `parent_mac=R1`, `hops_to_bridge=2`

- [ ] 7.5 Test: Route loss and cascade recovery:
  - Power off R1 (simulate relay loss)
  - Trigger a command to Leaf-X from HA (e.g., toggle a switch)
  - Observe bridge logs:
    - COMMAND retries exhaust
    - ROUTE_LOST cascade sent
    - Cascade propagates through R2
    - R2 forwards to Leaf-X
  - Observe Leaf-X logs:
    - ROUTE_LOST received
    - Fast discover starts (excluding R1)
    - DISCOVER_ANNOUNCE received from R2
    - Parent adopted (R2)
    - Immediate heartbeat sent
  - Observe bridge logs:
    - Heartbeat received from Leaf-X via R2
    - Route updated (`next_hop_mac` changed to R2's MAC)
    - Command retried on new route
    - Command ACK received
  - Verify total recovery time < 10 seconds

- [ ] 7.6 Test: No alternative path available:
  - Power off R1 AND move R2 out of Leaf-X's range
  - Trigger a command to Leaf-X
  - Observe: cascade sent, Leaf-X doesn't receive it (out of range of any node)
  - Observe: bridge session eventually times out (existing heartbeat timeout path)
  - Verify no crash, no infinite loop, no memory leak

- [ ] 7.7 Test: Rate limiting:
  - Trigger two rapid commands to Leaf-X while R1 is down
  - Observe: first cascade sent, second cascade within cooldown skipped
  - Verify no cascade storm

- [ ] 7.8 Test: Relay self-recovery:
  - Set up topology: Bridge → R1 → R2 → Leaf-X (3 hops)
  - Power off R1
  - Observe: bridge cascades, R2 receives PKT_ROUTE_LOST
  - R2 sees `broken_next_hop == R1` (not itself), so R2 cascades to Leaf-X but doesn't self-recover
  - Wait: this test may not exercise the self-recovery path
  - Alternative: Bridge → R1 → Leaf-X, where R1 is the broken_next_hop
  - If R1 is the broken_next_hop and R1 receives the cascade:
    - R1 sees `broken_next_hop == my_mac`
    - R1 starts `start_route_recovery_cycle_()`
    - R1 also forwards to Leaf-X (if it can reach Leaf-X)
  - This is hard to test without controlling which nodes receive the cascade

- [ ] 7.9 Test: PKT_ROUTE_LOST with `preferred_parents`:
  - Configure Leaf-X with `preferred_parents: [R1, R2]`
  - Power off R1
  - Trigger command → cascade → Leaf-X receives → fast discover
  - Verify Leaf-X excludes R1 and picks R2 (if R2 signal ≥ -85 dBm) or falls through to normal selection
  - Configure Leaf-X with `preferred_parents: [R1]` (only R1)
  - Power off R1
  - Trigger command → cascade → Leaf-X receives → fast discover
  - Verify Leaf-X excludes R1, no preferred parent available → normal selection runs

- [ ] 7.10 Capture logs from each test for documentation:
  ```bash
  curl "http://localhost:5555/stream?since=0&device_id=<device_name>&limit=50"
  ```

Verification:
- [ ] All hardware tests pass.
- [ ] Recovery time from command timeout to retry is under 10 seconds.
- [ ] No crashes, no memory leaks, no cascade storms.

---

## Stage 8: Hardening and Edge Cases

- [ ] 8.1 Handle bridge restart mid-cascade:
  - If the bridge restarts while a cascade is in flight, all cascade state is lost. The leaf may have started fast discover. On bridge restart, the leaf will re-join normally (DISCOVER → JOIN). This is acceptable behavior. No special handling needed.

- [ ] 8.2 Handle leaf reboot after PKT_ROUTE_LOST:
  - If the leaf reboots after receiving PKT_ROUTE_LOST (e.g., due to a watchdog), it starts fresh with DISCOVER. The bridge session may still exist. The leaf will re-join normally. No special handling needed.

- [ ] 8.3 Handle session cleanup during pending_route_lost:
  - In bridge session cleanup (RAM eviction, offline purge), if `pending_route_lost` is true, clear it before evicting. The command in the queue is also erased at that point.
  - In `evict_sessions_for_ram_()`, ensure `pending_route_lost` sessions are not given special treatment — they can be evicted like any other session.

- [ ] 8.4 Handle concurrent cascades for different leaves:
  - Multiple leaves may have command timeouts at the same time.
  - Each cascade is independent (different leaf_mac, different cascade_id).
  - The rate limit is per-leaf, so concurrent cascades for different leaves are allowed.
  - The dedup cache at relay nodes handles multiple cascade_ids simultaneously.

- [ ] 8.5 Memory budget for cascade dedup cache:
  - Each `CascadeDedupEntry` is 8 bytes (4 + 4).
  - Cap at 16 entries = 128 bytes.
  - This is negligible on ESP32.

- [ ] 8.6 Memory budget for route_lost_cooldowns_ on bridge:
  - Each `RouteLostCooldown` is 10 bytes (6 + 4).
  - With at most 128 sessions, max 128 entries = 1280 bytes.
  - Prune periodically to keep it small.

- [ ] 8.7 Add defensive checks:
  - In `handle_route_lost_()` (leaf): validate `payload_len >= sizeof(espnow_route_lost_t)` before parsing.
  - In `handle_route_lost_cascade_()` (relay): same validation.
  - In `send_route_lost_cascade_()` (bridge): validate the leaf MAC exists in sessions before cascading.

- [ ] 8.8 Add metrics/counters:
  - Bridge: count of cascades sent per session (expose via MQTT diagnostics or topology JSON).
  - Relay: count of cascade forwards (optional, for debugging).
  - Leaf: count of ROUTE_LOST received and acted upon (optional).

- [ ] 8.9 Topology JSON update:
  - Add `pending_route_lost` field to per-node JSON when true.
  - This helps with debugging and UI feedback.

Verification:
- [ ] Compile both: `./compile.sh espnow-remote b && ./compile.sh espnow-bridge-c5 b`
- [ ] Review all new code paths for memory safety and bounded allocations.

---

## Stage 9: Documentation and Final Build

- [ ] 9.1 Update `docs/espnow_v3_spec.md` (if it exists) with PKT_ROUTE_LOST packet type.

- [ ] 9.2 Add a comment in `espnow_types.h` near the `PKT_ROUTE_LOST` enum value:
  ```c
  PKT_ROUTE_LOST = 0x14,  // Bridge→tree cascade when route to leaf is broken (PSK-only)
  ```

- [ ] 9.3 Final build of all demos:
  ```bash
  ./compile.sh a b
  ```

- [ ] 9.4 Flash and run a final integration test:
  ```bash
  ./compile.sh espnow-bridge-c5 bf
  ./compile.sh espnow-remote bf
  ```

- [ ] 9.5 Verify no regression in existing functionality:
  - Normal join/discover/heartbeat/state/command paths work unchanged.
  - DEAUTH still works for session-invalid cases.
  - Relay forwarding of existing packet types works unchanged.
  - OTA file transfer works unchanged (if implemented).

Watch-outs:
- [ ] PKT_ROUTE_LOST uses `0x14`, which previously mapped to `FIELD_TYPE_TEXT_SENSOR` in `espnow_field_type_t`. These are different enums — `espnow_packet_type_t` vs `espnow_field_type_t` — so there is no conflict. Verify this.
- [ ] Do NOT commit `demos/secrets.yaml`.
- [ ] Preserve existing local modifications unless explicitly asked to change them.

---

## Summary of Files Modified

| File | Stage | Change |
|------|-------|--------|
| `components/esp_tree_common/espnow_types.h` | 1 | Add `PKT_ROUTE_LOST = 0x14`, `espnow_route_lost_t` struct, cascade constants, update helpers |
| `components/esp_tree_bridge/bridge_protocol.h` | 2 | Add `RouteLostCooldown`, `send_route_lost_cascade_()`, `handle_route_lost_()`, `pending_route_lost` fields |
| `components/esp_tree_bridge/bridge_protocol.cpp` | 2 | Implement cascade sender, modify command timeout, modify heartbeat handler, add dispatch |
| `components/esp_tree_remote/remote_protocol.h` | 3, 4 | Add `route_lost_exclude_mac_`, `handle_route_lost_()`, `CascadeDedupEntry`, `handle_route_lost_cascade_()` |
| `components/esp_tree_remote/remote_protocol.cpp` | 3, 4 | Implement leaf handler, relay cascade forwarder, modify `select_parent_candidate_()`, modify `adopt_best_parent_candidate_()`, modify `handle_downstream_()` |

Estimated complexity: **Medium.** The cascade forwarding is the novel part (current code only does route-table lookup forwarding). The leaf behavior is mostly wiring into existing fast-discover paths. The bridge side is straightforward.
