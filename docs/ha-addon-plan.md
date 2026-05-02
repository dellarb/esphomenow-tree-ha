# ESPHome ESPNow Tree HA Add-on - Architecture Plan

> Session date: 2026-04-30
> Status: Revised plan complete, ready for V1 implementation

## Overview

A Home Assistant add-on that provides an ingress web UI for managing ESP-NOW LR remote devices through a bridge ESP32.

The add-on replaces the topology and OTA web UI currently embedded in the bridge firmware with a proper Lit-based dashboard served from a Docker add-on container. The bridge remains the transport endpoint for ESP-NOW and MQTT discovery. The add-on owns UX, upload storage, flash history, OTA orchestration, and Home Assistant integration.

V1 scope is deliberately narrow: **topology view + device detail diagnostics + user-supplied OTA upload/flash**.

V1 does **not** include entity control, YAML editing, firmware builds, multi-bridge support, or bridge firmware API changes.

---

## V1 Hard Constraints

- Build as a real Home Assistant add-on from day one.
- Use Home Assistant ingress as the auth boundary.
- Do not expose an unauthenticated LAN UI/API.
- No new bridge firmware API surface in V1.
- Use only the bridge endpoints that exist today:
  - `GET /topology.json`
  - `POST /api/ota/start`
  - `GET /api/ota/status`
  - `POST /api/ota/chunk`
  - `POST /api/ota/abort`
- Entity display/control is deferred. V1 may show `entity_count` from topology only.
- Only one active OTA job at a time.
- OTA success requires bridge transfer success plus remote rejoin confirmation.

Bug fixes to existing bridge endpoints are acceptable if required for the add-on to work, but V1 should not depend on new bridge functionality.

---

## Decisions Summary

| # | Decision | Choice |
|---|----------|--------|
| 1 | Target users | Developer + early adopters, small ESP32 fleets |
| 2 | V1 scope | Topology, diagnostics, OTA upload/flash, flash history |
| 3 | Explicit V1 exclusions | Entity control, YAML editor, build pipeline, multi-bridge |
| 4 | Runtime shape | Home Assistant add-on from day one |
| 5 | Panel type | Ingress iframe, add-on serves own Lit app |
| 6 | HA auth | `SUPERVISOR_TOKEN` with `homeassistant_api: true` |
| 7 | User-supplied token | Not used in V1 |
| 8 | Bridge auth | Home Assistant ingress is the user auth boundary |
| 9 | Backend API | FastAPI serving JSON API + static Vite build |
| 10 | Frontend | Lit web app |
| 11 | Topology rendering | Recursive tree/list, poll backend proxy every 5s |
| 12 | Bridge discovery | Manual host config plus opportunistic HA auto-discovery |
| 13 | Bridge network | `host_network: true` for V1 |
| 14 | OTA upload path | Browser -> add-on backend -> retained file on `/data` |
| 15 | Bridge OTA path | Add-on feeds requested chunks to bridge `/api/ota/chunk` |
| 16 | OTA queue | One active/pending job at a time in V1 |
| 17 | OTA progress | Frontend polling, backend owns worker/state machine |
| 18 | OTA success | Bridge `SUCCESS` plus rejoin/version confirmation |
| 19 | OTA failure | Mark failed with error, no automatic retry |
| 20 | Restart recovery | Resume only if bridge still has the active session |
| 21 | Firmware retention | Retain uploaded binaries for 7 days for manual rollback |
| 22 | Rollback | Manual "flash this retained file again", no automatic rollback |
| 23 | Storage | SQLite plus `/data/firmware` file retention |
| 24 | Entity roadmap | Keep MQTT discovery now, architecture should not block ESPHome-like future |

---

## System Architecture

```text
Home Assistant
  Sidebar panel: "ESPNow LR"
    Ingress iframe
      Lit app
        Topology tree
        Device detail
        OTA upload/progress/history

  Add-on container: FastAPI + SQLite + OTA worker
    Static Vite build
    /api/config
    /api/bridge/topology.json
    /api/bridge/ota/status
    /api/bridge/ota/abort
    /api/ota/upload
    /api/ota/current
    /api/ota/start
    /api/ota/history
    /api/firmware/retained

    SQLite:
      bridge_config
      devices
      ota_jobs

    Files:
      /data/firmware/tmp
      /data/firmware/active
      /data/firmware/retained

    Worker:
      Owns active job
      Calls bridge /api/ota/start
      Polls bridge /api/ota/status
      Sends requested chunks to /api/ota/chunk
      Polls topology after transfer success
      Updates SQLite

Bridge ESP32
  /topology.json
  /api/ota/start
  /api/ota/status
  /api/ota/chunk
  /api/ota/abort
  MQTT discovery/state to HA
  ESP-NOW LR to remotes
```

