#!/usr/bin/env python3
"""
ESP-NOW LR Multi-Device Log Collector
Master thread: spawns per-device log threads, health-checks hosts,
writes parsed logs to SQLite (WAL mode) for live concurrent reads.

Usage:
    ./esplog-master.py [--ping-interval N] [--log-timeout N] [--db DB_PATH]
    ./esplog-master.py --status    # just print current DB contents
    ./esplog-master.py --kill      # kill all Docker log processes
    ./esplog-master.py --reset     # reset database and exit
"""

import argparse
import csv
import datetime
import http.server
import json
import os
import queue
import re
import signal
import socket
import socketserver
import sqlite3
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------
PROJ_DIR = Path(__file__).parent.parent.resolve()
DEMOS_DIR = PROJ_DIR / "device_code" / "demos"
CACHE_DIR = PROJ_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)
DOCKER_IMG = "ghcr.io/esphome/esphome:latest"
DEFAULT_DB = CACHE_DIR / "esplog.db"

# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    id              TEXT PRIMARY KEY,
    yaml_file       TEXT,
    yaml_basename   TEXT,
    hostname        TEXT,
    status          TEXT DEFAULT 'unknown',
    last_seen       TEXT,
    thread_id       TEXT
);

CREATE TABLE IF NOT EXISTS logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT,
    device_id       TEXT NOT NULL,
    device_timestamp TEXT,
    level           TEXT,
    tag             TEXT,
    message         TEXT,
    raw_line        TEXT,
    received_at     TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_logs_device_id ON logs(device_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp  ON logs(timestamp);
"""

LOG_PATTERN = re.compile(r'^\[(\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\]\[([A-Z]+)\]\[(.+?)\]:(.*)')

# ---------------------------------------------------------------------------
# Shared state (protected by _state_lock)
# ---------------------------------------------------------------------------
_state_lock = threading.Lock()
_device_threads: dict[str, threading.Thread] = {}   # device_id → thread
_device_procs:   dict[str, subprocess.Popen] = {}     # device_id → Popen
_host_status:   dict[str, str] = {}                # hostname → up/down/unknown
_host_failures: dict[str, int] = {}               # hostname → consecutive failure count
_host_cooldown: dict[str, float] = {}              # hostname → time() when cooldown ends
_HEALTH_COOLDOWN = 120  # seconds before re-pinging a failing host
_HEALTH_RETRIES = 3     # consecutive failures before entering cooldown

# Log write queue — single writer thread drains this
_log_queue: queue.Queue = queue.Queue()

# Shutdown flag
_shutdown = threading.Event()

# Ring buffer — per device, last ~10 min (maxlen ~500 entries at typical rate)
# Each entry is a dict with a synthetic 'id' (monotonically increasing seq)
RING_MAX = 500
_device_buffers: dict[str, deque] = {}
_buffer_lock = threading.Lock()

# Monotonically increasing sequence for buffer entries (avoids SQLite id confusion)
_buf_seq: int = 0
_seq_lock = threading.Lock()

# Track last SQLite id per device (updated by writer thread after each batch)
_buf_db_id: dict[str, int] = {}
_db_id_lock = threading.Lock()
_device_registry: dict[str, tuple[str, Path]] = {}
_registry_lock = threading.Lock()
_last_device_scan: float = 0
_DEVICE_RESCAN_INTERVAL = 60  # seconds


def buffer_get(device_id: str, since_buf_id: int = 0) -> list[dict]:
    """Return buffer entries for device with id > since_buf_id (0 means all)."""
    with _buffer_lock:
        buf = _device_buffers.get(device_id, deque())
        if since_buf_id == 0:
            return list(buf)
        return [row for row in buf if row.get("id", 0) > since_buf_id]


def buffer_get_all(device_id: str) -> list[dict]:
    """Return all buffer entries for device."""
    with _buffer_lock:
        buf = _device_buffers.get(device_id, deque())
        return list(buf)


def buffer_latest_id(device_id: str) -> int:
    """Return the latest buffer id for this device."""
    with _db_id_lock:
        return _buf_db_id.get(device_id, 0)


def buffer_latest_db_id(device_id: str) -> int:
    """Return the latest persisted SQLite id present in the ring buffer."""
    with _buffer_lock:
        buf = _device_buffers.get(device_id, deque())
        latest = 0
        for row in buf:
            db_id = row.get("db_id", 0)
            if isinstance(db_id, int) and db_id > latest:
                latest = db_id
        return latest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def yaml_name(yml_path: Path) -> Optional[str]:
    """Extract esphome.name from a YAML file."""
    try:
        with open(yml_path, "r") as f:
            in_esphome = False
            for line in f:
                line = line.rstrip()
                if not line or line.startswith("#"):
                    continue
                if line.strip() == "esphome:":
                    in_esphome = True
                    continue
                if in_esphome and line.startswith("  name:"):
                    name = line.split("name:", 1)[1].strip().strip('"').strip("'")
                    return name
                if in_esphome and line.startswith("  ") and not line.startswith("    "):
                    # left esphome block without finding name
                    break
    except Exception:
        pass
    return None


def init_db(db: Path) -> sqlite3.Connection:
    """Open SQLite DB with WAL mode and apply schema."""
    conn = sqlite3.connect(str(db), isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(SCHEMA)
    return conn


def log_row_to_dict(row: tuple) -> dict:
    """Convert a log row tuple to a dict (for API responses)."""
    return {
        "timestamp": row[0],
        "device_id": row[1],
        "device_timestamp": row[2],
        "level": row[3],
        "tag": row[4],
        "message": row[5],
        "raw_line": row[6],
        "received_at": row[7],
    }


def _next_buf_seq() -> int:
    global _buf_seq
    with _seq_lock:
        _buf_seq += 1
        return _buf_seq


def enqueue_log(device_id: str, raw_line: str, received_at: str):
    ts = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    m = LOG_PATTERN.match(raw_line) if raw_line else None
    if m:
        dev_ts, level, tag, message = m.group(1), m.group(2), m.group(3), m.group(4).strip()
    else:
        dev_ts, level, tag, message = "", "?", "?", raw_line

    buf_id = _next_buf_seq()
    row = {
        "id": buf_id,
        "timestamp": ts,
        "device_id": device_id,
        "device_timestamp": dev_ts,
        "level": level,
        "tag": tag,
        "message": message,
        "raw_line": raw_line,
        "received_at": received_at,
        "db_id": 0,
    }

    _log_queue.put(row)
    with _buffer_lock:
        if device_id not in _device_buffers:
            _device_buffers[device_id] = deque(maxlen=RING_MAX)
        _device_buffers[device_id].append(row)
    with _db_id_lock:
        _buf_db_id[device_id] = buf_id


def log_writer_thread(db: Path):
    """Drains _log_queue and writes batches to SQLite."""
    conn = init_db(db)
    buf = []

    def flush_batch(batch: list[dict]):
        if not batch:
            return
        rows_for_db = []
        for row in batch:
            rows_for_db.append((
                row["timestamp"], row["device_id"], row["device_timestamp"],
                row["level"], row["tag"], row["message"], row["raw_line"], row["received_at"]
            ))
        cur = conn.executemany(
            "INSERT INTO logs (timestamp,device_id,device_timestamp,level,tag,message,raw_line,received_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            rows_for_db
        )
        conn.commit()
        last_row_id = cur.lastrowid if cur.lastrowid is not None else conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        first_row_id = last_row_id - len(batch) + 1 if last_row_id is not None else None
        if first_row_id is None:
            return
        with _buffer_lock, _db_id_lock:
            for offset, row in enumerate(batch):
                db_id = first_row_id + offset
                row["db_id"] = db_id
                _buf_db_id[row["device_id"]] = db_id

    while True:
        try:
            item = _log_queue.get(timeout=0.5)
            if item is None:
                break
            buf.append(item)
        except queue.Empty:
            pass

        if buf and (_shutdown.is_set() or len(buf) >= 20):
            try:
                flush_batch(buf)
            except Exception as e:
                print(f"[writer] DB error: {e}", file=sys.stderr)
            buf.clear()

    if buf:
        try:
            flush_batch(buf)
        except Exception as e:
            print(f"[writer] final flush error: {e}", file=sys.stderr)
    conn.close()


def kill_proc_group(proc: subprocess.Popen):
    """Kill a subprocess and its entire process group."""
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, OSError):
        try:
            proc.kill()
        except OSError:
            pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


# ---------------------------------------------------------------------------
# DB prune thread — purge logs older than retention period
# ---------------------------------------------------------------------------

def prune_thread(db: Path, retention_days: int = 7, interval_hours: int = 1):
    """Periodically delete old log rows to keep DB size bounded."""
    while not _shutdown.is_set():
        time.sleep(interval_hours * 3600)
        if _shutdown.is_set():
            break
        try:
            conn = init_db(db)
            cutoff = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=retention_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
            cur = conn.execute(
                "SELECT COUNT(*) FROM logs WHERE received_at < ?",
                (cutoff,)
            )
            count = cur.fetchone()[0]
            if count > 0:
                conn.execute("DELETE FROM logs WHERE received_at < ?", (cutoff,))
                conn.commit()
                print(f"[prune] deleted {count} rows older than {cutoff}", file=sys.stderr)
            conn.close()
        except Exception as e:
            print(f"[prune] error: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Health checker
# ---------------------------------------------------------------------------

def _sync_host_status_to_db(db: Path, hostname: str, status: str):
    """Sync current host status to SQLite (called on every health check)."""
    ts = datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    try:
        conn = init_db(db)
        conn.execute(
            "UPDATE devices SET status=?, last_seen=? WHERE hostname=?",
            (status, ts, hostname)
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def health_checker(ping_interval: int, get_hostnames, on_status_change, db: Path):
    """
    Polls all hostnames every `ping_interval` seconds.
    on_status_change(hostname, new_status) is called on each state change.
    Uses a circuit breaker: after HEALTH_RETRIES consecutive failures,
    skips pinging for HEALTH_COOLDOWN seconds to avoid thrashing.
    Syncs status to SQLite on every health check (not just transitions).
    """
    while not _shutdown.is_set():
        for device_id, hostname in get_hostnames():
            now = time.time()
            cooldown_until = _host_cooldown.get(hostname, 0)
            if now < cooldown_until:
                continue

            was = _host_status.get(hostname, "unknown")
            result = _ping_host(hostname)
            if result:
                _host_failures[hostname] = 0
                _host_status[hostname] = "up"
                if was != "up":
                    on_status_change(hostname, "up")
                _sync_host_status_to_db(db, hostname, "up")
            else:
                failures = _host_failures.get(hostname, 0) + 1
                _host_failures[hostname] = failures
                if failures >= _HEALTH_RETRIES:
                    _host_cooldown[hostname] = now + _HEALTH_COOLDOWN
                    _host_status[hostname] = "down"
                    if was != "down":
                        on_status_change(hostname, "down")
                    _sync_host_status_to_db(db, hostname, "down")
                else:
                    _host_status[hostname] = "down"
                    _sync_host_status_to_db(db, hostname, "down")
        time.sleep(ping_interval)


def _ping_host(hostname: str, timeout: int = 2) -> bool:
    """Check if hostname resolves and responds to ping or TCP probe."""
    addresses = []
    try:
        old_timeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(timeout)
        try:
            ip = socket.gethostbyname(hostname)
            addresses.append(ip)
        except socket.gaierror:
            pass
        if not addresses:
            try:
                ip = socket.gethostbyname(f"{hostname}.local")
                addresses.append(ip)
            except socket.gaierror:
                pass
        socket.setdefaulttimeout(old_timeout)
    except Exception:
        pass

    if not addresses:
        return False

    for ip in addresses:
        try:
            result = subprocess.run(
                ["ping", "-c", "1", "-W", str(timeout), ip],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if result.returncode == 0:
                return True
        except FileNotFoundError:
            pass

        if _tcp_probe(ip, 6053, timeout):
            return True

    return False


def _tcp_probe(ip: str, port: int, timeout: int) -> bool:
    """Probe TCP port as fallback."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        sock.close()
        return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Per-device log thread
# ---------------------------------------------------------------------------

def device_log_thread(device_id: str, hostname: str, yaml_path: Path):
    """
    Owns one Docker subprocess. Parses stdout and enqueues log rows.
    Returns when the subprocess exits or is killed.
    """
    container_name = f"esplog-{device_id}"
    rel_yml = f"device_code/demos/{yaml_path.name}"
    proc: Optional[subprocess.Popen] = None
    try:
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)
        proc = subprocess.Popen(
            [
                "docker", "run", "--rm",
                "--name", container_name,
                "-v", f"{DEMOS_DIR}:/config",
                "-v", f"{PROJ_DIR}:/external",
                "-w", "/external",
                "--env-file", "/dev/null",
                "--network", "host",
                DOCKER_IMG,
                "logs", "--device", "OTA", rel_yml,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,
        )
        with _state_lock:
            _device_procs[device_id] = proc

        for line in proc.stdout:
            if _shutdown.is_set():
                break
            if line:
                received_at = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
                enqueue_log(device_id, line.rstrip("\n"), received_at)

    except Exception as e:
        print(f"[{device_id}] thread error: {e}", file=sys.stderr)
    finally:
        if proc:
            try:
                kill_proc_group(proc)
            except Exception:
                pass
            with _state_lock:
                _device_procs.pop(device_id, None)
        # Mark device offline
        _update_device_status(device_id, "down")


def _update_device_status(device_id: str, status: str):
    ts = datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    try:
        db = get_db_path()
        conn = init_db(db)
        conn.execute(
            "UPDATE devices SET status=?, last_seen=? WHERE id=?",
            (status, ts, device_id)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[{device_id}] status update error: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Device management
# ---------------------------------------------------------------------------

def preload_buffer(db: Path, minutes: int = 10):
    """Load recent logs from DB into ring buffers on startup."""
    cutoff = datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=minutes)
    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        conn = init_db(db)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM logs WHERE received_at >= ? ORDER BY id",
            (cutoff_str,)
        ).fetchall()
        conn.close()
        count = 0
        with _buffer_lock:
            for row in rows:
                did = row["device_id"]
                if did not in _device_buffers:
                    _device_buffers[did] = deque(maxlen=RING_MAX)
                buf_id = _next_buf_seq()
                _device_buffers[did].append({
                    "id": buf_id,
                    "timestamp": row["timestamp"],
                    "device_id": row["device_id"],
                    "device_timestamp": row["device_timestamp"],
                    "level": row["level"],
                    "tag": row["tag"],
                    "message": row["message"],
                    "raw_line": row["raw_line"],
                    "received_at": row["received_at"],
                    "db_id": row["id"],
                })
                count += 1
        print(f"[buffer] preloaded {count} recent log rows into ring buffers", file=sys.stderr)
    except Exception as e:
        print(f"[buffer] preload error: {e}", file=sys.stderr)


