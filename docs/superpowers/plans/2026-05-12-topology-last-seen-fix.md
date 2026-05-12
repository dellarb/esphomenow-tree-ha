# Fix New Device "last_seen" Not Populating in Topology

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix race condition where new devices joining the ESP Tree network don't appear in the topology UI until a FullSnapshot is received. Also fix `offline_started_at` calculation for consistency.

**Architecture:** When a `topology_changed` event arrives for an unknown MAC, create a minimal placeholder node. When FullSnapshot/RemoteSnapshot arrives, the node is replaced/updated with full identity info. RemoteAvailabilityEvent updates are also traced to ensure online/offline transitions properly set `offline_started_at`.

**Tech Stack:** Python (add-on), Protobuf, SQLite

---

## Files to Modify

- **`app/bridge_v2_client.py`** — `_handle_event_batch()` topology_changed handler and _remote_node() calculation

---

## Task 1: Fix topology_changed Handler to Create Placeholder Node

**File:** `app/bridge_v2_client.py:659-666`

- [ ] **Step 1: Read existing code**

```python
elif kind == "topology_changed":
    ev = event.topology_changed
    node = self._topology_nodes.get(normalize_mac(ev.remote_mac))
    if node:
        node["parent_mac"] = normalize_mac(ev.parent_mac)
        node["hops"] = ev.hops_to_bridge
        node["rssi"] = ev.rssi
        node["uptime_s"] = ev.uptime_s
```

- [ ] **Step 2: Write new code that creates placeholder node for unknown MACs**

```python
elif kind == "topology_changed":
    ev = event.topology_changed
    remote_mac = normalize_mac(ev.remote_mac)
    node = self._topology_nodes.get(remote_mac)
    if node:
        node["parent_mac"] = normalize_mac(ev.parent_mac)
        node["hops"] = ev.hops_to_bridge
        node["rssi"] = ev.rssi
        node["uptime_s"] = ev.uptime_s
    else:
        # New device - create minimal placeholder node
        # Full identity will be populated when FullSnapshot or RemoteSchemaChanged arrives
        bridge_mac = normalize_mac(ev.bridge_mac or "")
        node = {
            "mac": remote_mac,
            "node_key": remote_mac.replace(":", ""),
            "device_unique_id": f"esp_tree_{remote_mac.replace(':', '')}",
            "parent_mac": normalize_mac(ev.parent_mac),
            "name": remote_mac,
            "esphome_name": None,
            "friendly_name": remote_mac,
            "label": remote_mac,
            "manufacturer": "ESPHome",
            "model": "esp_tree_remote",
            "sw_version": None,
            "project_name": None,
            "firmware_version": None,
            "firmware_build_date": None,
            "firmware_md5": None,
            "chip_name": None,
            "online": True,  # topology_changed implies device is reachable
            "rssi": ev.rssi,
            "hops": ev.hops_to_bridge,
            "offline_started_at": None,
            "uptime_s": ev.uptime_s,
            "last_seen_ago": None,
            "last_seen_bridge_uptime_s": None,
            "bridge_uptime_s": self._bridge_uptime_map.get(bridge_mac, 0) or 0,
            "route_v2_capable": True,
            "can_relay": False,
            "relay_enabled": False,
            "direct_child_count": 0,
            "total_child_count": 0,
            "from_v2_api": True,
            "is_bridge": False,
            "bridge_mac": bridge_mac,
            "network_id": "",
            "entity_count": 0,
        }
        self._topology_nodes[remote_mac] = node
        logger.debug(
            "bridge v2 %s: created placeholder node for new device %s (topology_changed)",
            bridge_mac, remote_mac,
        )
```

- [ ] **Step 3: Run lint/typecheck**

Verify the code is syntactically correct and passes type checking.

---

## Task 2: Verify offline_started_at Calculation is Correct

**File:** `app/bridge_v2_client.py:776`

**Current code:**
```python
"offline_started_at": int(time.time()) - runtime.last_seen_bridge_uptime_s if not runtime.online else None,
```

**Issue:** C++ sends `last_seen_ago = now_s - session.last_seen_bridge_uptime_s` (elapsed seconds since last seen), not the absolute `session.last_seen_bridge_uptime_s` value itself.

**Analysis:** The current Python code does `int(time.time()) - runtime.last_seen_bridge_uptime_s` where `runtime.last_seen_bridge_uptime_s` is actually elapsed seconds. This correctly computes `now - elapsed_seconds_ago = timestamp_when_last_seen`, which is the correct `offline_started_at` (when the device went offline).

**Decision:** The calculation is **functionally correct** even though the field name `last_seen_bridge_uptime_s` is misleading (it's actually `last_seen_elapsed_s`). Document this with a comment but do not change the behavior to avoid breaking existing logic.

- [ ] **Step 1: Add clarifying comment to _remote_node()**

```python
# Note: last_seen_bridge_uptime_s from protobuf is actually elapsed seconds since last seen
# (bridge sends last_seen_ago = now_s - session.last_seen_bridge_uptime_s).
# The calculation int(time.time()) - elapsed_s correctly yields the timestamp when last seen.
"offline_started_at": int(time.time()) - runtime.last_seen_bridge_uptime_s if not runtime.online else None,
"last_seen_ago": runtime.last_seen_bridge_uptime_s if runtime.last_seen_bridge_uptime_s > 0 else None,
"last_seen_bridge_uptime_s": runtime.last_seen_bridge_uptime_s,
```

---

## Task 3: Add Debug Logging for topology_changed on Unknown Nodes

**File:** `app/bridge_v2_client.py`

- [ ] **Step 1: Add logging when topology_changed is discarded (before fix)**

This helps diagnose future issues. Add at line 661 before the fix:

```python
node = self._topology_nodes.get(normalize_mac(ev.remote_mac))
if not node:
    logger.warning(
        "bridge v2: topology_changed for unknown node %s, bridge=%s - node will be created on FullSnapshot",
        normalize_mac(ev.remote_mac), normalize_mac(ev.bridge_mac or ""),
    )
```

---

## Verification

- [ ] **Step 1: Start add-on with a bridge that has a new remote device**
- [ ] **Step 2: Verify new device appears in topology immediately after joining** (without waiting for FullSnapshot)
- [ ] **Step 3: Verify UI shows correct last_seen_ago and offline_started_at** when device goes offline

---

## Self-Review Checklist

1. **Spec coverage:** Does each requirement in the bug description have a task?
   - New device not appearing in topology → Task 1 (placeholder node creation)
   - last_seen not populating → Task 1 (node created with `online=True`)
   - offline_started_at calculation → Task 2 (documented as correct)

2. **Placeholder scan:** No "TODO", "TBD", "fill in later" found.

3. **Type consistency:** All field accesses match protobuf definitions (normalize_mac used consistently, field names match proto).

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-12-topology-last-seen-fix.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?