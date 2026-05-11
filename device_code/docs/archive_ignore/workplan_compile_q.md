# Compile Queue — Workplan

## Goal

Integrate compile requests into the existing OTA job queue so that clicking "Compile & Install" on multiple devices queues them up sequentially rather than rejecting with HTTP 409. Compiles run one at a time; after a compile succeeds, the job auto-transitions into the flash queue. The compile queue and flash queue operate in parallel (one compile at a time, one flash at a time) since they use different resources (Docker vs. bridge radio).

This transforms the workflow from "compile blocks the HTTP handler for minutes and rejects concurrent requests" to "compile is instant, jobs queue up, and a background worker processes them sequentially."

---

## Context

### What Exists Today

1. **OTA job queue** (`db.py`, `ota_worker.py`) — SQLite-backed job table with statuses `pending_confirm → queued → starting → transferring → verifying → waiting_rejoin → success/failed`. The OTA worker dequeues and flashes one device at a time. The queue page shows active + queued jobs with reordering and abort.

2. **Compile endpoint** (`POST /api/devices/{mac}/compile`) — Blocks the HTTP handler for the entire Docker compile (3-10 minutes). Returns 409 if another compile is running. No queuing.

3. **Compile infrastructure** (`compiler.py`, `compile_store.py`) — `ESPHomeCompiler` manages Docker container lifecycle. `CompileStore` persists per-device compile status as JSON files. `stream_logs()` yields SSE events from the Docker container.

4. **Frontend** — Config page blocks on `compileDevice()` awaiting the full compile. No queue position. No cancel during queue wait.

### What We're Building On

- The **same `ota_jobs` table** for compile-originated and upload-originated jobs. Two new statuses (`COMPILE_QUEUED`, `COMPILING`) distinguish compile-phase jobs from flash-phase jobs.
- The **same OTA worker** for flashing, with a status filter to skip compile-phase jobs.
- A **new `CompileWorker`** (mirrors OTA worker) that dequeues and processes compiles one at a time.
- Existing **compile log streaming** and **preflight comparison** logic, reused as-is.

---

## Decisions Summary

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Queue storage | Same `ota_jobs` table, new statuses | Reuses existing queue UI, DB, and infrastructure. No new table needed. |
| 2 | Compile concurrency | One at a time | Docker container name is hardcoded. PlatformIO cache would conflict with parallel runs. Matches ESPHome add-on pattern. |
| 3 | Compile vs. flash parallelism | Parallel (different workers, different resources) | Compiles use CPU/disk. Flashes use bridge radio. No contention. Enables pipeline: compile A → flash A + compile B. |
| 4 | After compile succeeds | Auto-transition to flash queue (`QUEUED`) | No manual confirmation needed. Pre-flight (name + chip) already verified before queueing. Build date is assumed newer. |
| 5 | Pre-flight checks | Name match + chip match before queueing | Catches mismatches before wasting a compile slot. Build date is always newer after compile, so not checked. |
| 6 | Manual flash button | Kept on config page | For re-flashing devices. Auto-queue handles the normal compile-to-flash flow. |
| 7 | Cancel/abort | Abort `COMPILE_QUEUED` jobs = delete from queue. Cancel `COMPILING` jobs = kill Docker container + mark `FAILED`. | Mirrors OTA queue abort pattern. |
| 8 | Startup recovery | `COMPILING` job at startup → mark `FAILED` (container gone). `COMPILE_QUEUED` jobs survive (just waiting). | Docker container is ephemeral and won't survive add-on restart. |
| 9 | Frontend compile flow | Non-blocking: POST returns 202, poll status every 2s | User gets instant feedback. Queue position shown. No more multi-minute HTTP hangs. |
| 10 | Queue page | Two sections: Compile Queue + Flash Queue | Clear visual separation. Users see exactly where each job is. |

---

## New Job Status Flow

### Compile + Flash Pipeline (new)

```
COMPILE_QUEUED  →  COMPILING  →  QUEUED  →  STARTING  →  TRANSFERRING  →  VERIFYING  →  WAITING_REJOIN  →  SUCCESS
                                  (flash queue begins)                                                        ↘ REJOIN_TIMEOUT
                 ↘ FAILED (compile failed)                    ↘ FAILED (flash failed)                        ↘ VERSION_MISMATCH
```

### Manual Upload (existing, unchanged)

```
PENDING_CONFIRM  →  (user confirms)  →  QUEUED  →  STARTING  →  TRANSFERRING  →  ...  →  SUCCESS
```

### Status Table

| Status | Constant | Worker | Phase | Description |
|--------|----------|--------|-------|-------------|
| `compile_queued` | `COMPILE_QUEUED` | CompileWorker | Compile queue | Waiting for a compile slot |
| `compiling` | `COMPILING` | CompileWorker | Compile active | Docker container is running |
| `pending_confirm` | `PENDING_CONFIRM` | — | Flash | Manual upload, awaiting user click |
| `queued` | `QUEUED` | OTAWorker | Flash queue | Waiting for flash slot |
| `starting` | `STARTING` | OTAWorker | Flash active | Bridge starting transfer |
| `transferring` | `TRANSFERRING` | OTAWorker | Flash active | Sending chunks |
| `verifying` | `VERIFYING` | OTAWorker | Flash active | Bridge verifying |
| `waiting_rejoin` | `WAITING_REJOIN` | OTAWorker | Flash active | Waiting for device to come back |
| `success` | `SUCCESS` | — | Terminal | Done |
| `failed` | `FAILED` | — | Terminal | Failed |
| `aborted` | `ABORTED` | — | Terminal | User cancelled |
| `rejoin_timeout` | `REJOIN_TIMEOUT` | — | Terminal | Device didn't come back |
| `version_mismatch` | `VERSION_MISMATCH` | — | Terminal | Wrong firmware after rejoin |

