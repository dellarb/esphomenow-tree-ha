# Fix Plan — ESPHome ESPNow Tree HA Add-on

> Bug review findings requiring action, with progress tracking.

## Critical

- [x] **#1 — Frontend API calls bypass HA ingress**
  Frontend `fetch('/api/config')` resolves to `https://ha-host:8123/api/config` (HA Core API) instead of the add-on backend. All API calls in `client.ts` use absolute paths.
  - Fix: Added `apiPath()` helper in `client.ts` that reads ingress prefix from `<meta name="x-ingress-path">` tag. Server rewrites the meta tag with `X-Ingress-Path` header value from HA Supervisor on each index.html serve. `vite.config.ts` supports `VITE_BASE` env var override.
  - Files: `ui/src/api/client.ts`, `ui/vite.config.ts`, `ui/index.html`, `app/server.py`

## Moderate

- [x] **#2 — `firmware_store.retain()` sets retention deadline on nonexistent file**
  When `path_value` is set but the file is missing from disk, `retain()` still returns a `retained_until` timestamp. This creates a phantom retained entry in the DB pointing at nothing.
  - Fix: Return `(None, None)` when the source file doesn't exist.
  - Files: `app/firmware_store.py`

- [x] **#3 — Settings "Save" converts auto-discovered bridge to manual override**
  Opening settings populates the form from `active_bridge.host`. Clicking Save without changing anything stores the discovered IP as a manual override, killing auto-discovery.
  - Fix: Form now loads from `bridge_config` row (the stored manual override). Save button is disabled when values haven't changed (dirty tracking via `originalHost`/`originalPort`). User must explicitly type a new value to create a manual override.
  - Files: `ui/src/components/settings.ts`

- [x] **#4 — `upsert_devices_from_topology()` lacks transaction wrapping**
  With `isolation_level=None` (autocommit), each `INSERT … ON CONFLICT` is its own transaction. A crash mid-iteration leaves partial device data.
  - Fix: Wrapped the loop in explicit `BEGIN`/`COMMIT` with `ROLLBACK` on exception.
  - Files: `app/db.py`

- [x] **#5 — `ota_abort` uses raw string literals instead of imported constants**
  `server.py:202` compares `job["status"] in {STARTING, "transferring", "verifying"}` — mixing the imported `STARTING` constant with raw strings. If constants change, this check silently breaks.
  - Fix: Imported `TRANSFERRING` and `VERIFYING` from `models` and used them.
  - Files: `app/server.py`

- [x] **#6 — `ota_abort` calls `mark_terminal` before confirming bridge abort succeeded**
  After calling bridge `/api/ota/abort`, any exception is swallowed. If bridge abort fails, the add-on still marks the job as aborted locally, creating a state mismatch where the bridge thinks a transfer is active but the add-on doesn't.
  - Fix: If bridge abort throws, the error message now includes a warning that the bridge abort may have failed. Job is still marked aborted locally (safe default) but the user is informed.
  - Files: `app/server.py`

## Low

- [x] **#7 — Bridge client creates new `httpx.AsyncClient` per call**
  Every `get_topology`, `get_ota_status`, `start_ota`, `send_chunk`, `abort_ota` creates and destroys an `AsyncClient`. During active OTA the worker polls status and sends chunks every ~1s, creating 2+ new TCP connections per second.
  - Fix: `BridgeClient` now creates a single persistent `AsyncClient` on first use, reused across all calls with per-request timeouts. Added `close()` method for shutdown cleanup.
  - Files: `app/bridge_client.py`

- [x] **#8 — `_find_node()` is duplicated**
  Identical function defined in both `server.py:294` and `ota_worker.py:216`.
  - Fix: Moved to `models.py` as `find_node_by_mac()`, normalizes both sides. Both `server.py` and `ota_worker.py` now import it.
  - Files: `app/server.py`, `app/ota_worker.py`, `app/models.py`

- [x] **#9 — `npm ci` requires `package-lock.json`**
  The Dockerfile runs `npm ci` but `package-lock.json` presence in `ui/` hasn't been verified. If missing, Docker build fails.
  - Fix: Verified `ui/package-lock.json` exists (37KB). Dockerfile already copies `ui/package*.json` glob which captures it.
  - Files: `Dockerfile` (no change needed), `ui/package-lock.json` (confirmed present)

- [x] **#10 — `map: config:rw` in config.yaml is unused**
  The add-on never reads from or writes to `/config`. Mapping it read-write is unnecessary and widens the security boundary.
  - Fix: Removed the `map` entry from `config.yaml`.
  - Files: `config.yaml`

- [x] **#11 — Device detail polls 3 endpoints every 3 seconds**
  `device-detail.ts` fetches topology + current OTA + history every 3s. Topology triggers a full DB upsert per poll, even when idle.
  - Fix: Poll interval is now 5s when idle, 2s when an OTA job is active. Uses `updated()` lifecycle to reschedule the timer when job status changes.
  - Files: `ui/src/components/device-detail.ts`

- [x] **#12 — `preflight_warnings` doesn't detect older firmware version**
  Plan says to warn if "new version/build date appears older or same." Current code only warns on exact version match, not on downgrade.
  - Fix: Added an `elif` branch that warns when version strings differ (both present but not equal), covering both upgrade and downgrade.
  - Files: `app/server.py`

- [x] **#13 — DB foreign key on `ota_jobs.mac → devices(mac)` can reject inserts**
  If `upsert_devices_from_topology()` fails partway (see #4), a subsequent `create_job()` can fail on the FK constraint. Currently masked because `ota_upload` calls `topology()` first, but the lack of transactional integrity makes this fragile.
  - Fix: Added `_ensure_device_stub()` method to `Database` that inserts a minimal device row if one doesn't exist. Called from `create_job()` before the INSERT, so FK always passes.
  - Files: `app/db.py`

- [x] **#14 — `normalize_mac` in TypeScript is dead code**
  `client.ts:104-106` exports `normalizeMac` but no component imports or uses it. Meanwhile, MAC comparisons in components use `.toUpperCase()` inline.
  - Fix: Updated `normalizeMac` to match Python behavior (strip delimiters, pad, reformat as `XX:XX:XX:XX:XX:XX`). Used it in `topology-node.ts`, `ota-box.ts`, `device-detail.ts`, and `topology-map.ts` for all MAC comparisons.
  - Files: `ui/src/api/client.ts`, `ui/src/components/topology-node.ts`, `ui/src/components/ota-box.ts`, `ui/src/components/device-detail.ts`, `ui/src/components/topology-map.ts`

- [x] **#15 — Dockerfile doesn't pin Node.js version, `apk add nodejs` may break**
  Alpine `nodejs` package version isn't pinned. Different base image rebuilds could pull incompatible Node versions.
  - Fix: Pinned to `nodejs~22` (Alpine version constraint syntax for major version 22).
  - Files: `Dockerfile`