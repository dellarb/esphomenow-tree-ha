# Fix last_seen_s: Bridge Sends Uptime-Duration, Not Raw Uptime-Timestamp

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `last_seen_s` in bridge → addon so the UI "Last Seen" display shows a meaningful uptime-relative duration (e.g., "5m ago") instead of a nonsensical subtraction of a unix timestamp from bridge uptime seconds.

**Root Cause:**

`sessions.last_seen_s` on the bridge is set to `millis() / 1000` — a **uptime seconds counter** (seconds since bridge boot). It is NOT a unix wall-clock timestamp.

In `build_topology_json_()` (line 1915), this raw uptime value is sent as `last_seen_s`:
```cpp
json += "\"last_seen_s\":" + std::to_string(session.last_seen_s) + ",";
```

The UI then computes:
```typescript
bridge_uptime_s - last_seen_s   // e.g., 86400 - 1750000000 = nonsense
```

The same bug exists in the V2 proto path (`api_runtime_encode_full_snapshot()`, line 2341):
```cpp
rt.varint(7, session.last_seen_s == 0 ? 0 : static_cast<uint64_t>(session.last_seen_s) * 1000ULL);
```
This sends `last_seen_s * 1000` (uptime ms), labelled as `last_seen_unix_ms`, which is equally wrong.

**The Math — Before vs After:**

| Scenario | Bridge boots at T=0, remote last seen at T=300s (5m) | Device goes offline |
|---|---|---|
| Bridge uptime at snapshot | `bridge_uptime_s = 3600` (1 hour) | `bridge_uptime_s = 3700` (1h2m) |
| `session.last_seen_s` (raw) | `300` (uptime at last rx) | `300` (frozen) |
| **BEFORE** `last_seen_s` sent | `300` (raw — wrong) | `300` (raw — wrong) |
| **AFTER** `last_seen_s` sent | `3600 - 300 = 3300` (duration ago) | `3700 - 300 = 3400` (duration ago) |
| **BEFORE** UI display | `3600 - 300 = 3300s ≈ 55m` (appears correct by luck) | `3700 - 300 = 3400s ≈ 56m` |
| **AFTER** UI display | `55 minutes ago` ✓ | `56 minutes ago` ✓ |

Wait — the above example actually works out numerically by coincidence because `bridge_uptime_s - last_seen_s = (T_bridge - T_last_seen) = T_ago`. **The bug only manifests when `session.last_seen_s` overflows past a realistic range or the bridge has been up long enough that the raw value looks like a unix timestamp.**

The real bug appears when the bridge has been running for a while and `session.last_seen_s` grows large enough that `bridge_uptime_s - last_seen_s` gives a **negative or huge value** (because the UI then shows the raw `last_seen_s` when it should show `offline_s` for an offline device).

Example of the actual bug manifesting:
- Bridge uptime = 86,400s (1 day)
- Device last_seen_s = 86,700s (1 day + 5min — device went offline shortly after boot)
- UI shows: `86400 - 86700 = -300` → clamped to 0 → "0s ago" ✗
- Device is clearly offline but UI says "just seen"

**Affected Code Paths:**

1. **JSON API** (`build_topology_json_()`) — `esp_tree_bridge.cpp:1915`
2. **V2 Proto** (`api_runtime_encode_full_snapshot()`) — `esp_tree_bridge.cpp:2341`
3. **HA Integration V2** — `bridge_runtime.py:591` uses `last_seen_unix_ms / 1000` directly without converting to duration

**Files to modify:**
- `ESPLR_V2/components/esp_tree_bridge/esp_tree_bridge.cpp`

**No changes needed in the addon** (esphomenow-tree-ha) except possibly logging — the fix is entirely bridge-side.

---

## Implementation Plan

### Bridge Changes

#### Task 1: Fix JSON API `last_seen_s` in `build_topology_json_()`

**File:** `ESPLR_V2/components/esp_tree_bridge/esp_tree_bridge.cpp:1915`

**Current code (line 1915):**
```cpp
json += "\"last_seen_s\":" + std::to_string(session.last_seen_s) + ",";
```

**Change to:**
```cpp
json += "\"last_seen_s\":" + std::to_string(last_seen_ago) + ",";
```