def load_devices(db: Path) -> list[tuple[str, Path]]:
    """Scan demos dir, populate devices table, return list of (device_id, yaml_path).
    Uses UPSERT so existing device status/last_seen are preserved."""
    conn = init_db(db)
    discovered = []
    for yml_path in sorted(DEMOS_DIR.glob("*.yml")):
        if yml_path.name.startswith("secrets"):
            continue
        device_id = yaml_name(yml_path)
        if not device_id:
            print(f"[warn] Could not extract esphome.name from {yml_path.name}, using basename", file=sys.stderr)
            device_id = yml_path.stem
        hostname = device_id  # mDNS name

        conn.execute(
            """INSERT INTO devices (id, yaml_file, yaml_basename, hostname, status, last_seen)
               VALUES (?, ?, ?, ?,
                       COALESCE((SELECT status FROM devices WHERE id=?), 'unknown'),
                       COALESCE((SELECT last_seen FROM devices WHERE id=?), ?))
               ON CONFLICT(id) DO UPDATE SET
                   yaml_file=excluded.yaml_file,
                   yaml_basename=excluded.yaml_basename,
                   hostname=excluded.hostname""",
            (device_id, yml_path.name, yml_path.stem, hostname,
             device_id, device_id,
             datetime.datetime.now(datetime.UTC).isoformat() + "Z")
        )
        discovered.append((device_id, hostname, yml_path))

    conn.commit()
    conn.close()
    with _state_lock:
        _device_registry.clear()
        for device_id, hostname, yml_path in discovered:
            _device_registry[device_id] = (hostname, yml_path)
    return discovered


