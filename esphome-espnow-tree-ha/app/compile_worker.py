from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from .bridge_client import BridgeManager
from .compile_store import CompileStore
from .compiler import ESPHomeCompiler
from .config import Settings
from .db import Database
from .firmware_store import FirmwareStore
from .models import COMPILING, COMPILE_QUEUED, FAILED, QUEUED, find_node_by_mac, normalize_mac, now_ts
from .ota_worker import OTAWorker
from .preflight import preflight_comparison
from .yaml_store import YAMLStore


class CompileWorker:
    def __init__(
        self,
        db: Database,
        compiler: ESPHomeCompiler,
        bridge_manager: BridgeManager,
        firmware_store: FirmwareStore,
        yaml_store: YAMLStore,
        settings: Settings,
        ota_worker: OTAWorker | None = None,
    ) -> None:
        self.db = db
        self.compiler = compiler
        self.bridge_manager = bridge_manager
        self.firmware_store = firmware_store
        self.yaml_store = yaml_store
        self.settings = settings
        self.ota_worker = ota_worker
        self._wake_event = asyncio.Event()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="compile-worker")

    async def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._task is not None:
            await self._task

    def wake(self) -> None:
        self._wake_event.set()

    async def _run(self) -> None:
        await self._recover_startup()
        while not self._stop_event.is_set():
            job = self.db.active_compile_job()
            if job and job["status"] == "compiling":
                try:
                    await self._process(job)
                except Exception as exc:
                    self._fail(job["id"], f"compile worker error: {exc}")
                await self._dequeue_next()
                continue
            self._wake_event.clear()
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                pass

    async def _recover_startup(self) -> None:
        active = self.db.active_compile_job()
        if active and active["status"] == "compiling":
            self.db.mark_terminal(active["id"], FAILED, error_msg="add-on restarted, compile could not be recovered")
            self.compiler.cleanup_stale()

    async def _process(self, job: dict[str, Any]) -> None:
        esphome_name = str(job.get("esphome_name") or "")
        if not esphome_name:
            device = self.db.get_device(str(job.get("mac", "")))
            if device:
                esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            self._fail(job["id"], "no esphome_name found for compile job")
            return

        if not self.yaml_store.has_config(esphome_name):
            self._fail(job["id"], f"no config found for '{esphome_name}'")
            return

        self.compiler.compile_store.set_status(esphome_name, "compiling")

        result = await self.compiler.compile(esphome_name)

        if result.success:
            active_path = self.settings.firmware_dir / "active" / f"{uuid.uuid4().hex}.bin"
            active_path.parent.mkdir(parents=True, exist_ok=True)
            if result.ota_bin_path:
                shutil.copy2(result.ota_bin_path, active_path)

            ota_path = Path(result.ota_bin_path) if result.ota_bin_path else None
            size = ota_path.stat().st_size if ota_path and ota_path.exists() else 0
            md5 = ""
            if ota_path and ota_path.exists():
                md5 = hashlib.md5(ota_path.read_bytes()).hexdigest()

            info_dict = result.firmware_info.as_dict() if result.firmware_info else {}

            try:
                _, topo = await self.bridge_manager.topology()
            except Exception:
                topo = []
            node = find_node_by_mac(topo, normalize_mac(str(job.get("mac", ""))))

            preflight = preflight_comparison(node or {}, info_dict)

            queued_jobs = self.db.queued_jobs()
            new_order = len(queued_jobs)

            self.db.update_job(
                job["id"],
                status=QUEUED,
                queue_order=new_order,
                firmware_path=str(active_path),
                firmware_name=f"{esphome_name}.ota.bin",
                firmware_size=size,
                firmware_md5=md5,
                parsed_project_name=info_dict.get("project_name"),
                parsed_version=info_dict.get("parsed_version"),
                parsed_esphome_name=info_dict.get("esphome_name"),
                parsed_build_date=info_dict.get("parsed_build_date"),
                parsed_chip_name=info_dict.get("chip_name"),
                old_firmware_version=(node or {}).get("firmware_version") or (node or {}).get("project_version"),
                old_project_name=(node or {}).get("project_name"),
                preflight_warnings=json.dumps(preflight["warnings"]),
                started_at=now_ts(),
            )

            if self.ota_worker:
                self.ota_worker.wake()

            self.compiler.compile_store.clear_status(esphome_name)
        else:
            self.db.mark_terminal(job["id"], FAILED, error_msg=result.error or "compilation failed")

    async def _dequeue_next(self) -> None:
        if self.db.active_compile_job():
            return
        next_job = self.db.next_compile_queued_job()
        if not next_job:
            return
        device = self.db.get_device(str(next_job.get("mac", "")))
        esphome_name = str(next_job.get("esphome_name") or "")
        if not esphome_name and device:
            esphome_name = str(device.get("esphome_name") or "")
        if not device or not esphome_name or not self.yaml_store.has_config(esphome_name):
            self.db.abort_compile_queued_job(next_job["id"])
            await self._dequeue_next()
            return
        next_job_id = next_job["id"]
        self.db.transition_compile_queued_to_compiling(next_job_id, started_at=now_ts())
        current = self.db.get_job(next_job_id)
        if not current or current["status"] != COMPILING:
            return
        self.compiler.compile_store.set_status(esphome_name, "compiling")
        self.wake()

    def _fail(self, job_id: int, message: str) -> None:
        self.db.mark_terminal(job_id, FAILED, error_msg=message)

    async def cancel(self, job_id: int) -> bool:
        job = self.db.get_job(job_id)
        if not job:
            return False
        if job["status"] == "compiling":
            esphome_name = str(job.get("esphome_name") or "")
            if esphome_name:
                await self.compiler.cancel_compile(esphome_name)
            self.db.mark_terminal(job_id, FAILED, error_msg="cancelled by user")
            self.wake()
            return True
        if job["status"] == "compile_queued":
            self.db.abort_compile_queued_job(job_id)
            self.wake()
            return True
        return False