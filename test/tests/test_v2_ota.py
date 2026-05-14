from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from app import models


def test_announcing_is_active_flash_status() -> None:
    assert models.ANNOUNCING in models.ACTIVE_STATUSES
    assert models.ANNOUNCING in models.FLASH_STATUSES
    assert not models.is_terminal(models.ANNOUNCING)


@pytest.mark.asyncio
async def test_v2_ota_client_splits_batches_and_uses_crc(tmp_path: Path) -> None:
    from app.bridge_v2_ota import BridgeV2OTAClient

    firmware = tmp_path / "firmware.bin"
    firmware.write_bytes(b"abcdefghi")

    class FakeClient:
        def __init__(self) -> None:
            self.batches = []

        async def send_ota_chunk_batch(self, job_id, response_request_id, chunks):
            self.batches.append((job_id, response_request_id, chunks))

    fake = FakeClient()
    ota = BridgeV2OTAClient(fake)
    ota.job_id = "b7f1"
    ota.max_chunk_size = 3
    ota.total_chunks = 3
    ota.max_chunks_per_batch = 2

    await ota.send_chunks("chunk-1", [0, 1, 2], firmware)

    assert len(fake.batches) == 2
    assert [chunk.sequence for chunk in fake.batches[0][2]] == [0, 1]
    assert [chunk.sequence for chunk in fake.batches[1][2]] == [2]
    assert fake.batches[1][2][0].flags & 0x0001
    assert fake.batches[0][2][0].payload == b"abc"
    assert fake.batches[0][2][0].crc32 == 0x352441C2


def test_manager_routes_ota_client_by_remote_mac() -> None:
    from app.bridge_v2_client import BridgeV2Manager, RemoteRoute

    manager = BridgeV2Manager(db=None)
    manager._routes["AA:BB:CC:DD:EE:FF"] = RemoteRoute(
        bridge_uuid="bridge-1",
        bridge_mac="11:22:33:44:55:66",
        remote_mac="AA:BB:CC:DD:EE:FF",
    )

    class FakeClient:
        connected = True

    fake = FakeClient()
    manager._clients["bridge-1"] = fake

    assert manager.ota_client_for_remote("AA:BB:CC:DD:EE:FF")._client is fake


def test_flash_work_pending_detects_queued_jobs(tmp_path: Path) -> None:
    from app.db import Database
    from app.server import _flash_work_pending

    db = Database(tmp_path / "esp_tree.db")
    db.init()
    assert not _flash_work_pending(db)

    queued = db.create_job(
        {
            "mac": "AA:BB:CC:DD:EE:01",
            "status": models.QUEUED,
            "firmware_path": str(tmp_path / "first.bin"),
        }
    )

    assert _flash_work_pending(db)
    assert _flash_work_pending(db, int(queued["id"]))


@pytest.mark.asyncio
async def test_ota_worker_handles_waiting_rejoin_status(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.db import Database
    from app.firmware_store import FirmwareStore
    from app.ota_worker import OTAWorker

    db = Database(tmp_path / "esp_tree.db")
    db.init()
    firmware_store = FirmwareStore(tmp_path / "firmware", retention_days=1)
    firmware_store.init()

    worker = OTAWorker(
        db=db,
        firmware_store=firmware_store,
        rejoin_timeout_s=1,
        transfer_timeout_s=1,
        bridge_manager=SimpleNamespace(),
    )
    job = db.create_job(
        {
            "mac": "AA:BB:CC:DD:EE:FF",
            "status": models.WAITING_REJOIN,
        }
    )
    called = {}

    async def fake_wait_for_rejoin(rejoin_job):
        called["job_id"] = rejoin_job["id"]

    monkeypatch.setattr(worker, "_wait_for_rejoin", fake_wait_for_rejoin)

    await worker._process(job)

    assert called["job_id"] == job["id"]


@pytest.mark.asyncio
async def test_compile_auto_flash_creates_queued_flash_job(tmp_path: Path) -> None:
    from app.compile_store import CompileStore
    from app.compile_worker import CompileWorker
    from app.compiler import CompileResult
    from app.db import Database
    from app.firmware_store import FirmwareStore
    from app.ota_worker import OTAWorker

    db = Database(tmp_path / "esp_tree.db")
    db.init()
    firmware_store = FirmwareStore(tmp_path / "firmware", retention_days=1)
    firmware_store.init()

    firmware = tmp_path / "remote.ota.bin"
    image = bytearray(64)
    image[0] = 0xE9
    image[12:14] = (0x0017).to_bytes(2, "little")
    firmware.write_bytes(image)

    class FakeCompiler:
        def __init__(self) -> None:
            self.compile_store = CompileStore(tmp_path / "devices")

        async def compile(self, esphome_name: str) -> CompileResult:
            return CompileResult(success=True, esphome_name=esphome_name, ota_bin_path=str(firmware))

    class FakeBridgeManager:
        async def topology(self):
            return [
                {
                    "mac": "AA:BB:CC:DD:EE:FF",
                    "online": True,
                    "esphome_name": "remote",
                    "firmware_md5": "old",
                    "chip_name": "ESP32-C5",
                }
            ]

    class FakeYamlStore:
        root = tmp_path / "devices"

        def has_config(self, esphome_name: str) -> bool:
            return esphome_name == "remote"

    ota_worker = OTAWorker(db, firmware_store, 1, 1, bridge_manager=FakeBridgeManager())
    worker = CompileWorker(
        db=db,
        compiler=FakeCompiler(),
        bridge_manager=FakeBridgeManager(),
        firmware_store=firmware_store,
        yaml_store=FakeYamlStore(),
        settings=SimpleNamespace(firmware_dir=tmp_path / "firmware"),
        ota_worker=ota_worker,
    )
    compile_job = db.create_job(
        {
            "mac": "AA:BB:CC:DD:EE:FF",
            "status": models.COMPILING,
            "esphome_name": "remote",
            "firmware_name": "remote.ota.bin",
            "auto_flash": 1,
        }
    )

    await worker._process(compile_job)

    completed_compile = db.get_job(compile_job["id"])
    flash_jobs = db.queued_jobs()
    assert completed_compile is not None
    assert completed_compile["status"] == models.COMPILE_SUCCESS
    assert len(flash_jobs) == 1
    assert flash_jobs[0]["mac"] == "AA:BB:CC:DD:EE:FF"
    assert flash_jobs[0]["firmware_path"]
    assert Path(flash_jobs[0]["firmware_path"]).exists()
