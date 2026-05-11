# ESPNow OTA MTU Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix ESPNow OTA so chunk sizes respect the destination leaf's MTU at every hop. Two failure modes:
1. **Relay path**: Bridge sends V2 chunks → relay forwards at V2 size → V1 leaf can't receive
2. **Direct path**: Bridge sends V2 chunks to V1-only 82xx → started failing recently (regression)

**Architecture:** The root cause is that `session_max_payload` is negotiated at JOIN time but NOT re-checked at OTA start time. The relay additionally has no per-child MTU tracking.

---

## Root Cause Summary

### Relay path (confirmed)
- `remote_protocol.cpp:forward_packet_()` blindly forwards FILE_DATA using the raw payload — no re-encoding based on child's MTU
- `forward_frame_()` copies payload verbatim, only updates hop count
- Relay has no per-child session storage (`RemoteRouteEntry` is just MAC + next_hop, no MTU)

### Direct path (probable, needs verification)
- Bridge checks `leaf_session_flags & V2_MTU` (not its own flag) — correct
- But: `session_max_payload` might be set from stale cached schema, or JOIN handling race
- 82xx never sets V2_MTU, so bridge should negotiate V1 session (250 bytes)
- Yet bridge sends 1445-byte chunks → bridge thinks it's in V2 session with 82xx
- **Hypothesis**: Cached schema with V2 session revived after IDF version/radio change, without fresh JOIN

---

## Files to Modify

| File | Change |
|------|--------|
| `components/esp_tree_remote/remote_protocol.cpp` | `forward_packet_()` / `forward_frame_()` — re-encode to child's MTU |
| `components/esp_tree_remote/remote_session.cpp` | Add per-child `session_max_payload` tracking |
| `components/esp_tree_bridge/bridge_ota_manager.cpp` | `clamp_chunk_size_()` — add defensive assertion for V1 safety |
| `components/esp_tree_bridge/bridge_protocol.cpp` | JOIN handling — validate both sides' V2_MTU flag |

---

## Task 1: Add per-child session MTU tracking to relay

**Files:**
- Modify: `components/esp_tree_remote/remote_protocol.h` — add `session_max_payload_` field to `RemoteRouteEntry`
- Modify: `components/esp_tree_remote/remote_protocol.cpp` — populate on JOIN (upstream), read on forward

- [ ] **Step 1: Add `session_max_payload_` to `RemoteRouteEntry` struct**

In `remote_protocol.h`, modify `RemoteRouteEntry`:

```cpp
struct RemoteRouteEntry {
  std::array<uint8_t, 6> leaf_mac{};
  std::array<uint8_t, 6> next_hop_mac{};
  uint32_t expiry_ms{0};
  bool has_logged_providing_relay{false};
  uint16_t session_max_payload{ESPNOW_V1_MAX_PAYLOAD};  // leaf's negotiated MTU
};
```

- [ ] **Step 2: Update `refresh_route_()` / route creation to store MTU**

When the relay handles an upstream JOIN from a child, it needs to record that child's session MTU. However, the relay only sees the raw JOIN packet — it doesn't decrypt the leaf's session flags since the leaf encrypts with the bridge's key.

**Alternative approach** (more reliable): The relay learns child's MTU from the leaf's periodic STATE logs or heartbeat, which contain session flags.

But the simplest fix for the relay OTA problem is: **when forwarding FILE_DATA downstream, look up the child's MAC in the routes and use a conservative V1 chunk size** — OR — **have bridge compute the minimum MTU across the path and send that**.

Actually, the cleanest solution is to have the **bridge** compute chunks based on the **minimum MTU across all hops**. The bridge knows the path (relay → leaf). So in `bridge_ota_manager.cpp`, when starting an OTA to a leaf behind a relay, the bridge should:
1. Look up the route: bridge → relay → leaf
2. Get relay's `session_max_payload` (with bridge) → this is the upstream MTU
3. Get leaf's `session_max_payload` (with relay) → this is the downstream MTU
4. Use `min(upstream_MTU, downstream_MTU) - overhead` as chunk size

This way the bridge sends correctly-sized chunks that the relay can always forward.

- [ ] **Step 3: Verify no other per-child state needed in relay**

The relay's `forward_frame_()` already takes the full payload. If chunks are sized correctly at the bridge, the relay just forwards bytes. No re-encoding needed at relay if bridge sizes chunks right.

---

## Task 2: Bridge computes minimum MTU across relay path

**Files:**
- Modify: `components/esp_tree_bridge/bridge_ota_manager.cpp` — `start_transfer()` / `clamp_chunk_size_()`
- Modify: `components/esp_tree_bridge/bridge_protocol.h/cpp` — add `get_route_to_leaf()` or similar

