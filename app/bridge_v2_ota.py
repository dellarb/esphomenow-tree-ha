from __future__ import annotations

import asyncio
import logging
import zlib
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from .protobuf.generated import esp_tree_runtime_pb2 as pb

logger = logging.getLogger(__name__)

ChunkRequestHandler = Callable[[pb.OtaChunkRequest], Awaitable[None]]
StatusHandler = Callable[[pb.OtaStatus], Awaitable[None]]
AbortHandler = Callable[[pb.OtaAborted], Awaitable[None]]


class BridgeV2OTAClient:
    def __init__(self, v2_client: Any) -> None:
        self._client = v2_client
        self.job_id: str | None = None
        self.max_chunk_size = 2048
        self.total_chunks = 0
        self.max_chunks_per_batch = 6
        self._chunk_request_handler: ChunkRequestHandler | None = None
        self._status_handler: StatusHandler | None = None
        self._abort_handler: AbortHandler | None = None
        self._buffered_requests: list[pb.OtaChunkRequest] = []
        self._ready = False

    def set_handlers(
        self,
        *,
        on_chunk_request: ChunkRequestHandler | None = None,
        on_status: StatusHandler | None = None,
        on_abort: AbortHandler | None = None,
    ) -> None:
        self._chunk_request_handler = on_chunk_request
        self._status_handler = on_status
        self._abort_handler = on_abort
        if hasattr(self._client, "set_ota_event_handlers"):
            self._client.set_ota_event_handlers(
                chunk_request=self._handle_chunk_request if on_chunk_request else None,
                status=on_status,
                aborted=on_abort,
            )

    async def _handle_chunk_request(self, request: pb.OtaChunkRequest) -> None:
        if not self._ready:
            self._buffered_requests.append(request)
            return
        if self._chunk_request_handler is not None:
            await self._chunk_request_handler(request)

    def close(self) -> None:
        if hasattr(self._client, "set_ota_event_handlers"):
            self._client.set_ota_event_handlers()

    async def start(
        self,
        target_mac: str,
        file_size: int,
        md5: str,
        sha256: str = "",
        filename: str = "",
        preferred_chunk_size: int = 0,
    ) -> pb.OtaAccepted:
        accepted = await self._client.ota_start(
            target_mac=target_mac,
            file_size=file_size,
            md5=md5,
            sha256=sha256,
            filename=filename,
            preferred_chunk_size=preferred_chunk_size,
        )
        self.job_id = accepted.job_id
        self.max_chunk_size = int(accepted.max_chunk_size or self.max_chunk_size)
        self.total_chunks = int(accepted.total_chunks or self.total_chunks)
        self.max_chunks_per_batch = int(accepted.max_chunks_per_batch or self.max_chunks_per_batch)
        self._ready = True
        buffered = list(self._buffered_requests)
        self._buffered_requests.clear()
        for req in buffered:
            if self._chunk_request_handler is not None:
                await self._chunk_request_handler(req)
        return accepted

    async def abort(self, job_id: str | None = None, reason: str = "user") -> pb.OtaAborted:
        return await self._client.ota_abort(job_id or self.job_id or "", reason)

    async def send_chunks(self, response_request_id: str, sequences: list[int], file_path: Path) -> None:
        if not self.job_id:
            logger.warning("send_chunks called before job_id was set, deferring to bridge retry")
            return
        batch_size = max(1, int(self.max_chunks_per_batch or 1))
        for start in range(0, len(sequences), batch_size):
            batch_sequences = sequences[start : start + batch_size]
            chunks = [self._build_chunk(file_path, int(seq)) for seq in batch_sequences]
            await self._client.send_ota_chunk_batch(self.job_id, response_request_id, chunks)
            if start + batch_size < len(sequences):
                await asyncio.sleep(0.006)

    def _build_chunk(self, file_path: Path, sequence: int) -> pb.OtaChunk:
        offset = sequence * self.max_chunk_size
        with file_path.open("rb") as handle:
            handle.seek(offset)
            payload = handle.read(self.max_chunk_size)
        flags = 0x0001 if self.total_chunks and sequence == self.total_chunks - 1 else 0
        return pb.OtaChunk(
            sequence=sequence,
            offset=offset,
            payload=payload,
            flags=flags,
            crc32=zlib.crc32(payload) & 0xFFFFFFFF,
        )