### Key Invariants

- **Only one job can be `COMPILING` at a time.** CompileWorker serializes compiles.
- **Only one job can be in `{STARTING, TRANSFERRING, VERIFYING, WAITING_REJOIN}` at a time.** OTAWorker serializes flashes.
- **`COMPILE_QUEUED` jobs are promoted to `COMPILING` in FIFO order by `queue_order`.**
- **`QUEUED` flash jobs are promoted to `STARTING` in FIFO order by `queue_order`.** This includes both compile-originated and manual-upload jobs.
- **A compile-originated job transitions from `COMPILING` → `QUEUED` on success.** It then enters the flash queue like any manual upload.
- **`active_job()` (used by OTAWorker) excludes `COMPILING` and `COMPILE_QUEUED`.** The OTA worker never sees compile-phase jobs.

---

## Database Schema Changes

### New column on `ota_jobs`

```sql
ALTER TABLE ota_jobs ADD COLUMN esphome_name TEXT;
```

The `esphome_name` column is set when a compile job is created. It allows the CompileWorker to find the device config to compile without looking up the MAC in the devices table. For manual upload jobs, this column is NULL.

### No other schema changes needed

The existing columns (`firmware_path`, `firmware_name`, `firmware_size`, `firmware_md5`, `parsed_*`, `old_*`, `preflight_warnings`, `percent`, `bridge_state`, `error_msg`, `queue_order`) are all reused for compile-phase jobs. Compile fills in the firmware columns; flash uses them.

---

## Architecture

```text
User                    Add-on Backend                                         Docker
                        (FastAPI / port 8099)                                  
                          │                                                     
  Edit YAML ──────────► │ config endpoints (unchanged)                         
  Import YAML ────────► │                                                      
  Edit secrets ────────► │                                                      
                          │                                                     
  Compile button ──────► │ POST /api/devices/{mac}/compile                     
                          │   ├─ Preflight check (name + chip)                 
                          │   ├─ Create ota_jobs row: status=COMPILE_QUEUED    
                          │   └─ Return 202 + job + queue_position             
                          │            │                                         
                          │            ▼                                         
                          │   CompileWorker._run()                              
                          │     ├─ _dequeue_next(): COMPILE_QUEUED → COMPILING   
                          │     ├─ compiler.compile(esphome_name)              
                          │     │       └── docker run --rm ──────────────► Docker
                          │     │                              └── SSE logs ◀─┤
                          │     ├─ On success:                                  
                          │     │   Copy .ota.bin → /data/firmware/active/     
                          │     │   Copy .factory.bin → /data/devices/{name}/   
                          │     │   Parse firmware info                        
                          │     │   Update job: firmware_*, parsed_* fields    
                          │     │   Transition: COMPILING → QUEUED (flash queue) 
                          │     │   Wake OTAWorker                              
                          │     ├─ On failure:                                 
                          │     │   Transition: COMPILING → FAILED              
                          │     └─ _dequeue_next(): next COMPILE_QUEUED job      
                          │                                                     
                          │   OTAWorker._run()                                  
                          │     ├─ Picks up QUEUED jobs (including compiled ones)
                          │     ├─ STARTING → TRANSFERRING → ... → SUCCESS      
                          │     └─ _dequeue_next(): next QUEUED flash job         
                          │                                                     
  Poll status ────────► │ GET /api/devices/{mac}/compile/status                 
                          │   Returns: COMPILE_QUEUED / COMPILING / QUEUED / etc.
                          │                                                     
  View queue ──────────► │ GET /api/compile/queue                               
                          │   Returns: active compile + queued compile list      
                          │                                                     
  Cancel ──────────────► │ POST /api/devices/{mac}/compile/cancel              
                          │   COMPILE_QUEUED → delete from queue                
                          │   COMPILING → kill container, mark FAILED            
```

---

## API Specification

### Modified Endpoints

#### `POST /api/devices/{mac}/compile` — Queue a compile (was blocking)

**Request body:** (unchanged) empty or `{}`

**Response:** `202 Accepted`

```json
{
  "job": {
    "id": 42,
    "mac": "AA:BB:CC:DD:EE:FF",
    "esphome_name": "living-room-light",
    "status": "compile_queued",
    "queue_order": 0,
    "created_at": 1746278400,
    "firmware_path": null,
    "firmware_name": null,
    "firmware_size": null,
    "firmware_md5": null,
    "parsed_project_name": null,
    "parsed_version": null,
    "parsed_esphome_name": null,
    "parsed_build_date": null,
    "parsed_chip_name": null,
    "old_firmware_version": "1.2.3",
    "old_project_name": "living-room-light",
    "preflight_warnings": "[\"chip: ESP32-C3\"]",
    "percent": 0,
    "bridge_state": null,
    "error_msg": null
  },
  "queue_position": 0,
  "preflight": {
    "name": {"current": "living-room-light", "new": "living-room-light", "match": true},
    "chip": {"current": "ESP32-C3", "new": "ESP32-C3", "match": true}
  }
}
```

