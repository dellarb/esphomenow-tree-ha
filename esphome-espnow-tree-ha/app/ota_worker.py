from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING, Any

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


def _read_file_chunk(path: Path, seq: int, chunk_size: int) -> bytes:
    if chunk_size <= 0:
        raise ValueError("bridge reported an invalid chunk size")
    with path.open("rb") as handle:
        handle.seek(seq * chunk_size)
        return handle.read(chunk_size)


class OTAWorker:
    def __init__(
        self,
        db: Database,
        firmware_store: FirmwareStore,
        rejoin_timeout_s: int,
        transfer_timeout_s: int,
        ws_manager: BridgeWsManager | None = None,
    ) -> None:
        self.db = db
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
            try:
                await asyncio.wait_for(self._task, timeout=2.0)
            except asyncio.TimeoutError:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass

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
        if not self.ws_manager:
            self._handle_dequeue_failure(next_job, "ws_manager not available")
            self.wake()
            return
        try:
            topology = await self.ws_manager.topology()
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
        await self._process_ws(current, path)

    async def _process_ws(self, job: dict[str, Any], path: Path) -> None:
        current = self.db.get_job(int(job["id"]))

        if not self.ws_manager.connected:
            waited = 0
            while not self.ws_manager.connected and waited < 15:
                await asyncio.sleep(1.0)
                waited += 1
            if not self.ws_manager.connected:
                self._fail(current["id"], "bridge WebSocket not connected")
                return

        if current["status"] == STARTING:
            self._total_chunks = None
            self._chunks_sent = 0
            self.db.update_job(current["id"], started_at=now_ts(), percent=0, error_msg=None)
            try:
                await self._ota_ws_start(current)
            except Exception as exc:
                return
            self.db.update_job(current["id"], status=TRANSFERRING, bridge_state="TRANSFERRING")

        transfer_started = now_ts()
        consecutive_failures = 0
        ota_client = self.ws_manager.ota_client
        if ota_client is None:
            self._fail(current["id"], "bridge WebSocket OTA client not available")
            return

        total_chunks = ota_client.total_chunks
        if total_chunks == 0:
            total_chunks = (int(current["firmware_size"]) + ota_client.max_chunk_size - 1) // ota_client.max_chunk_size
        self.db.update_job(current["id"], total_chunks=total_chunks)

        max_chunk = ota_client.max_chunk_size
        sent_seq = -1

        while not self._stop_event.is_set():
            latest = self.db.get_job(current["id"])
            if not latest or is_terminal(latest["status"]):
                return

            if now_ts() - transfer_started > self.transfer_timeout_s:
                try:
                    await ota_client.abort("timeout")
                except Exception:
                    pass
                self._fail(current["id"], "OTA transfer timed out")
                return

            try:
                status = await ota_client.poll_status()
            except Exception as exc:
                consecutive_failures += 1
                if consecutive_failures >= 5:
                    try:
                        await ota_client.abort("consecutive_failures")
                    except Exception:
                        pass
                    self._fail(current["id"], f"WS unreachable after {consecutive_failures} polls: {exc}")
                    return
                await asyncio.sleep(1.0)
                continue
            consecutive_failures = 0

            state = str(status.get("state", "")).lower()
            percent = _bounded_percent(status.get("percent"))
            message = str(status.get("message", ""))

            updates: dict[str, Any] = {"bridge_state": state.upper(), "percent": percent}
            if message:
                updates["error_msg"] = message

            if state == "verifying":
                updates["status"] = VERIFYING
            elif state == "transferring":
                updates["status"] = TRANSFERRING
            elif state == "success":
                updates["status"] = WAITING_REJOIN
                updates["percent"] = 100
                self.db.update_job(current["id"], **updates)
                await self._wait_for_rejoin(self.db.get_job(current["id"]) or current)
                return
            elif state in ("failed", "aborted", "idle"):
                permanent_tags = ["remote_not_found", "ota_busy", "rejected", "remote rejected", "md5", "crc"]
                if any(tag in message.lower() for tag in permanent_tags):
                    self._fail(current["id"], message or f"bridge state: {state}")
                else:
                    self._fail(current["id"], message or f"bridge state: {state}")
                return

            self.db.update_job(current["id"], **updates)

            next_seq = int(status.get("next_sequence", 0))
            window_size = int(status.get("window_size", 4))
            max_chunk = int(status.get("max_chunk_size", max_chunk))
            if max_chunk <= 0:
                max_chunk = ota_client.max_chunk_size

            bridge_total = int(status.get("total_chunks", 0))
            if bridge_total > 0 and bridge_total != total_chunks:
                total_chunks = bridge_total

            max_send_seq = min(next_seq - 1, total_chunks - 1)
            while sent_seq < max_send_seq:
                sent_seq += 1
                is_final = sent_seq == total_chunks - 1

                chunk = _read_file_chunk(path, sent_seq, max_chunk)
                job_id_int = int(ota_client.job_id or "0", 16)

                from .ota_chunks import encode_chunk
                frame = encode_chunk(
                    job_id=job_id_int,
                    sequence=sent_seq,
                    payload=chunk,
                    max_chunk_size=max_chunk,
                    is_final=is_final,
                )
                await self.ws_manager.client.send_binary_frame(frame)

                chunks_sent = sent_seq + 1
                self.db.update_job(current["id"], chunks_sent=chunks_sent)

            await asyncio.sleep(0.25)

    async def _ota_ws_start(self, job: dict[str, Any]) -> None:
        ota_client = self.ws_manager.ota_client
        if ota_client is None:
            self._fail(job["id"], "bridge WebSocket OTA client not available")
            return
        try:
            await ota_client.start(
                target_mac=job["mac"],
                file_size=int(job["firmware_size"]),
                md5_hex=str(job["firmware_md5"]),
                sha256_hex="",
                filename=Path(job["firmware_path"]).name,
            )
        except Exception as exc:
            msg = str(exc)
            permanent_tags = [
                "remote_not_found",
                "ota_busy",
                "ota_not_active",
                "rejected",
                "remote rejected",
                "md5",
                "size",
            ]
            retry_count = self._retry_counts.get(job["id"], 0)
            if retry_count < 1:
                self._retry_counts[job["id"]] = retry_count + 1
                queued = self.db.queued_jobs()
                self.db.update_job(
                    job["id"],
                    status=QUEUED,
                    queue_order=len(queued),
                    error_msg=f"ota.start retry: {msg}",
                )
                return
            self._retry_counts.pop(job["id"], None)
            if any(tag in msg.lower() for tag in permanent_tags):
                self._fail(job["id"], f"ota.start failed: {msg}")
            else:
                self._fail(job["id"], f"ota.start failed after retry: {msg}")
            return
        self._retry_counts.pop(job["id"], None)

    async def _wait_for_rejoin(self, job: dict[str, Any]) -> None:
        target_mac = normalize_mac(str(job["mac"]))
        expected_build_date = str(job.get("parsed_build_date") or "").strip()
        expected_versions = {str(job.get("parsed_version") or "").strip()}
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