def rescan_devices_if_needed(db: Path):
    """Rescan demos dir if _DEVICE_RESCAN_INTERVAL seconds have passed."""
    global _last_device_scan
    now = time.time()
    if now - _last_device_scan < _DEVICE_RESCAN_INTERVAL:
        return
    _last_device_scan = now
    print("[supervisor] rescanning demos directory...", file=sys.stderr)
    with _registry_lock:
        devices = load_devices(db)
        _device_registry.clear()
        for device_id, hostname, yml_path in devices:
            _device_registry[device_id] = (hostname, yml_path)


def spawn_device_thread(device_id: str, hostname: str, yaml_path: Path):
    with _state_lock:
        existing = _device_threads.get(device_id)
        if existing is not None and existing.is_alive():
            return
    t = threading.Thread(
        target=device_log_thread,
        args=(device_id, hostname, yaml_path),
        name=device_id,
        daemon=True,
    )
    with _state_lock:
        _device_threads[device_id] = t
    t.start()


def kill_device_thread(device_id: str):
    with _state_lock:
        proc = _device_procs.pop(device_id, None)
        thread = _device_threads.pop(device_id, None)
    if proc:
        try:
            kill_proc_group(proc)
        except Exception:
            pass
    # Thread will exit on next iteration since proc is removed from dict


