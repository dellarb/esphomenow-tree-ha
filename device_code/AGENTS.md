# AGENTS.md - ESP Tree Device Code

## Communication

When talking to the user, be concise — answer in 1-3 sentences or fewer. Avoid preamble, explanations, or conclusions.

## How to Talk to User

- Be concise: 1-3 sentences or a short paragraph max
- Answer directly, no preamble/postamble
- Use the working code as the source of truth, not docs

## What Matters Here

- ESPHome external components for bridge + remote in `components/`, demos in `demos/`
- `esp_tree_bridge` builds cleanly; `esp_tree_remote` + radio transport in progress
- `espnow_types.h` is the protocol source of truth — keep changes consistent
- Works with Home Assistant addon and integration in `../../esp-tree-ha/`

## Build & Verify

- `./device_code/scripts/ha_compile.sh` — interactive menu with no args; uses Docker
- CLI: `1`-`N` toggle, `a` all, `n` none, `b` build, `f` flash, `bf` build+flash
- Example: `./device_code/scripts/ha_compile.sh espnow-bridge-c5 bf`
- Cached firmware ages shown in menu; artifacts in `cache/builds/<demo>.bin` and `.ota.bin`

**Smart dev target:** Build what you touched — bridge/shared code → bridge; remote only → remote

## Constraints

- `demos/secrets.yaml` = gitignored, never commit secrets
- Build output in full — no hide warnings/errors
- Prefer cached `.ota.bin` for flashing: `./ha_compile.sh <demo> f`

## Source of Truth

- Executable config > prose
- Docs: `device_code/README.md`, `device_code/demos/README.md`, `opencode.json`

## Live ESP Logging (esplog)

```bash
./device_code/scripts/ha_esplog_run.sh restart        # Start/restart service
./device_code/scripts/ha_esplog_run.sh status         # Confirm ready (HTTP server: UP)
curl http://localhost:5555/status
curl "http://localhost:5555/stream?since=0&device_id=<name>&limit=20"
```

- Base URL: `http://localhost:5555`
- Key endpoints: `/stream` (logs), `/status` (device list), `/ui` (dashboard)
- Logs: SQLite `cache/esplog.db` (7-day retention) + in-memory ring buffer
- Screen session `esplog` runs `esplog-master.py --serve --port 5555`
- Per-device containers `esplog-<device_id>`

## Dev Menu

Use `dev.sh` at the repo root for the unified development menu. It includes:
- `dev.sh compile` — ESPHome build menu (passthrough to `device_code/scripts/ha_compile.sh`)
- `dev.sh qc` — QC pipeline (protobuf regeneration, UI build, version bump, git commit/push)
- `dev.sh flash <demo>` — USB/OTA flash

## Protocol Source of Truth

`components/esp_tree_common/espnow_types.h` — all protocol types, keep changes consistent across bridge and remote.

## Component Structure

| Component | Description |
|-----------|-------------|
| `esp_tree_bridge/` | Bridge node: WiFi + MQTT + ESP-NOW LR. Handles remote management, entity discovery, command routing |
| `esp_tree_remote/` | Remote node: ESP-NOW LR only. Entity registration, state reporting, command reception |
| `espnow_82xx_remote/` | Legacy ESP8266 remote variant |
| `esp_tree_common/` | Shared code: crypto, MAC utils, frame definitions, protocol types |