**Error responses:**
- `404` — Device not found in topology or no config
- `400` — No config exists, or preflight hard error (name mismatch)
- `409` — Device already has an active job (any status in `ACTIVE_STATUSES`)
- `502` — Bridge unavailable for preflight check

**Behavior change:** This endpoint no longer blocks. It creates a job and returns immediately.

#### `GET /api/devices/{mac}/compile/status` — Compile + job status

**Response:**

```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "esphome_name": "living-room-light",
  "status": "compiling",
  "job_id": 42,
  "queue_position": null,
  "compile_status": "compiling",
  "error": null
}
```

When no compile job exists for the device, returns `{"status": "idle", ...}`.

When `COMPILE_QUEUED`, includes `queue_position` (number of jobs ahead in the compile queue).

When `COMPILING`, the `compile_status` field comes from `compile_store` (so SSE log streaming still works).

When `QUEUED` or later, the job has left the compile phase. The response indicates the current flash phase status.

#### `POST /api/devices/{mac}/compile/cancel` — Cancel a compile

**Behavior:**
- If the device has a `COMPILE_QUEUED` job: delete it from the queue (same as `abort_queued_job()`).
- If the device has a `COMPILING` job: kill the Docker container, mark the job as `FAILED`.
- If no compile-phase job exists: return 404.

**Response:**

```json
{
  "cancelled": true,
  "job_id": 42,
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

### New Endpoints

#### `GET /api/compile/queue` — Compile queue status

**Response:**

```json
{
  "active_job": {
    "id": 42,
    "mac": "AA:BB:CC:DD:EE:FF",
    "esphome_name": "living-room-light",
    "status": "compiling",
    "firmware_name": null,
    "percent": 0,
    "created_at": 1746278400
  },
  "queued_jobs": [
    {
      "id": 43,
      "mac": "11:22:33:44:55:66",
      "esphome_name": "bedroom-sensor",
      "status": "compile_queued",
      "queue_order": 1,
      "created_at": 1746278410
    }
  ],
  "count": 2
}
```

#### `POST /api/compile/queue/{job_id}/abort` — Abort a queued compile

**Response:**

```json
{
  "ok": true,
  "job_id": 43
}
```

Deletes the job from the queue (same pattern as OTA `abort_queued_job()`).

### Unchanged Endpoints

- `GET /api/devices/{mac}/compile/logs` — SSE stream. Still uses `compile_store` + Docker container logs during `COMPILING` phase. When `COMPILE_QUEUED`, yields periodic `"waiting in compile queue, position X"` status events.
- `GET /api/ota/queue` — Flash queue. Unchanged, but `COMPILE_QUEUED`/`COMPILING` jobs are NOT included (they're in a separate queue).
- `GET /api/devices/{mac}/firmware/download` — Factory binary download. Unchanged.
- `POST /api/devices/{mac}/compile/start-flash` — Flash hand-off. Now only needed for manual re-flashing (compile-originated jobs auto-enter the flash queue).

---

## UI Specification

### Config Page (`#/device/{mac}/config`) — Revised Compile Flow

The config page no longer blocks on `compileDevice()`. Instead:

#### State: No Config (unchanged)
Same as before — "Create Config" and "Import YAML" buttons.

#### State: Editor — Idle (unchanged mostly)
- "Compile & Install" button.
- "Cancel" button is hidden.

#### State: COMPILE_QUEUED (new)
```
┌─────────────────────────────────────────────────────────┐
│  ⏳ Position 2 in compile queue                         │
│                                                         │
│  Waiting for compile slot...                            │
│                                                         │
│  [Cancel ]                                              │
└─────────────────────────────────────────────────────────┘
```
- Polls `GET /api/devices/{mac}/compile/status` every 2 seconds.
- Shows queue position (number of jobs ahead).
- "Cancel" button calls `POST /api/devices/{mac}/compile/cancel` and resets to idle.

#### State: COMPILING (modified from current)
```
┌─────────────────────────────────────────────────────────┐
│  [Saved ✓]  [Cancel ]          [Secrets ⚙]            │
│                                                         │
│  ┌── Build Log ──────────────────────────────────────┐  │
│  │ INFO ESPHome 2025.5.0                             │  │
│  │ INFO Compiling living-room-light.yaml...           │  │
│  │ ...                                               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Status: compiling...                                   │
└─────────────────────────────────────────────────────────┘
```
- SSE log viewer still works (same as current).
- "Cancel" button kills Docker container, marks job as `FAILED`.
- Editor is read-only during compile.

#### State: Compile Success → Job in Flash Queue (new)
```
┌─────────────────────────────────────────────────────────┐
│  ✓ Build successful                                     │
│    living-room-light v1.2.3 · ESP32-C3                 │
│    OTA: 487 KB · Factory: 1.2 MB                       │
│                                                         │
│  ┌── Preflight ─────────────────────────────────────┐   │
│  │ Name:     living-room-light       MATCH           │   │
│  │ Build:    NEWER +2d                               │   │
│  │ Chip:     ESP32-C3              MATCH             │   │
│  └───────────────────────────────────────────────────┘   │
│                                                         │
│  ⏳ Position 1 in flash queue                            │
│                                                         │
│  [ ▶ Flash via ESP-NOW ]  [ ↓ Download factory .bin ]  │
│                                                         │
│  You can also monitor progress on the device page.      │
└─────────────────────────────────────────────────────────┘
```
- The "Flash via ESP-NOW" button **auto-starts** the flash for this job (sets status to `STARTING`, wakes OTA worker). This is for users who want to skip the queue.
- If the user does nothing, the OTA worker will eventually pick up the job from the flash queue.
- Shows current flash queue position.

