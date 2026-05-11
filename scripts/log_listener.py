#!/usr/bin/env python3
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

LOG_FILE = Path(__file__).parent.parent / "cache" / "logs" / "esp_tree_debug.jsonl"
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

LOG_SERVER_URL = "http://10.1.1.23:9999"
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 9999


def _load_entries() -> list[dict]:
    if not LOG_FILE.exists():
        return []
    entries = []
    with LOG_FILE.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return entries


def _clear_log() -> None:
    try:
        LOG_FILE.unlink(missing_ok=True)
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOG_FILE.touch()
    except OSError:
        pass


class LogHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        if self.path != "/log":
            self.send_error(404)
            return
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            entry = json.loads(body)
            if not isinstance(entry, dict):
                self.send_error(400, "expected JSON object")
                return
            if "timestamp" not in entry:
                entry["timestamp"] = datetime.now(timezone.utc).isoformat()
            line = json.dumps(entry, ensure_ascii=False) + "\n"
            with LOG_FILE.open("a", encoding="utf-8") as fh:
                fh.write(line)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        except json.JSONDecodeError as exc:
            self.send_error(400, str(exc))
        except Exception:
            self.send_response(500)

    def do_GET(self):
        if self.path == "/logs/clear":
            _clear_log()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true,"cleared":true}')
            return
        if self.path == "/logs":
            entries = _load_entries()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(entries, ensure_ascii=False).encode("utf-8"))
            return
        self.send_error(404)


def _check_clear_old_log() -> None:
    try:
        if LOG_FILE.exists():
            age_hours = (datetime.now(timezone.utc) - datetime.fromtimestamp(LOG_FILE.stat().st_mtime, tz=timezone.utc)).total_seconds() / 3600
            if age_hours > 24:
                _clear_log()
        else:
            LOG_FILE.touch()
    except Exception:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOG_FILE.touch()


def run() -> None:
    _check_clear_old_log()
    server = HTTPServer((SERVER_HOST, SERVER_PORT), LogHandler)
    print(f"Log listener running on {SERVER_HOST}:{SERVER_PORT}")
    print(f"POST logs to   http://{SERVER_HOST}:{SERVER_PORT}/log")
    print(f"GET  logs at  http://{SERVER_HOST}:{SERVER_PORT}/logs")
    print(f"Clear logs:   http://{SERVER_HOST}:{SERVER_PORT}/logs/clear")
    server.serve_forever()


if __name__ == "__main__":
    run()
