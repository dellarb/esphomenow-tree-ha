# HA Restart from Integration Repair Flow — Investigation

## Problem

When the ESP Tree add-on installs or updates its Home Assistant integration
(`custom_components/esp_tree/`), it writes a `.restart_required.json` marker file.
An `update_repair.py` watcher creates a fixable repair issue in HA. The user sees a
"Restart required" notification. Clicking "Submit" on the repair form should restart
Home Assistant — but **it does not actually restart HA**.

**Observed behaviour:** The repair form closes (marked as "fixed"), but HA does not restart.
Environment: HA OS / Supervised. No error shown in the UI.

## Architecture

Three restart paths exist in the add-on ecosystem:

| # | Path | Mechanism | Location |
|---|------|-----------|----------|
| 1 | Add-on `/api/restart` | Supervisor `POST /core/restart` → fallback to HA WebSocket `call_service homeassistant.restart` | `app/server.py:530-560` |
| 2 | HA integration direct call | `hass.services.async_call("homeassistant", "restart")` | `ha_integration/.../__init__.py` |
| 3 | Supervisor API direct | `POST http://supervisor/core/restart` with Bearer token | `ha_integration/.../__init__.py` (added in v6) |

The repair flow (`RestartRequiredFlow` in `__init__.py`) has evolved through 6 versions of
the restart mechanism.

## Git History — Timeline of Restart Flow Changes

### v1 — Initial: direct `await` (commit `110a4c5`)
```python
await self.hass.services.async_call("homeassistant", "restart")
return self.async_create_entry(title="", data={})
```
Moved flow from `repairs.py` to `__init__.py`. Simple direct service call.
No fallback. No error handling.

### v2 — `call_soon` with lambda (commit `62f5785`)
```python
self.hass.loop.call_soon(
    lambda: self.hass.services.async_call("homeassistant", "restart")
)
return self.async_create_entry(title="", data={})
```
**Intent:** Let the flow response return before the restart begins.
**BUG:** `call_soon` runs callbacks synchronously and does NOT handle coroutines.
The lambda returns a coroutine object that is never awaited — the restart service
**never executes**. This is the likely origin of the bug.

### v3 — `async_create_task` (commit `c5b4842`)
```python
self.hass.async_create_task(
    self.hass.services.async_call("homeassistant", "restart")
)
return self.async_create_entry(title="", data={})
```
**FIX for v2:** `async_create_task` properly schedules a coroutine on the event loop.
The restart service should now execute.

