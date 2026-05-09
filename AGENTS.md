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