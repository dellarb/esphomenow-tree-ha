from __future__ import annotations

from pathlib import Path

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


def test_manager_returns_connected_bridge_placeholder_before_snapshot() -> None:
    from app.bridge_v2_client import BridgeV2Manager
    from app.models import BridgeTarget

    manager = BridgeV2Manager(db=None)

    class FakeClient:
        connected = True
        bridge_mac = "11:22:33:44:55:66"
        target = BridgeTarget(host="10.1.1.145", name="Bridge C5")

    manager._clients["bridge-1"] = FakeClient()

    nodes = manager.get_topology_list()

    assert len(nodes) == 1
    assert nodes[0]["mac"] == "11:22:33:44:55:66"
    assert nodes[0]["is_bridge"] is True
    assert nodes[0]["snapshot_pending"] is True
