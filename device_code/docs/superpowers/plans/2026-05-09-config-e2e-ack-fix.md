# Config Command End-to-End ACK Fix

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix config commands so the bridge waits for the remote's ESP-NOW ACK (or timeout) before reporting the result to the add-on, and ensure the add-on properly surfaces failure messages to the user.

**Architecture:** The bridge's `api_runtime_handle_config_command()` (protobuf handler) must be changed to match the WS handler's callback-based async pattern. The add-on must handle all failure result types (timeout, busy, rejected) and surface them to the UI, not just "ok".

**Tech Stack:** ESP32 C++ (bridge firmware), Python (add-on), TypeScript (UI)

---

## Bug Summary

### Bridge Firmware — Two Inconsistent Implementations

**WS handler (`handle_node_config_()` in `bridge_api_router.cpp:717-737`):**
- Passes a callback to `api_node_config_start()`
- Returns immediately with nothing
- When remote ACKs (or times out), callback fires and sends `node.config.result` to add-on
- **CORRECT** — waits for end-to-end ACK

**Protobuf handler (`api_runtime_handle_config_command()` in `esp_tree_bridge.cpp:2618-2662`):**
- Passes `nullptr` as callback — ignores async result entirely
- Returns `COMMAND_STATUS_ACCEPTED` immediately if config was queued
- Add-on receives "ok" instantly without waiting for remote ACK
- **BROKEN** — does not wait for end-to-end ACK

### Add-on — Missing Failure Handling

- V2 (`bridge_v2_client.py:360-375`): `COMMAND_STATUS_ACCEPTED` and `COMMAND_STATUS_DELIVERED` both map to `"ok"` — timeout is not surfaced to user
- WS (`bridge_ws_client.py:561-578`): 5s timeout, but `ConfigTimeoutError` maps to HTTP 504, yet the UI doesn't clearly differentiate timeout from success

---

## CRITICAL FIX REQUIRED: Complete the Callback Wiring

**The subagent's work was incomplete.** The callback infrastructure (`on_config_ack` closure) was added but `nullptr` was still passed to `api_node_config_start()` at line 2657. This means the fix doesn't work — the handler still returns ACCEPTED immediately.

### Fix Required: Replace `nullptr` with actual callback

**File:** `components/esp_tree_bridge/esp_tree_bridge.cpp:2656-2668`

**Current broken code:**
```cpp
std::string immediate;
const bool ok = api_node_config_start(request.remote_mac, command, payload, request.command, nullptr, immediate);
//                                                                                                ^^^^^^^ NULLPTR!
const auto status = ok ? bridge_api::runtime_pb::COMMAND_STATUS_ACCEPTED :
                        bridge_api::runtime_pb::COMMAND_STATUS_FAILED;
bridge_api::runtime_pb::envelope(out, request_id, bridge_api::runtime_pb::CONFIG_COMMAND_RESULT,
                                 [&](bridge_api::runtime_pb::Writer &w) {
  w.string(1, request.remote_mac);
  w.string(2, request.command);
  w.string(3, mac_colon_string_(sta_mac_.data()));
  w.varint(5, status);
  w.string(7, immediate);
});
finish();  // <-- sends immediately, never waits for ACK
```

