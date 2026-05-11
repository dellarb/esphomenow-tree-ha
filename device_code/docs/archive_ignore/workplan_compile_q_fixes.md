# Compile Queue — Bug Fixes & Missing Features

Trace of the compile queue implementation revealed bugs, missing features, and cleanup items. Prioritized and organized below.

---

## BUG-1: `create_job` double `queue_order` assignment for COMPILE_QUEUED

**Severity:** CRITICAL
**File:** `app/db.py:278-283`

**Problem:** When `status == COMPILE_QUEUED`, the code first correctly calculates `queue_order` from compile-queued jobs, then immediately overwrites it with a query against `QUEUED` (flash queue) jobs. Compile-queued jobs get queue positions from the wrong namespace.

```python
# Current — both blocks always execute
if data["status"] in (QUEUED, COMPILE_QUEUED):
    status_filter = data["status"]
    row = conn.execute("SELECT MAX(queue_order) ... WHERE status = ?", (status_filter,)).fetchone()
    data["queue_order"] = ...  # correct for COMPILE_QUEUED
    # BUG: always runs, overwrites with QUEUED ordering
    row = conn.execute("SELECT MAX(queue_order) ... WHERE status = ?", (QUEUED,)).fetchone()
    data["queue_order"] = ...
```

**Fix:** Make the second query conditional on `status == QUEUED` only. Each queue namespace must maintain independent orderings.

```python
if data["status"] in (QUEUED, COMPILE_QUEUED):
    status_filter = data["status"]
    row = conn.execute("SELECT MAX(queue_order) as max_order FROM ota_jobs WHERE status = ?", (status_filter,)).fetchone()
    data["queue_order"] = (row["max_order"] if row and row["max_order"] is not None else -1) + 1
```

The second query block targeting `QUEUED` specifically was a leftover from the original code where only `QUEUED` existed. It must be removed entirely.

---

## BUG-2: CompileWorker doesn't wake OTA worker after compile → QUEUED transition

**Severity:** HIGH
**File:** `app/compile_worker.py`

**Problem:** After a successful compile, `_process()` transitions the job from `COMPILING → QUEUED` (entering the flash queue). Per the workplan (CQ-2.3 step 5), it should then wake the OTA worker so it can immediately pick up the new flash job. Currently the OTA worker only discovers the new job on its next 5-second housekeeping poll, adding unnecessary latency.

**Fix:** Add `ota_worker` reference to `CompileWorker.__init__()` and call `self.ota_worker.wake()` after transitioning the job to `QUEUED` in `_process()`.

Changes:

1. Add `ota_worker` parameter to `CompileWorker.__init__()`
2. Store as `self.ota_worker`
3. In `_process()`, after the `db.update_job(job["id"], status=QUEUED, ...)` call, add `self.ota_worker.wake()`
4. In `server.py create_app()`, pass `ota_worker` to `CompileWorker` constructor

---

## BUG-3: Compile request TOCTOU race — two compiles could both get `COMPILING` status

**Severity:** MEDIUM
**File:** `app/server.py:532-546`

**Problem:** The compile endpoint checks `db.active_compile_job()` then decides whether to create the job as `COMPILING` or `COMPILE_QUEUED`. Between the check and the insert, another request could also see no active compile and create a second `COMPILING` job. Both would be processed concurrently by the worker, violating the "one compile at a time" invariant.

**Fix:** Move the race check into the `_dequeue_next()` method. The endpoint always creates jobs as `COMPILE_QUEUED`. The `CompileWorker._dequeue_next()` is the single authority for promoting to `COMPILING` — it checks `active_compile_job()` first and only promotes if no job is currently `COMPILING`. This eliminates the TOCTOU window entirely because `_dequeue_next()` runs inside the single compile-worker loop.

Additionally, add a guard in `_dequeue_next()`:

```python
async def _dequeue_next(self) -> None:
    if self.db.active_compile_job():
        return  # another job is already COMPILING
    next_job = self.db.next_compile_queued_job()
    if not next_job:
        return
    # ... existing promotion logic
```

This simplifies the server endpoint — it always creates `COMPILE_QUEUED` jobs:

```python
job = db.create_job({
    "mac": normalize_mac(mac),
    "status": COMPILE_QUEUED,  # always
    ...
})
compile_worker.wake()
```

The `queue_position` response should use `count_compile_queued_before()` plus 1 if an active compile exists (the active compile counts as position 0).

---

## BUG-4: Frontend config page doesn't poll when job is in flash phase on page load

**Severity:** HIGH
**File:** `ui/src/pages/config-page.ts`

**Problem:** When the user navigates to the config page and a compile-originated job is already `QUEUED` (waiting to flash) or actively flashing (`STARTING`/`TRANSFERRING`/etc.), the `load()` method calls `pollCompileStatus()` once but doesn't call `startPolling()`. The user sees a stale snapshot and no live updates.

