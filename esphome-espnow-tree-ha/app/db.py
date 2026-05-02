from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Iterable

from .models import (
    ACTIVE_STATUSES,
    COMPILE_QUEUED,
    COMPILING,
    QUEUED,
    TERMINAL_STATUSES,
    node_key_from_topology,
    normalize_mac,
    now_ts,
)


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def init(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS bridge_config (
                  id INTEGER PRIMARY KEY CHECK (id = 1),
                  bridge_host TEXT,
                  bridge_port INTEGER DEFAULT 80,
                  auto_discovered INTEGER DEFAULT 1,
                  last_validated_at INTEGER,
                  updated_at INTEGER
                );

                CREATE TABLE IF NOT EXISTS devices (
                  mac TEXT PRIMARY KEY,
                  node_key TEXT,
                  label TEXT,
                  esphome_name TEXT,
                  bridge_host TEXT,
                  last_seen_online INTEGER,
                  current_firmware_version TEXT,
                  current_project_name TEXT,
                  firmware_build_date TEXT,
chip_name TEXT,
                  rssi INTEGER,
                  hops INTEGER,
                  entity_count INTEGER,
                  created_at INTEGER,
                  updated_at INTEGER
                );

                CREATE TABLE IF NOT EXISTS ota_jobs (
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
                  parsed_chip_name TEXT,
                  old_firmware_version TEXT,
                  old_project_name TEXT,
                  preflight_warnings TEXT,
                  percent INTEGER DEFAULT 0,
                  bridge_state TEXT,
                  total_chunks INTEGER,
                  chunks_sent INTEGER DEFAULT 0,
                  error_msg TEXT,
                  started_at INTEGER,
                  completed_at INTEGER,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER,
                  FOREIGN KEY (mac) REFERENCES devices(mac)
                );

                CREATE INDEX IF NOT EXISTS idx_ota_jobs_mac_created ON ota_jobs(mac, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_ota_jobs_status ON ota_jobs(status);
                """
            )
            try:
                conn.execute("ALTER TABLE ota_jobs ADD COLUMN queue_order INTEGER")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE ota_jobs ADD COLUMN esphome_name TEXT")
            except Exception:
                pass
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ota_jobs_queue_order ON ota_jobs(queue_order)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ota_jobs_esphome_name ON ota_jobs(esphome_name)")
            conn.execute(
                """
                INSERT OR IGNORE INTO bridge_config
                  (id, bridge_host, bridge_port, auto_discovered, updated_at)
                VALUES (1, NULL, 80, 1, ?)
                """,
                (now_ts(),),
            )

    @staticmethod
    def row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        return dict(row) if row is not None else None

    @staticmethod
    def rows(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
        return [dict(row) for row in rows]

    def get_bridge_config(self) -> dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM bridge_config WHERE id = 1").fetchone()
            return self.row(row) or {}

    def set_bridge_config(
        self,
        bridge_host: str | None,
        bridge_port: int,
        auto_discovered: bool,
        validated: bool = False,
    ) -> dict[str, Any]:
        ts = now_ts()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO bridge_config
                  (id, bridge_host, bridge_port, auto_discovered, last_validated_at, updated_at)
                VALUES (1, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  bridge_host = excluded.bridge_host,
                  bridge_port = excluded.bridge_port,
                  auto_discovered = excluded.auto_discovered,
                  last_validated_at = excluded.last_validated_at,
                  updated_at = excluded.updated_at
                """,
                (bridge_host or None, bridge_port, 1 if auto_discovered else 0, ts if validated else None, ts),
            )
        return self.get_bridge_config()

    def mark_bridge_validated(self) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE bridge_config SET last_validated_at = ?, updated_at = ? WHERE id = 1",
                (now_ts(), now_ts()),
            )

    def upsert_devices_from_topology(self, topology: list[dict[str, Any]], bridge_host: str) -> None:
        ts = now_ts()
        conn = self.connect()
        try:
            conn.execute("BEGIN")
            for node in topology:
                mac = normalize_mac(str(node.get("mac") or ""))
                if not mac:
                    continue
                existing = conn.execute("SELECT created_at FROM devices WHERE mac = ?", (mac,)).fetchone()
                created_at = existing["created_at"] if existing else ts
                conn.execute(
                    """
                    INSERT INTO devices (
                      mac, node_key, label, esphome_name, bridge_host, last_seen_online,
                      current_firmware_version, current_project_name, firmware_build_date,
                      chip_name, rssi, hops, entity_count, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(mac) DO UPDATE SET
                      node_key = excluded.node_key,
                      label = excluded.label,
                      esphome_name = excluded.esphome_name,
                      bridge_host = excluded.bridge_host,
                      last_seen_online = COALESCE(excluded.last_seen_online, devices.last_seen_online),
                      current_firmware_version = excluded.current_firmware_version,
                      current_project_name = excluded.current_project_name,
                      firmware_build_date = excluded.firmware_build_date,
                      chip_name = excluded.chip_name,
                      rssi = excluded.rssi,
                      hops = excluded.hops,
                      entity_count = excluded.entity_count,
                      updated_at = excluded.updated_at
                    """,
                    (
                        mac,
                        node_key_from_topology(node),
                        node.get("label"),
                        node.get("esphome_name"),
                        bridge_host,
                        ts if bool(node.get("online")) else None,
                        node.get("firmware_version") or node.get("project_version"),
                        node.get("project_name"),
                        node.get("firmware_build_date"),
                        node.get("chip_name"),
                        node.get("rssi"),
                        node.get("hops"),
                        node.get("entity_count"),
                        created_at,
                        ts,
                    ),
                )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def list_devices(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            return self.rows(conn.execute("SELECT * FROM devices ORDER BY label COLLATE NOCASE, mac").fetchall())

    def get_device(self, mac: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            return self.row(conn.execute("SELECT * FROM devices WHERE mac = ?", (normalize_mac(mac),)).fetchone())

    def active_job(self) -> dict[str, Any] | None:
        from .models import FLASH_STATUSES
        placeholders = ",".join("?" for _ in FLASH_STATUSES)
        with self.connect() as conn:
            return self.row(
                conn.execute(
                    f"SELECT * FROM ota_jobs WHERE status IN ({placeholders}) ORDER BY created_at ASC LIMIT 1",
                    tuple(FLASH_STATUSES),
                ).fetchone()
            )

    def _ensure_device_stub(self, conn: sqlite3.Connection, mac: str) -> None:
        if conn.execute("SELECT 1 FROM devices WHERE mac = ?", (mac,)).fetchone():
            return
        conn.execute(
            "INSERT OR IGNORE INTO devices (mac, created_at, updated_at) VALUES (?, ?, ?)",
            (mac, now_ts(), now_ts()),
        )

    def create_job(self, values: dict[str, Any]) -> dict[str, Any]:
        ts = now_ts()
        keys = [
            "mac",
            "status",
            "firmware_path",
            "firmware_name",
            "firmware_size",
            "firmware_md5",
            "parsed_project_name",
            "parsed_version",
            "parsed_esphome_name",
            "parsed_build_date",
            "parsed_chip_name",
            "old_firmware_version",
            "old_project_name",
            "preflight_warnings",
            "percent",
            "bridge_state",
            "total_chunks",
            "chunks_sent",
            "error_msg",
            "retained_until",
            "queue_order",
            "esphome_name",
        ]
        data = {key: values.get(key) for key in keys}
        data["mac"] = normalize_mac(str(data["mac"] or ""))
        data["status"] = data["status"] or "pending_confirm"
        data["percent"] = data["percent"] or 0
        with self.connect() as conn:
            self._ensure_device_stub(conn, data["mac"])
            if data["status"] in (QUEUED, COMPILE_QUEUED):
                conn.execute("BEGIN IMMEDIATE")
                try:
                    status_filter = data["status"]
                    row = conn.execute("SELECT MAX(queue_order) as max_order FROM ota_jobs WHERE status = ?", (status_filter,)).fetchone()
                    data["queue_order"] = (row["max_order"] if row and row["max_order"] is not None else -1) + 1
                    cursor = conn.execute(
                        f"""
                        INSERT INTO ota_jobs ({",".join(keys)}, created_at, updated_at)
                        VALUES ({",".join("?" for _ in keys)}, ?, ?)
                        """,
                        tuple(data[key] for key in keys) + (ts, ts),
                    )
                    job_id = int(cursor.lastrowid)
                    conn.execute("COMMIT")
                    return self.get_job(job_id) or {}
                except Exception:
                    conn.execute("ROLLBACK")
                    raise
            cursor = conn.execute(
                f"""
                INSERT INTO ota_jobs ({",".join(keys)}, created_at, updated_at)
                VALUES ({",".join("?" for _ in keys)}, ?, ?)
                """,
                tuple(data[key] for key in keys) + (ts, ts),
            )
            job_id = int(cursor.lastrowid)
        return self.get_job(job_id) or {}

    def get_job(self, job_id: int) -> dict[str, Any] | None:
        with self.connect() as conn:
            return self.row(conn.execute("SELECT * FROM ota_jobs WHERE id = ?", (job_id,)).fetchone())

    def update_job(self, job_id: int, **values: Any) -> dict[str, Any] | None:
        if not values:
            return self.get_job(job_id)
        values["updated_at"] = now_ts()
        keys = list(values.keys())
        assignments = ", ".join(f"{key} = ?" for key in keys)
        with self.connect() as conn:
            conn.execute(
                f"UPDATE ota_jobs SET {assignments} WHERE id = ?",
                tuple(values[key] for key in keys) + (job_id,),
            )
        return self.get_job(job_id)

    def mark_terminal(
        self,
        job_id: int,
        status: str,
        error_msg: str | None = None,
        percent: int | None = None,
        retained_until: int | None = None,
    ) -> dict[str, Any] | None:
        values: dict[str, Any] = {"status": status, "completed_at": now_ts()}
        if error_msg is not None:
            values["error_msg"] = error_msg
        if percent is not None:
            values["percent"] = percent
        if retained_until is not None:
            values["retained_until"] = retained_until
        return self.update_job(job_id, **values)

    def list_history(self, mac: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        with self.connect() as conn:
            if mac:
                return self.rows(
                    conn.execute(
                        "SELECT * FROM ota_jobs WHERE mac = ? ORDER BY created_at DESC LIMIT ?",
                        (normalize_mac(mac), limit),
                    ).fetchall()
                )
            return self.rows(
                conn.execute("SELECT * FROM ota_jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
            )

    def list_retained(self) -> list[dict[str, Any]]:
        ts = now_ts()
        placeholders = ",".join("?" for _ in TERMINAL_STATUSES)
        with self.connect() as conn:
            return self.rows(
                conn.execute(
                    f"""
                    SELECT * FROM ota_jobs
                    WHERE status IN ({placeholders})
                      AND firmware_path IS NOT NULL
                      AND retained_until IS NOT NULL
                      AND retained_until > ?
                    ORDER BY completed_at DESC
                    """,
                    tuple(TERMINAL_STATUSES) + (ts,),
                ).fetchall()
            )

    def expired_retained(self) -> list[dict[str, Any]]:
        ts = now_ts()
        with self.connect() as conn:
            return self.rows(
                conn.execute(
                    """
                    SELECT * FROM ota_jobs
                    WHERE firmware_path IS NOT NULL
                      AND retained_until IS NOT NULL
                      AND retained_until <= ?
                    """,
                    (ts,),
                ).fetchall()
            )

    def clear_job_firmware(self, job_id: int) -> None:
        self.update_job(job_id, firmware_path=None, retained_until=None)

    def active_job_for_device(self, mac: str) -> dict[str, Any] | None:
        placeholders = ",".join("?" for _ in ACTIVE_STATUSES)
        with self.connect() as conn:
            return self.row(
                conn.execute(
                    f"SELECT * FROM ota_jobs WHERE mac = ? AND status IN ({placeholders}) ORDER BY created_at ASC LIMIT 1",
                    (normalize_mac(mac),) + tuple(ACTIVE_STATUSES),
                ).fetchone()
            )

    def queued_jobs(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            return self.rows(
                conn.execute(
                    "SELECT * FROM ota_jobs WHERE status = ? ORDER BY queue_order ASC",
                    (QUEUED,),
                ).fetchall()
            )

    def next_queued_job(self) -> dict[str, Any] | None:
        with self.connect() as conn:
            return self.row(
                conn.execute(
                    "SELECT * FROM ota_jobs WHERE status = ? ORDER BY queue_order ASC LIMIT 1",
                    (QUEUED,),
                ).fetchone()
            )

    def has_queued_jobs(self) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM ota_jobs WHERE status = ? LIMIT 1",
                (QUEUED,),
            ).fetchone()
            return row is not None

    def count_queued_before(self, job_id: int) -> int:
        with self.connect() as conn:
            job = self.row(conn.execute("SELECT queue_order FROM ota_jobs WHERE id = ?", (job_id,)).fetchone())
            if not job or job["queue_order"] is None:
                return 0
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM ota_jobs WHERE status = ? AND queue_order < ?",
                (QUEUED, job["queue_order"]),
            ).fetchone()
            return row["cnt"] if row else 0

    def reorder_queue(self, job_id: int, new_order: int) -> None:
        with self.connect() as conn:
            conn.execute("BEGIN")
            jobs = self.rows(
                conn.execute(
                    "SELECT id, queue_order FROM ota_jobs WHERE status = ? ORDER BY queue_order ASC",
                    (QUEUED,),
                ).fetchall()
            )
            current_ids = [j["id"] for j in jobs]
            if job_id not in current_ids:
                conn.execute("ROLLBACK")
                return
            current_ids.remove(job_id)
            current_ids.insert(new_order, job_id)
            for idx, jid in enumerate(current_ids):
                conn.execute(
                    "UPDATE ota_jobs SET queue_order = ? WHERE id = ?",
                    (idx, jid),
                )
            conn.execute("COMMIT")

    def abort_queued_job(self, job_id: int) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM ota_jobs WHERE id = ?", (job_id,))
            remaining = self.rows(
                conn.execute(
                    "SELECT id FROM ota_jobs WHERE status = ? ORDER BY queue_order ASC",
                    (QUEUED,),
                ).fetchall()
            )
            for idx, row in enumerate(remaining):
                conn.execute(
                    "UPDATE ota_jobs SET queue_order = ? WHERE id = ?",
                    (idx, row["id"]),
                )

    def active_compile_job(self) -> dict[str, Any] | None:
        with self.connect() as conn:
            return self.row(
                conn.execute(
                    "SELECT * FROM ota_jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1",
                    (COMPILING,),
                ).fetchone()
            )

    def compile_queued_jobs(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            return self.rows(
                conn.execute(
                    "SELECT * FROM ota_jobs WHERE status = ? ORDER BY queue_order ASC",
                    (COMPILE_QUEUED,),
                ).fetchall()
            )

    def next_compile_queued_job(self) -> dict[str, Any] | None:
        with self.connect() as conn:
            return self.row(
                conn.execute(
                    "SELECT * FROM ota_jobs WHERE status = ? ORDER BY queue_order ASC LIMIT 1",
                    (COMPILE_QUEUED,),
                ).fetchone()
            )

    def count_compile_queued_before(self, job_id: int) -> int:
        with self.connect() as conn:
            job = self.row(conn.execute("SELECT queue_order FROM ota_jobs WHERE id = ?", (job_id,)).fetchone())
            if not job or job["queue_order"] is None:
                return 0
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM ota_jobs WHERE status = ? AND queue_order < ?",
                (COMPILE_QUEUED, job["queue_order"]),
            ).fetchone()
            return row["cnt"] if row else 0

    def transition_compile_queued_to_compiling(self, job_id: int, **extra: Any) -> None:
        values = {"status": COMPILING, "updated_at": now_ts(), **extra}
        keys = list(values.keys())
        assignments = ", ".join(f"{key} = ?" for key in keys)
        with self.connect() as conn:
            conn.execute(
                f"UPDATE ota_jobs SET {assignments} WHERE id = ? AND status = ?",
                tuple(values[key] for key in keys) + (job_id, COMPILE_QUEUED),
            )

    def abort_compile_queued_job(self, job_id: int) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM ota_jobs WHERE id = ?", (job_id,))
            remaining = self.rows(
                conn.execute(
                    "SELECT id FROM ota_jobs WHERE status = ? ORDER BY queue_order ASC",
                    (COMPILE_QUEUED,),
                ).fetchall()
            )
            for idx, row in enumerate(remaining):
                conn.execute(
                    "UPDATE ota_jobs SET queue_order = ? WHERE id = ?",
                    (idx, row["id"]),
                )
