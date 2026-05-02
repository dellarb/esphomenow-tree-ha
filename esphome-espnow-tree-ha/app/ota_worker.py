from __future__ import annotations

import asyncio
import math
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .bridge_client import BridgeManager, read_file_chunk
from .db import Database
from .firmware_store import FirmwareStore
from .models import (
    ABORTED,
    FAILED,
    QUEUED,
    REJOIN_TIMEOUT,
    STARTING,
    SUCCESS,
    TRANSFERRING,
    VERIFYING,
    VERSION_MISMATCH,
    WAITING_REJOIN,
    find_node_by_mac,
    is_terminal,
    normalize_mac,
    now_ts,
    parse_build_datetime,
)

if TYPE_CHECKING:
    from .bridge_ws_client import BridgeWsManager


class OTAWorker:
    def __init__(
        self,
        db: Database,
        bridge_manager: BridgeManager,
        firmware_store: FirmwareStore,
        rejoin_timeout_s: int,
        transfer_timeout_s: int,
        ws_manager: BridgeWsManager | None = None,
    ) -> None:
        self.db = db
        self.bridge_manager = bridge_manager
        self.firmware_store = firmware_store
        self.rejoin_timeout_s = rejoin_timeout_s
        self.transfer_timeout_s = transfer_timeout_s
        self.ws_manager = ws_manager
        self._wake_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._total_chunks: int | None = None
        self._chunks_sent: int = 0
        self._paused: bool = False
        self._retry_counts: dict[int, int] = {}
        self._dequeue_failure_counts: dict[int, int] = {}

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="ota-worker")

    async def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._task is not None:
            await self._task

    def wake(self) -> None:
        self._wake_event.set()

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False
        self._wake_event.set()

    def is_paused(self) -> bool:
        return self._paused

    async def _run(self) -> None:
        await self._recover_startup()
        while not self._stop_event.is_set():
            job = self.db.active_job()
            if job and job["status"] in {STARTING, TRANSFERRING, VERIFYING, WAITING_REJOIN}:
                try:
                    await self._process(job)
                except Exception as exc:
                    self._fail(job["id"], f"OTA worker error: {exc}")
                if not self._paused:
                    await self._dequeue_next()
                continue
            self._wake_event.clear()
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                await self._cleanup_expired_files()

    async def _recover_startup(self) -> None:
        if self._stop_event.is_set():
            return
        job = self.db.active_job()
        if job and job["status"] not in {"pending_confirm", QUEUED}:
            self._fail(job["id"], "add-on restarted, active OTA job could not be recovered")
        if self.db.has_queued_jobs():
            self._paused = True

    async def _dequeue_next(self) -> None:
        next_job = self.db.next_queued_job()
        if not next_job:
            return
        try:
            _, topology = await self.bridge_manager.topology()
        except Exception:
            self._handle_dequeue_failure(next_job, "bridge unreachable when starting queued job")
            self.wake()
            return
        node = find_node_by_mac(topology, normalize_mac(str(next_job["mac"])))
        if not node or not bool(node.get("online")):
            self._handle_dequeue_failure(next_job, "device offline when starting queued job")
            self.wake()
            return
        self._dequeue_failure_counts.pop(next_job["id"], None)
        self.db.update_job(next_job["id"], status=STARTING, percent=0, error_msg=None)
        self.wake()

    def _handle_dequeue_failure(self, job: dict[str, Any], reason: str) -> None:
        job_id = int(job["id"])
        count = self._dequeue_failure_counts.get(job_id, 0) + 1
        if count < 3:
            self._dequeue_failure_counts[job_id] = count
            self.db.update_job(job_id, error_msg=f"{reason} (attempt {count}/3, will retry)")
            return
        self._dequeue_failure_counts.pop(job_id, None)
        queued_jobs = self.db.queued_jobs()
        if len(queued_jobs) <= 1:
            self._dequeue_failure_counts[job_id] = 3
            self.db.update_job(job_id, error_msg=f"{reason} (retried 3x, waiting for device to come online)")
            return
        new_order = len(queued_jobs) - 1
        self.db.update_job(job_id, queue_order=new_order, error_msg=f"{reason} (retried 3x, moved to back of queue)")

    async def _process(self, job: dict[str, Any]) -> None:
        if self.ws_manager and self.ws_manager.is_ws_mode():
            self._fail(job["id"], "OTA is not available in WebSocket transport mode")
            return
        current = self.db.get_job(int(job["id"]))
        if not current or is_terminal(current["status"]):
            return
        if current["status"] == WAITING_REJOIN:
            await self._wait_for_rejoin(current)
            return

        path = Path(str(current.get("firmware_path") or ""))
        if not path.exists():
            self._fail(current["id"], "firmware file is missing")
            return

        client = await self.bridge_manager.client()
        if current["status"] == STARTING:
            self._total_chunks = None
            self._chunks_sent = 0
            self.db.update_job(current["id"], started_at=now_ts(), percent=0, error_msg=None)
            try:
                await client.start_ota(current["mac"], int(current["firmware_size"]), str(current["firmware_md5"]))
            except Exception as exc:
                retry_count = self._retry_counts.get(current["id"], 0)
                if retry_count < 1:
                    self._retry_counts[current["id"]] = retry_count + 1
                    queued_jobs = self.db.queued_jobs()
                    new_order = len(queued_jobs)
                    self.db.update_job(current["id"], status=QUEUED, queue_order=new_order, error_msg=f"bridge start failed, re-queued: {exc}")
                    return
                self._retry_counts.pop(current["id"], None)
                self._fail(current["id"], f"bridge start failed after retry: {exc}")
                return
            self._retry_counts.pop(current["id"], None)
            self.db.update_job(current["id"], status=TRANSFERRING, bridge_state="START_RECEIVED")

        transfer_started = now_ts()
        consecutive_failures = 0
        while not self._stop_event.is_set():
            latest = self.db.get_job(current["id"])
            if not latest or is_terminal(latest["status"]):
                return
            if now_ts() - transfer_started > self.transfer_timeout_s:
                self._fail(current["id"], "OTA transfer timed out")
                return

            try:
                status = await client.get_ota_status()
            except Exception as exc:
                consecutive_failures += 1
                if consecutive_failures >= 5:
                    self._fail(current["id"], f"bridge unreachable after {consecutive_failures} consecutive failures: {exc}")
                    return
                await asyncio.sleep(1.0)
                continue
            consecutive_failures = 0
            bridge_state = str(status.get("state") or "").upper()
            percent = _bounded_percent(status.get("percent"))
            updates: dict[str, Any] = {"bridge_state": bridge_state, "percent": percent}
            if bridge_state == "VERIFYING":
                updates["status"] = VERIFYING
            elif bridge_state in {"START_RECEIVED", "UPLOADING", "TRANSFERRING"}:
                updates["status"] = TRANSFERRING
            self.db.update_job(current["id"], **updates)

            if bridge_state == "FAIL":
                self._fail(current["id"], str(status.get("error_msg") or "bridge reported OTA failure"))
                return
            if bridge_state == "IDLE" and latest["status"] != STARTING:
                self._fail(current["id"], "bridge returned to IDLE before completing the transfer")
                return
            if bridge_state == "SUCCESS":
                self.db.update_job(current["id"], status=WAITING_REJOIN, percent=100, bridge_state="SUCCESS")
                await self._wait_for_rejoin(self.db.get_job(current["id"]) or current)
                return

            chunk_size = int(status.get("chunk_size") or 0)
            requested = status.get("requested") or []
            if chunk_size > 0 and isinstance(requested, list):
                if self._total_chunks is None:
                    self._total_chunks = math.ceil(int(current["firmware_size"]) / chunk_size)
                    self.db.update_job(current["id"], total_chunks=self._total_chunks)
                new_chunks: list[int] = []
                for seq_value in sorted(set(int(seq) for seq in requested)):
                    latest = self.db.get_job(current["id"])
                    if not latest or is_terminal(latest["status"]):
                        return
                    chunk = read_file_chunk(path, seq_value, chunk_size)
                    if not chunk:
                        continue
                    await client.send_chunk(seq_value, chunk)
                    new_chunks.append(seq_value)
                self._chunks_sent += len(new_chunks)
                self.db.update_job(current["id"], chunks_sent=self._chunks_sent)

            await asyncio.sleep(0.25)

    async def _wait_for_rejoin(self, job: dict[str, Any]) -> None:
        target_mac = normalize_mac(str(job["mac"]))
        expected_build_date = str(job.get("parsed_build_date") or "").strip()
        expected_versions = {
            str(job.get("parsed_version") or "").strip(),
        }
        expected_versions = {value for value in expected_versions if value}
        deadline = now_ts() + self.rejoin_timeout_s

        while now_ts() <= deadline and not self._stop_event.is_set():
            latest = self.db.get_job(job["id"])
            if not latest or is_terminal(latest["status"]):
                return
            try:
                _, topology = await self.bridge_manager.topology()
            except Exception:
                await asyncio.sleep(3.0)
                continue

            node = find_node_by_mac(topology, target_mac)
            if node and bool(node.get("online")):
                current_build_date = str(node.get("firmware_build_date") or "").strip()
                current_version = str(node.get("firmware_version") or node.get("project_version") or "").strip()

                if expected_build_date and current_build_date:
                    expected_ts = parse_build_datetime(expected_build_date)
                    current_ts = parse_build_datetime(current_build_date)
                    if expected_ts is not None and current_ts is not None:
                        if abs(current_ts - expected_ts) > 1.0:
                            self._finish(
                                job["id"], VERSION_MISMATCH,
                                f"device rejoined with build date {current_build_date}, expected {expected_build_date}"
                            )
                            return
                        self._finish(job["id"], SUCCESS, None)
                        return

                if expected_versions and current_version and current_version not in expected_versions:
                    self._finish(job["id"], VERSION_MISMATCH, f"device rejoined with firmware {current_version}, expected {sorted(expected_versions)[0]}")
                    return
                self._finish(job["id"], SUCCESS, None)
                return

            await asyncio.sleep(3.0)

        self._finish(job["id"], REJOIN_TIMEOUT, "bridge transfer succeeded but the device did not rejoin before timeout")

    def _finish(self, job_id: int, status: str, error_msg: str | None) -> None:
        job = self.db.get_job(job_id)
        if not job:
            return
        retained_path, retained_until = self.firmware_store.retain(job.get("firmware_path"), job_id)
        self.db.update_job(job_id, firmware_path=retained_path, retained_until=retained_until)
        self.db.mark_terminal(job_id, status, error_msg=error_msg, percent=100 if status == SUCCESS else job.get("percent"))

    def _fail(self, job_id: int, message: str) -> None:
        self._finish(job_id, FAILED, message)

    async def _cleanup_expired_files(self) -> None:
        for job in self.db.expired_retained():
            self.firmware_store.delete_file(job.get("firmware_path"))
            self.db.clear_job_firmware(int(job["id"]))


def _bounded_percent(value: Any) -> int:
    try:
        percent = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, percent))