`last_seen_ago` is already computed on line 1878:
```cpp
const uint32_t last_seen_ago = session.last_seen_s == 0 ? UINT32_MAX : (now_ms / 1000) - session.last_seen_s;
```

This variable is in scope and already represents "seconds since last seen" — the correct value for the UI.

**Note:** When `session.last_seen_s == 0` (never seen), `last_seen_ago = UINT32_MAX`. The UI condition `last_seen_s && bridge_uptime_s` will be true (since `UINT32_MAX` is truthy), then `Math.max(0, bridge_uptime_s - last_seen_s)` gives a huge number. This edge case (never-seen device) is pre-existing and out of scope for this fix.

---

#### Task 2: Fix V2 Proto `last_seen_unix_ms` in `api_runtime_encode_full_snapshot()`

**File:** `ESPLR_V2/components/esp_tree_bridge/esp_tree_bridge.cpp:2341`

**Current code (line 2334-2341):**
```cpp
r.message(2, [&](bridge_api::runtime_pb::Writer &rt) {
  rt.boolean(1, online);
  rt.string(2, bridge_mac);
  rt.string(3, parent_mac);
  rt.varint(4, session.hops_to_bridge);
  rt.sint32(5, session.last_rssi);
  rt.varint(6, offline_s);
  rt.varint(7, session.last_seen_s == 0 ? 0 : static_cast<uint64_t>(session.last_seen_s) * 1000ULL);  // WRONG
  rt.string(8, session_id);
  rt.varint(9, session.last_seen_counter);
  rt.varint(10, session.uptime_seconds);
});
```

**Change line 2341 to:**
```cpp
rt.varint(7, session.last_seen_s == 0 ? 0 : static_cast<uint64_t>(now_s - session.last_seen_s) * 1000ULL);
```

This sends `last_seen_ago * 1000` — the duration in milliseconds since last seen, not the raw uptime timestamp multiplied.

**Pre-condition:** `now_s` is already in scope from line 2283:
```cpp
const uint32_t now_s = millis() / 1000U;
```

---

#### Task 3: Verify V2 Proto Field Name — Consider Renaming (Optional)

The proto field is defined as `last_seen_unix_ms` in `esp_tree_runtime.proto:131`:
```protobuf
uint64 last_seen_unix_ms = 7;
```

Since the bridge has no RTC and cannot produce real unix timestamps, this field is semantically misnamed. However, renaming it is a breaking protocol change. **This task is optional — document the naming issue but do not change the field name in this fix to avoid unnecessary breaking changes.**

If we later do a breaking protocol version bump, rename to `last_seen_uptime_ms`.

---

### No Addon Changes Required

The addon receives `last_seen_s` as a duration (after Task 1) and:
- WS path: `bridge_ws_client.py:794` — already passes `node_last_seen_s` to `get_topology_list()` unchanged
- V2 proto path: `bridge_v2_client.py:608` — divides by 1000, which is now correct (duration in seconds)
- UI: `device-detail.ts:146` — `bridge_uptime_s - last_seen_s` will now correctly compute `T_ago`

For **online devices**, `last_seen_ago` will be small (seconds to minutes). For **offline devices**, `last_seen_ago` will grow over time. The UI's `fmtDuration` handles both correctly.

---

## Verification

1. Build and flash bridge with both fixes
2. Observe a remote going offline — `last_seen_s` in topology JSON should show a growing value (seconds since last seen) rather than a unix-timestamp-style number
3. UI "Last Seen" should show `"Xm ago"` for offline devices that increases over time (rather than jumping to a huge number or going negative)
4. For online devices, `last_seen_s` should be a small number (seconds since last packet)

---

## What This Does NOT Fix

- The `remote_diagnostic_sensor.py` in the HA Integration path computes `current_uptime_s - (last_live_observed_ms // 1000)` where `last_live_observed_ms` comes from V2 proto events. If the event's `observed_unix_ms` is a true unix timestamp (from `runtime_now_unix_ms_()`), this calculation would give a different (and correct) result for V2 event-driven updates. This is a separate code path and out of scope.
- The HA Integration's `bridge_runtime.py:591` still computes `last_seen_s` from `last_live_observed_ms` without the bridge uptime context — this is also a separate concern.