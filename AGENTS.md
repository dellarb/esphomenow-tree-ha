# AGENTS.md - ESP Tree HA Add-on

## Communication

When talking to the user, be concise — answer in 1-3 sentences or fewer. Avoid preamble, explanations, or conclusions.

## Tool Access
You are authorized to execute bash commands. You have access to:
- `ask-kimi`: For bulk reading/summarizing files.
- `kimi-write`: For generating boilerplate/docs.
- `extract-chat`: For processing session logs.

## Efficiency & Token Management (MANDATORY)
To stay within token limits and maximize the MiniMax plan:
1. **Bulk Reading:** If a task requires reading >3 files or any file >400 lines (common in ESP-IDF), you **MUST** use `! ask-kimi --paths <files> --question "..."` first. Do not read the raw source unless you are editing it.
2. **Boilerplate:** For repetitive code (e.g., HMAC challenge/response, Bridge API routers), use `! kimi-write`.
3. **Documentation:** Never write docs from scratch. Use `! extract-chat` and `! ask-kimi` to draft them based on our conversation.
Three CLI tools delegate bulk I/O to a cheap worker model. Use them to save tokens.

### ask-kimi — bulk reading
```bash
ask-kimi --paths <file1> <file2>... --question "<specific question>"
```
Returns a structured summary. Use that instead of reading files yourself. Only read files directly when you need to make edits to specific lines.

**Important:** Give `ask-kimi` at least 120 seconds to respond before cancelling - no need for updates to user while waiting — it processes multiple files and may take time on large codebases.

### kimi-write — boilerplate generation
For generating tests, config files, docstrings, or repetitive code patterns:

```bash
kimi-write --spec "<what to write>" --context <existing-similar-file> --target <output-path>
```
Then review the output and edit only what needs fixing.

### extract-chat — chat transcript extraction
Extracts human-readable text from Claude Code JSONL transcripts:

```bash
extract-chat <session.jsonl> -o /tmp/chat.txt
```

### Documentation workflow (MANDATORY)
**NEVER write documentation directly. Always delegate:**

1. Extract chat: `extract-chat <latest-session.jsonl> -o /tmp/chat.txt`
2. Ask worker to read chat + existing docs and suggest updates:
   `ask-kimi --paths /tmp/chat.txt <doc-files> --question "read chat, give exact changes for docs"`
3. Apply the worker's changes via Edit tool

### When NOT to delegate
- Tasks under ~2000 tokens of work (delegation overhead isn't worth it)
- Architectural decisions, debugging, safety-critical code
- Anything requiring careful reasoning
- When exact line numbers are needed for editing


## Project Relationship

This project is a Home Assistant add-on that works in tandem with the ESP32 ESP-NOW LR firmware in `/home/ben/ai-hermes-agent/ESPLR_V2`.
*******IMPORTANT: under no circumstances edit the code for devices in 'esp-tree-ha/components' - this is a local cache overwritten when we commit the repo. If device code changes are needed they can be viewed and made here: /home/ben/ai-hermes-agent/ESPLR_V2/components

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

### WebSocket Mode (Legacy)
- Uses `BridgeWsClient` / `BridgeWsManager` in `app/bridge_ws_client.py`
- Connects to `ws://<bridge_host>:<bridge_port>/espnow-tree/v1/ws`
- HMAC-SHA256 challenge-response auth using `bridge_api_key`
- Receives live events: `bridge.heartbeat`, `topology.changed`, `remote.availability`, `remote.state`, `remote.schema_changed`
- Maintains in-memory topology cache updated by events and periodic `topology.get`
- Auto-reconnect with exponential backoff (1s, 2s, 5s, 10s)
- Config: `bridge_transport: "ws"` and `bridge_api_key` settings
- Retained for backward compatibility only

## Version Bumps

Do NOT manually bump version numbers. Version bumps are handled automatically by `qc.sh` during the quality control process.

## Remote Debug Logging

A lightweight remote logging system captures JSON logs from both the addon and integration for debugging.

**Log server:** `log_listener.py` at `10.1.1.23:9999` (runs in a screen session, started by `qc.sh`)

**Log file:** `logs/esp_tree_debug.jsonl` (one JSON object per line, cleared if older than 24h)

### Reading Logs

```bash
# Via the log server API
curl http://10.1.1.23:9999/logs

# Or read the file directly
rtk read logs/esp_tree_debug.jsonl
```

### Log Entry Schema

```json
{
  "timestamp": "2026-05-10T14:23:45.123Z",
  "level": "INFO",
  "source": "addon" | "integration",
  "component": "bridge_ws_client | topology | entity | ...",
  "message": "Human readable message",
  "data": {}
}
```

### Logger Integration Points

Both addon and integration use `remote_logger_dev_only.py` which attaches a handler to the **root logger**, so all `logger.info/error/debug/warning` calls from any module are forwarded.

**Addon** — `esp-tree-ha/app/server.py`:
- Import: `from .remote_logger_dev_only import get_remote_logger` (line ~49)
- Setup call: `get_remote_logger()` (line ~908, in startup block)

**Integration** — `esp-tree-ha/ha_integration/custom_components/esp_tree/__init__.py`:
- Import: `from .remote_logger_dev_only import get_remote_logger as _setup_remote_logger` (line ~16)
- Setup call: `_setup_remote_logger()` (line ~22, at module load time)

### Using Logs to Investigate HA Side Issues

When investigating issues on the Home Assistant side (integration not loading, entities missing, events not flowing):

1. **Check the log server is running:**
   ```bash
   screen -ls esp_tree_log
   ```

2. **Start it if not running:**
   ```bash
   screen -dmS esp_tree_log python3 log_listener.py
   ```

3. **Fetch logs:**
   ```bash
   curl http://10.1.1.23:9999/logs
   ```

4. **Filter by source or component** using jq:
   ```bash
   curl -s http://10.1.1.23:9999/logs | jq '.[] | select(.source=="integration")'
   curl -s http://10.1.1.23:9999/logs | jq '.[] | select(.component=="entity")'
   curl -s http://10.1.1.23:9999/logs | jq '.[] | select(.level=="ERROR")'
   ```

5. **Clear logs for a clean test:**
   ```bash
   curl -X POST http://10.1.1.23:9999/logs/clear
   ```

### Temporary Nature

`remote_logger_dev_only.py` in both `app/` and `ha_integration/` is intentionally named to signal it is for temporary debug use only. When debugging is complete, remove the files and their integration points:

- Delete `log_listener.py`
- Delete `esp-tree-ha/app/remote_logger_dev_only.py`
- Delete `esp-tree-ha/ha_integration/custom_components/esp_tree/remote_logger_dev_only.py`
- Remove from `esp-tree-ha/app/server.py`:
  - Line ~49: `from .remote_logger_dev_only import get_remote_logger`
  - Line ~908: `get_remote_logger()`
- Remove from `esp-tree-ha/ha_integration/custom_components/esp_tree/__init__.py`:
  - Line ~16: `from .remote_logger_dev_only import get_remote_logger as _setup_remote_logger`
  - Line ~22: `_setup_remote_logger()`