def supervisor_thread(db: Path, poll_interval: int = 5):
    """Keep log threads aligned with current host reachability."""
    while not _shutdown.is_set():
        rescan_devices_if_needed(db)
        with _state_lock:
            registry = dict(_device_registry)
            host_status = dict(_host_status)
            live_threads = {device_id: thread.is_alive() for device_id, thread in _device_threads.items()}
            live_procs = {device_id: proc.poll() is None for device_id, proc in _device_procs.items()}

        for device_id, (hostname, yaml_path) in registry.items():
            status = host_status.get(hostname, "unknown")
            thread_alive = live_threads.get(device_id, False)
            proc_alive = live_procs.get(device_id, False)
            if status == "up":
                if not thread_alive or not proc_alive:
                    if thread_alive or proc_alive:
                        kill_device_thread(device_id)
                    print(f"[supervisor] restarting logger for {device_id}", file=sys.stderr)
                    spawn_device_thread(device_id, hostname, yaml_path)
            elif status == "down" and (thread_alive or proc_alive):
                print(f"[supervisor] stopping logger for {device_id}", file=sys.stderr)
                kill_device_thread(device_id)

        _shutdown.wait(poll_interval)


# ---------------------------------------------------------------------------
# Status display
# ---------------------------------------------------------------------------

def get_db_path() -> Path:
    return DEFAULT_DB


def status_loop(db: Path, interval: int = 5):
    """Print device status table every `interval` seconds."""
    while not _shutdown.is_set():
        try:
            conn = init_db(db)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT d.id, d.hostname, d.status, d.last_seen,
                          l.level, l.tag, l.message
                     FROM devices d
                LEFT JOIN (
                        SELECT device_id, level, tag, message, MAX(id) as max_id
                        FROM logs GROUP BY device_id
                   ) l ON l.device_id = d.id
                 ORDER BY d.id"""
            ).fetchall()
            conn.close()

            print("\n" + "=" * 90)
            print(f"  ESP-NOW LR Log Collector  |  DB: {db}  |  {datetime.datetime.now(datetime.UTC).strftime('%H:%M:%S')} UTC")
            print("=" * 90)
            print(f"  {'Device':<28} {'Host':<22} {'Status':<8} {'Last Log'}")
            print("-" * 90)
            for row in rows:
                lvl = row["level"] or ""
                tag = row["tag"] or ""
                msg = (row["message"] or "")[:60]
                print(f"  {row['id']:<28} {row['hostname']:<22} {row['status']:<8} [{lvl}][{tag}] {msg}")
            print()

        except Exception as e:
            print(f"[status] error: {e}", file=sys.stderr)
        time.sleep(interval)


def print_db_contents(db: Path):
    """Print all logs from DB (--status mode)."""
    conn = init_db(db)
    conn.row_factory = sqlite3.Row
    print("\n=== DEVICES ===")
    for row in conn.execute("SELECT * FROM devices ORDER BY id"):
        print(dict(row))
    print("\n=== RECENT LOGS (last 50) ===")
    for row in conn.execute(
        "SELECT * FROM logs ORDER BY id DESC LIMIT 50"
    ):
        print(dict(row))
    conn.close()


def export_csv(db: Path, output_path: Optional[Path] = None):
    """Export all logs to CSV."""
    conn = init_db(db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT timestamp, device_id, device_timestamp, level, tag, message, raw_line, received_at "
        "FROM logs ORDER BY id"
    ).fetchall()
    conn.close()

    if output_path:
        outfile = open(output_path, "w", newline="")
    else:
        outfile = sys.stdout

    writer = csv.writer(outfile)
    writer.writerow(["timestamp_iso", "device_id", "device_timestamp", "level", "tag", "message", "raw_line", "received_at"])
    for row in rows:
        writer.writerow([row["timestamp"], row["device_id"], row["device_timestamp"],
                        row["level"], row["tag"], row["message"], row["raw_line"], row["received_at"]])

    if output_path:
        outfile.close()
        print(f"Exported {len(rows)} rows to {output_path}", file=sys.stderr)


def stream_logs(db: Path, interval: int = 1):
    """Stream logs live from SQLite, polling for new rows since last seen."""
    conn = init_db(db)
    conn.execute("SELECT COUNT(*) FROM logs")
    last_id = conn.execute("SELECT MAX(id) FROM logs").fetchone()[0] or 0
    conn.close()

    while not _shutdown.is_set():
        time.sleep(interval)
        conn = init_db(db)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM logs WHERE id > ? ORDER BY id",
            (last_id,)
        ).fetchall()
        conn.close()

        for row in rows:
            last_id = row["id"]
            print(f"[{row['device_id']}] [{row['level']}][{row['tag']}]: {row['message']}")


# ---------------------------------------------------------------------------
# HTTP SSE server
# ---------------------------------------------------------------------------

class SSEHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    db: Path = DEFAULT_DB
    timeout = 10

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/events":
            self._sse_stream()
        elif parsed.path == "/stream":
            self._stream_poll()
        elif parsed.path == "/since":
            self._since_logs()
        elif parsed.path == "/status":
            self._status_json()
        elif parsed.path == "/logs":
            self._recent_logs()
        elif parsed.path == "/export-csv":
            self._export_csv()
        elif parsed.path in ("/_ui", "/ui"):
            self._ui()
        elif parsed.path in ("/", "/index.html", ""):
            self._index()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

    def _index(self):
        body = """<!DOCTYPE html>
