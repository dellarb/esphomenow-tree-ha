from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from .bridge_ws_client import BridgeWsClient
from .ota_chunks import encode_chunk, read_chunk_from_file, MAX_WS_CHUNK_SIZE

logger = logging.getLogger(__name__)


class BridgeWsOTAClient:
    def __init__(
        self,
        ws_client: BridgeWsClient,
        poll_interval: float = 0.25,
        transfer_timeout: float = 300.0,
    ) -> None:
        self._ws = ws_client
        self._poll_interval = poll_interval
        self._transfer_timeout = transfer_timeout
        self._job_id: str | None = None
        self._max_chunk_size: int = MAX_WS_CHUNK_SIZE
        self._requested: set[int] = set()
        self._delivered: set[int] = set()
        self._total_chunks: int = 0
        self._job_mac: str = ""
        self._job_size: int = 0

    @property
    def job_id(self) -> str | None:
        return self._job_id

    @property
    def max_chunk_size(self) -> int:
        return self._max_chunk_size

    @property
    def requested(self) -> set[int]:
        return self._requested

    @property
    def total_chunks(self) -> int:
        return self._total_chunks

    @property
    def target_mac(self) -> str:
        return self._job_mac

    @property
    def file_size(self) -> int:
        return self._job_size

    async def start(
        self,
        target_mac: str,
        file_size: int,
        md5_hex: str,
        sha256_hex: str,
        filename: str,
        preferred_chunk_size: int = MAX_WS_CHUNK_SIZE,
    ) -> dict[str, Any]:
        logger.info(
            "ws_ota start: target=%s size=%d md5=%s",
            target_mac,
            file_size,
            md5_hex[:8],
        )
        result = await self._ws.ota_start(
            target_mac=target_mac,
            size=file_size,
            md5=md5_hex,
            sha256=sha256_hex,
            filename=filename,
            preferred_chunk_size=preferred_chunk_size,
        )
        self._job_id = result.get("job_id", "")
        self._max_chunk_size = result.get("chunk_size", MAX_WS_CHUNK_SIZE)
        self._requested = {int(s) for s in result.get("requested", [])}
        self._delivered = set()
        self._job_mac = target_mac
        self._job_size = file_size
        bridge_total = int(result.get("total_chunks", 0))
        self._total_chunks = bridge_total if bridge_total > 0 else (file_size + self._max_chunk_size - 1) // self._max_chunk_size

        logger.info(
            "ws_ota accepted: job_id=%s max_chunk=%d requested=%d total_chunks=%d",
            self._job_id,
            self._max_chunk_size,
            len(self._requested),
            self._total_chunks,
        )
        return result

    async def send_all_chunks(self, path: Path) -> None:
        if not self._job_id:
            raise RuntimeError("OTA not started — call start() first")

        with path.open("rb") as fp:
            while len(self._delivered) < self._total_chunks:
                status = await self.poll_status()
                state = str(status.get("state", "")).lower()

                if state in ("success", "failed", "aborted"):
                    logger.info("ws_ota terminal state reached: %s", state)
                    return

                pending = sorted(self._requested - self._delivered)
                for seq in pending:
                    chunk = read_chunk_from_file(fp, seq, self._max_chunk_size)
                    job_id_int = int(self._job_id, 16) if self._job_id else 0
                    is_final = seq == self._total_chunks - 1

                    frame = encode_chunk(
                        job_id=job_id_int,
                        sequence=seq,
                        payload=chunk,
                        max_chunk_size=self._max_chunk_size,
                        is_final=is_final,
                    )
                    await self._ws.send_binary_frame(frame)
                    self._delivered.add(seq)
                    logger.debug(
                        "ws_ota sent chunk seq=%d/%d final=%s",
                        seq,
                        self._total_chunks - 1,
                        is_final,
                    )

                if not pending and len(self._delivered) < self._total_chunks:
                    logger.warning("ws_ota: no pending sequences but %d/%d delivered, waiting", len(self._delivered), self._total_chunks)

                await asyncio.sleep(self._poll_interval)

        logger.info("ws_ota all chunks sent")

    async def poll_status(self) -> dict[str, Any]:
        result = await self._ws.ota_status()
        requested_raw = result.get("requested", [])
        self._requested = {int(s) for s in requested_raw}
        bridge_chunk_size = int(result.get("chunk_size", 0))
        if bridge_chunk_size > 0 and bridge_chunk_size != self._max_chunk_size:
            self._max_chunk_size = bridge_chunk_size
        bridge_total = int(result.get("total_chunks", 0))
        if bridge_total > 0:
            self._total_chunks = bridge_total
        return result

    async def abort(self, reason: str = "user") -> None:
        if not self._job_id:
            return
        try:
            await self._ws.ota_abort(self._job_id, reason)
        except Exception as exc:
            logger.warning("ws_ota abort failed: %s", exc)
        finally:
            self._job_id = None