**Correct code — wire the callback:**
```cpp
auto on_config_ack = [this, request_id, callback, remote_mac = request.remote_mac, cmd = request.command](
    const ConfigAckResult &result) {
  if (!callback) return;
  auto status = bridge_api::runtime_pb::COMMAND_STATUS_ACCEPTED;
  if (!result.acked) {
    if (result.timed_out || result.no_session) {
      status = bridge_api::runtime_pb::COMMAND_STATUS_TIMEOUT;
    } else if (result.result == CFG_RESULT_BUSY) {
      status = bridge_api::runtime_pb::COMMAND_STATUS_UNAVAILABLE;
    } else {
      status = bridge_api::runtime_pb::COMMAND_STATUS_FAILED;
    }
  }
  std::vector<uint8_t> out;
  bridge_api::runtime_pb::envelope(out, request_id, bridge_api::runtime_pb::CONFIG_COMMAND_RESULT,
                                   [&](bridge_api::runtime_pb::Writer &w) {
    w.string(1, remote_mac);
    w.string(2, cmd);
    w.string(3, mac_colon_string_(sta_mac_.data()));
    w.varint(5, status);
    w.string(7, config_result_string_(result));
  });
  callback(out);
};

std::string immediate;
if (!api_node_config_start(request.remote_mac, command, payload, request.command, on_config_ack, immediate)) {
  // Handle immediate failure...
  if (callback) {
    if (immediate.empty()) immediate = bridge_api::config_result::NO_SESSION;
    auto status = bridge_api::runtime_pb::COMMAND_STATUS_FAILED;
    if (immediate == bridge_api::config_result::TIMEOUT) status = bridge_api::runtime_pb::COMMAND_STATUS_TIMEOUT;
    else if (immediate == bridge_api::config_result::BUSY) status = bridge_api::runtime_pb::COMMAND_STATUS_UNAVAILABLE;
    std::vector<uint8_t> out;
    bridge_api::runtime_pb::envelope(out, request_id, bridge_api::runtime_pb::CONFIG_COMMAND_RESULT,
                                     [&](bridge_api::runtime_pb::Writer &w) {
      w.string(1, request.remote_mac);
      w.string(2, request.command);
      w.string(3, mac_colon_string_(sta_mac_.data()));
      w.varint(5, status);
      w.string(7, immediate);
    });
    callback(out);
  }
  return;
}
// Response via callback when remote ACKs or ~1.5s timeout — NO finish() call here
```

This single change fixes all five config commands: `reboot`, `heartbeat_interval`, `force_rediscover`, `set_parent_mac`, `relay`.

---

## Task 1: Fix Bridge Firmware — Protobuf Config Handler

**Files:**
- Modify: `components/esp_tree_bridge/esp_tree_bridge.cpp:2656-2668` (CRITICAL: wire the callback)
- Modify: `components/esp_tree_bridge/bridge_api_proto_ws.cpp:443-451` (DONE by subagent)

---

## Task 2: Add-on — Propagate Failure Results Properly

**Files:**
- Modify: `app/bridge_v2_client.py:335-375` ✅ (DONE by subagent)
- Review: `ui/src/components/device-config.ts:44-50` ✅ (verified OK)

**Note:** WS mode already works correctly. The 5s timeout raises `ConfigTimeoutError` → HTTP 504 → UI shows error. The bug is that the bridge returns success too early, so the add-on never gets a timeout response to surface.

- [ ] **Step 1: Fix V2 client result mapping for `COMMAND_STATUS_ACCEPTED`**

The bridge Task 1 fix means the bridge will send actual status (ACCEPTED/DELIVERED/FAILED/TIMEOUT). The V2 client currently maps `ACCEPTED` and `DELIVERED` both to `"ok"` without checking `error_message`. Update the mapping in `bridge_v2_client.py:360-375` to inspect `error_message` for `ACCEPTED` status:

```python
# In send_config(), after receiving result from bridge:
status_name = pb.CommandStatus.Name(result.status)
if result.status == pb.COMMAND_STATUS_TIMEOUT:
    result_str = "timeout"
elif result.status == pb.COMMAND_STATUS_UNSUPPORTED:
    result_str = "unsupported"
elif result.status == pb.COMMAND_STATUS_ACCEPTED:
    # ACCEPTED means bridge queued the config; real result is in error_message
    em = (result.error_message or "").lower()
    if em in ("", "ok", "accepted"):
        result_str = "ok"
    elif em == "timeout":
        result_str = "timeout"
    elif em == "busy":
        result_str = "busy"
    elif em in ("rejected", "invalid_payload"):
        result_str = "rejected"
    else:
        result_str = "ok"  # default
elif result.status == pb.COMMAND_STATUS_DELIVERED:
    result_str = "ok"
else:
    result_str = "rejected"
```

