from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import Any, AsyncGenerator

from .bin_parser import parse_firmware
from .compile_store import CompileStore


class CompileResult:
    def __init__(
        self,
        success: bool,
        esphome_name: str,
        ota_bin_path: str | None = None,
        factory_bin_path: str | None = None,
        firmware_info: Any = None,
        error: str | None = None,
        build_log: str = "",
    ) -> None:
        self.success = success
        self.esphome_name = esphome_name
        self.ota_bin_path = ota_bin_path
        self.factory_bin_path = factory_bin_path
        self.firmware_info = firmware_info
        self.error = error
        self.build_log = build_log


class ESPHomeCompiler:
    def __init__(
        self,
        compile_store: CompileStore,
        devices_root: Path,
        components_root: Path,
        platformio_cache: Path,
    ) -> None:
        self.compile_store = compile_store
        self.devices_root = devices_root
        self.components_root = components_root
        self.platformio_cache = platformio_cache

    async def compile(self, esphome_name: str) -> CompileResult:
        self.compile_store.set_status(esphome_name, "failed", error="Native compilation is not yet implemented. This add-on has been built without Docker-based ESPHome compilation support.")
        return CompileResult(
            success=False,
            esphome_name=esphome_name,
            error="Native compilation is not yet implemented. This add-on has been built without Docker-based ESPHome compilation support.",
        )

    async def stream_logs(self, esphome_name: str) -> AsyncGenerator[str, None]:
        status = self.compile_store.get_status(esphome_name)
        status_str = status.get("status", "idle")
        yield f"event: status\ndata: {status_str}\n\n"
        yield "data: Native compilation is not yet implemented. This build does not include ESPHome compilation support.\n\n"
        yield "event: status\ndata: failed\n\n"

    async def cancel_compile(self, esphome_name: str) -> bool:
        return False

    def clean_artifacts(self) -> tuple[int, int]:
        platformio_bytes = _rmtree_size(self.platformio_cache)
        self.platformio_cache.mkdir(parents=True, exist_ok=True)

        esphome_cache = self.devices_root / ".esphome"
        esphome_bytes = _rmtree_size(esphome_cache)

        return platformio_bytes, esphome_bytes


def _rmtree_size(path: Path) -> int:
    size = 0
    if path.exists():
        for entry in path.rglob("*"):
            if entry.is_file():
                try:
                    size += entry.stat().st_size
                except OSError:
                    pass
        shutil.rmtree(path, ignore_errors=True)
    return size