---

## Data Flow

| Data | Source | Method |
|------|--------|--------|
| Topology and diagnostics | Bridge HTTP | Backend proxy: `GET /api/bridge/topology.json` |
| Bridge IP discovery | HA Core API | `SUPERVISOR_TOKEN` against `http://supervisor/core/api/states` |
| Manual bridge host | Add-on options | `/data/options.json` |
| Firmware upload | Browser | `POST /api/ota/upload` multipart to add-on |
| Firmware storage | Add-on | `/data/firmware/...` |
| Firmware hash/header | Add-on backend | Parse uploaded file and compute MD5 |
| OTA transfer | Add-on worker | Bridge `/api/ota/start`, `/api/ota/status`, `/api/ota/chunk` |
| OTA progress | Add-on worker | SQLite job state, exposed via `GET /api/ota/current` |
| Rejoin confirmation | Bridge topology | Worker polls `/topology.json` after bridge success |
| Flash history | SQLite | `GET /api/ota/history?mac=...` |

---

## Home Assistant Integration

V1 uses Home Assistant only for:

- Ingress auth and panel access.
- Reading add-on options.
- Optional bridge auto-discovery through HA Core states.

The add-on should configure:

```yaml
homeassistant_api: true
hassio_api: true
ingress: true
host_network: true
```

The backend uses:

- REST: `http://supervisor/core/api/`
- Token: `SUPERVISOR_TOKEN`

No long-lived access token is stored in add-on options.

Entity control and HA WebSocket service calls are deferred. When entity support is added later, backend-owned HA API access should remain the default so the frontend never receives privileged tokens.

---

## Bridge Discovery

Manual config is the reliable path:

- `bridge_host`
- `bridge_port`, default `80`

Auto-discovery is opportunistic:

1. If `bridge_host` is set, use it.
2. Otherwise call HA Core states via Supervisor token.
3. Search for bridge diagnostics that expose `topology_url`.
4. Accept either an IP string or URL.
5. Normalize to `{host, port}`.
6. Validate with `GET http://<host>:<port>/topology.json`.
7. Store the working bridge in SQLite.

The UI settings page shows the active bridge and lets the user set/clear a manual override.

---

## Topology View

V1 should render a polished recursive tree/list, not a canvas or graph.

Source: `GET /api/bridge/topology.json`, proxied to bridge `GET /topology.json`.

Expected fields currently available from bridge topology:

```json
[
  {
    "mac": "XX:XX:XX:XX:XX:XX",
    "label": "Display Name",
    "parent_mac": "",
    "online": true,
    "state": 5,
    "hops": 0,
    "offline_s": 0,
    "uptime_s": 12345,
    "entity_count": 12,
    "firmware_version": "1.0.0",
    "esphome_name": "espnow_remote_1",
    "project_name": "espnow_remote_1",
    "firmware_build_date": "2026-04-30 12:30:00 UTC",
    "chip_type": 23,
    "rssi": -71
  }
]
```

The topology node should show:

- Label / ESPHome name
- MAC
- Online/offline state
- Hops
- RSSI
- Firmware version
- Entity count
- OTA status badge if current job targets that MAC

Clicking a node opens device detail.

---

## Device Detail

Device detail is built from topology data and local SQLite history only.

V1 sections:

- Header: name, MAC, online state
- Diagnostics: firmware version, project name, build date, chip, RSSI, hops, uptime, entity count
- OTA box: file upload, parsed metadata, warnings, confirm flash, progress
- Flash history: previous jobs for the MAC
- Retained firmware action: "Flash this file again" while binary is retained

No entity controls in V1.

---

## OTA Model

V1 OTA is add-on-stored and bridge-chunk-fed.

The add-on receives the uploaded `.ota.bin`, stores it on disk, computes MD5, parses useful metadata, and then feeds the bridge the chunks it requests. The bridge never receives a whole-file upload endpoint from the add-on.

