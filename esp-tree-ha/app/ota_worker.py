from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .db import Database
from .firmware_store import FirmwareStore
from .models import (
    ANNOUNCING,
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
from .protobuf.generated import esp_tree_runtime_pb2 as pb

if TYPE_CHECKING:
    from .bridge_v2_client import BridgeV2Manager


logger = logging.getLogger(__name__)

SOURCE_CHUNK_BURST_LIMIT = 12
SOURCE_CHUNK_SEND_DELAY_S = 0.006


def _read_file_chunk(path: Path, seq: int, chunk_size: int) -> bytes:
    if chunk_size <= 0:
        raise ValueError("bridge reported an invalid chunk size")
    with path.open("rb") as handle:
        handle.seek(seq * chunk_size)
        return handle.read(chunk_size)


def _extract_increment_fields(status: dict[str, Any], updates: dict[str, Any]) -> None:
    for key in ("current_increment", "total_increments", "retransmit_round", "buffer_size_kb"):
        val = status.get(key)
        if val is not None:
            try:
                updates[key] = int(val)
            except (ValueError, TypeError):
                pass


class OTAWorker:
    def __init__(
        self,
        db: Database,
        firmware_store: FirmwareStore,
        rejoin_timeout_s: int,
        transfer_timeout_s: int,
        bridge_manager: BridgeV2Manager | None = None,
    ) -> None:
        self.db = db
        self.firmware_store = firmware_store
        self.rejoin_timeout_s = rejoin_timeout_s
        self.transfer_timeout_s = transfer_timeout_s
        self.bridge_manager = bridge_manager
        self._wake_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._total_chunks: int | None = None
        self._chunks_sent: int = 0
        self._paused: bool = False
        self._retry_counts: dict[int, int] = {}
        self._dequeue_failure_counts: dict[int, int] = {}
        self._last_percent_10: dict[int, int] = {}

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="ota-worker")

    async def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=1.0)
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
            if job and job["status"] in {STARTING, ANNOUNCING, TRANSFERRING, VERIFYING, WAITING_REJOIN}:
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
        if job and job["status"] not in {QUEUED}:
            self._fail(job["id"], "add-on restarted, active OTA job could not be recovered")
        from .models import PENDING_CONFIRM
        for stale in self.db.list_jobs_by_status(PENDING_CONFIRM):
            self.firmware_store.delete_file(stale.get("firmware_path"))
            self.db.abort_queued_job(stale["id"])
        if self.db.has_queued_jobs():
            self._paused = True

    async def _dequeue_next(self) -> None:
        next_job = self.db.next_queued_job()
        if not next_job:
            return
        if not self.bridge_manager:
            self._handle_dequeue_failure(next_job, "bridge manager not available")
            self.wake()
            return
        try:
            topology = await self.bridge_manager.topology()
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
        self.db.append_job_event(next_job["id"], "flash_dequeued")
        self.wake()

    def _handle_dequeue_failure(self, job: dict[str, Any], reason: str) -> None:
        job_id = int(job["id"])
        count = self._dequeue_failure_counts.get(job_id, 0) + 1
        if count < 3:
            self._dequeue_failure_counts[job_id] = count
            self.db.update_job(job_id, error_msg=f"{reason} (attempt {count}/3, will retry)")
            self.db.append_job_event(job_id, "dequeue_retry", attempt=count, reason=reason)
            return
        self._dequeue_failure_counts.pop(job_id, None)
        queued_jobs = self.db.queued_jobs()
        if len(queued_jobs) <= 1:
            self._dequeue_failure_counts[job_id] = 3
            self.db.update_job(job_id, error_msg=f"{reason} (retried 3x, waiting for device to come online)")
            self.db.append_job_event(job_id, "dequeue_moved_back", reason=f"{reason} (3 retries, no other jobs)")
            return
        new_order = len(queued_jobs) - 1
        self.db.update_job(job_id, queue_order=new_order, error_msg=f"{reason} (retried 3x, moved to back of queue)")
        self.db.append_job_event(job_id, "dequeue_moved_back", reason=reason)

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
        await self._process_v2(current, path)

    async def _process_v2(self, job: dict[str, Any], path: Path) -> None:
        current = self.db.get_job(int(job["id"]))
        if not current:
            return
        if self.bridge_manager is None:
            self._fail(current["id"], "bridge manager not available")
            return
        if not self.bridge_manager.connected:
            waited = 0
            while not self.bridge_manager.connected and waited < 15:
                await asyncio.sleep(1.0)
                waited += 1
            if not self.bridge_manager.connected:
                self._fail(current["id"], "bridge protobuf WebSocket not connected")
                return

        try:
            ota_client = self.bridge_manager.ota_client_for_remote(str(current["mac"]))
        except Exception as exc:
            self._fail(current["id"], f"bridge for OTA target is not connected: {exc}")
            return

        terminal_event = asyncio.Event()
        unique_delivered: set[int] = set()
        transfer_started = now_ts()
        last_event_at = now_ts()
        terminal_action: str | None = None

        async def on_chunk_request(request: Any) -> None:
            nonlocal last_event_at
            last_event_at = now_ts()
            latest = self.db.get_job(current["id"])
            if not latest or is_terminal(latest["status"]) or self._stop_event.is_set():
                return
            if now_ts() - transfer_started > self.transfer_timeout_s:
                try:
                    await ota_client.abort(reason="timeout")
                except Exception:
                    pass
                self._fail(current["id"], "OTA transfer timed out")
                terminal_event.set()
                return
            sequences = [int(seq) for seq in request.sequences]
            await ota_client.send_chunks(request.request_id, sequences, path)
            unique_delivered.update(sequences)
            progress = request.progress
            self.db.update_job(
                current["id"],
                status=TRANSFERRING,
                bridge_state="TRANSFERRING",
                chunks_sent=len(unique_delivered),
                current_increment=int(progress.current_increment),
                total_increments=int(progress.total_increments),
                retransmit_round=int(progress.retransmit_round),
                buffer_size_kb=int(progress.buffer_size_kb),
                percent=_bounded_percent(progress.percent),
            )

        async def on_status(status: Any) -> None:
            nonlocal last_event_at, terminal_action
            last_event_at = now_ts()
            job_id = int(current["id"])
            percent = _bounded_percent(status.percent)
            updates: dict[str, Any] = {"bridge_state": pb.OtaState.Name(int(status.state)), "percent": percent}
            if status.error_detail:
                updates["error_msg"] = status.error_detail
            if status.state == pb.OTA_STATE_ANNOUNCING:
                updates["status"] = ANNOUNCING
                self.db.append_job_event(job_id, "flash_announcing")
            elif status.state == pb.OTA_STATE_TRANSFERRING:
                updates["status"] = TRANSFERRING
                last_p10 = self._last_percent_10.get(job_id, 0)
                new_p10 = percent // 10
                if new_p10 > last_p10 and percent > 0:
                    self._last_percent_10[job_id] = new_p10
                    self.db.append_job_event(job_id, "flash_progress", percent=percent, chunks_sent=len(unique_delivered), total_chunks=ota_client.total_chunks)
            elif status.state == pb.OTA_STATE_VERIFYING:
                updates["status"] = VERIFYING
                self.db.append_job_event(job_id, "flash_verifying")
            elif status.state == pb.OTA_STATE_SUCCESS:
                updates["status"] = WAITING_REJOIN
                updates["percent"] = 100
                self.db.append_job_event(job_id, "flash_rejoin_waiting")
                self.db.update_job(current["id"], **updates)
                terminal_action = "rejoin"
                terminal_event.set()
                return
            elif status.state in (pb.OTA_STATE_FAILED, pb.OTA_STATE_ABORTED):
                self._fail(current["id"], status.error_detail or "bridge OTA failed")
                terminal_event.set()
                return
            self.db.update_job(current["id"], **updates)

        async def on_aborted(aborted: Any) -> None:
            self._fail(current["id"], f"OTA aborted: {aborted.reason or 'bridge'}")
            terminal_event.set()

        ota_client.set_handlers(chunk_request=on_chunk_request, status=on_status, aborted=on_aborted)
        if current["status"] == STARTING:
            self._total_chunks = None
            self._chunks_sent = 0
            self._last_percent_10.pop(int(current["id"]), None)
            self.db.update_job(current["id"], started_at=now_ts(), percent=0, error_msg=None)
            self.db.append_job_event(int(current["id"]), "flash_starting")
            try:
                accepted = await ota_client.start(
                    target_mac=str(current["mac"]),
                    file_size=int(current["firmware_size"]),
                    md5=str(current["firmware_md5"]),
                    sha256="",
                    filename=Path(current["firmware_path"]).name,
                    preferred_chunk_size=0,
                )
            except Exception as exc:
                msg = str(exc)
                self.db.append_job_event(int(current["id"]), "flash_start_failed", error=msg)
                retry_count = self._retry_counts.get(current["id"], 0)
                permanent_tags = ["remote_not_found", "ota_busy", "rejected", "md5", "size"]
                if retry_count < 1 and not any(tag in msg.lower() for tag in permanent_tags):
                    self._retry_counts[current["id"]] = retry_count + 1
                    queued = self.db.queued_jobs()
                    self.db.update_job(
                        current["id"],
                        status=QUEUED,
                        queue_order=len(queued),
                        error_msg=f"ota.start retry: {msg}",
                    )
                    self.db.append_job_event(int(current["id"]), "ota_start_retry", reason=msg)
                    ota_client.close()
                    return
                self._retry_counts.pop(current["id"], None)
                self._fail(current["id"], f"ota.start failed: {msg}")
                ota_client.close()
                return
            self.db.update_job(
                current["id"],
                status=TRANSFERRING,
                bridge_state="TRANSFERRING",
                total_chunks=int(accepted.total_chunks),
            )
            self.db.append_job_event(int(current["id"]), "flash_transferring")

        while not self._stop_event.is_set():
            latest = self.db.get_job(current["id"])
            if not latest or is_terminal(latest["status"]):
                ota_client.close()
                return

            if now_ts() - transfer_started > self.transfer_timeout_s:
                try:
                    await ota_client.abort(reason="timeout")
                except Exception:
                    pass
                self._fail(current["id"], "OTA transfer timed out")
                ota_client.close()
                return

            try:
                await asyncio.wait_for(terminal_event.wait(), timeout=5.0)
                if terminal_action == "rejoin":
                    await self._wait_for_rejoin(self.db.get_job(current["id"]) or current)
                ota_client.close()
                return
            except asyncio.TimeoutError:
                if now_ts() - last_event_at > 60 and latest["status"] in {TRANSFERRING, VERIFYING}:
                    try:
                        await ota_client.abort(reason="stalled")
                    except Exception:
                        pass
                    self._fail(current["id"], "OTA transfer stalled")
                    ota_client.close()
                    return

    async def _wait_for_rejoin(self, job: dict[str, Any]) -> None:
        target_mac = normalize_mac(str(job["mac"]))
        expected_build_date = str(job.get("parsed_build_date") or "").strip()
        deadline = now_ts() + self.rejoin_timeout_s
        job_id = int(job["id"])

        initial_uptime_s: float | None = None
        try:
            initial_topology = await self.bridge_manager.topology()
            initial_node = find_node_by_mac(initial_topology, target_mac)
            if initial_node:
                initial_uptime_s = initial_node.get("uptime_s")
        except Exception:
            pass

        while now_ts() <= deadline and not self._stop_event.is_set():
            latest = self.db.get_job(job_id)
            if not latest or is_terminal(latest["status"]):
                return
            try:
                topology = await self.bridge_manager.topology()
            except Exception:
                await asyncio.sleep(3.0)
                continue

            node = find_node_by_mac(topology, target_mac)
            if node and bool(node.get("online")):
                current_uptime = node.get("uptime_s", 0)

                if initial_uptime_s is not None and current_uptime < initial_uptime_s:
                    try:
                        await self.bridge_manager.refresh_once()
                        topology = self.bridge_manager.get_topology_list()
                        node = find_node_by_mac(topology, target_mac)
                    except Exception:
                        pass
                    await asyncio.sleep(3.0)

                current_build_date = str(node.get("firmware_build_date") or "").strip()

                if expected_build_date and current_build_date:
                    expected_ts = parse_build_datetime(expected_build_date)
                    current_ts = parse_build_datetime(current_build_date)
                    if expected_ts is not None and current_ts is not None:
                        if abs(current_ts - expected_ts) > 1.0:
                            self.db.append_job_event(job_id, "flash_version_mismatch", expected=expected_build_date, actual=current_build_date)
                            self._finish(
                                job["id"], VERSION_MISMATCH,
                                f"device rejoined with build date {current_build_date}, expected {expected_build_date}"
                            )
                            return
                        self.db.append_job_event(job_id, "flash_rejoined", build_date=current_build_date)
                        self._finish(job["id"], SUCCESS, None)
                        return

                self.db.append_job_event(job_id, "flash_rejoined", build_date=current_build_date or "unknown")
                self._finish(job["id"], SUCCESS, None)
                return

            await asyncio.sleep(3.0)

        self.db.append_job_event(job_id, "flash_rejoin_timeout", timeout_s=self.rejoin_timeout_s)
        self._finish(job["id"], REJOIN_TIMEOUT, "bridge transfer succeeded but the device did not rejoin before timeout")

    def _finish(self, job_id: int, status: str, error_msg: str | None) -> None:
        job = self.db.get_job(job_id)
        if not job:
            return
        retained_path, retained_until = self.firmware_store.retain(job.get("firmware_path"), job_id)
        self.db.update_job(job_id, firmware_path=retained_path, retained_until=retained_until)
        if status == SUCCESS:
            elapsed = None
            if job.get("started_at"):
                elapsed = now_ts() - int(job["started_at"])
            self.db.append_job_event(job_id, "flash_success", duration_s=elapsed)
        else:
            self.db.append_job_event(job_id, "flash_failed", error=error_msg or status)
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