#### State: Compile Failed (unchanged)
Same as current — error log shown, "Fix the YAML above and try again."

### Queue Page (`#/queue`) — Two Sections

```
┌─────────────────────────────────────────────────────────┐
│  Compile Queue                                  [PAUSED]│
├─────────────────────────────────────────────────────────┤
│  ① living-room-light   COMPILING    Compiling... 23%    │
│     [Abort]                                             │
│                                                         │
│  2. bedroom-sensor     COMPILE_QUEUED                   │
│     [✕]                                                │
├─────────────────────────────────────────────────────────┤
│  Firmware Flash Queue                                   │
├─────────────────────────────────────────────────────────┤
│  ① kitchen-light       TRANSFERRING   67%              │
│     [Abort]                                             │
│                                                         │
│  2. garage-door         QUEUED                          │
│     [✕] [▲] [▼]                                        │
└─────────────────────────────────────────────────────────┘
```

**Compile Queue section:**
- `COMPILING` job has a "Compiling..." label with progress indicator. Abort button kills the Docker container.
- `COMPILE_QUEUED` jobs show position and ✕ abort button.
- No reorder buttons (compile order is FIFO — reordering compiles would risk dependency issues).

**Flash Queue section:**
- Unchanged from current implementation, but also includes compile-originated jobs that have transitioned to `QUEUED`.
- Reorder buttons work across all `QUEUED` jobs regardless of origin (manual upload or compile).

### Device Detail Page (`#/device/{mac}`) — ota-box Updates

The `<esp-ota-box>` component must handle two new statuses:

- **`COMPILE_QUEUED`**: Show a "Compiling firmware..." banner with queue position and abort button. Yellow overlay, similar to the existing queued overlay.
- **`COMPILING`**: Show a "Building firmware..." banner with "View compile logs →" link that navigates to `#/device/{mac}/config`. Yellow overlay.

When a compile-originated job transitions to `QUEUED` (flash queue), it appears as a normal queued flash job — the existing queued overlay handles it.

### Topology Node Config Badge Updates

The config badge logic (`/api/devices/{mac}/config/status`) should also reflect compile queue status:

- `COMPILE_QUEUED` → amber `●` with tooltip "Waiting to compile (#2)"
- `COMPILING` → amber `●` with spinner/pulse animation
- `QUEUED` (after compile, waiting to flash) → blue `↑` (same as current `compiled_ready`)

---

## Implementation Phases

### Phase CQ-1 — Data Model & Database Migration

Foundation: new status constants, database column, query methods.

- [ ] **CQ-1.1** Add `COMPILE_QUEUED = "compile_queued"` and `COMPILING = "compiling"` constants to `models.py`. Add `COMPILE_STATUSES = {COMPILE_QUEUED, COMPILING}` set. Add both to `ACTIVE_STATUSES`.
- [ ] **CQ-1.2** In `db.py`, add migration `ALTER TABLE ota_jobs ADD COLUMN esphome_name TEXT` inside `init()`. Add `esphome_name` to the `create_job()` keys list.
- [ ] **CQ-1.3** In `db.py`, add `active_compile_job()` method: `SELECT * FROM ota_jobs WHERE status = 'compiling' ORDER BY created_at ASC LIMIT 1`.
- [ ] **CQ-1.4** In `db.py`, add `compile_queued_jobs()` method: `SELECT * FROM ota_jobs WHERE status = 'compile_queued' ORDER BY queue_order ASC`.
- [ ] **CQ-1.5** In `db.py`, add `next_compile_queued_job()` method: `SELECT * FROM ota_jobs WHERE status = 'compile_queued' ORDER BY queue_order ASC LIMIT 1`.
- [ ] **CQ-1.6** In `db.py`, modify `active_job()` to exclude `COMPILING` and `COMPILE_QUEUED` from its query. This ensures the OTA worker never picks up a compile-phase job.
- [ ] **CQ-1.7** In `db.py`, add `active_job_for_device(mac, statuses)` convenience method that checks for any active job for a MAC within the given status set. Used by the compile endpoint to reject duplicate requests.
- [ ] **CQ-1.8** Test: verify `active_job()` no longer returns compile-phase jobs. Verify `create_job()` works with `esphome_name` column.

---

### Phase CQ-2 — CompileWorker

Backend: the background worker that processes compile jobs.

- [ ] **CQ-2.1** Create `app/compile_worker.py` with `CompileWorker` class.
  - `__init__(self, db, compiler, bridge_manager, firmware_store, yaml_store, settings)` — same pattern as `OTAWorker`.
  - `start()` — create `asyncio.create_task(self._run(), name="compile-worker")`.
  - `stop()` — set `_stop_event`, wake, and await the task.
  - `wake()` — set `_wake_event`.
- [ ] **CQ-2.2** Implement `CompileWorker._run()` main loop:
  ```
  while not _stop_event.is_set():
      job = db.active_compile_job()
      if job and job["status"] == "compiling":
          try: await self._process(job)
          except: self._fail(job["id"], "compile worker error")
          await self._dequeue_next()
          continue
      _wake_event.clear()
      try: await asyncio.wait_for(_wake_event.wait(), timeout=5.0)
      except asyncio.TimeoutError: pass  # housekeeping interval
  ```
