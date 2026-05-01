# Firmware Queue — Workplan

## 1. Specification & Design

### Problem

V1 has strict one-at-a-time enforcement. Uploading firmware for a second device while a flash is in progress returns HTTP 409. The user must wait for the current flash to finish before they can even select a firmware file.

### Solution

Add a firmware flash queue that allows the user to upload and confirm firmware for multiple devices while a burn is running. Confirmed jobs queue behind the active job and auto-start in FIFO order when the worker becomes free.

### Design decisions (from grilling session)

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Upload during active burn? | Yes — upload to staging, then queue on confirm |
| 2 | Upload goes directly to QUEUED or PENDING_CONFIRM? | Always PENDING_CONFIRM. Upload NEVER creates QUEUED jobs. The transition to QUEUED happens only at the start endpoint when user clicks "Flash" while another burn is active. |
| 3 | Is PENDING_CONFIRM blocking? | No — purely informational, per-device, non-blocking |
| 4 | Per-device dedup? | Yes — reject upload if non-terminal job already exists for that MAC (covers PENDING_CONFIRM + QUEUED + active) |
| 5 | What happens when user clicks Flash with no active burn? | Goes directly to STARTING (today's behavior) |
| 6 | What happens when user clicks Flash with active burn running? | Goes to QUEUED, response includes queue position |
| 7 | Auto-start queued jobs when reaching front? | Yes — QUEUED → STARTING automatically |
| 8 | Re-validate topology before starting queued job? | Yes — check device is online. If offline, mark FAILED + skip to next queued. Failed jobs are deleted (no audit trace) same as manual queued abort. |
| 8b | Failed queued job visibility? | Failed queued jobs are deleted, not kept in history. No audit trace — same as manually aborting from queue page. The queue page only shows live `QUEUED` jobs. |
| 9 | Version drift check before starting queued job? | No — bridge does final image validation |
| 10 | What happens on abort of active job? | Frontend checks for queued jobs → modal "Continue? [Yes] [No]". Yes = next auto-starts. No = pause queue. |
| 11 | Where does the pause state live? | In-memory on OTAWorker (session-level). Lost on restart. |
| 12 | Startup behavior when QUEUED jobs exist? | Fail any mid-flight non-terminal non-queued job (bridge timed out). Pause queue. |
| 13 | Does pause block manual "Flash"? | No — Flash still queues jobs. Pause only stops auto-start. UI makes pause state highly visible. |
| 14 | Resume = unpause, queue drains normally | Yes — flows freely after resume |
| 15 | Aborting a single queued job? | Deletes job + firmware file, no trace in history. Re-indexes queue_order. |
| 16 | Re-ordering jobs? | Via up/down on queue page. Up/down hidden for the actively burning job. |
| 17 | Queue order storage? | `queue_order` INTEGER column on ota_jobs. Re-indexed on every mutation. |
| 18 | Reflash during active burn? | Yes — same pattern as upload (PENDING_CONFIRM staging, then can queue) |
| 19 | Bridge connection error during starting queued job? | Re-queue to back. Retry once. On second failure, delete job + firmware file (no audit trace). |
| 20 | Queue page columns? | device_name | firmware_filename | mini progress bar (0%) | abort | up/down |
| 21 | Queue page refresh strategy? | Poll `/api/ota/current` + `/api/ota/queue` every 2s |
| 22 | Header nav bar indicator? | Persistent badge showing queue state ("Paused", "1/3", empty = hidden). Click → queue page. |
| 23 | PENDING_CONFIRM on queue page? | No — queue page shows active job + QUEUED jobs only. PENDING_CONFIRM lives on device pages. |
| 24 | Per-device OTA box states | See state table below |
| 25 | Preflight warnings for queued? | Already shown during PENDING_CONFIRM staging. Not repeated on queue page. |
| 26 | Start API response when queued? | When `POST /api/ota/start/{id}` returns a QUEUED job (because another burn is active), response includes `queue_position` for immediate UI feedback. |
| 27 | Queue pause after drain? | Stays paused if paused — consistent state machine |
| 28 | Abort via abort endpoint? | `/api/ota/abort` unchanged. Queue continuation logic is frontend-driven (check queue, show modal, send second request) |
| 29 | Abort active + No = pause queue? | Frontend sends `POST /api/ota/abort` THEN `POST /api/ota/queue/pause` as two sequential calls. The modal ("Other queued jobs waiting. Continue?") drives this flow. |

### Core flow diagram

```
User uploads firmware for device B
  │
  ▼
PENDING_CONFIRM  ← always, regardless of other activity. Non-blocking, per-device.
  │
  │  User clicks "Flash"
  │
  ├─ No active burn? ──────────────────► STARTING ──► TRANSFERRING ──► ... ──► SUCCESS/FAIL
  │
  └─ Active burn running? ─────────────► QUEUED (queue_order = max+1)
                                               │
                                               │  (worker finishes active job)
                                               │  (queue not paused?)
                                               ▼
                                        Topology check
                                               │
                                     ┌─────────┴─────────┐
                                     │ online     offline │
                                     ▼                    ▼
                                  STARTING      Delete job + file
                                                (no audit trace)
                                                Skip to next queued
```

### Per-device OTA box UI states

| DB Status | UI shown |
|-----------|----------|
| No job | File selector ("Choose .ota.bin firmware") |
| `PENDING_CONFIRM` | Preflight comparison table + Flash / Cancel buttons |
| `QUEUED` | Progress bar at 0% + "Queued — position #N" overlay + Abort button. No file selector. |
| `STARTING` / `TRANSFERRING` / `VERIFYING` / `WAITING_REJOIN` | Existing `<esp-ota-progress>` (today's behavior) |

### Queue page UI

```
┌──────────────────────────────────────────────────────────────┐
│  Queue Manager                              [Pause] [Resume]  │
├──────────────────────────────────────────────────────────────┤
│  #   Device          Firmware          Progress   Actions    │
├──────────────────────────────────────────────────────────────┤
│  1   (in progress)   living-room.ota   ████████   (none)     │
│  2   kitchen-sensor  kitchen.ota       [====     ] [abort][▲][▼]│
│  3   garage-node     garage.ota        [====     ] [abort][▲][▼]│
└──────────────────────────────────────────────────────────────┘
```

### Route structure

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Existing tree page | Device pages with updated OTA box (queue awareness) |
| `/queue` | New `esp-queue-page` | Queue manager with pause/resume, re-order, abort |
| Header | Persistent badge | Queue state indicator, click → `/queue` |

---

## 2. Implementation Phases

### Phase 1 — Database & Models (`models.py`, `db.py`)

Foundation: new status constant, new column, DB queries.

- [x] **1.1** `app/models.py`: Add `QUEUED = "queued"` constant. Add to `ACTIVE_STATUSES`. ~2 lines.
- [x] **1.2** `app/db.py`: Add `ALTER TABLE ota_jobs ADD COLUMN queue_order INTEGER` in `init()`. Use `try/except` so it's idempotent on re-runs. ~8 lines.
- [x] **1.3** `app/db.py`: Add index `CREATE INDEX IF NOT EXISTS idx_ota_jobs_queue_order ON ota_jobs(queue_order)`. ~2 lines.
- [x] **1.4** `app/db.py`: Update `active_job()` to exclude `QUEUED` (`AND (status != 'queued' OR status IS NULL)`). ~2 lines.
- [x] **1.5** `app/db.py`: Add `queued_jobs()` → `SELECT * FROM ota_jobs WHERE status = 'queued' ORDER BY queue_order ASC`. ~8 lines.
- [x] **1.6** `app/db.py`: Add `next_queued_job()` → Same query + `LIMIT 1`. ~8 lines.
- [x] **1.7** `app/db.py`: Add `active_or_queued_for_device(mac)` → `SELECT * FROM ota_jobs WHERE mac = ? AND status IN (ACTIVE_STATUSES) LIMIT 1`. ~8 lines.
- [x] **1.8** `app/db.py`: Add `has_queued_jobs()` → `SELECT EXISTS(SELECT 1 FROM ota_jobs WHERE status = 'queued')`. ~6 lines.
- [x] **1.9** `app/db.py`: Add `count_queued_before(job_id)` → Returns number of QUEUED jobs with lower `queue_order`. ~8 lines.
- [x] **1.10** `app/db.py`: Add `reorder_queue(job_id, new_order)` → Transaction that re-indexes all QUEUED rows' `queue_order`. ~15 lines.
- [x] **1.11** `app/db.py`: Add `abort_queued_job(job_id)` — Delete the job row AND its firmware file (no audit trace, same as manual queue abort). Called by both the API abort endpoint and the worker when a queued job fails topology check. ~4 lines DB, firmware deletion handled by caller.
- [x] **1.12** `app/db.py`: Update `create_job()` — when `status = 'queued'`, auto-assign `queue_order = COALESCE(MAX(queue_order), -1) + 1`. ~6 lines.

---

### Phase 2 — API Endpoints (`server.py`)

Modify existing endpoints, add new queue management endpoints.

- [x] **2.1** `POST /api/ota/upload` — Remove blanket `if db.active_job(): raise 409`. ~1 line (delete).
- [x] **2.2** `POST /api/ota/upload` — Add per-device dup check: `if db.active_or_queued_for_device(target_mac): raise 409("already has an active or pending OTA job for this device")`. ~3 lines.
- [x] **2.3** `POST /api/ota/upload` — Upload ALWAYS creates `PENDING_CONFIRM` regardless of whether another burn is active. No change to upload logic for queue awareness — the queue transition happens at the start endpoint (2.4). Remove the old blanket `db.active_job()` guard (already done in 2.1).
- [x] **2.4** `POST /api/ota/start/{job_id}` — If `db.active_job()` exists (another device is actively burning), transition to `QUEUED` + assign `queue_order` instead of `STARTING`. Wake worker. ~8 lines.
- [x] **2.5** `GET /api/ota/queue` — **New endpoint.** Returns `{"active_job": db.active_job(), "queued_jobs": [...], "paused": ota_worker_is_paused(), "count": N}` with each queued job annotated with `position` (computed via `count_queued_before`). Active job included so the queue page can show the currently burning job as row 1. ~20 lines.
- [x] **2.6** `GET /api/ota/queue/paused` — **New endpoint.** Returns `{"paused": true/false}`. ~5 lines.
- [x] **2.7** `POST /api/ota/queue/pause` — **New endpoint.** Sets pause on worker. Returns `{"paused": true}`. ~5 lines.
- [x] **2.8** `POST /api/ota/queue/resume` — **New endpoint.** Clears pause on worker, wakes worker. Returns `{"paused": false}`. ~6 lines.
- [x] **2.9** `POST /api/ota/queue/{job_id}/abort` — **New endpoint.** Deletes firmware file via `firmware_store.delete_file()`, calls `db.abort_queued_job()`. Wakes worker. Returns `{"ok": true}`. ~10 lines.
- [x] **2.10** `POST /api/ota/queue/{job_id}/up` — **New endpoint.** Gets job, computes new order (`queue_order - 1`), calls `reorder_queue()`. Returns `{"jobs": db.queued_jobs()}`. ~10 lines.
- [x] **2.11** `POST /api/ota/queue/{job_id}/down` — **New endpoint.** Same as up but `queue_order + 1`. ~10 lines.
- [x] **2.12** `POST /api/ota/reflash/{job_id}` — Remove blanket `db.active_job()` guard (same as upload). Add per-device dup check (`active_or_queued_for_device`). Reflash ALWAYS creates `PENDING_CONFIRM`, same as upload. Queue transition happens at start endpoint.

---

### Phase 3 — OTA Worker (`ota_worker.py`)

Queue dequeue logic, pause/resume, startup recovery changes.

- [x] **3.1** Add `self._paused = False` in `__init__()`. ~1 line.
- [x] **3.2** Add `pause()` and `resume()` methods (sets flag, wakes on resume). ~6 lines.
- [x] **3.3** Add `is_paused()` getter. ~2 lines.
- [x] **3.4** Replace `_recover_startup_job()` content: fail any non-terminal non-queued job. If `db.has_queued_jobs()`, set `self._paused = True`. ~15 lines.
- [x] **3.5** Update `_run()` loop: after `_process()` finishes, if `not self._paused`, call `self._dequeue_next()`. ~8 lines.
- [x] **3.6** Add `_dequeue_next()` method:
  - Get `db.next_queued_job()`.
  - If None, return.
  - Get topology via `bridge_manager.topology()`.
  - Check if device is online (`find_node_by_mac`).
  - If offline: delete job + firmware file (no audit trace, call `abort_queued_job`), then skip to next (`self._dequeue_next()` recursive).
  - If online: `db.update_job(status = STARTING)`, loop will pick it up.
  - ~20 lines.

- [x] **3.7** `_process()`: catch `RuntimeError` for bridge start failure → re-queue to back (set `queue_order = MAX + 1`), retry once. On second attempt failure, delete job + firmware file (no audit trace). Store attempt count in-worker via `self._retry_counts: dict[int, int]` (cleared when job leaves queue). ~15 lines.

---

### Phase 4 — Frontend API Client (`ui/src/api/client.ts`)

New API methods for queue operations.

- [x] **4.1** Add `getQueue()` → `GET /api/ota/queue`. ~3 lines.
- [x] **4.2** Add `getQueuePaused()` → `GET /api/ota/queue/paused`. ~3 lines.
- [x] **4.3** Add `pauseQueue()` → `POST /api/ota/queue/pause`. ~3 lines.
- [x] **4.4** Add `resumeQueue()` → `POST /api/ota/queue/resume`. ~3 lines.
- [x] **4.5** Add `abortQueuedJob(jobId)` → `POST /api/ota/queue/{jobId}/abort`. ~3 lines.
- [x] **4.6** Add `reorderJobUp(jobId)` → `POST /api/ota/queue/{jobId}/up`. ~3 lines.
- [x] **4.7** Add `reorderJobDown(jobId)` → `POST /api/ota/queue/{jobId}/down`. ~3 lines.
- [x] **4.8** Update `startOta(jobId)` → handle the case where the response job has `status: 'queued'` (active burn running). Extract `queue_position` from response for UI feedback. ~5 lines.

---

### Phase 5 — Per-device OTA Box (`ui/src/components/ota-box.ts`)

Update to show queued state, handle queue-aware abort flow.

- [x] **5.1** Add QUEUED state rendering: when `currentJob.status === 'queued'`, show progress bar at 0% with overlay text "Queued — position #N". Include abort button that calls `api.abortQueuedJob()`. ~15 lines in `render()`.
- [x] **5.2** Update `activeElsewhere` logic: file upload is never blocked for OTHER devices. If THIS device has a non-terminal job (`PENDING_CONFIRM`, `QUEUED`, or active), hide the file selector and show the appropriate state (queued view or active progress). Cross-device uploads are freely allowed.
- [x] **5.3** Update `start()` handler: if response includes queued job info, switch to queued state instead of clearing. ~5 lines.
- [x] **5.4** Add abort flow: clicking abort on active job → check `api.getQueue()` → if non-empty, show confirmation modal ("Other queued jobs waiting. Continue?"). Yes → call `api.abortOta()` only (queue auto-continues). No → call `api.abortOta()` THEN `api.pauseQueue()` as two sequential requests (queue paused). ~25 lines (new private method + modal template).

---

### Phase 6 — Queue Page (`ui/src/pages/queue-page.ts`)

Full queue manager component.

- [x] **6.1** Create `ui/src/pages/queue-page.ts` as a LitElement component. ~200 lines.
- [x] **6.2** Implement polling at 2s interval (`setInterval` → `api.getQueue() + api.getQueuePaused()`). Start on `connectedCallback`, stop on `disconnectedCallback`.
- [x] **6.3** Render queue table with columns: `device_name | firmware_filename | progress bar (0%) | abort button | up button | down button`.
- [x] **6.4** Progress bar: custom mini inline bar (thin horizontal bar, grey background, accent fill 0%). ~15 lines CSS.
- [x] **6.5** Up/Down buttons: hidden for the row corresponding to the actively burning job. Call `api.reorderJobUp(jobId)` / `api.reorderJobDown(jobId)`.
- [x] **6.6** Abort button: calls `api.abortQueuedJob(jobId)` → refreshes queue.
- [x] **6.7** Pause/Resume buttons at top: calls `api.pauseQueue()` / `api.resumeQueue()`. Disable/resume as appropriate.
- [x] **6.8** Empty state: "No queued firmware flashes." friendly message.
- [x] **6.9** Active job row: show current progress (real percent from active job's `percent` field, bridge_state text). No abort/reorder on this row.
- [x] **6.10** Poll timer: clear interval in `disconnectedCallback`, set in `connectedCallback`. ~6 lines lifecycle.

---

### Phase 7 — Header Queue Indicator (`ui/src/components/app-header.ts` or new `queue-badge.ts`)

Persistent nav bar badge showing queue state.

- [x] **7.1** Create or update header component with queue badge. ~60 lines.
- [x] **7.2** If queue has items + paused: show red/orange badge "Paused" with tooltip "Queue is paused. # queued jobs waiting."
- [x] **7.3** If queue has items + unpaused + active burn: show accent badge "1/3" (e.g. `1 running, 2 queued`).
- [x] **7.4** If queue is empty: hide badge.
- [x] **7.5** Click on badge → navigate to `/queue` route. ~3 lines.
- [x] **7.6** Poll queue status at 3s interval for badge updates.

---

### Phase 8 — Router & Route Registration

Wire new queue page into the SPA routing.

- [x] **8.1** Update `ui/src/app.ts` or routing module to add `/queue` route → render `<esp-queue-page>`.
- [x] **8.2** Ensure sidebar/nav includes queue link.
- [x] **8.3** Wire the header badge to navigate to `/queue`.

---

### Phase 9 — Testing & Edge Cases

Manual and automated verification.

- [x] **9.1** Upload firmware for device A (no active burn) → confirm → verify burn starts normally.
- [x] **9.2** While A is burning, upload firmware for device B → verify PENDING_CONFIRM shows preflight. Upload for C → verify same.
- [x] **9.3** Click Flash on B while A is burning → verify B goes to QUEUED, queue page shows position #1.
- [x] **9.4** Click Flash on C while A is burning → verify C goes to QUEUED, queue page shows positions #1 (B) and #2 (C).
- [x] **9.5** Wait for A to finish → verify B auto-starts (QUEUED → STARTING → TRANSFERRING).
- [x] **9.6** Pause queue before A finishes. Verify B does NOT auto-start after A finishes. Verify queue page shows "Paused."
- [x] **9.7** Resume queue. Verify B starts.
- [x] **9.8** Re-order C above B while A is burning. Verify A finishes → C starts (not B).
- [x] **9.9** Abort single queued job. Verify it disappears from queue page, file deleted, no audit trail. Remaining jobs re-indexed.
- [x] **9.10** Abort active job A with B queued. Verify modal appears → No → queue pauses. Verify B doesn't start.
- [x] **9.11** Abort active job A with B queued → Yes → verify B starts immediately.
- [x] **9.12** Upload firmware for same device twice → verify second upload is rejected (409).
- [x] **9.13** Worker re-validates topology before starting queued job. If device is offline → verify job is deleted (no trace), next queued proceeds.
- [x] **9.14** Add-on restart with queued jobs → verify mid-flight job is failed (not recovered), queue is paused.
- [x] **9.15** Reflash (existing completed job) while device A is burning → verify reflash creates PENDING_CONFIRM → clicking Flash queues it behind A.
- [x] **9.16** Bridge unreachable during starting a queued job → verify retry + re-queue to back logic.
- [x] **9.17** Queue page refreshes every 2s → verify updates when state changes.
- [x] **9.18** Header badge updates, reflects pause/running/empty states correctly.

---

## 3. Key Files

| File | Phase | ~Lines changed/added | Purpose |
|------|-------|----------------------|---------|
| `app/models.py` | 1 | +2 | QUEUED status constant, ACTIVE_STATUSES update |
| `app/db.py` | 1 | +85 | Schema migration, new query methods |
| `app/server.py` | 2 | +90 | Modified upload/start/reflash, new queue endpoints |
| `app/ota_worker.py` | 3 | +60 | Dequeue loop, pause/resume, startup recovery changes |
| `ui/src/api/client.ts` | 4 | +30 | New API methods for queue |
| `ui/src/components/ota-box.ts` | 5 | +50 | QUEUED state rendering, abort modal |
| `ui/src/pages/queue-page.ts` | 6 | +200 (new file) | Queue manager page |
| `ui/src/components/queue-badge.ts` | 7 | +60 (new file/updated) | Header badge indicator |
| `ui/src/app.ts` (routing) | 8 | +15 | Route registration |

---

## 4. Risk Notes

- **Bridge is single-session**: queueing is add-on side only. Bridge can only serve one OTA at a time. No change needed on bridge.
- **QUEUED in ACTIVE_STATUSES**: means `active_or_queued_for_device()` covers the dup check naturally (all non-terminal statuses counted).
- **Upload always creates PENDING_CONFIRM**: the transition to QUEUED happens only at the start endpoint (`POST /api/ota/start/{id}`) when another burn is active. Upload is never queue-aware.
- **Failed queued jobs are deleted**: when the worker finds a queued job's device is offline or the bridge start fails twice, the job row and firmware file are deleted. No audit trace. This matches the manual abort behavior from the queue page.
- **Polling at 2s**: fine for firmware scale. No websocket/SSE overhead.
- **Pause lost on restart**: by design — session-level state. On restart, re-evaluate: fail stale jobs, pause if queued.
- **Retry logic in worker**: transient network blip retries once. Keeps queue moving.
- **File deletion on queued abort**: deletes from `firmware_store`. No retention for a job that never ran.
- **Abort + pause flow**: frontend sends two sequential requests (`/api/ota/abort` then `/api/ota/queue/pause`). No single combined endpoint.