<html><head><title>ESP-NOW LR Log Collector</title></head>
<body>
<h1>ESP-NOW LR Log Collector</h1>
<ul>
<li><a href="/ui">/ui</a> &mdash; Split-screen log monitor dashboard</li>
<li><a href="/events">/events</a> &mdash; SSE live log stream (for LLMs, keeps connection open)</li>
<li><a href="/stream?since=0">/stream</a> &mdash; JSON polling stream (?since=N&amp;device_id=X)</li>
<li><a href="/since?since=2026-01-01T00:00:00Z">/since</a> &mdash; JSON logs since timestamp (?since=ISO&amp;device_id=X)</li>
<li><a href="/status">/status</a> &mdash; JSON device list</li>
<li><a href="/logs">/logs</a> &mdash; JSON recent logs (100 rows)</li>
<li><a href="/export-csv">/export-csv</a> &mdash; CSV download</li>
</ul>
</body></html>""".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _ui(self):
        body = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP-NOW LR Log Monitor</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; }
body { display: flex; flex-direction: column; overflow: hidden; }

#toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  flex-wrap: wrap;
  flex-shrink: 0;
  position: relative;
}

.add-btn {
  position: relative;
  background: #21262d;
  border: 1px solid #30363d;
  color: #c9d1d9;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.add-btn:hover { background: #30363d; }

.dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  min-width: 160px;
}
.dropdown.open { display: block; }

.dropdown-item {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dropdown-item:hover { background: #21262d; }
.dropdown-item .dot { width: 6px; height: 6px; border-radius: 50%; }
.dot.up { background: #3fb950; }
.dot.down { background: #484f58; }
.dot.error { background: #da3633; }

.dropdown-empty {
  padding: 8px 12px;
  color: #484f58;
  font-size: 11px;
  font-style: italic;
}

#controls { margin-left: auto; display: flex; gap: 8px; align-items: center; }
#controls .rate-group { display: flex; gap: 4px; }
#controls button {
  background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
  padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
}
#controls button:hover { background: #30363d; }
#controls button.active { background: #388bfd; border-color: #388bfd; color: #fff; }
#pauseBtn.paused { background: #da3633; border-color: #da3633; }

#grid {
  display: grid;
  gap: 4px;
  padding: 4px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.panel {
  display: flex;
  flex-direction: column;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  overflow: hidden;
}
.panel-header {
  background: #161b22;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #21262d;
  min-height: 30px;
}
.panel-header {
  background: #161b22;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #21262d;
  min-height: 30px;
}
.panel-header .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.panel-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; }
.badge-up { background: #1f3828; color: #3fb950; }
.badge-down { background: #1c1e24; color: #484f58; }

.close-btn {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: #484f58;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.close-btn:hover { background: #da3633; color: #fff; }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
  font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
  font-size: 11px;
  line-height: 1.5;
  scrollbar-width: thin;
  scrollbar-color: #30363d #0d1117;
}
.panel-body::-webkit-scrollbar { width: 6px; }
.panel-body::-webkit-scrollbar-track { background: #0d1117; }
.panel-body::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

.log-line { white-space: pre-wrap; word-break: break-word; padding: 1px 0; }
.log-line:hover { background: #161b22; }

.log-W, .log-WARN { color: #e3b341; }
.log-E, .log-ERROR { color: #f85149; }
.log-I, .log-INFO { color: #3fb950; }
.log-D, .log-DEBUG { color: #58a6ff; }
.log-C, .log-CRIT { color: #d2a8ff; }
.log-? { color: #6e7681; }

.resume-btn {
  display: none;
  position: sticky;
  bottom: 0;
  background: #21262d;
  border: 1px solid #30363d;
  color: #58a6ff;
  font-size: 10px;
  padding: 2px 8px;
  cursor: pointer;
  width: 100%;
  text-align: center;
}
.resume-btn:hover { background: #30363d; }
.resume-btn.visible { display: block; }

.panel-error { color: #f85149; padding: 8px; text-align: center; font-size: 11px; }
.panel-empty { color: #484f58; padding: 8px; text-align: center; font-size: 11px; font-style: italic; }

.no-devices {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #484f58;
  font-size: 14px;
}
</style>
</head>
<body>

<div id="toolbar">
  <button class="add-btn" id="addBtn">Add Device ▼</button>
  <div class="dropdown" id="deviceDropdown"></div>
  <span id="controls">
    <span class="rate-group">
      <button data-rate="1">1s</button>
      <button data-rate="2">2s</button>
      <button data-rate="5">5s</button>
    </span>
    <button id="pauseBtn">Pause</button>
  </span>
</div>
<div id="grid">
  <div class="no-devices">Select devices above to start monitoring</div>
</div>

<script>
const STATUS_URL = '/status';
const STREAM_URL = '/stream';

let devices = [];
let selectedDevices = new Set();
let lastIds = {};
let panels = {};
let refreshRate = 1;
let pauseAll = false;
let pollTimer = null;
const MAX_LINES = 500;
const PAUSE_MS = 5000;

function levelClass(lvl) {
  return 'log-' + (lvl || '?');
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function layoutGrid() {
  const grid = document.getElementById('grid');
  const n = selectedDevices.size;
  if (n === 0) {
    grid.innerHTML = '<div class="no-devices">Click "Add Device" to start monitoring</div>';
    return;
  }
  let cols;
  if (n === 1) cols = 1;
  else if (n === 2) cols = 2;
  else if (n <= 4) cols = 2;
  else if (n <= 6) cols = 3;
  else cols = 3;
  const rows = Math.ceil(n / cols);
  grid.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
  grid.style.gridTemplateRows    = 'repeat(' + rows + ',1fr)';
  grid.innerHTML = '';

  for (const id of selectedDevices) {
    if (!panels[id]) panels[id] = { lines: [], pausedUntil: 0 };
    const dev = devices.find(d => d.id === id) || { id, hostname: id, status: 'unknown' };
    const isUp = dev.status === 'up';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.dataset.device = id;
    panel.innerHTML =
      '<div class="panel-header">' +
        '<span class="dot ' + (isUp ? 'up' : 'down') + '"></span>' +
        '<span class="panel-name">' + esc(dev.hostname || id) + '</span>' +
        '<span class="panel-badge ' + (isUp ? 'badge-up' : 'badge-down') + '">' + esc(dev.status) + '</span>' +
        '<button class="close-btn" data-device="' + esc(id) + '">&#10005;</button>' +
      '</div>' +
      '<div class="panel-body" id="body-' + id + '"></div>' +
      '<div class="resume-btn" id="resume-' + id + '">&#8593; resume</div>';
    grid.appendChild(panel);

    const bodyEl = document.getElementById('body-' + id);
    bodyEl.addEventListener('scroll', () => {
      const atBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 30;
      if (!atBottom) {
        panels[id].pausedUntil = Date.now() + PAUSE_MS;
        document.getElementById('resume-' + id).classList.add('visible');
      }
    });
    document.getElementById('resume-' + id).addEventListener('click', () => {
      panels[id].pausedUntil = 0;
      document.getElementById('resume-' + id).classList.remove('visible');
      bodyEl.scrollTop = 0;
    });
    document.querySelector('.close-btn[data-device="' + id.replace(/"/g, '\\"') + '"]').addEventListener('click', () => closePanel(id));
  }
  renderAllPanels();
}

function renderAllPanels() {
  for (const id of selectedDevices) renderPanel(id);
}

function renderPanel(id) {
  const body = document.getElementById('body-' + id);
  if (!body) return;
  const panel = panels[id];
  if (!panel) return;

  const isPinned = panel.pausedUntil > Date.now();
  const wasAtBottom = !isPinned && (body.scrollHeight - body.scrollTop - body.clientHeight < 30);

  let html = '';
  for (const log of panel.lines) {
    const lvl = esc(log.level || '?');
    html += '<div class="log-line ' + levelClass(log.level) + '">[' +
      esc(log.device_timestamp || log.timestamp) + '][' + lvl + '][' +
      esc(log.tag) + ']: ' + esc(log.message) + '</div>';
  }
  body.innerHTML = html;

  const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 30;
  if (isPinned && atBottom) {
    panel.pausedUntil = 0;
  }

  if (panel.pausedUntil <= Date.now()) {
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
  }

  const resumeBtn = document.getElementById('resume-' + id);
  if (resumeBtn) {
    if (panel.pausedUntil > Date.now()) {
      resumeBtn.classList.add('visible');
    } else {
      resumeBtn.classList.remove('visible');
    }
  }
}

function saveState() {
  localStorage.setItem('esplog-open-devices', JSON.stringify([...selectedDevices]));
}

function loadState() {
  try {
    const saved = localStorage.getItem('esplog-open-devices');
    if (saved) {
      const arr = JSON.parse(saved);
      arr.forEach(id => selectedDevices.add(id));
    }
  } catch (e) {}
}

function closePanel(id) {
  selectedDevices.delete(id);
  delete panels[id];
  delete lastIds[id];
  saveState();
  document.getElementById('deviceDropdown').style.display = 'none';
  layoutGrid();
}

function toggleDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('deviceDropdown');
  dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  if (dd.style.display === 'block' && dd.children.length === 0) {
    for (const d of devices) {
      if (!selectedDevices.has(d.id)) {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = d.hostname || d.id;
        item.onclick = () => { selectedDevices.add(d.id); dd.style.display = 'none'; layoutGrid(); };
        dd.appendChild(item);
      }
    }
  }
}

function addDropdownEventListeners() {
  document.getElementById('addBtn').addEventListener('click', function(e) { toggleDropdown(e); });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown') && !e.target.closest('#addBtn')) {
      document.getElementById('deviceDropdown').style.display = 'none';
    }
  });
  document.getElementById('deviceDropdown').addEventListener('click', function(e) { e.stopPropagation(); });
}

async function loadDevices() {
  const resp = await fetch(STATUS_URL);
  devices = await resp.json();
  loadState();
  layoutGrid();
}

async function poll() {
  if (pauseAll || selectedDevices.size === 0) return;
  for (const id of selectedDevices) {
    if (Date.now() < (panels[id]?.pausedUntil || 0)) continue;
    const since = lastIds[id] || 0;
    try {
      const resp = await fetch(STREAM_URL + '?since=' + since + '&limit=100&device_id=' + encodeURIComponent(id));
      const data = await resp.json();
      if (!data.logs || data.logs.length === 0) continue;
      if (!panels[id]) panels[id] = { lines: [], pausedUntil: 0 };
      for (const log of data.logs) {
        if (!panels[id].lines.find(l => l.id === log.id)) {
          panels[id].lines.push(log);
        }
      }
      if (panels[id].lines.length > MAX_LINES) {
        panels[id].lines = panels[id].lines.slice(-MAX_LINES);
      }
      lastIds[id] = data.latest_id;
      renderPanel(id);
      saveState();
    } catch (e) {
      console.error('poll error for', id, e);
    }
  }
}

function startPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, refreshRate * 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  addDropdownEventListeners();
  document.querySelectorAll('[data-rate]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-rate]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshRate = parseInt(btn.dataset.rate);
      startPoll();
    });
  });
  document.getElementById('pauseBtn').addEventListener('click', () => {
    pauseAll = !pauseAll;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = pauseAll ? 'Resume' : 'Pause';
    btn.classList.toggle('paused', pauseAll);
  });
  loadDevices().then(startPoll);
});
</script>
</body>
</html>""".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _stream_poll(self):
        import urllib.parse
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        since_id = int(params.get("since", [0])[0])
        limit = int(params.get("limit", [100])[0])
        device_id = params.get("device_id", [None])[0]

        try:
            logs = []
            latest_id = 0

            if device_id:
                conn = init_db(self.db)
                conn.row_factory = sqlite3.Row
                if since_id == 0:
                    db_rows = conn.execute(
                        "SELECT * FROM logs WHERE device_id = ? ORDER BY id DESC LIMIT ?",
                        (device_id, limit)
                    ).fetchall()
                    db_rows = list(reversed(db_rows))
                else:
                    db_rows = conn.execute(
                        "SELECT * FROM logs WHERE id > ? AND device_id = ? ORDER BY id LIMIT ?",
                        (since_id, device_id, limit)
                    ).fetchall()
                latest_row = conn.execute(
                    "SELECT MAX(id) FROM logs WHERE device_id = ?", (device_id,)
                ).fetchone()
                latest_id = latest_row[0] if latest_row and latest_row[0] is not None else since_id
                conn.close()
                logs = [dict(row) for row in db_rows]
            else:
                conn = init_db(self.db)
                conn.row_factory = sqlite3.Row
                if since_id == 0:
                    db_rows = conn.execute(
                        "SELECT * FROM logs ORDER BY id DESC LIMIT ?",
                        (limit,)
                    ).fetchall()
                    db_rows = list(reversed(db_rows))
                else:
                    db_rows = conn.execute(
                        "SELECT * FROM logs WHERE id > ? ORDER BY id LIMIT ?",
                        (since_id, limit)
                    ).fetchall()
                latest_row = conn.execute("SELECT MAX(id) FROM logs").fetchone()
                latest_id = latest_row[0] if latest_row and latest_row[0] is not None else since_id
                conn.close()
                logs = [dict(row) for row in db_rows]

            data = logs
            body = json.dumps({"logs": data, "latest_id": latest_id}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(body))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            try:
                self.send_error(500, str(e))
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _sse_stream(self):
        import urllib.parse
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        device_id = params.get("device_id", [None])[0]

        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()

            last_heartbeat = time.time()
            last_sqlite_id = 0

            while not _shutdown.is_set():
                try:
                    new_entries = []

                    if device_id:
                        conn = init_db(self.db)
                        conn.row_factory = sqlite3.Row
                        rows = conn.execute(
                            "SELECT * FROM logs WHERE id > ? AND device_id = ? ORDER BY id LIMIT 50",
                            (last_sqlite_id, device_id)
                        ).fetchall()
                        conn.close()
                        for row in rows:
                            if row["id"] > last_sqlite_id:
                                new_entries.append(dict(row))
                                last_sqlite_id = row["id"]
                    else:
                        conn = init_db(self.db)
                        conn.row_factory = sqlite3.Row
                        rows = conn.execute(
                            "SELECT * FROM logs WHERE id > ? ORDER BY id LIMIT 50",
                            (last_sqlite_id,)
                        ).fetchall()
                        conn.close()
                        for row in rows:
                            if row["id"] > last_sqlite_id:
                                new_entries.append(dict(row))
                                last_sqlite_id = row["id"]

                    for entry in new_entries:
                        data = json.dumps(entry).encode()
                        self.wfile.write(b"data: ")
                        self.wfile.write(data)
                        self.wfile.write(b"\n\n")
                    if new_entries:
                        self.wfile.flush()

                    now = time.time()
                    if now - last_heartbeat >= 25:
                        self.wfile.write(b": heartbeat\n\n")
                        self.wfile.flush()
                        last_heartbeat = now

                    time.sleep(1)

                except (BrokenPipeError, ConnectionResetError):
                    break
                except Exception:
                    time.sleep(1)

        except (BrokenPipeError, ConnectionResetError):
            pass

    def _since_logs(self):
        import urllib.parse
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        device_id = params.get("device_id", [None])[0]
        since = params.get("since", [None])[0]

        if not since:
            body = json.dumps({"error": "missing ?since=ISO_TIMESTAMP"}).encode()
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
            return

        try:
            logs = []
            if device_id:
                conn = init_db(self.db)
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT * FROM logs WHERE timestamp > ? AND device_id = ? ORDER BY id LIMIT 500",
                    (since, device_id)
                ).fetchall()
                conn.close()
                logs = [dict(row) for row in rows]
            else:
                conn = init_db(self.db)
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT * FROM logs WHERE timestamp > ? ORDER BY id LIMIT 500",
                    (since,)
                ).fetchall()
                conn.close()
                logs = [dict(row) for row in rows]

            logs.sort(key=lambda x: x.get("timestamp", ""))
            logs = logs[:500]
            body = json.dumps(logs).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(body))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            try:
                self.send_error(500, str(e))
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _status_json(self):
        try:
            conn = init_db(self.db)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT id, hostname, status, last_seen FROM devices ORDER BY id"
            ).fetchall()
            conn.close()
            data = [dict(r) for r in rows]
            body = json.dumps(data).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(body))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            try:
                self.send_error(500, str(e))
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _recent_logs(self, limit: int = 100):
        try:
            conn = init_db(self.db)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT timestamp, device_id, device_timestamp, level, tag, message "
                "FROM logs ORDER BY id DESC LIMIT ?",
                (limit,)
            ).fetchall()
            conn.close()
            data = [dict(row) for row in rows]
            body = json.dumps(data).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(body))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            try:
                self.send_error(500, str(e))
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _export_csv(self):
        try:
            conn = init_db(self.db)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT timestamp, device_id, device_timestamp, level, tag, message, raw_line, received_at "
                "FROM logs ORDER BY id"
            ).fetchall()
            conn.close()

            import io
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["timestamp_iso", "device_id", "device_timestamp", "level", "tag", "message", "raw_line", "received_at"])
            for row in rows:
                w.writerow([row["timestamp"], row["device_id"], row["device_timestamp"],
                            row["level"], row["tag"], row["message"], row["raw_line"], row["received_at"]])
            body = buf.getvalue().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv")
            self.send_header("Content-Disposition", "attachment; filename=esplog.csv")
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            try:
                self.send_error(500, str(e))
            except (BrokenPipeError, ConnectionResetError):
                pass

    def log_message(self, format, *args):
        pass


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def run_http_server(db: Path, port: int = 5555):
    SSEHandler.db = db
    server = ThreadedHTTPServer(("0.0.0.0", port), SSEHandler)
    print(f"[http] Serving on http://localhost:{port}")
    print(f"[http]   GET /events      — SSE live log stream (for LLMs)")
    print(f"[http]   GET /stream      — JSON polling stream (?since=N&device_id=X)")
    print(f"[http]   GET /since       — JSON logs since timestamp (?device_id=X&since=ISO)")
    print(f"[http]   GET /status      — JSON device list")
    print(f"[http]   GET /logs        — JSON recent logs (100 rows)")
    print(f"[http]   GET /export-csv  — CSV download")
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="http")
    thread.start()
    return server


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

