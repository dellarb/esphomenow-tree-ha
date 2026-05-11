# AGENTS.md - ESP Tree HA Add-on

## Communication

When talking to the user, be concise — answer in 1-3 sentences or fewer. Avoid preamble, explanations, or conclusions.

## Project Structure

This is a monorepo containing:
- **`esp-tree-ha/`** — Home Assistant add-on (Python backend + HA integration + UI)
- **`device_code/`** — ESP device firmware, ESPHome components, demos, and protocol docs

For ESP device-side work (bridge/remote firmware, protocol, ESPHome builds), see `device_code/AGENTS.md`.

## This Project

- ESP Tree is a Home Assistant add-on for administering the ESPNOW network via the bridge and its remotes.
- **Primary API: Protobuf** — The add-on communicates with the bridge via a protobuf-based protocol. This is the default and recommended approach.
- **Legacy APIs (HTTP & WebSocket)** — HTTP and WebSocket transport modes are retained for backward compatibility but are considered legacy. Only use these if the protobuf API is unavailable.
- OTA is only available in HTTP mode. In WebSocket mode, OTA endpoints return 501.

## Bridge Transport Modes

### Protobuf Mode (Primary - Default)
- Uses `BridgeProtoClient` / `BridgeProtoManager` in `app/bridge_proto_client.py`
- Binary protobuf protocol for efficient communication with the bridge
- This is the default mode — always work on this path for new features and improvements

### HTTP Mode (Legacy)
- Uses `BridgeClient` / `BridgeManager` in `app/bridge_client.py`
- REST API polling via `/topology.json` and `/api/ota/*` endpoints
- Config: `bridge_host` and `bridge_port` settings
- Retained for backward compatibility only

## Dev Menu

Use `dev.sh` at the repo root for the unified development menu:
- `dev.sh compile` — ESPHome build menu
- `dev.sh qc` — QC pipeline (protobuf regeneration, UI build, version bump, git commit/push)
- `dev.sh flash-usb <port> <demo>` — USB flash
- `dev.sh clean` — Clean builds and __pycache__

## Version Bumps

Do NOT manually bump version numbers. Version bumps are handled automatically by `dev.sh qc` during the quality control process.

## Remote Debug Logging

A lightweight remote logging system captures JSON logs from both the addon and integration for debugging.

**Log server:** `log_listener.py` at `10.1.1.23:9999` (runs in a screen session, started by `dev.sh qc`)

**Log file:** `logs/esp_tree_debug.jsonl` (one JSON object per line, cleared if older than 24h)

### Reading Logs

```bash
curl http://10.1.1.23:9999/logs
```

### Log Entry Schema

```json
{
  "timestamp": "2026-05-10T14:23:45.123Z",
  "level": "INFO",
  "source": "addon" | "integration",
  "component": "bridge_v2_client | topology | entity | ...",
  "message": "Human readable message",
  "data": {}
}
```

### Logger Integration Points

Both addon and integration use `remote_logger_dev_only.py` which attaches a handler to the **root logger**, so all `logger.info/error/debug/warning` calls from any module are forwarded.

**Addon** — `app/server.py`:
- Import: `from .remote_logger_dev_only import get_remote_logger` (line ~49)
- Setup call: `get_remote_logger()` (line ~908, in startup block)

**Integration** — `ha_integration/custom_components/esp_tree/__init__.py`:
- Import: `from .remote_logger_dev_only import get_remote_logger as _setup_remote_logger` (line ~16)
- Setup call: `_setup_remote_logger()` (line ~22, at module load time)

### Temporary Nature

`remote_logger_dev_only.py` in both `app/` and `ha_integration/` is intentionally named to signal it is for temporary debug use only. When debugging is complete, remove the files and their integration points.