- [ ] **CQ-2.3** Implement `CompileWorker._process(job)`:
  1. Get `esphome_name` from the job (or look up via MAC in devices table).
  2. Verify config exists: `yaml_store.has_config(esphome_name)`. If missing, fail the job.
  3. Set `compile_store.set_status(esphome_name, "compiling")`.
  4. Call `await compiler.compile(esphome_name)`.
  5. On success:
     - Copy `.ota.bin` to `/data/firmware/active/{uuid}.bin`.
     - Copy `.factory.bin` to `/data/devices/{esphome_name}/{esphome_name}.factory.bin`.
     - Parse firmware info via `bin_parser.parse_firmware()`.
     - Get topology data for preflight comparison.
     - Update job with all firmware metadata: `firmware_path`, `firmware_name`, `firmware_size`, `firmware_md5`, `parsed_*` fields, `old_firmware_version`, `old_project_name`, `preflight_warnings`.
     - Transition job: `status = QUEUED` with `queue_order` (use existing `create_job` pattern for queue_order).
     - Clear compile_store status for this device.
     - Wake OTA worker (it may pick up the new QUEUED job).
  6. On failure:
     - Set compile_store status to `failed` with error.
     - Transition job: `db.mark_terminal(job_id, FAILED, error_msg=result.error)`.
     - Wake self to dequeue next.
- [ ] **CQ-2.4** Implement `CompileWorker._dequeue_next()`:
  1. Call `db.next_compile_queued_job()`.
  2. If none, return.
  3. Look up device MAC in topology to verify it still exists and has a config. If not, delete the job and try the next one (recursive).
  4. Update job: `status = COMPILING`, `started_at = now_ts()`, `error_msg = None`.
  5. Set `compile_store.set_status(esphome_name, "compiling")`.
  6. Wake self.
- [ ] **CQ-2.5** Implement `CompileWorker._recover_startup()`:
  1. If a `COMPILING` job exists: mark it `FAILED` with error "add-on restarted, compile could not be recovered". The Docker container is gone.
  2. Call `compiler.cleanup_stale()` to remove any leftover container.
  3. `COMPILE_QUEUED` jobs are left as-is — they'll be picked up when the worker runs.
- [ ] **CQ-2.6** Implement `CompileWorker._fail(job_id, message)` — wraps `db.mark_terminal(job_id, FAILED, error_msg=message)`.
- [ ] **CQ-2.7** Implement `CompileWorker.cancel(job_id)` — convenience method for cancel endpoint: looks up job, kills Docker container if `COMPILING`, marks job as `FAILED` or deletes from queue if `COMPILE_QUEUED`.
- [ ] **CQ-2.8** Remove `compiler._compile_lock` from `compiler.py`. Serialization is now handled by `CompileWorker` — only one `COMPILING` job exists at a time.

---

### Phase CQ-3 — Server Endpoints

Backend: rewrite compile endpoint to be non-blocking, add compile queue endpoints.

- [ ] **CQ-3.1** Rewrite `POST /api/devices/{mac}/compile`:
  1. Look up device and esphome_name from MAC.
  2. Verify YAML config exists (`yaml_store.has_config()`). Return 400 if not.
  3. Check for existing active job for this MAC (any `ACTIVE_STATUSES`). Return 409 if one exists.
  4. Run preflight comparison: get topology, find node, check name match and chip match. Store warnings on the job.
  5. Create job via `db.create_job()` with `status=COMPILE_QUEUED`, `mac=device_mac`, `esphome_name=esphome_name`, `preflight_warnings=json.dumps(warnings)`, `old_firmware_version` and `old_project_name` from topology.
  6. Wake CompileWorker.
  7. Return 202 with job info, queue position (`db.count_queued_before(job_id)` for compile queue), and preflight comparison.
- [ ] **CQ-3.2** Rewrite `GET /api/devices/{mac}/compile/status`:
  1. Look up device and esphome_name.
  2. Find any job for this MAC with status in `{COMPILE_QUEUED, COMPILING, QUEUED}` — these are compile-originated job phases.
  3. If `COMPILE_QUEUED`: return `{"status": "compile_queued", "job_id": ..., "queue_position": ...}`.
  4. If `COMPILING`: return `{"status": "compiling", "job_id": ..., "compile_status": compile_store.get_status(esphome_name)}`.
  5. If `QUEUED` (flash queue): return `{"status": "queued", "job_id": ..., "flash_queue_position": ...}`.
  6. If no active job: check compile_store for recent `success` or `failed` status and return that; otherwise `{"status": "idle"}`.
- [ ] **CQ-3.3** Rewrite `POST /api/devices/{mac}/compile/cancel`:
  1. Find active job for this MAC with status in `{COMPILE_QUEUED, COMPILING}`.
  2. If `COMPILE_QUEUED`: call `db.abort_queued_job(job_id)`.
  3. If `COMPILING`: call `compile_worker.cancel(job_id)` which kills Docker container and marks job `FAILED`.
  4. If no compile-phase job: return 404.
- [ ] **CQ-3.4** Add `GET /api/compile/queue` endpoint:
  1. Return `{active_job: db.active_compile_job(), queued_jobs: db.compile_queued_jobs(), count: len(queued_jobs) + (1 if active_job else 0)}`.
  2. Enrich jobs with `device_label` from the devices table.