### Bridge Contract

Use the existing bridge API:

```http
POST /api/ota/start
```

Form/query args:

- `target`: target MAC
- `size`: firmware byte size
- `md5`: lowercase hex MD5 of full file

```http
GET /api/ota/status
```

Expected response:

```json
{
  "state": "IDLE|START_RECEIVED|TRANSFERRING|VERIFYING|SUCCESS|FAIL",
  "percent": 75,
  "packets_sent": 150,
  "packets_total": 200,
  "active_target": "XX:XX:XX:XX:XX:XX",
  "chunk_size": 128,
  "requested": [1, 2, 3],
  "error_msg": ""
}
```

```http
POST /api/ota/chunk
```

Form/query args:

- `seq`: requested sequence number
- `data`: base64 chunk bytes

```http
POST /api/ota/abort
```

Abort active bridge transfer.

### Add-on OTA Flow

1. User opens device detail.
2. User selects `.ota.bin`.
3. Browser uploads file to add-on via `POST /api/ota/upload`.
4. Backend writes to `/data/firmware/tmp/<upload_id>.part`.
5. Backend validates basic image shape, parses metadata, computes MD5.
6. Backend atomically moves file to `/data/firmware/active/<upload_id>.bin`.
7. Backend creates an OTA job in `pending_confirm` state.
8. UI shows current device vs firmware comparison.
9. User confirms flash.
10. Backend checks no other active job exists.
11. Backend checks target is online in current topology.
12. Worker calls bridge `/api/ota/start`.
13. Worker polls `/api/ota/status`.
14. Worker sends each requested chunk via `/api/ota/chunk`.
15. Bridge reports `SUCCESS`.
16. Worker moves job to `transfer_success_waiting_rejoin`.
17. Worker polls topology until target rejoins.
18. If firmware version matches parsed version, mark `success`.
19. If version cannot be parsed, online rejoin is enough for success.
20. If target rejoins with old/different version, mark `version_mismatch`.
21. If no rejoin before timeout, mark `rejoin_timeout`.
22. File moves to retained storage for 7 days.

### OTA Preflight

Hard blocks:

- Missing or empty file.
- File is not parseable enough to look like an ESP OTA image.
- MD5 computation fails.
- Target device is offline.
- Another OTA job is active.
- Bridge health check fails.

Warnings requiring explicit confirmation:

- Firmware project/name does not match topology ESPHome name.
- Parsed chip does not match topology chip type.
- New version/build date appears older or same.
- Topology lacks enough metadata to compare.

The remote remains the final safety net for chip/image validity, MD5 verification, and OTA partition commit.

### OTA States

Recommended internal job states:

- `pending_confirm`
- `starting`
- `transferring`
- `verifying`
- `transfer_success_waiting_rejoin`
- `success`
- `failed`
- `aborted`
- `rejoin_timeout`
- `version_mismatch`

Only one job may be in a non-terminal state at a time.

Terminal states:

- `success`
- `failed`
- `aborted`
- `rejoin_timeout`
- `version_mismatch`

### Restart Recovery

On add-on startup:

1. Load any non-terminal job.
2. Confirm retained/active firmware file exists.
3. Query bridge `/api/ota/status`.
4. If bridge is still `TRANSFERRING` and reports requested chunks, resume feeding chunks.
5. If bridge is `VERIFYING`, keep polling.
6. If bridge is `SUCCESS`, continue rejoin polling.
7. If bridge is `IDLE`, `FAIL`, unreachable, or target mismatch, mark failed.

This is not generic resumable OTA. It only resumes the add-on chunk feeder if the bridge still has the active transfer session.

### Firmware Retention

Uploaded firmware binaries are retained for 7 days after terminal state.

Retention goals:

- Manual rollback if a previously uploaded binary is needed.
- Re-flash retained firmware without requiring the user to find the file again.

Rules:

- Keep parsed metadata/history indefinitely.
- Keep binary for 7 days by default.
- Delete stale retained binaries on startup and periodically.
- Do not automatically rollback.
- Do not label a file "previous firmware" unless it was actually uploaded through this add-on.

---

## SQLite Schema