### v4 — `await` with `blocking=False`, add-on fallback first (commit `c1eecdc`)
```python
# Try add-on endpoint first
if await self._restart_via_addon():
    return self.async_create_entry(title="", data={})

# Fallback: direct HA service
try:
    await self.hass.services.async_call("homeassistant", "restart", blocking=False)
    return self.async_create_entry(title="", data={})
except Exception as exc:
    _LOGGER.warning(...)
```
Added `_restart_via_addon()` method (POSTs to add-on's `/api/restart`).
Issues:
- `_restart_via_addon` requires a hub config entry with `CONF_ADDON_URL` — if none
  exists (fresh install, no hub configured), returns `False` silently.
- `blocking=False` on the HA service call means service dispatch failures are
  swallowed. The `async_call` returns without exception even if the restart service
  dispatch fails.

### v5 — `await` with `blocking=True`, shared config fallback (commit `75a915a` / `3545eb2`)
```python
# Try add-on endpoint first
if await self._restart_via_addon():
    return self.async_create_entry(title="", data={})

# Fallback: direct HA service (blocking=True)
try:
    await self.hass.services.async_call("homeassistant", "restart")
    return self.async_create_entry(title="", data={})
except Exception:
    _LOGGER.info("Direct HA restart failed, trying add-on fallback")
```
Changes:
- `_restart_via_addon()` now falls back to `read_shared_config()` for `addon_url`
  when no hub entry exists (or when hub entry has no URL).
- Removed `blocking=False` — service dispatch failures now raise exceptions.
- HA service is tried first in the try/except; add-on is the implicit pre-check.

**User tested this version. Result: Form closes, no restart.**
Both paths (`_restart_via_addon` and `homeassistant.restart`) return "success" but
HA does not restart.

### v6 — Supervisor API direct (HEAD, commit `9e33b92`)
```python
# Try supervisor API directly (most reliable in HA OS)
if await self._restart_via_supervisor():
    return self.async_create_entry(title="", data={})

# Fallback 1: direct HA service
try:
    await self.hass.services.async_call("homeassistant", "restart")
    return self.async_create_entry(title="", data={})
except Exception:
    _LOGGER.info("Direct HA restart failed, trying add-on fallback")

# Fallback 2: add-on /api/restart endpoint
if await self._restart_via_addon():
    return self.async_create_entry(title="", data={})

# All methods failed
_LOGGER.error("Failed to restart Home Assistant")
return self.async_show_form(..., errors={"base": "restart_failed"})
```
New `_restart_via_supervisor()` method:
```python
async def _restart_via_supervisor(self) -> bool:
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        return False
    # POST http://supervisor/core/restart
    # Authorization: Bearer <token>
    # Returns True if 2xx response
```
Uses the same supervisor API that the add-on's server-side restart uses.
Should be the most direct/reliable method in HA OS.

**Status: Not yet tested by user.**

## Cascade Summary (v6, current)

```
User clicks Submit
  |
  v
[1] _restart_via_supervisor()  → POST http://supervisor/core/restart
  |  Requires: SUPERVISOR_TOKEN env var (HA OS only)
  |  Returns: True if 2xx from supervisor
  |
  v (if False or token missing)
[2] hass.services.async_call("homeassistant", "restart")
  |  blocking=True (default) — exceptions propagate
  |  Returns: via async_create_entry (success) or except (fallback)
  |
  v (if exception)
[3] _restart_via_addon()  → POST {addon_url}/api/restart
  |  addon_url from: hub entry > shared_config > hardcoded 127.0.0.1:8099
  |  Returns: True if add-on responds {"success": true}
  |
  v (if False)
[X] Show "restart_failed" error on form
```

## Server-Side Restart (Add-on's `/api/restart`)

Located in `app/server.py:530-560`:

```python
async def restart_home_assistant() -> dict[str, Any]:
    # Method 1: POST http://supervisor/core/restart
    #   Requires SUPERVISOR_TOKEN
    #   If 2xx → returns {"success": True, "method": "supervisor"}

    # Method 2 (fallback): HA WebSocket call_service homeassistant.restart
    #   Returns {"success": True, "method": "homeassistant_service"}
```

The `/api/restart` endpoint (`server.py:1082`) calls `restart_home_assistant()` and
returns `{"success": True}` if either method reports success. **However, "success" only
means the API call was accepted — not that HA actually restarted.**

## Known Issues & Observations

1. **`hass.services.async_call("homeassistant", "restart")` from within an HA integration**
   — This is the standard way to restart HA from within. It calls the core service handler
   which schedules `hass.async_stop(RESTART_EXIT_CODE)`. In HA OS, the supervisor should
   detect exit code 100 and restart the Core. Why this fails is unclear.

2. **The repair flow returns `async_create_entry` before the restart executes.**
   The flow response closes the UI dialog, marking the issue as fixed. If the restart
   never fires, the user sees a resolved repair but no actual restart.

3. **`_restart_via_addon()` URL resolution** — The add-on writes `addon_url` to the
   shared config as `http://127.0.0.1:8099`. From within the HA Core container, this
   points to HA Core's own port 8099, not the add-on's. The add-on's `/api/restart`
   uses `http://supervisor/` for its own calls, but the HA integration can't reach the
   add-on at `127.0.0.1:8099` in a Docker-based HA OS setup. This means `_restart_via_addon()`
   likely always fails when called from the HA integration (wrong address).

4. **`SUPERVISOR_TOKEN` availability** — In HA OS, `os.environ["SUPERVISOR_TOKEN"]` is
   available inside the Core container. The new `_restart_via_supervisor()` depends on this.
   If the token is missing (non-HA-OS installs), it returns `False` and falls through.

5. **No user-facing error** — In v4/v5, if `_restart_via_addon` returned `False` and
   `homeassistant.restart` didn't raise (blocking=False swallowed errors), the flow
   returned `async_create_entry` successfully. The repair was marked fixed with no
   restart occurring. v6 fixes this by making the HA service call blocking (exceptions
   propagate) and showing `restart_failed` if all three methods fail.

## Open Questions

1. Why does `hass.services.async_call("homeassistant", "restart", blocking=True)` succeed
   (no exception) but HA does not restart? The handler schedules `async_stop(RESTART_EXIT_CODE)`
   — does this task get cancelled or silently fail?

2. Is the `SUPERVISOR_TOKEN` value correct at runtime within the HA Core container?
   A bad or expired token would cause `POST http://supervisor/core/restart` to return
   401/403, returning `False`, then falling through to the other methods.

3. Does the `aiohttp.ClientSession` from within the HA integration's repairs flow have
   the right network access to reach `http://supervisor/core/restart`? Docker DNS
   resolution for `supervisor` should work from within the HA Core container.

4. Does the Supervisor API's `POST /core/restart` actually return a 2xx before the
   restart begins, or does the connection close mid-request? The `_restart_via_supervisor()`
   method checks for `200 <= resp.status < 300`. If the supervisor force-closes the
   connection during restart, the `aiohttp` call might raise an exception instead of
   returning a clean response.

## Files Involved

| File | Role |
|------|------|
| `ha_integration/custom_components/esp_tree/__init__.py` | `RestartRequiredFlow` class (repair flow with restart logic) |
| `ha_integration/custom_components/esp_tree/update_repair.py` | Watcher that syncs `.restart_required.json` to HA repair registry |
| `app/server.py:530-560` | `restart_home_assistant()` — server-side restart via supervisor API |
| `app/server.py:1082` | `POST /api/restart` endpoint |
| `ha_integration/custom_components/esp_tree/config_flow.py` | `read_shared_config()` — reads add-on URL from shared config |
| `ha_integration/custom_components/esp_tree/translations/en.json` | UI strings for the repair flow |
