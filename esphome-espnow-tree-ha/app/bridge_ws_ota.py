from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Callable, Optional

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
        self._window_size: int = 4
        self._next_sequence: int = 0
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
    def window_size(self) -> int:
        return self._window_size

    @property
    def next_sequence(self) -> int:
        return self._next_sequence

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
        self._max_chunk_size = result.get("max_chunk_size", MAX_WS_CHUNK_SIZE)
        self._window_size = result.get("window_size", 4)
        self._next_sequence = result.get("next_sequence", 0)
        self._job_mac = target_mac
        self._job_size = file_size
        self._total_chunks = (file_size + self._max_chunk_size - 1) // self._max_chunk_size

        logger.info(
            "ws_ota accepted: job_id=%s max_chunk=%d window=%d total_chunks=%d",
            self._job_id,
            self._max_chunk_size,
            self._window_size,
            self._total_chunks,
        )
        return result

    async def send_all_chunks(self, path: Path) -> None:
        if not self._job_id:
            raise RuntimeError("OTA not started — call start() first")

        file_size = path.stat().st_size
        sent_sequence = -1

        with path.open("rb") as fp:
            while sent_sequence < self._total_chunks - 1:
                status = await self.poll_status()
                state = str(status.get("state", "")).lower()

                if state in ("success", "failed", "aborted"):
                    logger.info("ws_ota terminal state reached: %s", state)
                    return

                next_seq = int(status.get("next_sequence", 0))

                while sent_sequence < next_seq - 1 and sent_sequence < self._total_chunks - 1:
                    sent_sequence += 1
                    is_final = sent_sequence == self._total_chunks - 1

                    chunk = read_chunk_from_file(fp, sent_sequence, self._max_chunk_size)
                    job_id_int = int(self._job_id, 16) if self._job_id else 0

                    frame = encode_chunk(
                        job_id=job_id_int,
                        sequence=sent_sequence,
                        payload=chunk,
                        max_chunk_size=self._max_chunk_size,
                        is_final=is_final,
                    )
                    await self._ws.send_binary_frame(frame)
                    logger.debug(
                        "ws_ota sent chunk seq=%d/%d final=%s",
                        sent_sequence,
                        self._total_chunks - 1,
                        is_final,
                    )

                await asyncio.sleep(self._poll_interval)

        logger.info("ws_ota all chunks sent")

    async def poll_status(self) -> dict[str, Any]:
        result = await self._ws.ota_status()
        self._next_sequence = int(result.get("next_sequence", 0))
        bridge_chunk_size = int(result.get("max_chunk_size", 0))
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