```sql
CREATE TABLE bridge_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bridge_host TEXT,
  bridge_port INTEGER DEFAULT 80,
  auto_discovered INTEGER DEFAULT 1,
  last_validated_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE devices (
  mac TEXT PRIMARY KEY,
  node_key TEXT,
  label TEXT,
  esphome_name TEXT,
  bridge_host TEXT,
  last_seen_online INTEGER,
  current_firmware_version TEXT,
  current_project_name TEXT,
  firmware_build_date TEXT,
  chip_type INTEGER,
  rssi INTEGER,
  hops INTEGER,
  entity_count INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE ota_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mac TEXT NOT NULL,
  status TEXT NOT NULL,
  firmware_path TEXT,
  retained_until INTEGER,
  firmware_name TEXT,
  firmware_size INTEGER,
  firmware_md5 TEXT,
  parsed_project_name TEXT,
  parsed_version TEXT,
  parsed_esphome_name TEXT,
  parsed_build_date TEXT,
  parsed_chip_type INTEGER,
  old_firmware_version TEXT,
  old_project_name TEXT,
  percent INTEGER DEFAULT 0,
  bridge_state TEXT,
  error_msg TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  FOREIGN KEY (mac) REFERENCES devices(mac)
);

CREATE INDEX idx_ota_jobs_mac_created ON ota_jobs(mac, created_at DESC);
CREATE INDEX idx_ota_jobs_status ON ota_jobs(status);
```

V1 can use `ota_jobs` as both current-job and flash-history storage. Future queue support can be added without changing the history model substantially.

---

## Add-on Backend API

FastAPI, port `8099`.

```text
GET    /api/config
GET    /api/health

GET    /api/bridge/topology.json
GET    /api/bridge/ota/status
POST   /api/bridge/ota/abort

GET    /api/devices
GET    /api/devices/{mac}

POST   /api/ota/upload
GET    /api/ota/current
POST   /api/ota/start/{job_id}
POST   /api/ota/abort
GET    /api/ota/history
GET    /api/ota/history/{mac}
POST   /api/ota/reflash/{job_id}

GET    /api/firmware/retained
DELETE /api/firmware/retained/{job_id}

GET    /
GET    /assets/*
```

Notes:

- `/api/ota/upload` creates a `pending_confirm` job.
- `/api/ota/start/{job_id}` confirms and starts that job.
- `/api/ota/reflash/{job_id}` creates a new pending job from a retained binary.
- `/api/ota/abort` aborts the current add-on job and calls bridge abort if needed.
- Static routes serve the Vite build output.

---

## Frontend Components

```text
ui/src/app.ts
  Root, route handling, app shell

ui/src/api/client.ts
  Fetch wrapper for add-on API

ui/src/components/topology-map.ts
  Recursive tree/list from topology

ui/src/components/topology-node.ts
  Node row, status badge, click navigation

ui/src/components/device-detail.ts
  Diagnostics, OTA box, history

ui/src/components/device-diagnostics.ts
  MAC, firmware, project, uptime, RSSI, hops, entity count

ui/src/components/ota-box.ts
  Upload, preflight comparison, confirmation, progress

ui/src/components/ota-progress.ts
  Current job progress from polling

ui/src/components/flash-history.ts
  Past jobs and retained firmware actions

ui/src/components/settings.ts
  Bridge discovery status and manual override
```

Polling cadence:

- Topology: 5 seconds.
- Current OTA: 1 second while active, 5 seconds while idle.
- Backend worker polls bridge status at 1 second while active.
- Backend worker polls topology every 2 to 5 seconds during rejoin wait.

---

## Add-on Config

```yaml
name: ESPHome ESPNow Tree
version: 0.1.0
slug: esphome-espnow-tree-ha
description: Manage ESP-NOW LR remotes through your bridge
arch:
  - amd64
  - aarch64
image: ghcr.io/<org>/esphome-espnow-tree-ha
ingress: true
ingress_port: 8099
panel_icon: mdi:radio-tower
panel_title: ESPNow LR
startup: services
host_network: true
homeassistant_api: true
hassio_api: true
map:
  - config:rw
options:
  bridge_host: ""
  bridge_port: 80
  firmware_retention_days: 7
schema:
  bridge_host: str
  bridge_port: int
  firmware_retention_days: int
```

No `ports:` mapping in V1.

---

## Directory Structure

