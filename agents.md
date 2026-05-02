# AGENTS.md - ESPHome ESPNow Tree HA Add-on

## Project Relationship

This project is a Home Assistant add-on that works in tandem with the ESP32 ESP-NOW LR firmware in `/home/ben/ai-hermes-agent/ESPLR_V2`.

## Bridge and Remote Behavior

To understand bridge and remote behavior, protocol details, and ESP-NOW LR implementation, reference the AGENTS.md in `/home/ben/ai-hermes-agent/ESPLR_V2/`.

Key areas where ESPLR_V2 context is helpful:
- Radio protocol (only if needed): `ESPLR_V2/docs/espnow_v3_spec.md`
- Bridge and remote component behavior (`components/espnow_lr_bridge`, `components/espnow_lr_remote`)
- Protocol source of truth (`espnow_types.h`)
- Bridge API endpoints and OTA protocol
- Build and flashing workflow via `./compile.sh`

## This Project

- ESPHome ESPNow Tree is a Home Assistant add-on for viewing ESP-NOW LR bridge topology and flashing remote firmware through the bridge.
- It communicates with the bridge via REST API (`/topology.json`, `/api/ota/*` endpoints).
- Source of truth for add-on behavior: `esphome-espnow-tree-ha/DOCS.md`, `ha-addon-plan.md`, and this file.

## Version Bump Convention

Before finishing any code change, increment the add-on version:
- **File:** `esphome-espnow-tree-ha/config.yaml` — `version` field (0.1.X format)
- **File:** `esphome-espnow-tree-ha/app/server.py` — FastAPI `version=` kwarg
- **Rule:** Always increment `X` by 1 (no upper limit). Never reset to 0. Never skip a number.
