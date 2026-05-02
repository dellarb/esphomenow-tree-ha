from __future__ import annotations

import asyncio
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator

import docker
from docker.errors import DockerException, ImageNotFound, NotFound

from .bin_parser import parse_firmware
from .compile_store import CompileStore


CONTAINER_NAME = "esphome-espnow-tree-compiler"
ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def strip_ansi(text: str) -> str:
    return ANSI_ESCAPE_RE.sub("", text)


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
        tag: str = "latest",
        pull_timeout: int = 300,
        docker_socket: str | None = None,
    ) -> None:
        self.compile_store = compile_store
        self.devices_root = devices_root
        self.components_root = components_root
        self.platformio_cache = platformio_cache
        self.tag = tag
        self.pull_timeout = pull_timeout
        self._docker_client: docker.DockerClient | None = None
        self._docker_socket = docker_socket
        self._pull_lock = asyncio.Lock()

    @property
    def image_name(self) -> str:
        return f"ghcr.io/esphome/esphome:{self.tag}"

    SOCKET_CANDIDATES = [
        "/var/run/docker.sock",
        "/run/docker.sock",
        "/etc/docker.sock",
        "/docker.sock",
        "/host_var_run/docker.sock",
        "/host/run/docker.sock",
    ]

    def _get_client(self) -> docker.DockerClient:
        if self._docker_client is not None:
            return self._docker_client
        if self._docker_socket and os.path.exists(self._docker_socket):
            os.environ.setdefault("DOCKER_HOST", f"unix://{self._docker_socket}")
        elif "DOCKER_HOST" not in os.environ:
            for sock in self.SOCKET_CANDIDATES:
                if os.path.exists(sock):
                    os.environ["DOCKER_HOST"] = f"unix://{sock}"
                    break
        try:
            self._docker_client = docker.from_env()
            return self._docker_client
        except DockerException as exc:
            raise DockerException(
                f"Cannot connect to Docker daemon. "
                f"Ensure the add-on has Docker access enabled (docker_api: true in config) "
                f"and /var/run/docker.sock is available inside the container. "
                f"Original error: {exc}"
            ) from exc

    def check_docker(self) -> dict[str, Any]:
        socket_found = False
        socket_path = ""
        candidates = self.SOCKET_CANDIDATES[:]
        if self._docker_socket and self._docker_socket not in candidates:
            candidates.insert(0, self._docker_socket)
        for sock in candidates:
            if os.path.exists(sock):
                socket_found = True
                socket_path = sock
                break

        connected = False
        error = None
        if socket_found:
            try:
                client = self._get_client()
                client.ping()
                connected = True
            except Exception as exc:
                error = str(exc)
        else:
            error = "Docker socket not found. Searched: " + ", ".join(candidates)

        return {
            "socket_found": socket_found,
            "socket_path": socket_path,
            "connected": connected,
            "error": error,
        }

    def debug_docker(self) -> dict[str, Any]:
        docker_host_env = os.environ.get("DOCKER_HOST", "")
        candidates = self.SOCKET_CANDIDATES[:]
        if self._docker_socket and self._docker_socket not in candidates:
            candidates.insert(0, self._docker_socket)

        socket_probes = {}
        for sock in candidates:
            try:
                socket_probes[sock] = {
                    "exists": os.path.exists(sock),
                    "is_socket": os.path.exists(sock) and os.path.isdir(sock) is False,
                }
            except OSError:
                socket_probes[sock] = {"exists": False, "is_socket": False}

        check = self.check_docker()

        container_info = {}
        try:
            with open("/proc/1/cgroup", "r") as f:
                container_info["cgroup"] = f.read(512).strip()
        except Exception:
            container_info["cgroup"] = "unreadable"

        try:
            with open("/proc/self/mountinfo", "r") as f:
                mounts = f.readlines()
            docker_mounts = [m.strip() for m in mounts if "docker" in m.lower()]
            container_info["docker_mounts"] = docker_mounts[:10] or ["none found"]
        except Exception:
            container_info["docker_mounts"] = ["unreadable"]

        image_info = {}
        if check["connected"]:
            try:
                client = self._get_client()
                img = client.images.get(self.image_name)
                image_info = {
                    "id": img.short_id if img else None,
                    "tags": img.tags if img else [],
                }
            except ImageNotFound:
                image_info = {"status": "not_pulled"}
            except Exception as exc:
                image_info = {"error": str(exc)}

        return {
            "docker_host_env": docker_host_env,
            "configured_socket": self._docker_socket or "",
            "socket_probes": socket_probes,
            "connected": check["connected"],
            "socket_found": check["socket_found"],
            "socket_path": check["socket_path"],
            "error": check["error"],
            "container": container_info,
            "image": image_info,
        }

    def cleanup_stale(self) -> None:
        try:
            client = self._get_client()
        except DockerException:
            return
        try:
            stale = client.containers.get(CONTAINER_NAME)
            stale.remove(force=True)
        except NotFound:
            pass
        except Exception:
            pass

    def ensure_image(self) -> bool:
        try:
            client = self._get_client()
        except DockerException:
            return False
        try:
            client.images.get(self.image_name)
            return True
        except ImageNotFound:
            pass
        return False

    async def pull_image(self) -> AsyncGenerator[str, None]:
        async with self._pull_lock:
            client = self._get_client()
            try:
                client.images.get(self.image_name)
                yield "ESPHome image already present\n"
                return
            except ImageNotFound:
                pass

            yield f"Pulling {self.image_name} (this may take a few minutes on first run)...\n"
            try:
                for line in client.api.pull(
                    self.image_name,
                    stream=True,
                    decode=True,
                ):
                    status = line.get("status", "")
                    progress = line.get("progress", "")
                    if status and progress:
                        yield f"  {status}: {progress}\n"
                    elif status:
                        yield f"  {status}\n"
            except DockerException as exc:
                yield f"ERROR: Docker pull failed: {exc}\n"
                raise

    async def compile(self, esphome_name: str) -> CompileResult:
        self.compile_store.set_status(esphome_name, "compiling")
        log_lines: list[str] = []

        try:
            client = self._get_client()

            if not self.ensure_image():
                self.compile_store.set_status(esphome_name, "pulling_image")
                async for line in self.pull_image():
                    log_lines.append(line)
                self.compile_store.set_status(esphome_name, "compiling")

            self.compile_store.set_status(
                esphome_name,
                "compiling",
                container=CONTAINER_NAME,
            )

            container = client.containers.run(
                image=self.image_name,
                name=CONTAINER_NAME,
                volumes={
                    str(self.devices_root): {"bind": "/config", "mode": "rw"},
                    str(self.components_root): {"bind": "/external/components", "mode": "ro"},
                    str(self.platformio_cache): {"bind": "/root/.platformio", "mode": "rw"},
                },
                command=f"esphome compile {esphome_name}.yaml",
                working_dir="/config",
                detach=True,
                remove=True,
                stdout=True,
                stderr=True,
            )

            result = await asyncio.wait_for(
                asyncio.to_thread(container.wait),
                timeout=self.pull_timeout,
            )
            exit_code = result["StatusCode"]

            raw_logs = container.logs(
                stdout=True,
                stderr=True,
            ).decode("utf-8", errors="replace")

            clean_logs = strip_ansi(raw_logs)
            log_lines.append(clean_logs)
            full_log = "".join(log_lines)

            self.compile_store.save_log(esphome_name, full_log)

            if exit_code != 0:
                self.compile_store.save_error_log(esphome_name, full_log)
                self.compile_store.set_status(
                    esphome_name,
                    "failed",
                    error="compilation failed",
                    exit_code=exit_code,
                )
                return CompileResult(
                    success=False,
                    esphome_name=esphome_name,
                    error="compilation failed",
                    build_log=full_log,
                )

            build_dir = self.devices_root / esphome_name / ".esphome" / "build" / esphome_name / ".pioenvs" / esphome_name

            ota_src = build_dir / "firmware.ota.bin"
            factory_src = build_dir / "firmware.factory.bin"

            device_dir = self.devices_root / esphome_name
            device_dir.mkdir(parents=True, exist_ok=True)

            ota_dst = device_dir / f"{esphome_name}.ota.bin"
            factory_dst = device_dir / f"{esphome_name}.factory.bin"

            ota_exists = ota_src.exists()
            factory_exists = factory_src.exists()

            if ota_exists:
                shutil.copy2(str(ota_src), str(ota_dst))
            if factory_exists:
                shutil.copy2(str(factory_src), str(factory_dst))

            if not ota_exists:
                self.compile_store.set_status(
                    esphome_name,
                    "failed",
                    error="OTA binary not found after compilation",
                )
                return CompileResult(
                    success=False,
                    esphome_name=esphome_name,
                    error="OTA binary not found after compilation",
                    build_log=full_log,
                )

            firmware_info = parse_firmware(ota_dst)

            self.compile_store.set_status(
                esphome_name,
                "success",
                ota_bin_path=str(ota_dst),
                factory_bin_path=str(factory_dst) if factory_exists else None,
                firmware_info=firmware_info.as_dict(),
            )

            return CompileResult(
                success=True,
                esphome_name=esphome_name,
                ota_bin_path=str(ota_dst),
                factory_bin_path=str(factory_dst) if factory_exists else None,
                firmware_info=firmware_info,
                build_log=full_log,
            )

        except DockerException as exc:
            error_msg = str(exc)
            self.compile_store.save_error_log(esphome_name, "\n".join(log_lines) + f"\nDocker error: {error_msg}")
            self.compile_store.set_status(esphome_name, "failed", error=error_msg)
            return CompileResult(
                success=False,
                esphome_name=esphome_name,
                error=error_msg,
                build_log="".join(log_lines),
            )
        except asyncio.TimeoutError:
            error_msg = f"Compile timed out after {self.pull_timeout}s. Check internet connectivity and Docker availability."
            self.compile_store.save_error_log(esphome_name, "\n".join(log_lines) + f"\n{error_msg}")
            self.cleanup_stale()
            self.compile_store.set_status(esphome_name, "failed", error=error_msg)
            return CompileResult(
                success=False,
                esphome_name=esphome_name,
                error=error_msg,
                build_log="".join(log_lines),
            )
        except Exception as exc:
            error_msg = str(exc)
            self.compile_store.save_error_log(esphome_name, "\n".join(log_lines) + f"\nError: {error_msg}")
            self.compile_store.set_status(esphome_name, "failed", error=error_msg)
            return CompileResult(
                success=False,
                esphome_name=esphome_name,
                error=error_msg,
                build_log="".join(log_lines),
            )

    async def stream_logs(self, esphome_name: str) -> AsyncGenerator[str, None]:
        status = self.compile_store.get_status(esphome_name)
        status_str = status.get("status", "idle")

        yield f"event: status\ndata: {status_str}\n\n"

        if status_str in {"pulling_image", "compiling"}:
            try:
                client = self._get_client()
            except DockerException as exc:
                yield f"data: Docker unavailable: {exc}\n\n"
                yield "event: status\ndata: failed\n\n"
                return
            try:
                container = client.containers.get(CONTAINER_NAME)
                for line in container.logs(
                    stdout=True,
                    stderr=True,
                    stream=True,
                    follow=True,
                ):
                    decoded = line.decode("utf-8", errors="replace") if isinstance(line, bytes) else str(line)
                    clean = strip_ansi(decoded).rstrip("\n")
                    if clean.strip():
                        yield f"data: {clean}\n\n"
                    await asyncio.sleep(0.01)

                exit_code = container.wait()["StatusCode"]
                final_status = self.compile_store.get_status(esphome_name)
                yield f"event: status\ndata: {final_status.get('status', 'idle')}\n\n"
                yield f"event: exit\ndata: {exit_code}\n\n"
            except NotFound:
                yield "data: Compile container not found — it may have already exited.\n\n"
                yield f"event: status\ndata: {self.compile_store.get_status(esphome_name).get('status', 'idle')}\n\n"
            except DockerException as exc:
                yield f"data: Docker error while streaming logs: {exc}\n\n"
                yield "event: status\ndata: failed\n\n"

        elif status_str == "success":
            yield "event: status\ndata: success\n\n"

        elif status_str == "failed":
            error_log = self.compile_store.get_error_log(esphome_name)
            if error_log:
                for line in error_log.split("\n"):
                    if line.strip():
                        yield f"data: {line}\n\n"

    async def cancel_compile(self, esphome_name: str) -> bool:
        try:
            client = self._get_client()
        except DockerException:
            self.compile_store.set_status(esphome_name, "idle")
            return False
        try:
            container = client.containers.get(CONTAINER_NAME)
            container.kill()
            self.compile_store.set_status(esphome_name, "failed", error="cancelled by user")
            return True
        except NotFound:
            self.compile_store.set_status(esphome_name, "idle")
            return False
        except DockerException:
            self.compile_store.set_status(esphome_name, "idle")
            return False

    def get_image_status(self) -> dict[str, Any]:
        docker_status = self.check_docker()
        available = False
        if docker_status["connected"]:
            available = self.ensure_image()
        return {
            "image": self.image_name,
            "available": available,
            "tag": self.tag,
            "docker": docker_status,
        }

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
