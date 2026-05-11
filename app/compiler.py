from __future__ import annotations

import asyncio
import json
import os
import shutil
import signal
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncGenerator

from .bin_parser import parse_firmware
from .compile_store import CompileStore


@dataclass
class CompileResult:
    success: bool
    esphome_name: str
    ota_bin_path: str | None = None
    factory_bin_path: str | None = None
    firmware_info: Any = None
    error: str | None = None
    build_log: str = ""


@dataclass
class FlashResult:
    success: bool
    esphome_name: str
    port: str
    error: str | None = None
    build_log: str = ""
    flashed_bytes: int | None = None


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
        self._active_procs: dict[str, asyncio.subprocess.Process] = {}
        self._secrets_paths: dict[str, Path] = {}
        self._serial_proc: asyncio.subprocess.Process | None = None
        self._serial_esphome_name: str | None = None
        self._serial_lock = asyncio.Lock()
        self._serial_reserved = False

    def _esphome_bin(self) -> str:
        candidates = [Path("/opt/esp-tree/venv/bin/esphome")]
        override = os.environ.get("ESP_TREE_ESPHOME_BIN", "").strip()
        if override:
            candidates.append(Path(override))
        for candidate in candidates:
            if candidate and candidate.exists():
                return str(candidate)
        return "esphome"

    def _esptool_bin(self) -> str:
        candidates = [Path("/opt/esp-tree/venv/bin/esptool"), Path("/opt/esp-tree/venv/bin/esptool.py")]
        override = os.environ.get("ESP_TREE_ESPTOOL_BIN", "").strip()
        if override:
            candidates.insert(0, Path(override))
        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
        return "esptool"

    def _compile_env(self) -> dict[str, str]:
        env = dict(os.environ)
        env["PLATFORMIO_CORE_DIR"] = str(self.platformio_cache)
        env["GIT_PYTHON_GIT_EXECUTABLE"] = "/usr/bin/git"
        env.pop("ESPHOME_IS_HA_ADDON", None)
        env.pop("ESPHOME_DATA_DIR", None)
        return env

    def _artifact_dir(self, esphome_name: str) -> Path:
        return self.devices_root / esphome_name / ".esphome" / "build" / esphome_name / ".pioenvs" / esphome_name

    def _serial_log_path(self, esphome_name: str) -> Path:
        return self.devices_root / esphome_name / "serial_flash.log"

    def _serial_status_path(self, esphome_name: str) -> Path:
        return self.devices_root / esphome_name / "serial_flash_status.json"

    def _find_artifact(self, esphome_name: str, filename: str, suffix: str) -> Path | None:
        expected = self._artifact_dir(esphome_name) / filename
        if expected.exists():
            return expected
        build_root = self.devices_root / esphome_name / ".esphome" / "build" / esphome_name
        if not build_root.exists():
            return None
        for path in sorted(build_root.rglob(f"*{suffix}")):
            if path.is_file():
                return path
        return None

    async def compile(self, esphome_name: str) -> CompileResult:
        yaml_path = self.devices_root / esphome_name / f"{esphome_name}.yaml"
        if not yaml_path.exists():
            error = f"YAML config not found: {yaml_path}"
            self.compile_store.set_status(esphome_name, "failed", error=error)
            return CompileResult(success=False, esphome_name=esphome_name, error=error)

        self.platformio_cache.mkdir(parents=True, exist_ok=True)
        log_path = self.compile_store._log_path(esphome_name)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("", encoding="utf-8")
        lines: list[str] = []

        secrets_src = self.devices_root / "secrets.yaml"
        secrets_dst = self.devices_root / esphome_name / "secrets.yaml"

        try:
            if secrets_src.exists():
                shutil.copy2(secrets_src, secrets_dst)
                self._secrets_paths[esphome_name] = secrets_dst

            proc = await asyncio.create_subprocess_exec(
                self._esphome_bin(),
                "compile",
                str(yaml_path),
                env=self._compile_env(),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,
            )
            self._active_procs[esphome_name] = proc

            assert proc.stdout is not None
            with log_path.open("a", encoding="utf-8") as log_file:
                while True:
                    raw = await proc.stdout.readline()
                    if not raw:
                        break
                    decoded = raw.decode("utf-8", errors="replace")
                    lines.append(decoded)
                    log_file.write(decoded)
                    log_file.flush()

            await proc.wait()
            exit_code = proc.returncode
            build_log = "".join(lines)
            if exit_code != 0:
                error = f"ESPHome compile failed with exit code {exit_code}"
                self.compile_store.set_status(esphome_name, "failed", error=error)
                self.compile_store.save_error_log(esphome_name, build_log)
                return CompileResult(success=False, esphome_name=esphome_name, error=error, build_log=build_log)

            ota_bin = self._find_artifact(esphome_name, "firmware.ota.bin", ".ota.bin")
            factory_bin = self._find_artifact(esphome_name, "firmware.factory.bin", ".factory.bin")
            if ota_bin is None:
                build_root = self.devices_root / esphome_name / ".esphome" / "build" / esphome_name
                error = f"ESPHome compile succeeded but no OTA binary was found under {build_root}"
                self.compile_store.set_status(esphome_name, "failed", error=error)
                self.compile_store.save_error_log(esphome_name, build_log)
                return CompileResult(success=False, esphome_name=esphome_name, error=error, build_log=build_log)

            firmware_info = None
            try:
                firmware_info = parse_firmware(ota_bin)
            except Exception as exc:
                lines.append(f"\nFirmware metadata parse failed: {exc}\n")
                build_log = "".join(lines)
                self.compile_store.save_log(esphome_name, build_log)

            self.compile_store.set_status(esphome_name, "success")
            return CompileResult(
                success=True,
                esphome_name=esphome_name,
                ota_bin_path=str(ota_bin),
                factory_bin_path=str(factory_bin) if factory_bin else None,
                firmware_info=firmware_info,
                build_log=build_log,
            )
        except FileNotFoundError as exc:
            error = f"ESPHome executable not found: {exc.filename or self._esphome_bin()}"
            self.compile_store.set_status(esphome_name, "failed", error=error)
            return CompileResult(success=False, esphome_name=esphome_name, error=error, build_log="".join(lines))
        except Exception as exc:
            error = str(exc)
            self.compile_store.set_status(esphome_name, "failed", error=error)
            self.compile_store.save_error_log(esphome_name, "".join(lines))
            return CompileResult(success=False, esphome_name=esphome_name, error=error, build_log="".join(lines))
        finally:
            self._active_procs.pop(esphome_name, None)
            secrets_path = self._secrets_paths.pop(esphome_name, secrets_dst)
            try:
                if secrets_path.exists():
                    secrets_path.unlink()
            except OSError:
                pass

    async def stream_logs(self, esphome_name: str) -> AsyncGenerator[str, None]:
        status = self.compile_store.get_status(esphome_name)
        status_str = str(status.get("status", "idle"))
        yield f"event: status\ndata: {status_str}\n\n"

        log_path = self.compile_store._log_path(esphome_name)
        position = 0
        if log_path.exists():
            content = log_path.read_text(encoding="utf-8", errors="replace")
            position = len(content.encode("utf-8"))
            for line in content.splitlines():
                yield f"data: {line}\n\n"

        while esphome_name in self._active_procs:
            await asyncio.sleep(0.5)
            if not log_path.exists():
                continue
            with log_path.open("rb") as handle:
                handle.seek(position)
                chunk = handle.read()
                position = handle.tell()
            if not chunk:
                continue
            for line in chunk.decode("utf-8", errors="replace").splitlines():
                yield f"data: {line}\n\n"

        final_status = self.compile_store.get_status(esphome_name).get("status", "idle")
        yield f"event: status\ndata: {final_status}\n\n"

    async def cancel_compile(self, esphome_name: str) -> bool:
        proc = self._active_procs.get(esphome_name)
        if proc is None:
            return False
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            try:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except (ProcessLookupError, OSError):
                pass
            await proc.wait()
        secrets_dst = self.devices_root / esphome_name / "secrets.yaml"
        try:
            if secrets_dst.exists():
                secrets_dst.unlink()
        except OSError:
            pass
        self.compile_store.set_status(esphome_name, "failed", error="cancelled by user")
        return True

    def serial_flash_active(self) -> bool:
        return self._serial_reserved or self._serial_lock.locked() or self._serial_proc is not None

    def reserve_serial_flash(self) -> bool:
        if self.serial_flash_active():
            return False
        self._serial_reserved = True
        return True

    def serial_flash_status(self, esphome_name: str) -> dict[str, Any]:
        path = self._serial_status_path(esphome_name)
        if not path.exists():
            return {"status": "idle", "esphome_name": esphome_name, "port": None, "error": None}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"status": "idle", "esphome_name": esphome_name, "port": None, "error": None}

    def _set_serial_status(self, esphome_name: str, status: str, **kwargs: Any) -> None:
        path = self._serial_status_path(esphome_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"status": status, "esphome_name": esphome_name, **kwargs}), encoding="utf-8")

    async def stream_serial_logs(self, esphome_name: str) -> AsyncGenerator[str, None]:
        status = self.serial_flash_status(esphome_name).get("status", "idle")
        yield f"event: status\ndata: {status}\n\n"
        log_path = self._serial_log_path(esphome_name)
        position = 0
        if log_path.exists():
            content = log_path.read_text(encoding="utf-8", errors="replace")
            position = len(content.encode("utf-8"))
            for line in content.splitlines():
                yield f"data: {line}\n\n"

        while True:
            current_status = str(self.serial_flash_status(esphome_name).get("status", "idle"))
            active = (
                self._serial_esphome_name == esphome_name
                and self._serial_proc is not None
            ) or current_status in {"starting", "flashing"}
            if not active:
                break
            await asyncio.sleep(0.5)
            if not log_path.exists():
                continue
            with log_path.open("rb") as handle:
                handle.seek(position)
                chunk = handle.read()
                position = handle.tell()
            if not chunk:
                continue
            for line in chunk.decode("utf-8", errors="replace").splitlines():
                yield f"data: {line}\n\n"

        final_status = self.serial_flash_status(esphome_name).get("status", "idle")
        yield f"event: status\ndata: {final_status}\n\n"

    async def cancel_serial_flash(self) -> bool:
        proc = self._serial_proc
        esphome_name = self._serial_esphome_name
        if proc is None or esphome_name is None:
            return False
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            try:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except (ProcessLookupError, OSError):
                pass
            await proc.wait()
        self._set_serial_status(esphome_name, "failed", port=None, error="cancelled by user")
        return True

    def clean_artifacts(self) -> tuple[int, int]:
        platformio_bytes = _rmtree_size(self.platformio_cache)
        self.platformio_cache.mkdir(parents=True, exist_ok=True)

        esphome_bytes = 0
        if self.devices_root.exists():
            for entry in self.devices_root.iterdir():
                esphome_dir = entry / ".esphome"
                if entry.is_dir() and esphome_dir.exists():
                    esphome_bytes += _rmtree_size(esphome_dir)

        return platformio_bytes, esphome_bytes

    def cleanup_stale(self) -> None:
        if not self.devices_root.exists():
            return
        for entry in self.devices_root.iterdir():
            if not entry.is_dir():
                continue
            status_path = entry / "compile_status.json"
            if status_path.exists():
                try:
                    data = json.loads(status_path.read_text(encoding="utf-8"))
                    if data.get("status") in {"compiling", "pulling_image"}:
                        status_path.unlink()
                except (OSError, json.JSONDecodeError):
                    pass
            secrets_file = entry / "secrets.yaml"
            if secrets_file.exists():
                try:
                    secrets_file.unlink()
                except OSError:
                    pass

    async def flash_serial(self, esphome_name: str, port: str) -> FlashResult:
        if self._serial_lock.locked():
            return FlashResult(success=False, esphome_name=esphome_name, port=port, error="another serial flash is already running")

        async with self._serial_lock:
            self._serial_reserved = False
            factory_path = self.devices_root / esphome_name / f"{esphome_name}.factory.bin"
            log_path = self._serial_log_path(esphome_name)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text("", encoding="utf-8")
            lines: list[str] = []

            if not factory_path.exists():
                error = f"Factory binary not found: {factory_path}"
                self._set_serial_status(esphome_name, "failed", port=port, error=error)
                return FlashResult(success=False, esphome_name=esphome_name, port=port, error=error)

            self._set_serial_status(esphome_name, "flashing", port=port, error=None)
            try:
                proc = await asyncio.create_subprocess_exec(
                    self._esptool_bin(),
                    "--chip",
                    "auto",
                    "--port",
                    port,
                    "--baud",
                    "460800",
                    "write_flash",
                    "0x0",
                    str(factory_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    start_new_session=True,
                )
                self._serial_proc = proc
                self._serial_esphome_name = esphome_name

                assert proc.stdout is not None
                with log_path.open("a", encoding="utf-8") as log_file:
                    while True:
                        raw = await proc.stdout.readline()
                        if not raw:
                            break
                        decoded = raw.decode("utf-8", errors="replace")
                        lines.append(decoded)
                        log_file.write(decoded)
                        log_file.flush()

                await proc.wait()
                build_log = "".join(lines)
                if proc.returncode == 0:
                    flashed_bytes = factory_path.stat().st_size
                    self._set_serial_status(esphome_name, "success", port=port, error=None, flashed_bytes=flashed_bytes)
                    return FlashResult(True, esphome_name, port, build_log=build_log, flashed_bytes=flashed_bytes)
                error = f"Serial flash failed with exit code {proc.returncode}"
                self._set_serial_status(esphome_name, "failed", port=port, error=error)
                return FlashResult(False, esphome_name, port, error=error, build_log=build_log)
            except FileNotFoundError as exc:
                error = f"esptool executable not found: {exc.filename or self._esptool_bin()}"
                self._set_serial_status(esphome_name, "failed", port=port, error=error)
                return FlashResult(False, esphome_name, port, error=error, build_log="".join(lines))
            except Exception as exc:
                error = str(exc)
                self._set_serial_status(esphome_name, "failed", port=port, error=error)
                return FlashResult(False, esphome_name, port, error=error, build_log="".join(lines))
            finally:
                self._serial_proc = None
                self._serial_esphome_name = None
                self._serial_reserved = False


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
