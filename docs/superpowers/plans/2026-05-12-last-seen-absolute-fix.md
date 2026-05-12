# Fix last_seen: Send Absolute Bridge Uptime, Compute Elapsed in Python/JS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change C++ to send `session.last_seen_bridge_uptime_s` (absolute bridge uptime when remote was last seen) instead of `last_seen_ago` (elapsed seconds). Update Python and JS to compute `elapsed = current_bridge_uptime - last_seen_bridge_uptime_s`. Fix placeholder nodes to compute `last_seen_ago` from `observed_unix_ms`.

**Breaking Change:** Proto field 7 (`last_seen_bridge_uptime_s`) now carries absolute bridge uptime, not elapsed seconds. All Python/JS consumers must be updated.

**Architecture:** The field name `last_seen_bridge_uptime_s` finally matches its content (absolute bridge uptime when last seen). `last_seen_ago = current_bridge_uptime - last_seen_bridge_uptime_s` everywhere.

---

## Files to Modify

### Device Code (C++)
- `device_code/components/components/esp_tree_bridge/esp_tree_bridge.cpp` — Fix proto encode, JSON encode, Web UI JS
- `device_code/components/components/esp_tree_bridge/proto/esp_tree_runtime.proto` — Add comment clarifying field 7 is absolute

### Add-on (Python)
- `app/bridge_v2_client.py` — Compute elapsed from absolute; fix placeholder nodes

### HA Integration
- `ha_integration/custom_components/esp_tree/bridge_runtime.py` — Compute elapsed from absolute

### UI (TypeScript/JS)
- `ui/src/components/topology-node.ts` — Compute elapsed from absolute
- `ui/src/components/device-detail.ts` — (already reads `last_seen_ago` from node, which we compute in Python)

---

## Task 1: Fix C++ Proto Encoding — Send Absolute Value

**File:** `device_code/components/components/esp_tree_bridge/esp_tree_bridge.cpp`

**Current (line 2289, 2320):**
```cpp
const uint32_t last_seen_ago = session.last_seen_bridge_uptime_s == 0 ? 0 : now_s - session.last_seen_bridge_uptime_s;
// ...
rt.varint(7, last_seen_ago);  // WRONG: sends elapsed
```

**Change to:**
```cpp
// Send absolute bridge uptime when remote was last seen (field name finally matches content)
rt.varint(7, session.last_seen_bridge_uptime_s);
```

Note: `offline_s` computation at line 2287 can remain unchanged (`now_s - session.last_seen_bridge_uptime_s`) since it uses the same formula — just local computation, not sent over wire.

---

## Task 2: Fix C++ JSON Encoding — Send Absolute in All Code Paths

**File:** `device_code/components/components/esp_tree_bridge/esp_tree_bridge.cpp`

**Lines 1699, 1725, 1823, 1853** — Currently hardcoded to `now_ms / 1000`:
```cpp
json += "\"last_seen_bridge_uptime_s\":" + std::to_string(now_ms / 1000) + ",";  // WRONG
```

**Change to:**
```cpp
json += "\"last_seen_bridge_uptime_s\":" + std::to_string(session->last_seen_bridge_uptime_s) + ",";
```

**Lines 1894, 1941** — Currently sends `last_seen_ago`:
```cpp
json += "\"last_seen_bridge_uptime_s\":" + std::to_string(last_seen_ago) + ",";  // WRONG: sends elapsed
```

**Change to:**
```cpp
json += "\"last_seen_bridge_uptime_s\":" + std::to_string(session->last_seen_bridge_uptime_s) + ",";
```

**Also update line 1865** where `last_seen_elapsed_s` is sent — rename key for clarity or keep as-is since it's a different field.

---

## Task 3: Add Proto Comment

**File:** `device_code/components/components/esp_tree_bridge/proto/esp_tree_runtime.proto`

**Line 216** — Current:
```protobuf
int32 last_seen_bridge_uptime_s = 7;
```

**Change to:**
```protobuf
int32 last_seen_bridge_uptime_s = 7;  // Absolute bridge uptime (seconds) when remote was last seen. Consumers compute: elapsed = current_bridge_uptime - this_value
```

---

## Task 4: Fix Python `_remote_node()` — Compute Elapsed from Absolute

**File:** `app/bridge_v2_client.py`

**Current (lines 820-832):**
```python
"offline_started_at": int(time.time()) - runtime.last_seen_bridge_uptime_s if not runtime.online else None,
# Note: last_seen_bridge_uptime_s from protobuf is elapsed seconds since last seen,
# not an absolute bridge uptime value. The subtraction above correctly yields
# the unix timestamp when the device was last seen.
"uptime_s": runtime.uptime_s,
"last_seen_ago": runtime.last_seen_bridge_uptime_s if runtime.last_seen_bridge_uptime_s > 0 else None,
"last_seen_bridge_uptime_s": runtime.last_seen_bridge_uptime_s,
```

**New:**
```python
# last_seen_bridge_uptime_s is now absolute bridge uptime when remote was last seen
# Compute offline_started_at (unix timestamp when device went offline)
current_bridge_uptime = self._bridge_uptime_map.get(bridge_mac, 0) or 0
elapsed_s = current_bridge_uptime - runtime.last_seen_bridge_uptime_s if runtime.last_seen_bridge_uptime_s > 0 else 0
"offline_started_at": int(time.time()) - elapsed_s if not runtime.online and elapsed_s > 0 else None,
"uptime_s": runtime.uptime_s,
"last_seen_ago": elapsed_s if elapsed_s > 0 else None,
"last_seen_bridge_uptime_s": runtime.last_seen_bridge_uptime_s,
```