def signal_handler(sig, frame):
    print("\n[main] Shutdown signal received...")
    _shutdown.set()


def run_device_manager(db: Path, ping_interval: int):
    writer_t = threading.Thread(target=log_writer_thread, args=(db,), daemon=True, name="writer")
    writer_t.start()

    prune_t = threading.Thread(target=prune_thread, args=(db,), daemon=True, name="prune")
    prune_t.start()

    devices = load_devices(db)
    print(f"[main] Found {len(devices)} devices: {[d[0] for d in devices]}")
    preload_buffer(db, minutes=10)

    def get_hostnames():
        return [(device_id, hostname) for device_id, hostname, _ in devices]

    def on_status_change(hostname: str, new_status: str):
        ts = datetime.datetime.now(datetime.UTC).isoformat() + "Z"
        try:
            conn = init_db(db)
            conn.execute(
                "UPDATE devices SET status=?, last_seen=? WHERE hostname=?",
                (new_status, ts, hostname)
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

        entry = next((d for d in devices if d[1] == hostname), None)
        if entry is None:
            return
        device_id, _, yaml_path = entry
        if new_status == "up":
            spawn_device_thread(device_id, hostname, yaml_path)
        else:
            kill_device_thread(device_id)

    health_t = threading.Thread(
        target=health_checker,
        args=(ping_interval, get_hostnames, on_status_change, db),
        daemon=True,
        name="health-checker"
    )
    health_t.start()

    supervisor_t = threading.Thread(
        target=supervisor_thread,
        args=(db,),
        daemon=True,
        name="supervisor"
    )
    supervisor_t.start()

    for device_id, hostname, yaml_path in devices:
        if _ping_host(hostname):
            print(f"[main] {hostname} is reachable — spawning")
            on_status_change(hostname, "up")
        else:
            print(f"[main] {hostname} not reachable — waiting for health checker")
            on_status_change(hostname, "down")

    return writer_t


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="ESP-NOW LR Multi-Device Log Collector")
    parser.add_argument("--ping-interval", type=int, default=30,
                        help="Health check interval in seconds (default: 5)")
    parser.add_argument("--log-timeout", type=int, default=0,
                        help="Max seconds to run each log thread (0=forever, default: 0)")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB,
                        help=f"SQLite DB path (default: {DEFAULT_DB})")
    parser.add_argument("--status", action="store_true",
                        help="Print current DB contents and exit")
    parser.add_argument("--kill", action="store_true",
                        help="Kill all Docker esplog containers and exit")
    parser.add_argument("--reset", action="store_true",
                        help="Reset database and exit")
    parser.add_argument("--watch", action="store_true",
                        help="Run status loop continuously (default when no flag given)")
    parser.add_argument("--export-csv", nargs="?", const="esplog_export.csv",
                        help="Export logs to CSV and exit (default: esplog_export.csv)")
    parser.add_argument("--stream", action="store_true",
                        help="Stream logs live from SQLite (like tail -f)")
    parser.add_argument("--serve", action="store_true",
                        help="Run HTTP SSE server for live log streaming")
    parser.add_argument("--port", type=int, default=5555,
                        help="HTTP server port (default: 5555)")
    args = parser.parse_args()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    db = args.db

    # -----------------------------------------------------------------------
    # One-shot modes
    # -----------------------------------------------------------------------
    if args.reset:
        db.unlink(missing_ok=True)
        init_db(db)
        print(f"Database reset: {db}")
        return

    if args.kill:
        result = subprocess.run(
            ["docker", "ps", "-q", "--filter", f"ancestor={DOCKER_IMG}"],
            capture_output=True, text=True
        )
        ids = result.stdout.strip().split()
        if ids:
            subprocess.run(["docker", "kill"] + ids)
            print(f"Killed {len(ids)} container(s)")
        else:
            print("No containers to kill")
        return

    if args.status:
        if not db.exists():
            print(f"DB not found: {db}")
        else:
            print_db_contents(db)
        return

    if args.export_csv is not None:
        if not db.exists():
            print(f"DB not found: {db}")
        else:
            export_csv(db, Path(args.export_csv))
        return

    if args.stream:
        if not db.exists():
            print(f"DB not found: {db}")
        else:
            stream_logs(db)
        return

    if args.serve:
        init_db(db)

        http_server = run_http_server(db, args.port)
        writer_t = run_device_manager(db, args.ping_interval)

        print("[main] HTTP server running — Ctrl+C to stop")
        try:
            while not _shutdown.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            _shutdown.set()
            http_server.shutdown()
            with _state_lock:
                procs = dict(_device_procs)
            for proc in procs.values():
                try:
                    kill_proc_group(proc)
                except Exception:
                    pass
            _log_queue.put(None)
            writer_t.join(timeout=5)
            print("[main] Server stopped")
        return

    # -----------------------------------------------------------------------
    # Full run mode
    # -----------------------------------------------------------------------
    if db.exists():
        conn = init_db(db)
        conn.close()

    print(f"[main] Scanning {DEMOS_DIR}...")
    writer_t = run_device_manager(db, args.ping_interval)

    # Status display loop (runs in main thread)
    print("[main] Entering status loop — Ctrl+C to stop")
    try:
        status_loop(db, interval=5)
    except KeyboardInterrupt:
        pass
    finally:
        _shutdown.set()

        # Kill all device threads
        print("[main] Stopping device threads...")
        with _state_lock:
            threads = list(_device_threads.values())
            procs = dict(_device_procs)

        for proc in procs.values():
            try:
                kill_proc_group(proc)
            except Exception:
                pass

        for t in threads:
            t.join(timeout=3)

        # Signal writer to flush and exit
        _log_queue.put(None)
        writer_t.join(timeout=5)

        print("[main] Done.")


if __name__ == "__main__":
    main()