- [ ] **CQ-3.5** Add `POST /api/compile/queue/{job_id}/abort` endpoint:
  1. Look up job by ID. Verify status is `COMPILE_QUEUED`.
  2. Delete from queue via `db.abort_queued_job(job_id)`.
  3. Wake CompileWorker (it might want to dequeue the next one).
- [ ] **CQ-3.6** Modify `GET /api/devices/{mac}/compile/logs` (SSE):
  1. If the device's current compile job status is `COMPILE_QUEUED`: yield periodic `"event: status\ndata: compile_queued\n\n"` and `"event: queue_position\ndata: {position}\n\n"` events every 2 seconds.
  2. If `COMPILING`: stream Docker container logs as before.
  3. If the job has transitioned to `QUEUED` or further: yield `"event: status\ndata: queued\n\n"` and close.
- [ ] **CQ-3.7** Wire `CompileWorker` in `main.py` / `create_app()`:
  1. Create `compile_worker = CompileWorker(db=db, compiler=compiler, bridge_manager=bridge_manager, firmware_store=firmware_store, yaml_store=yaml_store, settings=settings)`.
  2. Call `compile_worker.start()` in the `@app.on_event("startup")` handler (alongside `ota_worker.start()`).
  3. Call `await compile_worker.stop()` in the `@app.on_event("shutdown")` handler.
  4. Store on `app.state` for access from endpoints.
  5. Remove the old blocking compile logic from `POST /api/devices/{mac}/compile` endpoint.
- [ ] **CQ-3.8** Modify `POST /api/devices/{mac}/compile/start-flash`:
  - Currently finds `PENDING_CONFIRM` job. Should also handle `QUEUED` compile-originated jobs that are ready to flash.
  - If the job status is `QUEUED`, set it to `STARTING` directly (bypassing `PENDING_CONFIRM` since the compile already passed preflight).
  - Wake OTA worker.
- [ ] **CQ-3.9** Move `compiler.cleanup_stale()` call from `main.py` startup to `CompileWorker._recover_startup()`. Remove from `main.py` if present there.

---

### Phase CQ-4 — Frontend: Config Page Compile Flow

Client: rewrite compile trigger to be non-blocking with polling.

- [ ] **CQ-4.1** Add new types to `api/client.ts`:
  - `CompileQueueJob` type extending `OtaJob` with `esphome_name` field.
  - `CompileQueueResponse` type: `{active_job: CompileQueueJob | null, queued_jobs: CompileQueueJob[], count: number}`.
  - `CompileStatusResponse` type: `{mac: string, esphome_name: string, status: string, job_id: number | null, queue_position: number | null, error: string | null}`.
- [ ] **CQ-4.2** Add new API methods to `client.ts`:
  - `getCompileQueue()`: `GET /api/compile/queue`
  - `abortCompileJob(jobId: number)`: `POST /api/compile/queue/{jobId}/abort`
  - `getCompileStatus(mac: string)`: `GET /api/devices/{mac}/compile/status` — returns full status including queue position.
  - Modify `compileDevice(mac: string)` to return the 202 response (job + queue_position + preflight).
- [ ] **CQ-4.3** Rewrite `triggerCompile()` in `config-page.ts`:
  1. `POST /api/devices/{mac}/compile` → get back job with status `COMPILE_QUEUED` (or `COMPILING` if queue was empty).
  2. Set `this.compilePhase = 'compiling'` and `this.compileJobId = job.id`.
  3. Start polling `getCompileStatus(this.mac)` every 2 seconds.
  4. Update UI based on polled status:
     - `COMPILE_QUEUED` → show "Position {n} in compile queue" with cancel button.
     - `COMPILING` → show build log viewer (existing SSE stream).
     - `QUEUED` → show success card with "Position {n} in flash queue" and flash/download buttons.
     - `FAILED` → show error banner.
  4. On error: set `this.compilePhase = 'failed'` and show error message.
- [ ] **CQ-4.4** Add polling logic to `config-page.ts`:
  - `private pollInterval: ReturnType<typeof setInterval> | null = null`
  - Start polling in `connectedCallback()` if `compilePhase` is not `idle`.
  - Stop polling in `disconnectedCallback()`.
  - On each poll: call `getCompileStatus()`, update `compilePhase`, `compileJobId`, `queuePosition`, `error`.
  - If status transitions to a terminal state (`FAILED`) or flash state (`QUEUED`, `STARTING`, etc.), stop polling.
- [ ] **CQ-4.5** Update `config-page.ts` render:
  - Add `@state() queuePosition: number | null = null` and `@state() compileJobId: number | null = null`.
  - When `COMPILE_QUEUED`: show "Position {n} in compile queue" banner with cancel button.
  - When `COMPILING`: show build log viewer (existing, unchanged).
  - When compile succeeds (job status `QUEUED`): show success card with "Waiting to flash. Position {n} in flash queue." and flash/download buttons.
  - Cancel button calls `api.cancelCompile(this.mac)` and resets to idle.
- [ ] **CQ-4.6** Update `flashNow()` in `config-page.ts`:
  - Currently calls `api.startCompileFlash(this.mac)` which finds the pending job and starts it.
  - For compile-originated jobs in `QUEUED` status, this should work the same way — the endpoint sets the job to `STARTING` and wakes the OTA worker.
  - No changes needed if `startCompileFlash` handles `QUEUED` status.