**Note:** Remove the old comment. Add `bridge_uptime_s` to the return dict at line 780 if not already present (it is — line 780 `bridge_uptime_s: bridge_uptime_s`).

---

## Task 5: Fix Python Placeholder Node — Use `observed_unix_ms` for `last_seen_ago`

**File:** `app/bridge_v2_client.py`

**Current (lines 691-693):**
```python
"offline_started_at": None,
"uptime_s": ev.uptime_s,
"last_seen_ago": None,
"last_seen_bridge_uptime_s": None,
```

**New:**
```python
# Use observed_unix_ms (bridge wall-clock Unix ms) to compute last_seen_ago
now_ms = int(time.time() * 1000)
elapsed_ms = now_ms - ev.observed_unix_ms if ev.observed_unix_ms else None
"offline_started_at": None,
"uptime_s": ev.uptime_s,
"last_seen_ago": elapsed_ms // 1000 if elapsed_ms else None,
"last_seen_bridge_uptime_s": None,  # Not available in topology_changed event
```

Also need `bridge_uptime_s` for the node — it's already set at line 694 using `self._bridge_uptime_map.get(bridge_mac, 0) or 0`.

---

## Task 6: Fix HA Integration `bridge_runtime.py` — Compute Elapsed from Absolute

**File:** `ha_integration/custom_components/esp_tree/bridge_runtime.py`

**Line 314** (in `_merge_remote_snapshot`):
```python
# Current:
remote.last_live_observed_ms = observed_ms or (runtime.last_seen_bridge_uptime_s * 1000 if runtime.last_seen_bridge_uptime_s != 0 else 0)
```

**New:**
```python
# last_seen_bridge_uptime_s is now absolute bridge uptime
# Compute elapsed_ms = current_bridge_uptime * 1000 - runtime.last_seen_bridge_uptime_s * 1000
bridge_uptime_ms = self._bridge_uptime_map.get(bridge_mac, 0) * 1000 if bridge_mac in self._bridge_uptime_map else observed_ms or 0
elapsed_ms = bridge_uptime_ms - runtime.last_seen_bridge_uptime_s * 1000 if runtime.last_seen_bridge_uptime_s > 0 else observed_ms or 0
remote.last_live_observed_ms = elapsed_ms if elapsed_ms > 0 else (observed_ms or 0)
```

**Line 316-317** (offline_started_at computation):
```python
# Current:
if not runtime.online and runtime.last_seen_bridge_uptime_s != 0:
    remote.offline_started_at = int(time.time()) - runtime.last_seen_bridge_uptime_s
```

**New:**
```python
if not runtime.online and runtime.last_seen_bridge_uptime_s != 0:
    elapsed_s = (self._bridge_uptime_map.get(bridge_mac, 0) - runtime.last_seen_bridge_uptime_s) if bridge_mac in self._bridge_uptime_map else 0
    remote.offline_started_at = int(time.time()) - elapsed_s if elapsed_s > 0 else None
```

**Line 440** (remote_schema_changed handler) — same pattern as line 314.

**Also:** Add `self._bridge_uptime_map` tracking at `BridgeV2Manager` level (check if exists, populate from BridgeHeartbeat events).

---

## Task 7: Fix UI `topology-node.ts` — Compute Elapsed from Absolute

**File:** `ui/src/components/topology-node.ts`

**Lines 9-10** (offline duration fallback):
```typescript
// Current:
if (node.last_seen_bridge_uptime_s && node.bridge_uptime_s && !node.online) {
    return Math.max(0, node.bridge_uptime_s - node.last_seen_bridge_uptime_s);
}
```

**New (no change needed):**
```typescript
// last_seen_bridge_uptime_s is now absolute, so this formula still works:
if (node.last_seen_bridge_uptime_s && node.bridge_uptime_s && !node.online) {
    return Math.max(0, node.bridge_uptime_s - node.last_seen_bridge_uptime_s);
}
```

**No changes needed** — the UI formula `bridge_uptime_s - last_seen_bridge_uptime_s` correctly computes elapsed seconds from absolute values. The field name finally matches the content.

**Line 74** (display) — already reads `node.last_seen_ago` which Python now computes correctly.

---

## Task 8: Verify and Run Tests

- [ ] Python syntax check: `python3 -m py_compile app/bridge_v2_client.py`
- [ ] Ruff lint: `ruff check app/bridge_v2_client.py`
- [ ] HA integration tests: `pytest ha_integration/tests/ -v`
- [ ] C++ compilation (if available): `./device_code/scripts/ha_compile.sh <demo> b`

---

## Self-Review Checklist

1. **Spec coverage:**
   - Send absolute in proto → Task 1
   - Send absolute in JSON → Task 2
   - Compute elapsed in Python → Tasks 4, 5
   - Compute elapsed in HA integration → Task 6
   - UI already computes correctly → Task 7 (verified no change needed)

2. **Placeholder scan:** No "TODO", "TBD", "fill in later" found.

3. **Type consistency:** All computations use consistent types (ms vs s, bridge_uptime_s is seconds).

4. **Breaking changes documented:**
   - Proto field 7 now carries absolute, not elapsed
   - All Python/JS consumers must compute elapsed locally
   - HA integration needs `_bridge_uptime_map` tracking

---

## Key Insight: The Formula is the Same Everywhere

Once C++ sends absolute value:
- Python: `elapsed = bridge_uptime_s - runtime.last_seen_bridge_uptime_s`
- JS: `elapsed = bridge_uptime_s - last_seen_bridge_uptime_s`
- C++ internal: `elapsed = now_s - session.last_seen_bridge_uptime_s` (unchanged, already correct)

The fix is just "C++ sends what it already stores; everyone else computes elapsed from it."