Polling is only started inside `pollCompileStatus()` for `compile_queued` and `compiling` states (lines 77, 82). The `queued_for_flash` branch at line 87 also calls `this.startPolling()`, but this only triggers if the poll happens to return `queued` — the `starting`/`transferring` branch at line 95 starts polling too. However, after `startPolling()` is called for those states, subsequent polls hit the `queued`/`starting`/`transferring` branches which all call `startPolling()` again (which is a no-op if already polling). The polling does eventually stop when a terminal state is reached.

The real issue: for `queued_for_flash` when position is 0 (it's next to flash), the user should see real-time updates as the OTA worker picks it up. The polling is started, so this is actually mostly correct on re-examination, but there's a subtle gap — the `compilePhase` was `'success'` in the old `CompilePhase` type but is now `'queued_for_flash'`. The render logic shows the success card and flash buttons, which is correct. However, the `pollCompileStatus` doesn't update the `compileQueuePosition` when the job transitions from `QUEUED` to `STARTING` in the flash queue — it just keeps `compilePhase` as `queued_for_flash`. The flash queue position will go stale.

**Fix:** In `pollCompileStatus()`, for all `queued_for_flash` states, continue polling and update queue position. Also, when the job reaches a terminal flash status (`success`/`failed`/etc.), transition `compilePhase` appropriately and stop polling.

Additionally, when the job reaches a terminal flash status, the `pollCompileStatus` should detect it. Currently the code doesn't handle terminal flash states (`success`, `failed`, `rejoin_timeout`, `version_mismatch`, `aborted`). Add a check for those.

---

## BUG-5: `device-detail.ts` doesn't pass compile-phase jobs to `ota-box`

**Severity:** MEDIUM
**File:** `ui/src/components/device-detail.ts`

**Problem:** The `esp-ota-box` component has new `COMPILE_QUEUED` and `COMPILING` overlay renderers, but it only receives a `currentJob` property. When `device-detail.ts` populates this, it likely only fetches the active flash job from `/api/ota/current`, which now excludes compile-phase jobs. The compile overlays will never appear on the device detail page.

**Fix:** The `device-detail.ts` component needs to also query for compile-phase jobs for its device. Options:

- **Option A:** Add a new endpoint `GET /api/ota/current-for-device/{mac}` that returns any active job (including compile-phase) for a specific device.
- **Option B:** Query `/api/devices/{mac}/compile/status` alongside the existing queue/topology polls in `device-detail.ts` and pass the result as `currentJob` if it's a compile-phase job and no flash-phase job exists for that device.
- **Option C:** Modify `/api/ota/current` to accept an optional `?mac=` filter that includes compile-phase jobs. This is the least-invasive approach.

Recommended: **Option C** — modify the existing `/api/ota/current` endpoint to accept an optional `mac` query parameter. When provided, return `active_job_for_device(mac)` (which includes compile statuses) instead of `active_job()` (which excludes them). Then `device-detail.ts` passes `?mac=AA:BB:...` to get the device-scoped active job.

---

## MISSING-1: `compiler._compile_lock` not removed

**Severity:** LOW (redundancy, not a bug)
**File:** `app/compiler.py:62-63, 121`

**Problem:** The workplan explicitly says (CQ-2.8): "Remove `compiler._compile_lock` from `compiler.py`. Serialization is now handled by `CompileWorker` — only one `COMPILING` job exists at a time." The lock still exists and `compile()` still acquires it. This is redundant and could cause confusing deadlocks if the lock is ever held while the worker tries to do something else.

**Fix:** Remove `self._compile_lock = asyncio.Lock()` from `__init__` and remove `async with self._compile_lock:` from the `compile()` method (dedent the body).

---

## MISSING-2: `_preflight_comparison` circular import

**Severity:** LOW (works today, fragile)
**File:** `app/compile_worker.py:115`

**Problem:** `_preflight_comparison` is imported inside `_process()` via `from .server import _preflight_comparison` to avoid circular imports (`server.py` imports `CompileWorker` at module level). This is a lazy-import pattern that works in CPython but is fragile — if the import graph changes, it could fail silently or cause surprising import-order bugs.

**Fix:** Extract `_preflight_comparison`, `_parse_build_datetime`, and `_format_time_delta` from `server.py` into a new shared module `app/preflight.py`. Import from there in both `server.py` and `compile_worker.py`.

---

## MISSING-3: Server endpoint `/api/ota/current` doesn't support device-scoped queries

**Severity:** MEDIUM (needed for BUG-5 fix)
**File:** `app/server.py:217-219`

**Problem:** The `/api/ota/current` endpoint returns only the globally active flash job. It cannot return compile-phase jobs or device-scoped active jobs. This makes it impossible for the device detail page to show compile overlays.

**Fix:** Add optional `?mac=` query parameter. When provided, return the first active job for that MAC from `active_job_for_device(mac)` (which includes compile statuses). When omitted, keep existing behavior (`active_job()` — flash-only).

---

## Implementation Order

| Order | ID | Description | Files |
|-------|----|-------------|-------|
| 1 | BUG-1 | Fix `queue_order` double assignment | `app/db.py` |
| 2 | BUG-2 | Wake OTA worker after compile→QUEUED | `app/compile_worker.py`, `app/server.py` |
| 3 | BUG-3 | Eliminate TOCTOU race in compile endpoint | `app/server.py`, `app/compile_worker.py` |
| 4 | BUG-4 | Fix config page polling for flash-phase states | `ui/src/pages/config-page.ts` |
| 5 | MISSING-3 | Add `?mac=` to `/api/ota/current` | `app/server.py` |
| 6 | BUG-5 | Pass compile-phase jobs to ota-box on device page | `ui/src/components/device-detail.ts` |
| 7 | MISSING-2 | Extract preflight to shared module | `app/preflight.py`, `app/server.py`, `app/compile_worker.py` |
| 8 | MISSING-1 | Remove `compiler._compile_lock` | `app/compiler.py` |

---

## Detailed Steps

### Step 1: Fix `queue_order` double assignment (BUG-1)

In `app/db.py`, inside `create_job()`:

- Remove lines 282-283 (the second `SELECT MAX(queue_order)` query that always targets `QUEUED` status)
- Keep only the parameterized query using `status_filter`

### Step 2: Wake OTA worker after compile→QUEUED (BUG-2)

In `app/compile_worker.py`:

1. Add `ota_worker: OTAWorker` parameter to `__init__()`
2. Store as `self.ota_worker`
3. After `db.update_job(job["id"], status=QUEUED, ...)` in `_process()`, add:
   ```python
   self.ota_worker.wake()
   ```

In `app/server.py`:

4. Pass `ota_worker=ota_worker` to `CompileWorker(...)` constructor

### Step 3: Eliminate TOCTOU race (BUG-3)

In `app/server.py`, simplify `compile_device_config()`:

1. Always create the job with `status=COMPILE_QUEUED` (remove the `active_compile_job()` check for deciding status)
2. Calculate `queue_position` as `count_compile_queued_before(job_id) + (1 if active_compile else 0)` — active compile counts as position 0
3. Always call `compile_worker.wake()`

In `app/compile_worker.py`, add guard to `_dequeue_next()`:

1. At the top of `_dequeue_next()`, check `if self.db.active_compile_job(): return`
2. This is the single point of authority for promoting to COMPILING

### Step 4: Fix config page polling for flash-phase states (BUG-4)

In `ui/src/pages/config-page.ts`:

1. In `pollCompileStatus()`, add handling for terminal flash statuses:
   ```typescript
   } else if (['success', 'failed', 'aborted', 'rejoin_timeout', 'version_mismatch'].includes(status.status)) {
     this.compilePhase = status.status === 'success' ? 'idle' : 'failed';
     this.compileJobId = null;
     this.compileQueuePosition = null;
     this.stopPolling();
   }
   ```
2. Ensure `startPolling()` is called for all `queued_for_flash` states
3. When polling returns `idle` and `compilePhase` is `queued_for_flash`, the job may have completed and been retained — transition to idle

### Step 5: Add `?mac=` to `/api/ota/current` (MISSING-3)

In `app/server.py`:

```python
@app.get("/api/ota/current")
async def ota_current(mac: str | None = None) -> dict[str, Any]:
    if mac:
        return {"job": db.active_job_for_device(normalize_mac(mac))}
    return {"job": db.active_job()}
```

### Step 6: Pass compile-phase jobs to ota-box (BUG-5)

In `ui/src/components/device-detail.ts`:

1. When fetching the active job for the device, call `/api/ota/current?mac={this.mac}` instead of `/api/ota/current`
2. This returns compile-phase jobs too, so `currentJob` on `esp-ota-box` will include them
3. The existing `esp-ota-box` render logic already handles `compile_queued` and `compiling` statuses

### Step 7: Extract preflight to shared module (MISSING-2)

1. Create `app/preflight.py` containing:
   - `preflight_comparison(node, info)` (renamed from `_preflight_comparison`)
   - `_parse_build_datetime(s)`
   - `_format_time_delta(seconds)`
   - `CHIP_TYPE_DECIMAL` dict
2. In `app/server.py`: `from .preflight import preflight_comparison` and replace all `_preflight_comparison` calls
3. In `app/compile_worker.py`: `from .preflight import preflight_comparison` at module level, replace lazy import
4. Delete `_preflight_comparison`, `_parse_build_datetime`, `_format_time_delta`, and `CHIP_TYPE_DECIMAL` from `app/server.py`

### Step 8: Remove `compiler._compile_lock` (MISSING-1)

In `app/compiler.py`:

1. Remove `self._compile_lock = asyncio.Lock()` from `__init__`
2. In `compile()` method: remove `async with self._compile_lock:` and dedent the method body