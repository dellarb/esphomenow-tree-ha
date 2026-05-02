from __future__ import annotations

import hashlib
import json
import mimetypes
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bridge_client import BridgeManager
from .compile_store import CompileStore
from .compiler import ESPHomeCompiler
from .config import Settings, load_settings
from .db import Database
from .firmware_store import FirmwareStore
from .ha_client import HomeAssistantClient
from .models import (
    ABORTED,
    ACTIVE_STATUSES,
    PENDING_CONFIRM,
    QUEUED,
    STARTING,
    TRANSFERRING,
    VERIFYING,
    find_node_by_mac,
    normalize_mac,
    now_ts,
)
from .ota_worker import OTAWorker
from .yaml_scaffold import generate_scaffold
from .yaml_store import YAMLStore


class BridgeConfigUpdate(BaseModel):
    bridge_host: str
    bridge_port: int = 80


def create_app() -> FastAPI:
    settings = load_settings()
    db = Database(settings.database_path)
    firmware_store = FirmwareStore(settings.firmware_dir, settings.firmware_retention_days)
    ha_client = HomeAssistantClient(settings.supervisor_token)
    bridge_manager = BridgeManager(settings, db, ha_client)
    ota_worker = OTAWorker(
        db=db,
        bridge_manager=bridge_manager,
        firmware_store=firmware_store,
        rejoin_timeout_s=settings.ota_rejoin_timeout_s,
        transfer_timeout_s=settings.ota_transfer_timeout_s,
    )

    app = FastAPI(title="ESPHome ESPNow Tree Add-on", version="0.1.19")
    app.state.settings = settings
    app.state.db = db
    app.state.firmware_store = firmware_store
    app.state.bridge_manager = bridge_manager
    app.state.ota_worker = ota_worker

    yaml_store = YAMLStore(settings.data_dir / "devices")
    compile_store = CompileStore(settings.data_dir / "devices")
    compiler = ESPHomeCompiler(
        compile_store=compile_store,
        devices_root=settings.data_dir / "devices",
        components_root=Path("/opt/espnow-tree/components"),
        platformio_cache=settings.data_dir / "platformio_cache",
        tag=settings.esphome_container_tag,
        pull_timeout=settings.pull_timeout,
    )
    app.state.yaml_store = yaml_store
    app.state.compile_store = compile_store
    app.state.compiler = compiler

    @app.on_event("startup")
    async def startup() -> None:
        db.init()
        firmware_store.init()
        firmware_store.cleanup_partials()
        compiler.cleanup_stale()
        ota_worker.start()

    @app.on_event("shutdown")
    async def shutdown() -> None:
        await ota_worker.stop()
        await bridge_manager.close()

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {"ok": True}

    @app.get("/api/config")
    async def config() -> dict[str, Any]:
        bridge_config = db.get_bridge_config()
        active_bridge = None
        try:
            target = await bridge_manager.resolve(validate=False)
            active_bridge = {"host": target.host, "port": target.port, "source": target.source}
        except Exception as exc:
            active_bridge = {"error": str(exc)}
        return {
            "bridge": bridge_config,
            "active_bridge": active_bridge,
            "firmware_retention_days": settings.firmware_retention_days,
            "ha_api_available": bool(settings.supervisor_token),
        }

    @app.put("/api/config/bridge")
    async def update_bridge_config(update: BridgeConfigUpdate) -> dict[str, Any]:
        host = update.bridge_host.strip()
        if not host:
            raise HTTPException(status_code=400, detail="bridge_host is required")
        target = db.set_bridge_config(host, update.bridge_port, auto_discovered=False, validated=False)
        try:
            await bridge_manager.validate(await bridge_manager.resolve(validate=False))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"bridge validation failed: {exc}") from exc
        return {"bridge": target}

    @app.delete("/api/config/bridge")
    async def clear_bridge_config() -> dict[str, Any]:
        return {"bridge": db.set_bridge_config(None, 80, auto_discovered=True, validated=False)}

    @app.get("/api/bridge/topology.json")
    async def topology() -> list[dict[str, Any]]:
        try:
            _, data = await bridge_manager.topology()
            return data
        except Exception as exc:
            cached = db.list_devices()
            if cached:
                return [{"mac": d["mac"], "label": d["label"], "esphome_name": d["esphome_name"], "online": False, "from_cache": True} for d in cached]
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.get("/api/bridge/ota/status")
    async def bridge_ota_status() -> dict[str, Any]:
        try:
            return await (await bridge_manager.client()).get_ota_status()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.post("/api/bridge/ota/abort")
    async def bridge_ota_abort() -> dict[str, Any]:
        try:
            return await (await bridge_manager.client()).abort_ota()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.get("/api/devices")
    async def devices() -> list[dict[str, Any]]:
        return db.list_devices()

    @app.get("/api/devices/{mac}")
    async def device(mac: str) -> dict[str, Any]:
        found = db.get_device(mac)
        if not found:
            raise HTTPException(status_code=404, detail="device not found")
        return found

    @app.post("/api/ota/upload")
    async def ota_upload(mac: str = Form(...), file: UploadFile = File(...)) -> dict[str, Any]:
        target_mac = normalize_mac(mac)
        if db.active_job_for_device(target_mac):
            raise HTTPException(status_code=409, detail="this device already has an active or pending OTA job")

        try:
            _, topo = await bridge_manager.topology()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"bridge health check failed: {exc}") from exc

        node = find_node_by_mac(topo, target_mac)
        if not node:
            raise HTTPException(status_code=404, detail="target device was not found in current topology")

        try:
            _, path, size, md5, info = await firmware_store.save_upload(file)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        preflight = _preflight_comparison(node, info.as_dict())
        job = db.create_job(
            {
                "mac": target_mac,
                "status": PENDING_CONFIRM,
                "firmware_path": str(path),
                "firmware_name": file.filename or path.name,
                "firmware_size": size,
                "firmware_md5": md5,
                "parsed_project_name": info.project_name,
                "parsed_version": info.parsed_version,
                "parsed_esphome_name": info.project_name,
                "parsed_build_date": info.formatted_build_date,
                "parsed_chip_name": info.chip_name,
                "old_firmware_version": node.get("firmware_version") or node.get("project_version"),
                "old_project_name": node.get("project_name"),
                "preflight_warnings": json.dumps(preflight["warnings"]),
            }
        )
        return {"job": job, "firmware": info.as_dict() | {"size": size, "md5": md5}, "preflight": preflight}

    @app.get("/api/ota/current")
    async def ota_current() -> dict[str, Any]:
        return {"job": db.active_job()}

    @app.post("/api/ota/start/{job_id}")
    async def ota_start(job_id: int) -> dict[str, Any]:
        job = db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="OTA job not found")
        if job["status"] != PENDING_CONFIRM:
            raise HTTPException(status_code=409, detail=f"job is not awaiting confirmation: {job['status']}")
        active = db.active_job()
        if active and int(active["id"]) != job_id:
            queued_jobs = db.queued_jobs()
            queue_order = len(queued_jobs)
            db.update_job(job_id, status=QUEUED, queue_order=queue_order)
            ota_worker.wake()
            return {"job": db.get_job(job_id), "queue_position": queue_order + 1}
        db.update_job(job_id, status=STARTING, percent=0, error_msg=None)
        ota_worker.wake()
        return {"job": db.get_job(job_id)}

    @app.post("/api/ota/abort")
    async def ota_abort() -> dict[str, Any]:
        job = db.active_job()
        if not job:
            return {"job": None}
        bridge_abort_failed = False
        try:
            if job["status"] in {STARTING, TRANSFERRING, VERIFYING}:
                await (await bridge_manager.client()).abort_ota()
        except Exception:
            bridge_abort_failed = True
        retained_path, retained_until = firmware_store.retain(job.get("firmware_path"), int(job["id"]))
        db.update_job(int(job["id"]), firmware_path=retained_path, retained_until=retained_until)
        error_msg = "aborted by user"
        if bridge_abort_failed:
            error_msg += " (warning: bridge abort request failed, bridge may still have an active session)"
        db.mark_terminal(int(job["id"]), ABORTED, error_msg=error_msg)
        ota_worker.wake()
        return {"job": db.get_job(int(job["id"]))}

    @app.get("/api/ota/history")
    async def ota_history(limit: int = 100) -> dict[str, Any]:
        return {"jobs": db.list_history(limit=limit)}

    @app.get("/api/ota/history/{mac}")
    async def ota_history_for_mac(mac: str, limit: int = 100) -> dict[str, Any]:
        return {"jobs": db.list_history(mac=mac, limit=limit)}

    @app.post("/api/ota/reflash/{job_id}")
    async def ota_reflash(job_id: int) -> dict[str, Any]:
        source = db.get_job(job_id)
        if not source:
            raise HTTPException(status_code=404, detail="source job not found")
        if db.active_job_for_device(str(source["mac"])):
            raise HTTPException(status_code=409, detail="this device already has an active or pending OTA job")
        if not source.get("firmware_path") or not source.get("retained_until") or int(source["retained_until"]) <= now_ts():
            raise HTTPException(status_code=410, detail="firmware binary is no longer retained")
        try:
            path = firmware_store.clone_retained(str(source["firmware_path"]))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=410, detail=str(exc)) from exc
        device = db.get_device(str(source["mac"])) or {}
        job = db.create_job(
            {
                "mac": source["mac"],
                "status": PENDING_CONFIRM,
                "firmware_path": str(path),
                "firmware_name": source.get("firmware_name"),
                "firmware_size": source.get("firmware_size"),
                "firmware_md5": source.get("firmware_md5"),
                "parsed_project_name": source.get("parsed_project_name"),
                "parsed_version": source.get("parsed_version"),
                "parsed_esphome_name": source.get("parsed_esphome_name"),
                "parsed_build_date": source.get("parsed_build_date"),
                "parsed_chip_name": source.get("parsed_chip_name"),
                "old_firmware_version": device.get("current_firmware_version"),
                "old_project_name": device.get("current_project_name"),
                "preflight_warnings": "[]",
            }
        )
        return {"job": job}

    @app.get("/api/firmware/retained")
    async def retained() -> dict[str, Any]:
        return {"jobs": db.list_retained()}

    @app.delete("/api/firmware/retained/{job_id}")
    async def delete_retained(job_id: int) -> dict[str, Any]:
        job = db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        firmware_store.delete_file(job.get("firmware_path"))
        db.clear_job_firmware(job_id)
        return {"job": db.get_job(job_id)}

    @app.get("/api/ota/queue")
    async def ota_queue() -> dict[str, Any]:
        active = db.active_job()
        queued = db.queued_jobs()
        queued_with_position = []
        for job in queued:
            job_copy = dict(job)
            job_copy["queue_position"] = db.count_queued_before(int(job["id"])) + 1
            device = db.get_device(str(job["mac"]))
            job_copy["device_label"] = (device or {}).get("label") or (device or {}).get("esphome_name") or str(job["mac"])
            queued_with_position.append(job_copy)
        return {
            "active_job": active,
            "queued_jobs": queued_with_position,
            "paused": ota_worker.is_paused(),
            "count": len(queued_with_position),
        }

    @app.get("/api/ota/queue/paused")
    async def ota_queue_paused() -> dict[str, Any]:
        return {"paused": ota_worker.is_paused()}

    @app.post("/api/ota/queue/pause")
    async def ota_queue_pause() -> dict[str, Any]:
        ota_worker.pause()
        return {"paused": True}

    @app.post("/api/ota/queue/resume")
    async def ota_queue_resume() -> dict[str, Any]:
        ota_worker.resume()
        return {"paused": False}

    @app.post("/api/ota/queue/{job_id}/abort")
    async def ota_queue_abort(job_id: int) -> dict[str, Any]:
        job = db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="queued job not found")
        if job["status"] != QUEUED:
            raise HTTPException(status_code=409, detail="job is not in queued status")
        firmware_store.delete_file(job.get("firmware_path"))
        db.abort_queued_job(job_id)
        return {"ok": True}

    @app.post("/api/ota/queue/{job_id}/up")
    async def ota_queue_up(job_id: int) -> dict[str, Any]:
        job = db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        if job["status"] != QUEUED:
            raise HTTPException(status_code=409, detail="job is not in queued status")
        current_order = job.get("queue_order")
        if current_order is None or current_order <= 0:
            raise HTTPException(status_code=400, detail="job is already at the front of the queue")
        db.reorder_queue(job_id, current_order - 1)
        return {"jobs": db.queued_jobs()}

    @app.post("/api/ota/queue/{job_id}/down")
    async def ota_queue_down(job_id: int) -> dict[str, Any]:
        job = db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        if job["status"] != QUEUED:
            raise HTTPException(status_code=409, detail="job is not in queued status")
        current_order = job.get("queue_order")
        queued_count = len(db.queued_jobs())
        if current_order is None or current_order >= queued_count - 1:
            raise HTTPException(status_code=400, detail="job is already at the back of the queue")
        db.reorder_queue(job_id, current_order + 1)
        return {"jobs": db.queued_jobs()}

    # ── Device Config ──

    @app.get("/api/devices/{mac}/config")
    async def get_device_config(mac: str) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        content = yaml_store.get_config(esphome_name)
        if content is None:
            raise HTTPException(status_code=404, detail="no config exists for this device")
        return {
            "mac": mac,
            "esphome_name": esphome_name,
            "content": content,
            "has_config": True,
        }

    @app.put("/api/devices/{mac}/config")
    async def save_device_config(mac: str, body: dict[str, Any]) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        content = str(body.get("content") or body.get("yaml") or "")
        scaffold = body.get("scaffold") if not content else False
        if scaffold:
            try:
                _, topo = await bridge_manager.topology()
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"bridge unavailable: {exc}") from exc
            node = find_node_by_mac(topo, normalize_mac(mac))
            if not node:
                raise HTTPException(status_code=404, detail="device not found in topology")
            try:
                content = generate_scaffold(node)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not content.strip():
            raise HTTPException(status_code=400, detail="config content is empty")
        yaml_store.save_config(esphome_name, content)
        return {
            "mac": mac,
            "esphome_name": esphome_name,
            "content": content,
            "has_config": True,
        }

    @app.delete("/api/devices/{mac}/config")
    async def delete_device_config(mac: str) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        yaml_store.delete_config(esphome_name)
        return {"deleted": True, "mac": mac, "esphome_name": esphome_name}

    @app.post("/api/devices/{mac}/config/import")
    async def import_device_config(
        mac: str,
        file: UploadFile | None = File(None),
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        content = ""
        if file is not None:
            content = (await file.read()).decode("utf-8", errors="replace")
        elif body is not None:
            content = str(body.get("content") or body.get("yaml") or "")
        elif body is None:
            content = ""
        if not content.strip():
            raise HTTPException(status_code=400, detail="no YAML content provided")
        yaml_store.save_config(esphome_name, content)
        return {
            "mac": mac,
            "esphome_name": esphome_name,
            "content": content,
            "has_config": True,
        }

    @app.get("/api/devices/{mac}/config/status")
    async def device_config_status(mac: str) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        has_config = bool(esphome_name and yaml_store.has_config(esphome_name))
        compile_status = compile_store.get_status(esphome_name) if esphome_name else {"status": "idle"}
        state = "no_config"
        if has_config:
            state = "has_config"
        if compile_status.get("status") == "success":
            state = "compiled_ready"
        return {
            "mac": mac,
            "esphome_name": esphome_name,
            "config_state": state,
            "has_config": has_config,
            "compile_status": compile_status.get("status", "idle"),
        }

    # ── Compilation ──

    @app.post("/api/devices/{mac}/compile")
    async def compile_device_config(mac: str) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        if not yaml_store.has_config(esphome_name):
            raise HTTPException(status_code=400, detail="no config exists for this device")
        if compile_store.is_any_compiling():
            current = compile_store.current_compiling()
            raise HTTPException(
                status_code=409,
                detail=f"another compile is already in progress for '{current}'",
            )

        result = await compiler.compile(esphome_name)

        if not result.success:
            return {
                "success": False,
                "mac": mac,
                "esphome_name": esphome_name,
                "error": result.error,
            }

        try:
            _, topo = await bridge_manager.topology()
        except Exception:
            topo = []

        node = find_node_by_mac(topo, normalize_mac(mac))
        info_dict = result.firmware_info.as_dict() if result.firmware_info else {}
        preflight = _preflight_comparison(node or {}, info_dict)

        active_path = settings.firmware_dir / "active" / f"{uuid.uuid4().hex}.bin"

        active_path.parent.mkdir(parents=True, exist_ok=True)
        if result.ota_bin_path:
            shutil.copy2(result.ota_bin_path, active_path)

        ota_path = Path(result.ota_bin_path) if result.ota_bin_path else None
        size = ota_path.stat().st_size if ota_path and ota_path.exists() else 0
        md5 = ""
        if ota_path and ota_path.exists():
            md5 = hashlib.md5(ota_path.read_bytes()).hexdigest()

        job = db.create_job(
            {
                "mac": normalize_mac(mac),
                "status": PENDING_CONFIRM,
                "firmware_path": str(active_path),
                "firmware_name": f"{esphome_name}.ota.bin",
                "firmware_size": size,
                "firmware_md5": md5,
                "parsed_project_name": info_dict.get("project_name"),
                "parsed_version": info_dict.get("parsed_version"),
                "parsed_esphome_name": info_dict.get("esphome_name"),
                "parsed_build_date": info_dict.get("parsed_build_date"),
                "parsed_chip_name": info_dict.get("chip_name"),
                "old_firmware_version": node.get("firmware_version") or node.get("project_version"),
                "old_project_name": node.get("project_name"),
                "preflight_warnings": json.dumps(preflight["warnings"]),
            }
        )

        return {
            "success": True,
            "mac": mac,
            "esphome_name": esphome_name,
            "firmware": info_dict | {"size": size, "md5": md5},
            "preflight": preflight,
            "job": job,
        }

    @app.get("/api/devices/{mac}/compile/status")
    async def compile_status(mac: str) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            return {"status": "idle", "esphome_name": ""}
        return compile_store.get_status(esphome_name)

    @app.get("/api/devices/{mac}/compile/logs")
    async def compile_logs(mac: str) -> StreamingResponse:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        return StreamingResponse(
            compiler.stream_logs(esphome_name),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.post("/api/devices/{mac}/compile/cancel")
    async def compile_cancel(mac: str) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        cancelled = await compiler.cancel_compile(esphome_name)
        return {"cancelled": cancelled, "mac": mac, "esphome_name": esphome_name}

    # ── Secrets ──

    @app.get("/api/secrets")
    async def secrets_get() -> dict[str, Any]:
        return {"content": yaml_store.get_secrets()}

    @app.put("/api/secrets")
    async def secrets_save(body: dict[str, Any]) -> dict[str, Any]:
        content = str(body.get("content") or "")
        yaml_store.save_secrets(content)
        return {"content": content, "saved": True}

    # ── Container / Artifacts ──

    @app.get("/api/compile/container/status")
    async def container_status() -> dict[str, Any]:
        return compiler.get_image_status()

    @app.delete("/api/compile/container")
    async def delete_container() -> dict[str, Any]:
        compiler.cleanup_stale()
        return {"ok": True}

    @app.delete("/api/compile/artifacts")
    async def clean_artifacts() -> dict[str, Any]:
        platformio_bytes, esphome_bytes = compiler.clean_artifacts()
        return {
            "ok": True,
            "platformio_cache_bytes": platformio_bytes,
            "esphome_build_bytes": esphome_bytes,
            "total_bytes": platformio_bytes + esphome_bytes,
        }

    # ── Flash hand-off ──

    @app.post("/api/devices/{mac}/compile/start-flash")
    async def compile_start_flash(mac: str) -> dict[str, Any]:
        nm = normalize_mac(mac)
        active = db.active_job()
        if not active or normalize_mac(str(active.get("mac", ""))) != nm:
            raise HTTPException(status_code=404, detail="no pending OTA job for this device")
        if active["status"] != PENDING_CONFIRM:
            raise HTTPException(status_code=409, detail=f"job is not awaiting confirmation: {active['status']}")
        job_id = int(active["id"])
        db.update_job(job_id, status=STARTING, percent=0, error_msg=None)
        ota_worker.wake()
        return {"job": db.get_job(job_id)}

    @app.get("/api/devices/{mac}/firmware/download")
    async def factory_binary_download(mac: str) -> FileResponse:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        factory_path = yaml_store.get_factory_binary(esphome_name)
        if factory_path is None:
            raise HTTPException(status_code=404, detail="no compiled factory binary available")
        return FileResponse(
            factory_path,
            media_type="application/octet-stream",
            filename=f"{esphome_name}.factory.bin",
        )

    _mount_static(app, settings.static_dir)
    return app


def _mount_static(app: FastAPI, static_dir: Path) -> None:
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    def _serve_index(request: Request) -> HTMLResponse:
        index_path = static_dir / "index.html"
        if not index_path.exists():
            return HTMLResponse("<!doctype html><title>ESPNow Tree</title><p>Frontend build is missing.</p>", status_code=503)
        content = index_path.read_text(encoding="utf-8")
        ingress_path = (request.headers.get("x-ingress-path") or "").rstrip("/")
        if ingress_path:
            content = content.replace(
                '<meta name="x-ingress-path" content="" />',
                f'<meta name="x-ingress-path" content="{ingress_path}" />',
            )
        return HTMLResponse(content)

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        return _serve_index(request)

    @app.get("/{path:path}")
    async def spa_fallback(path: str, request: Request):
        candidate = (static_dir / path).resolve()
        if static_dir.exists() and static_dir.resolve() in candidate.parents and candidate.exists() and candidate.is_file():
            return FileResponse(candidate, media_type=mimetypes.guess_type(candidate.name)[0])
        return _serve_index(request)


CHIP_TYPE_DECIMAL = {
    1: "ESP32",
    2: "ESP32-S2",
    5: "ESP32-C3",
    9: "ESP32-S3",
    12: "ESP32-C2",
    13: "ESP32-C6",
    16: "ESP32-H2",
    18: "ESP32-P4",
    20: "ESP32-C61",
    23: "ESP32-C5",
    25: "ESP32-H21",
    28: "ESP32-H4",
    31: "ESP32-S3/FH",
}


def _preflight_comparison(node: dict[str, Any], info: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []

    current_name = str(node.get("esphome_name") or "").strip()
    new_name = str(info.get("esphome_name") or "").strip()
    name_match = bool(current_name and new_name and current_name == new_name)

    current_build_date = str(node.get("firmware_build_date") or "").strip()
    new_build_date = str(info.get("parsed_build_date") or "").strip()
    build_date_status = "unknown"
    build_date_delta = ""
    if current_build_date and new_build_date:
        try:
            current_ts = _parse_build_datetime(current_build_date)
            new_ts = _parse_build_datetime(new_build_date)
            if current_ts is not None and new_ts is not None:
                diff = current_ts - new_ts
                abs_diff = abs(diff)
                if diff == 0:
                    build_date_status = "same"
                elif diff > 0:
                    build_date_status = "older"
                    build_date_delta = _format_time_delta(abs_diff)
                else:
                    build_date_status = "newer"
                    build_date_delta = _format_time_delta(abs_diff)
        except Exception:
            pass

    current_chip_name = node.get("chip_name")
    new_chip_name = info.get("chip_name")
    chip_match = bool(current_chip_name and new_chip_name and current_chip_name == new_chip_name)
    if current_chip_name and new_chip_name and current_chip_name != new_chip_name:
        warnings.append(f"Firmware chip '{new_chip_name}' does not match device chip '{current_chip_name}'.")
    elif not current_chip_name or not new_chip_name:
        warnings.append("Chip metadata is incomplete; the remote will perform final image validation.")
    if build_date_status == "newer":
        warnings.append(f"Uploaded firmware build date is newer than the device's current firmware (current: {current_build_date}, new: {new_build_date}). This is a normal upgrade.")
    elif build_date_status == "older":
        warnings.append(f"Uploaded firmware build date is older than the device's current firmware (current: {current_build_date}, new: {new_build_date}). This is a downgrade — verify intentional.")

    return {
        "name": {"current": current_name, "new": new_name, "match": name_match},
        "build_date": {"current": current_build_date, "new": new_build_date, "status": build_date_status, "delta": build_date_delta},
        "chip": {"current": current_chip_name or "", "new": new_chip_name or "", "match": chip_match},
        "has_warnings": len(warnings) > 0,
        "warnings": warnings,
    }


def _parse_build_datetime(s: str) -> float | None:
    import re
    from datetime import datetime, timezone

    cleaned = s.strip()
    cleaned = re.sub(r"\s+UTC\s*$", "", cleaned)

    # ISO format: 2026-05-01 02:48:04
    m = re.match(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})", cleaned)
    if m:
        dt = datetime.fromisoformat(f"{m.group(1)}T{m.group(2)}")
        return dt.replace(tzinfo=timezone.utc).timestamp()

    # Text-month format from ESP32 binary: May 1 2026 02:48:04
    m = re.match(r"(\w{3,9})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})", cleaned)
    if m:
        dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)} {m.group(4)}", "%b %d %Y %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).timestamp()

    return None


def _format_time_delta(seconds: float) -> str:
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    mins = int((seconds % 3600) // 60)
    if days > 0:
        return f"+{days}d"
    if hours > 0:
        return f"+{hours}h"
    return f"+{mins}m"