- [ ] **Step 2: Verify UI `configError()` shows timeout properly**

Current code in `device-config.ts:44-51`:
```typescript
private configError(command: string, result: string | undefined, raw: unknown): void {
  if (result === undefined) {
    console.error('Unexpected config response:', raw);
    this.notify(`${command} returned an unexpected response`, 'error');
  } else {
    this.notify(`${command} returned ${result}`, 'error');
  }
}
```

This will show "Reboot returned timeout" which is acceptable. No change needed unless you want a more user-friendly message like "Remote did not respond (timeout)".

- [ ] **Step 3: Add "timeout" to `configStatusCode()` mapping in server.py**

The `server.py:1507-1514` already maps "timeout" to HTTP 504. No change needed.

---

## Task 3: Verify ESP-NOW ACK Protocol

**Files:**
- Review: `components/esp_tree_bridge/bridge_protocol.cpp:463-495`
- Review: `components/esp_tree_bridge/bridge_protocol.cpp:1367-1398`
- Review: `components/esp_tree_bridge/bridge_protocol.cpp:2082-2122`
- Review: `components/espnow_lr_remote/` (config ACK generation)

- [ ] **Step 1: Verify CONFIG_ACK_TIMEOUT_MS and CONFIG_MAX_RETRIES**

From `bridge_protocol.h:359-360`:
- `CONFIG_ACK_TIMEOUT_MS = 500ms`
- `CONFIG_MAX_RETRIES = 3`

Total max wait: ~2 seconds (3 retries × 500ms + gaps). This is reasonable.

- [ ] **Step 2: Confirm remote sends PKT_CONFIG ACK**

Find where remote generates config ACK in `espnow_lr_remote` components. Should be in response to `espnow_config_t` handling.

- [ ] **Step 3: Check CFG_RESULT_BUSY path**

Find where remote returns `CFG_RESULT_BUSY`. Confirm add-on would surface "busy" if remote is already processing a config.

---

## Task 4: End-to-End Test

**Files:**
- Create: `ha_integration/tests/test_config_e2e.py`

- [ ] **Step 1: Write test for config timeout (offline remote)**

```python
async def test_config_timeout_offline_remote(bridge_client, offline_remote_mac):
    result = await bridge_client.send_config(offline_remote_mac, "reboot")
    assert result["result"] == "timeout"
```

- [ ] **Step 2: Write test for config success (online remote)**

Requires mocking the remote ACK.

- [ ] **Step 3: Write test for config busy/rejected**

---

## Files Summary

| File | Change |
|---|---|
| `components/esp_tree_bridge/esp_tree_bridge.h` | Add `ConfigResponseCallback` type, update `api_runtime_handle_config_command` signature |
| `components/esp_tree_bridge/esp_tree_bridge.cpp:2618-2662` | Implement callback-based response |
| `components/esp_tree_bridge/bridge_api_proto_ws.cpp:443-451` | Pass callback instead of using result parameter |
| `app/bridge_v2_client.py:335-375` | Fix result mapping for ACCEPTED status |
| `ui/src/components/device-config.ts:44-50` | Verify configError shows timeout message correctly |
| `ha_integration/tests/test_config_e2e.py` | Add E2E tests for config commands |

---

## Verification Checklist

1. **Bridge: Config to offline remote** → `"timeout"` result (not `"ok"`)
2. **Bridge: Config to online remote that ACKs** → `"ok"` result
3. **Add-on: V2 timeout** → HTTP 504 with `{"result": "timeout"}`
4. **Add-on: WS timeout** → HTTP 504 with `{"result": "timeout"}`
5. **UI: Timeout error** → User sees "Reboot returned timeout" toast
6. **UI: Busy remote** → User sees "returned busy" toast
7. **Both modes (WS + V2) work correctly**