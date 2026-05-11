# Remote Log Streaming - Debug Feature

**Date:** 2026-05-10
**Status:** Approved

## Overview

A lightweight remote logging system for debugging the ESP Tree HA addon and integration. JSON logs are POSTed over the network to a Python HTTP server running on `10.1.1.23:9999`, persisted to a rolling JSONL file, and queryable via HTTP GET.

**Scope:** Temporary debug feature. Designed for easy removal.

---

## Architecture

```
┌─────────────────────┐         HTTP POST          ┌──────────────────────────┐
│  Addon (app/)       │ ──────────────────────────▶ │  Log Listener            │
│  remote_logger_dev  │  JSON log entry              │  10.1.1.23:9999         │
└─────────────────────┘                             │  log_listener.py         │
┌─────────────────────┐                              │                          │
│  Integration (ha_  │ ──────────────────────────▶  │  logs/esp_tree_debug.jsonl│
│  integration/)      │                             └──────────────────────────┘
│  remote_logger_dev │                                      │
└─────────────────────┘                                      │ HTTP GET /logs
                                                             ▼
                                                     [LLM reads JSON array]
```

---

## Components

### 1. Log Listener (`log_listener.py`)

**Location:** Root of project ( )

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/log` | Accept JSON log entry, append to file |
| GET | `/logs` | Return all log entries as JSON array |
| GET | `/logs/clear` | Clear the log file |

**Request format (POST /log):**
```json
{
  "timestamp": "2026-05-10T14:23:45.123Z",
  "level": "INFO",
  "source": "addon",
  "component": "bridge_ws_client",
  "message": "Connected to bridge",
  "data": {}
}
```

**Persistence:** `logs/esp_tree_debug.jsonl` (one JSON object per line)

**Behavior:**
- On startup: if log file exists and is older than 24 hours, clear it
- On each write: append newline-terminated JSON object
- Fail silently on errors (disk full, etc.)
- Auto-create `logs/` directory if missing

**Run command:**
```bash
python log_listener.py
```

### 2. Addon Remote Logger (`app/remote_logger_dev_only.py`)

**Location:** `app/remote_logger_dev_only.py`

**Responsibility:** Intercept addon log calls and forward as JSON via HTTP POST.

**Interface:**
```python
def setup_remote_logger(url: str) -> logging.Handler
def get_remote_logger() -> logging.Logger
```

**Implementation:**
- `RemoteLoggerDevOnly` class extends `logging.Handler`
- On `emit()`: serialize record to JSON, HTTP POST to log server (async/fire-and-forget)
- Fail silently if POST fails
- Returns a `logging.Logger` that propagates to root logger

**Integration:** Called from `server.py` startup — adds handler to all addon loggers.

### 3. Integration Remote Logger (`ha_integration/custom_components/esp_tree/remote_logger_dev_only.py`)

**Location:** `ha_integration/custom_components/esp_tree/remote_logger_dev_only.py`

**Responsibility:** Same pattern as addon logger but for HA integration loggers.

**Interface:**
```python
def setup_remote_logger(url: str) -> logging.Handler
def get_remote_logger() -> logging.Logger
```

**Integration:** Called from `__init__.py` at module load time.

---

## Log Entry Schema

```json
{
  "timestamp": "ISO 8601 with timezone",
  "level": "DEBUG|INFO|WARNING|ERROR",
  "source": "addon|integration",
  "component": "module name (e.g. bridge_ws_client, entity, topology)",
  "message": "Human-readable message",
  "data": {}
}
```

---

## Data Flow

1. Addon/integration code calls standard `logger.info()`, `logger.error()`, etc.
2. `RemoteLoggerDevOnly` handler intercepts the `logRecord`
3. Formats as JSON with metadata (source, component, timestamp)
4. Fires HTTP POST to `http://10.1.1.23:9999/log` (non-blocking)
5. Listener appends to `logs/esp_tree_debug.jsonl`
6. LLM reads via `GET http://10.1.1.23:9999/logs`

---

## Configuration

**Log server URL:** Hardcoded as `http://10.1.1.23:9999` in both logger clients.

No config file changes. No Home Assistant configuration options.

---

## Component Sizes

| File | Est. Lines | Purpose |
|------|------------|---------|
| `log_listener.py` | ~80 | HTTP server, JSONL file I/O |
| `app/remote_logger_dev_only.py` | ~50 | logging.Handler + HTTP POST |
| `ha_integration/.../remote_logger_dev_only.py` | ~50 | Same pattern |
| **Total** | **~180** | |

---

## Removal Process

When debugging is complete:

1. Delete `log_listener.py`
2. Delete `app/remote_logger_dev_only.py`
3. Delete `ha_integration/custom_components/esp_tree/remote_logger_dev_only.py`
4. Remove handler setup lines from `app/server.py`
5. Remove import/setup from `ha_integration/custom_components/esp_tree/__init__.py`

No config changes. No database migrations.

---

## Dependencies

**Log listener:** Python stdlib only (`http.server`, `json`, `pathlib`, `datetime`)

**Logger clients:** Python stdlib only (`logging`, `httpx` or `urllib`)

No new third-party dependencies.