- [ ] **CQ-4.7** Update cancel button behavior:
  - Call `api.cancelCompile(this.mac)`.
  - On success: reset `compilePhase` to `idle`, clear `compileJobId`, stop polling.

---

### Phase CQ-5 — Frontend: Queue Page Compile Section

Client: add compile queue display to the existing queue page.

- [ ] **CQ-5.1** Add `getCompileQueue()` API method to `client.ts` (if not already added in CQ-4.2).
- [ ] **CQ-5.2** Update `queue-page.ts`:
  - Add `@state() compileData: CompileQueueResponse | null = null`.
  - Fetch compile queue data alongside flash queue data in `fetchQueue()`.
  - Add `fetchCompileQueue()` method: `this.compileData = await api.getCompileQueue()`.
  - Poll every 2 seconds (same interval as flash queue).
- [ ] **CQ-5.3** Render compile queue section above the flash queue section:
  ```
  <div class="compile-section">
    <h3>Compile Queue</h3>
    {activeCompileJob ? renderActiveCompileRow(activeCompileJob) : nothing}
    {compileQueuedJobs.map((job, i) => renderCompileQueuedRow(job, i + 1))}
    {no compile jobs ? "No compiles in progress or queued." : nothing}
  </div>
  ```
- [ ] **CQ-5.4** Style compile queue rows:
  - Active compile (`COMPILING`): teal background, "Compiling..." label with esphome_name, abort button.
  - Queued compile (`COMPILE_QUEUED`): light yellow background, position number, esphome_name, ✕ abort button.
  - No reorder buttons for compile queue (FIFO only).
- [ ] **CQ-5.5** Add abort handler for compile queue:
  - `abortCompileJob(jobId: number)` calls `api.abortCompileJob(jobId)`.
  - After abort, refresh compile queue data.

---

### Phase CQ-6 — Frontend: OTA Box Updates

Client: handle `COMPILE_QUEUED` and `COMPILING` job statuses in the device detail page.

- [ ] **CQ-6.1** Update `ota-box.ts`:
  - In the `render()` method, add conditions for `COMPILE_QUEUED` and `COMPILING` statuses when `activeForThisDevice` is true.
  - `COMPILE_QUEUED`: render a yellow overlay banner "⏳ Compiling firmware... Position {n} in queue" with abort button.
  - `COMPILING`: render a yellow overlay banner "⏳ Building firmware..." with "View logs →" link that navigates to `#/device/{mac}/config` and abort button.
  - Both banners use the same overlay style as the existing `renderQueued()` method.
- [ ] **CQ-6.2** Update `ota-box.ts` status detection:
  - `hasActive` should include `COMPILE_QUEUED` and `COMPILING` as active statuses.
  - The existing `jobIsActive()` utility in `client.ts` should include these statuses.

---

### Phase CQ-7 — Integration & Edge Cases

- [ ] **CQ-7.1** OTA worker must skip `COMPILING` and `COMPILE_QUEUED` jobs. Verify that `active_job()` in `db.py` excludes these statuses. Test that OTA worker's `_dequeue_next()` only picks up `QUEUED` flash jobs.
- [ ] **CQ-7.2** After a compile job transitions to `QUEUED` (flash queue), the OTA worker should pick it up automatically. Verify this by checking that `_dequeue_next()` in `ota_worker.py` will promote `QUEUED` jobs regardless of their origin (manual upload or compile).
- [ ] **CQ-7.3** Handle compile job for a device that goes offline: the `_dequeue_next()` in `CompileWorker` should verify the device still exists in topology. If not, mark the job as `FAILED` with "device not found in topology" and try the next compile job.
- [ ] **CQ-7.4** Handle concurrent compile request for the same MAC: the `POST /compile` endpoint checks `active_job_for_device(mac, ACTIVE_STATUSES)`. If a job already exists for this MAC, return 409.
- [ ] **CQ-7.5** Handle add-on restart during compile: `CompileWorker._recover_startup()` marks any `COMPILING` job as `FAILED`. `COMPILE_QUEUED` jobs survive and will be picked up.
- [ ] **CQ-7.6** Handle Docker unavailability: `CompileWorker._process()` catches `DockerException`. If Docker is unavailable, the compile job is marked `FAILED` with a clear error message.
- [ ] **CQ-7.7** Handle SSE log stream for `COMPILE_QUEUED` jobs: when a job is `COMPILE_QUEUED`, the SSE endpoint yields periodic status events every 2 seconds indicating the queue position. When the job transitions to `COMPILING`, normal Docker log streaming begins. When the job transitions to `QUEUED`, the SSE stream closes.
- [ ] **CQ-7.8** Clean up `compile_store` status: after a compile job succeeds and transitions to `QUEUED`, clear the compile_store status file so it doesn't show stale "compiling" status.

---

### Phase CQ-8 — Testing & Validation