- [ ] **Step 1: Add `get_relay_to_leaf_mtu()` helper**

In `bridge_protocol.cpp/h`, add a method that:
1. Takes a leaf MAC
2. If leaf is directly connected (no relay) → returns leaf's `session_max_payload`
3. If leaf is behind a relay → returns `min(relay's session_max_payload with bridge, leaf's session_max_payload with relay)`

The challenge: **bridge doesn't know leaf's MTU with relay** — relay doesn't store per-child MTU.

**Revised approach**: The bridge's OTA to a leaf behind a relay should use the **relay's MTU** (with bridge) since that's the bottleneck. The relay has V2 MTU with bridge (typically), but the leaf might be V1. Since the bridge doesn't know leaf→relay MTU, we need the relay to advertise its children's MTU.

Actually, the simplest fix: **have bridge use V1 chunk size for ALL OTA transfers** when the destination is behind a relay. This is the safe default. V1 chunks (217 bytes) work over any link.

- [ ] **Step 2: Modify `start_transfer()` to use V1 for relayed OTA**

In `bridge_ota_manager.cpp`, in `start_transfer()`:
- If `espnow_session_get_hops(mac) > 0` (behind relay) → use `ESPNOW_V1_MAX_PAYLOAD`
- Otherwise → use the leaf's negotiated `session_max_payload`

This is the minimal fix: relay OTA always uses V1 chunks (217 bytes), which any downstream can receive.

---

## Task 3: Fix direct bridge→82xx OTA (regression)

**Files:**
- Modify: `components/esp_tree_bridge/bridge_protocol.cpp` — JOIN handling to validate both sides' V2_MTU

- [ ] **Step 1: Add logging to see what session_max_payload is being used at OTA start**

In `bridge_ota_manager.cpp` `start_transfer()`, add:
```cpp
ESP_LOGI(TAG, "OTA start: leaf=%s session_max_payload=%u (V1=%u/V2=%u)",
         mac_display(leaf_mac).c_str(), session->session_max_payload,
         ESPNOW_V1_MAX_PAYLOAD, ESPNOW_V2_MAX_PAYLOAD);
```

- [ ] **Step 2: Check bridge JOIN handling — verify both sides must have V2_MTU**

Current code only checks leaf's flags. Per the spec, both sides must agree:

```cpp
// CORRECT (both sides must agree):
if ((session.leaf_session_flags & ESPNOW_SESSION_FLAG_V2_MTU) &&
    (bridge_session_flags_ & ESPNOW_SESSION_FLAG_V2_MTU)) {
  session.session_max_payload = ESPNOW_V2_MAX_PAYLOAD;
} else {
  session.session_max_payload = ESPNOW_V1_MAX_PAYLOAD;
}
```

Add `bridge_session_flags_` check. Note: `bridge_session_flags_` is set via `set_session_flags()` which is called at init based on ESP-NOW radio version.

- [ ] **Step 3: On cached session restore, re-verify V2_MTU agreement**

In `handle_join_()` at line ~911 where cached schema is restored, verify the leaf's current session_flags still match the cached session's `session_max_payload`. If leaf dropped V2_MTU but cached session was V2, force V1.

---

## Task 4: Verify fix

**Files:**
- Test: Run OTA to 82xx direct — verify chunk size is 217 bytes, not 1445
- Test: Run OTA to 82xx via relay — verify chunk size is 217 bytes
- Test: Run OTA to V2-capable leaf (no relay) — verify chunk size is 1437 bytes

- [ ] **Step 1: Build and flash bridge**
- [ ] **Step 2: Build and flash 82xx leaf**
- [ ] **Step 3: OTA direct bridge→82xx, check esplog for chunk size**
- [ ] **Step 4: OTA via relay bridge→82xx, check esplog for chunk size**

Expected for both: `len=217` (or `len=225` for encrypted plaintext)
Expected for V2 leaf: `len=1437`

---

## Clarifying Questions for User

1. **Direct OTA failure timing**: You said "started failing recently" — was it working with the 82xx before, and if so, what's the last known good commit?
2. **Is there a relay in the path for the direct failure?** Or is the 82xx a direct child of the bridge?
3. **Is the bridge ESP-IDF >= 5.4** with ESP-NOW V2 radio? (We're trying to understand why bridge sends V2 chunks to V1-only 82xx)

---

## Implementation Order

1. **Task 3.1** (add OTA logging) — get diagnostic data first
2. **Task 3.2** (fix JOIN handling) — fix direct OTA regression
3. **Task 2** (V1 for relayed OTA) — fix relay path
4. **Task 1** (per-child MTU tracking in relay) — proper multi-hop MTU (deferred if Task 2 works)

The fix for direct OTA (Task 3.2) is small and self-contained — probably the first thing to try.