```text
esphomenow-tree-ha/
  repository.yaml
  esphome-espnow-tree-ha/
    config.yaml
    Dockerfile
    build.yaml
    rootfs/
      etc/
        cont-init.d/
          00-prepare.sh
        services.d/
          esphome-espnow-tree-ha/
            run
    app/
      main.py
      server.py
      config.py
      db.py
      models.py
      bridge_client.py
      ha_client.py
      ota_worker.py
      bin_parser.py
      firmware_store.py
    ui/
      index.html
      package.json
      vite.config.ts
      tsconfig.json
      src/
        app.ts
        api/
          client.ts
        components/
          topology-map.ts
          topology-node.ts
          device-detail.ts
          device-diagnostics.ts
          ota-box.ts
          ota-progress.ts
          flash-history.ts
          settings.ts
    icon.png
    logo.png
    DOCS.md
    CHANGELOG.md
  .github/
    workflows/
      builder.yaml
```

---

## Implementation Order

| Step | What | Effort |
|------|------|--------|
| 1 | Add-on scaffold: config.yaml, Dockerfile, startup scripts | Small |
| 2 | FastAPI skeleton: config, health, static serving | Small |
| 3 | SQLite schema/init and firmware directories | Small |
| 4 | Bridge client and topology proxy | Small |
| 5 | Bridge discovery: manual config plus HA state lookup | Medium |
| 6 | Lit app shell and routing | Small |
| 7 | Topology tree/list polling `/api/bridge/topology.json` | Medium |
| 8 | Device detail diagnostics from topology | Medium |
| 9 | Firmware upload, storage, MD5, metadata parsing | Medium |
| 10 | OTA job model and one-active-job enforcement | Medium |
| 11 | OTA worker: start/status/chunk/abort bridge loop | Large |
| 12 | OTA progress UI and polling | Medium |
| 13 | Rejoin/version confirmation | Medium |
| 14 | Flash history and 7-day retained firmware actions | Medium |
| 15 | Settings page for bridge override | Small |
| 16 | Cleanup/restart recovery/error polish | Medium |

---

## V2+ Roadmap

### Entity Display and Control

- Keep MQTT discovery as the HA exposure path.
- Add backend-owned HA Core REST/WebSocket integration using `SUPERVISOR_TOKEN`.
- Do not expose HA tokens to frontend.
- Query device/entity registries and map topology nodes to HA devices by stable identifiers.
- Prefer ESPHome-aligned naming and schema semantics.
- If bridge schema is exposed later, persist raw entity descriptors in SQLite.

Potential future table:

```sql
CREATE TABLE entity_descriptors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mac TEXT NOT NULL,
  node_key TEXT NOT NULL,
  entity_index INTEGER,
  entity_type TEXT NOT NULL,
  entity_name TEXT,
  entity_id_hint TEXT,
  object_id TEXT,
  unique_id TEXT,
  unit TEXT,
  device_class TEXT,
  state_class TEXT,
  entity_category TEXT,
  options_json TEXT,
  ha_entity_id TEXT,
  ha_device_id TEXT,
  last_seen_at INTEGER,
  UNIQUE(mac, entity_index),
  FOREIGN KEY (mac) REFERENCES devices(mac)
);
```

### YAML Editor and Build Pipeline

- CodeMirror YAML editor in device detail.
- Device configs stored under `/data/devices/`.
- ESPHome compile inside the add-on container.
- Build log streaming via SSE or WebSocket.
- `!secret` support using ESPHome-style `secrets.yaml`.
- Flash compiled firmware through the same OTA worker.

### Multi-Bridge

- Store bridge config per bridge.
- Select active bridge in UI.
- Associate devices and OTA jobs with bridge ID.
- Route transfer through the owning bridge.

### HA Community Add-on Store

- Public repository.
- Multi-arch images.
- CI builder workflow.
- Docs, logo, changelog, versioning.

---

## Implementation Readiness Checklist

- [x] V1 scope excludes entity control.
- [x] V1 uses existing bridge chunk API.
- [x] V1 requires no bridge API changes.
- [x] HA auth uses `SUPERVISOR_TOKEN`.
- [x] One active OTA job at a time.
- [x] Firmware retained for 7 days.
- [x] Success requires rejoin/version confirmation.
- [x] Frontend progress uses polling.
- [x] Add-on is primary runtime from day one.
- [ ] Implement add-on scaffold.
- [ ] Implement backend API.
- [ ] Implement Lit UI.
- [ ] Test against real bridge.