- [ ] **CQ-8.1** Create a compile for an online remote device with correct config. Verify job is created with `COMPILE_QUEUED` status and correct queue position.
- [ ] **CQ-8.2** Create a second compile for a different device. Verify it enters the queue at position 1 (after the first).
- [ ] **CQ-8.3** Verify the first compile runs to completion and the job transitions to `QUEUED` (flash queue).
- [ ] **CQ-8.4** Verify the second compile starts automatically after the first completes.
- [ ] **CQ-8.5** Verify SSE log streaming works for `COMPILING` jobs.
- [ ] **CQ-8.6** Verify SSE log streaming shows queue position for `COMPILE_QUEUED` jobs.
- [ ] **CQ-8.7** Verify canceling a `COMPILE_QUEUED` job removes it from the queue and the remaining jobs are renumbered.
- [ ] **CQ-8.8** Verify canceling a `COMPILING` job kills the Docker container and marks the job as `FAILED`.
- [ ] **CQ-8.9** Verify compile-originated job enters the flash queue after compile, and the OTA worker flashes it.
- [ ] **CQ-8.10** Verify preflight checks (name match, chip match) are run before queuing.
- [ ] **CQ-8.11** Verify add-on restart during compile: `COMPILING` job is marked `FAILED`, `COMPILE_QUEUED` jobs survive.
- [ ] **CQ-8.12** Verify queue page shows both compile and flash queues.
- [ ] **CQ-8.13** Verify config page shows queue position during `COMPILE_QUEUED` and `COMPILING` phases.
- [ ] **CQ-8.14** Verify "Flash via ESP-NOW" button skips the flash queue for the current device (starts immediately).
- [ ] **CQ-8.15** Verify manual firmware upload still works alongside compile-originated flash jobs.
- [ ] **CQ-8.16** Verify Docker unavailability during compile: job is marked `FAILED` with clear error message.

---

## Key Files

| File | Phase | ~Lines | Change Type |
|------|-------|--------|-------------|
| `app/models.py` | CQ-1 | ~10 | Add status constants, update sets |
| `app/db.py` | CQ-1 | ~60 | Migration, new query methods, modify `active_job()` |
| `app/compile_worker.py` | CQ-2 | ~180 | **NEW FILE** — background compile worker |
| `app/compiler.py` | CQ-2 | ~15 | Remove `_compile_lock`, minor refactor |
| `app/server.py` | CQ-3 | ~120 | Rewrite compile endpoint, add queue endpoints, wire worker |
| `app/main.py` | CQ-3 | ~5 | Start/stop CompileWorker |
| `app/ota_worker.py` | CQ-7 | ~10 | Exclude compile statuses from `active_job()` |
| `app/compile_store.py` | CQ-7 | ~5 | Add `clear_status()` method for post-compile cleanup |
| `ui/src/api/client.ts` | CQ-4 | ~40 | New types, modify `compileDevice()`, add queue methods |
| `ui/src/pages/config-page.ts` | CQ-4 | ~80 | Non-blocking compile, polling, queue position display |
| `ui/src/pages/queue-page.ts` | CQ-5 | ~60 | Compile queue section |
| `ui/src/components/ota-box.ts` | CQ-6 | ~25 | Handle COMPILE_QUEUED and COMPILING statuses |
| | | **~770** | |

---

## Assumptions

1. The existing OTA job queue infrastructure (`db.py`, `ota_worker.py`) works correctly and can be shared.
2. The Docker container `esphome-espnow-tree-compiler` is ephemeral (`--rm`) and can only run one compile at a time.
3. PlatformIO build cache at `/data/platformio_cache` is shared between sequential compiles (safe since they're serialized).
4. The topology API remains available for preflight checks and device existence verification.
5. The `esphome_name` field in the `devices` table is populated by topology sync before a compile can be queued.
6. The existing SSE log streaming (via `compile_store`) works correctly for the active Docker compile.
7. A compile job that fails does not block subsequent compiles — the CompileWorker dequeues the next job regardless.

## Constraints

1. **One compile at a time** — The Docker container name is hardcoded. Only one `COMPILING` job can exist. The CompileWorker serializes by dequeuing one at a time.
2. **COMPILE_QUEUED order is FIFO** — No reorder functionality for compile queue. The order is determined by `queue_order` at creation time.
3. **No compile cancellation during Docker build for correctness** — Killing the Docker container mid-compile may leave stale files. `cleanup_stale()` is called on startup and after cancel.
4. **Pre-flight checks before queueing only** — Name and chip match are checked when the compile is submitted, not when it starts compiling. If the config changes between submission and compile start, the compile may produce a mismatched binary. Preflight warnings from the compile step will catch this.
5. **Bridge must be reachable for OTA but not for compile** — Compiles use Docker, not the bridge. The CompileWorker does not need bridge connectivity to compile. It only needs bridge connectivity for topology lookups during preflight (which happen at queue time, not compile time).
6. **Compile-originated jobs skip PENDING_CONFIRM** — After compile, jobs go directly to `QUEUED` in the flash queue. No manual confirmation step. The user can still re-flash manually via the "Flash via ESP-NOW" button.

## Risk Notes

- **Compile worker startup recovery**: If the add-on restarts during a compile, the Docker container is gone. The `COMPILING` job is marked `FAILED`. The Docker image pull cache and PlatformIO cache survive in `/data`, so the next compile will be faster.
- **Database contention**: Both the OTA worker and Compile worker write to `ota_jobs`. SQLite WAL mode handles concurrent writes, and both workers run in the same async process (no true parallelism). Risk is low.
- **Frontend polling frequency**: 2-second polling for compile status is reasonable for a developer-focused tool. If load is a concern, SSE could be extended to push status changes, but polling is simpler and sufficient for V1.
- **Queue page UX**: Showing two queues (compile + flash) adds visual complexity. Consider collapsing them into a single timeline view in a future iteration if users find it confusing.