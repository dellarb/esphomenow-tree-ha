# AGENTS.md - ESPHome ESPNow Tree HA Add-on

## Project Relationship

This project is a Home Assistant add-on that works in tandem with the ESP32 ESP-NOW LR firmware in `/home/ben/ai-hermes-agent/ESPLR_V2`.

## Bridge and Remote Behavior

To understand bridge and remote behavior, protocol details, and ESP-NOW LR implementation, reference the AGENTS.md in `/home/ben/ai-hermes-agent/ESPLR_V2/`.

Key areas where ESPLR_V2 context is helpful:
- Radio protocol (only if needed): `ESPLR_V2/docs/espnow_v3_spec.md`
- Bridge and remote component behavior (`components/espnow_lr_bridge`, `components/espnow_lr_remote`)
- Protocol source of truth (`espnow_types.h`)
- Bridge API v1 spec: `ESPLR_V2/docs/bridge_api/bridge_api_v1.md`
- Bridge API v1 workplan: `ESPLR_V2/docs/bridge_api/bridge_firmware_workplan.md`
- Build and flashing workflow via `./compile.sh`

## This Project

- ESPHome ESPNow Tree is a Home Assistant add-on for administering the ESPNOW network via the bridge and its remotes.
- It supports two transport modes to communicate with the bridge:
  - **HTTP mode** (default): REST API polling via `/topology.json` and `/api/ota/*` endpoints.
  - **WebSocket mode**: Persistent WebSocket connection using the Bridge API v1 protocol at `/espnow-tree/v1/ws`, with HMAC-SHA256 challenge-response authentication.
- OTA is only available in HTTP mode. In WebSocket mode, OTA endpoints return 501.
- Configured via `bridge_transport` setting (`http` or `ws`).

## Bridge Transport Modes

### HTTP Mode (default)
- Uses `BridgeClient` / `BridgeManager` in `app/bridge_client.py`
- Polls `/topology.json` for device state
- Drives OTA via `/api/ota/start`, `/api/ota/status`, `/api/ota/chunk`, `/api/ota/abort`
- Config: `bridge_host` and `bridge_port` settings

### WebSocket Mode
- Uses `BridgeWsClient` / `BridgeWsManager` in `app/bridge_ws_client.py`
- Connects to `ws://<bridge_host>:<bridge_port>/espnow-tree/v1/ws`
- HMAC-SHA256 challenge-response auth using `bridge_api_key`
- Receives live events: `bridge.heartbeat`, `topology.changed`, `remote.availability`, `remote.state`, `remote.schema_changed`
- Maintains in-memory topology cache updated by events and periodic `topology.get`
- Auto-reconnect with exponential backoff (1s, 2s, 5s, 10s)
- Config: `bridge_transport: "ws"` and `bridge_api_key` settings

## Version Bump Convention

Before finishing any code change, increment the add-on version:
- **File:** `esphome-espnow-tree-ha/config.yaml` — `version` field (0.1.X format)
- **File:** `esphome-espnow-tree-ha/app/server.py` — FastAPI `version=` kwarg
- **Rule:** Always increment `X` by 1 (no upper limit). Never reset to 0. Never skip a number.