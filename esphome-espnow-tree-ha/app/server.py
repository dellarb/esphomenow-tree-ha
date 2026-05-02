from __future__ import annotations

import asyncio
import json
import mimetypes
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
from .compile_worker import CompileWorker
from .models import (
    ABORTED,
    ACTIVE_STATUSES,
    COMPILING,
    COMPILE_QUEUED,
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
from .preflight import preflight_comparison
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

    app = FastAPI(title="ESPHome ESPNow Tree Add-on", version="0.1.32")
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
        docker_socket=settings.docker_socket or None,
    )
    compile_worker = CompileWorker(
        db=db,
        compiler=compiler,
        bridge_manager=bridge_manager,
        firmware_store=firmware_store,
        yaml_store=yaml_store,
        settings=settings,
        ota_worker=ota_worker,
    )
    app.state.yaml_store = yaml_store
    app.state.compile_store = compile_store
    app.state.compiler = compiler
    app.state.compile_worker = compile_worker

    @app.on_event("startup")
    async def startup() -> None:
        db.init()
        firmware_store.init()
        firmware_store.cleanup_partials()
        ota_worker.start()
        compile_worker.start()

    @app.on_event("shutdown")
    async def shutdown() -> None:
        await compile_worker.stop()
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

        preflight = preflight_comparison(node, info.as_dict())
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
    async def ota_current(mac: str | None = None) -> dict[str, Any]:
        if mac:
            return {"job": db.active_job_for_device(normalize_mac(mac))}
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

    @app.get("/api/devices/{mac}/compile/history")
    async def compile_history(mac: str) -> dict[str, Any]:
        return {"jobs": db.compile_history(normalize_mac(mac))}

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
        nm = normalize_mac(mac)
        active_job = db.active_job_for_device(nm)
        if active_job:
            if active_job["status"] == COMPILE_QUEUED:
                state = "compile_queued"
            elif active_job["status"] == COMPILING:
                state = "compiling"
        if compile_status.get("status") == "success" and state not in ("compile_queued", "compiling"):
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
        docker_status = compiler.check_docker()
        if not docker_status["connected"]:
            raise HTTPException(
                status_code=503,
                detail=f"Docker is not available: {docker_status['error']}. "
                       "Ensure the add-on has Docker access enabled (docker_api: true) "
                       "and try reinstalling the add-on.",
            )
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        if not yaml_store.has_config(esphome_name):
            raise HTTPException(status_code=400, detail="no config exists for this device")
        existing = db.active_job_for_device(normalize_mac(mac))
        if existing:
            raise HTTPException(status_code=409, detail="this device already has an active or pending job")

        try:
            _, topo = await bridge_manager.topology()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"bridge unavailable for preflight check: {exc}") from exc

        node = find_node_by_mac(topo, normalize_mac(mac))
        if not node:
            raise HTTPException(status_code=404, detail="device not found in current topology")

        new_firmware_info = {"esphome_name": esphome_name, "chip_name": device.get("chip_name") or ""}
        preflight = preflight_comparison(node, new_firmware_info)

        job = db.create_job({
            "mac": normalize_mac(mac),
            "status": COMPILE_QUEUED,
            "esphome_name": esphome_name,
            "old_firmware_version": node.get("firmware_version") or node.get("project_version"),
            "old_project_name": node.get("project_name"),
            "preflight_warnings": json.dumps(preflight["warnings"]),
        })

        active_compile = db.active_compile_job()
        queue_position = db.count_compile_queued_before(job["id"]) + (1 if active_compile else 0)

        compile_worker.wake()

        return {
            "job": job,
            "queue_position": queue_position,
            "preflight": preflight,
        }

    @app.get("/api/devices/{mac}/compile/status")
    async def compile_status(mac: str) -> dict[str, Any]:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            return {"mac": normalize_mac(mac), "esphome_name": "", "status": "idle", "job_id": None, "queue_position": None, "error": None}
        nm = normalize_mac(mac)
        compile_job = db.active_job_for_device(nm)
        if compile_job and compile_job["status"] in (COMPILE_QUEUED, COMPILING):
            if compile_job["status"] == COMPILE_QUEUED:
                pos = db.count_compile_queued_before(compile_job["id"])
                return {
                    "mac": nm,
                    "esphome_name": esphome_name,
                    "status": "compile_queued",
                    "job_id": compile_job["id"],
                    "queue_position": pos,
                    "compile_status": None,
                    "error": None,
                }
            else:
                cs = compile_store.get_status(esphome_name)
                return {
                    "mac": nm,
                    "esphome_name": esphome_name,
                    "status": "compiling",
                    "job_id": compile_job["id"],
                    "queue_position": None,
                    "compile_status": cs.get("status", "compiling"),
                    "error": None,
                }
        if compile_job and compile_job["status"] == QUEUED:
            pos = db.count_queued_before(compile_job["id"])
            return {
                "mac": nm,
                "esphome_name": esphome_name,
                "status": "queued",
                "job_id": compile_job["id"],
                "queue_position": pos,
                "compile_status": None,
                "error": None,
            }
        if compile_job and compile_job["status"] in (STARTING, TRANSFERRING, VERIFYING, "transfer_success_waiting_rejoin"):
            return {
                "mac": nm,
                "esphome_name": esphome_name,
                "status": compile_job["status"],
                "job_id": compile_job["id"],
                "queue_position": None,
                "compile_status": None,
                "error": None,
            }
        cs = compile_store.get_status(esphome_name) if esphome_name else {"status": "idle"}
        cs_status = cs.get("status", "idle")
        if cs_status in ("success", "failed"):
            return {
                "mac": nm,
                "esphome_name": esphome_name,
                "status": cs_status,
                "job_id": None,
                "queue_position": None,
                "compile_status": cs_status,
                "error": cs.get("error"),
            }
        return {
            "mac": nm,
            "esphome_name": esphome_name,
            "status": "idle",
            "job_id": None,
            "queue_position": None,
            "compile_status": None,
            "error": None,
        }

    @app.get("/api/devices/{mac}/compile/logs")
    async def compile_logs(mac: str) -> StreamingResponse:
        device = db.get_device(mac)
        if not device:
            raise HTTPException(status_code=404, detail="device not found")
        esphome_name = str(device.get("esphome_name") or "")
        if not esphome_name:
            raise HTTPException(status_code=404, detail="device has no esphome_name associated")
        nm = normalize_mac(mac)
        compile_job = db.active_job_for_device(nm)
        if compile_job and compile_job["status"] == COMPILE_QUEUED:
            pos = db.count_compile_queued_before(compile_job["id"])
            async def queued_stream():
                while True:
                    yield f"event: status\ndata: compile_queued\n\n"
                    yield f"event: queue_position\ndata: {pos}\n\n"
                    await asyncio.sleep(2)
                    current = db.get_job(compile_job["id"])
                    if not current or current["status"] not in (COMPILE_QUEUED, COMPILING):
                        yield f"event: status\ndata: queued\n\n"
                        return
                    if current["status"] == COMPILING:
                        break
            async def combined_stream():
                async for chunk in queued_stream():
                    yield chunk
                async for chunk in compiler.stream_logs(esphome_name):
                    yield chunk
            return StreamingResponse(
                combined_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
            )
        if compile_job and compile_job["status"] not in (COMPILE_QUEUED, COMPILING):
            async def done_stream():
                yield f"event: status\ndata: queued\n\n"
            return StreamingResponse(
                done_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
            )
        return StreamingResponse(
            compiler.stream_logs(esphome_name),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    @app.post("/api/devices/{mac}/compile/cancel")
    async def compile_cancel(mac: str) -> dict[str, Any]:
        nm = normalize_mac(mac)
        job = db.active_job_for_device(nm)
        if not job or job["status"] not in (COMPILE_QUEUED, COMPILING):
            raise HTTPException(status_code=404, detail="no compile job found for this device")
        if job["status"] == COMPILE_QUEUED:
            db.abort_compile_queued_job(job["id"])
            compile_worker.wake()
            return {"cancelled": True, "job_id": job["id"], "mac": nm}
        if job["status"] == COMPILING:
            await compile_worker.cancel(job["id"])
            return {"cancelled": True, "job_id": job["id"], "mac": nm}
        raise HTTPException(status_code=404, detail="no compile job found for this device")

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

    @app.get("/api/compile/docker-debug")
    async def docker_debug() -> dict[str, Any]:
        return compiler.debug_docker()

    @app.put("/api/compile/docker-socket")
    async def set_docker_socket(body: dict[str, Any]) -> dict[str, Any]:
        socket_path = str(body.get("docker_socket") or "").strip()
        options_path = settings.options_path
        options = {}
        if options_path.exists():
            try:
                options = json.loads(options_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                pass
        options["docker_socket"] = socket_path
        options_path.parent.mkdir(parents=True, exist_ok=True)
        options_path.write_text(json.dumps(options), encoding="utf-8")
        compiler._docker_socket = socket_path or None
        compiler._docker_client = None
        os.environ.pop("DOCKER_HOST", None)
        return {"docker_socket": socket_path, "docker": compiler.check_docker()}

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

    @app.get("/api/compile/queue")
    async def compile_queue() -> dict[str, Any]:
        active = db.active_compile_job()
        if active:
            device = db.get_device(str(active.get("mac", "")))
            active = dict(active)
            active["device_label"] = (device or {}).get("label") or (device or {}).get("esphome_name") or str(active.get("mac", ""))
        queued = db.compile_queued_jobs()
        queued_enriched = []
        for job in queued:
            job_copy = dict(job)
            device = db.get_device(str(job.get("mac", "")))
            job_copy["device_label"] = (device or {}).get("label") or (device or {}).get("esphome_name") or str(job.get("mac", ""))
            queued_enriched.append(job_copy)
        return {
            "active_job": active,
            "queued_jobs": queued_enriched,
            "count": (1 if active else 0) + len(queued_enriched),
        }

    @app.post("/api/compile/queue/{job_id}/abort")
    async def compile_queue_abort(job_id: int) -> dict[str, Any]:
        job = db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        if job["status"] != COMPILE_QUEUED:
            raise HTTPException(status_code=409, detail="job is not in compile_queued status")
        db.abort_compile_queued_job(job_id)
        compile_worker.wake()
        return {"ok": True, "job_id": job_id}

    # ── Flash hand-off ──

    @app.post("/api/devices/{mac}/compile/start-flash")
    async def compile_start_flash(mac: str) -> dict[str, Any]:
        nm = normalize_mac(mac)
        job = db.active_job_for_device(nm)
        if not job:
            raise HTTPException(status_code=404, detail="no pending or queued OTA job for this device")
        if job["status"] == PENDING_CONFIRM:
            active = db.active_job()
            if active and int(active["id"]) != job["id"]:
                queued_jobs = db.queued_jobs()
                queue_order = len(queued_jobs)
                db.update_job(job["id"], status=QUEUED, queue_order=queue_order)
                ota_worker.wake()
                return {"job": db.get_job(job["id"]), "queue_position": queue_order + 1}
            db.update_job(job["id"], status=STARTING, percent=0, error_msg=None)
            ota_worker.wake()
            return {"job": db.get_job(job["id"])}
        if job["status"] == QUEUED:
            db.update_job(job["id"], status=STARTING, percent=0, error_msg=None, started_at=now_ts())
            ota_worker.wake()
            return {"job": db.get_job(job["id"])}
        raise HTTPException(status_code=409, detail=f"job status is {job['status']}, not awaiting flash")

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
