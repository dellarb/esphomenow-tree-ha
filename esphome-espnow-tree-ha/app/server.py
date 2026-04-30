from __future__ import annotations

import mimetypes
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bridge_client import BridgeManager
from .config import Settings, load_settings
from .db import Database
from .firmware_store import FirmwareStore
from .ha_client import HomeAssistantClient
from .models import (
    ABORTED,
    ACTIVE_STATUSES,
    PENDING_CONFIRM,
    STARTING,
    TRANSFERRING,
    VERIFYING,
    find_node_by_mac,
    normalize_mac,
    now_ts,
)
from .ota_worker import OTAWorker


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

    app = FastAPI(title="ESPHome ESPNow Tree Add-on", version="0.1.0")
    app.state.settings = settings
    app.state.db = db
    app.state.firmware_store = firmware_store
    app.state.bridge_manager = bridge_manager
    app.state.ota_worker = ota_worker

    @app.on_event("startup")
    async def startup() -> None:
        db.init()
        firmware_store.init()
        firmware_store.cleanup_partials()
        ota_worker.start()

    @app.on_event("shutdown")
    async def shutdown() -> None:
        await ota_worker.stop()

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
        if db.active_job():
            raise HTTPException(status_code=409, detail="another OTA job is already active or awaiting confirmation")

        try:
            _, topo = await bridge_manager.topology()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"bridge health check failed: {exc}") from exc

        node = find_node_by_mac(topo, target_mac)
        if not node:
            raise HTTPException(status_code=404, detail="target device was not found in current topology")
        if not bool(node.get("online")):
            raise HTTPException(status_code=409, detail="target device is offline")

        try:
            _, path, size, md5, info = await firmware_store.save_upload(file)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        warnings = _preflight_warnings(node, info.as_dict())
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
                "parsed_chip_type": info.chip_type,
                "old_firmware_version": node.get("firmware_version") or node.get("project_version"),
                "old_project_name": node.get("project_name"),
                "preflight_warnings": json.dumps(warnings),
            }
        )
        return {"job": job, "firmware": info.as_dict() | {"size": size, "md5": md5}, "warnings": warnings}

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
            raise HTTPException(status_code=409, detail="another OTA job is active")
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
        if db.active_job():
            raise HTTPException(status_code=409, detail="another OTA job is already active or awaiting confirmation")
        source = db.get_job(job_id)
        if not source:
            raise HTTPException(status_code=404, detail="source job not found")
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
                "parsed_chip_type": source.get("parsed_chip_type"),
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


def _preflight_warnings(node: dict[str, Any], info: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    current_name = str(node.get("esphome_name") or node.get("project_name") or "").strip()
    new_name = str(info.get("project_name") or info.get("parsed_esphome_name") or "").strip()
    if current_name and new_name and current_name != new_name:
        warnings.append(f"Firmware project/name '{new_name}' does not match device '{current_name}'.")
    elif not current_name or not new_name:
        warnings.append("Project/name metadata is incomplete; verify this firmware belongs to the selected device.")

    current_chip = node.get("chip_type")
    new_chip = info.get("chip_type")
    if current_chip is not None and new_chip is not None and int(current_chip) != int(new_chip):
        warnings.append(f"Firmware chip type {new_chip} does not match device chip type {current_chip}.")
    elif current_chip is None or new_chip is None:
        warnings.append("Chip metadata is incomplete; the remote will perform final image validation.")

    current_version = str(node.get("firmware_version") or node.get("project_version") or "").strip()
    new_version = str(info.get("parsed_version") or "").strip()
    if current_version and new_version and current_version == new_version:
        warnings.append("Firmware version appears to match the current device version.")
    elif current_version and new_version and current_version != new_version:
        warnings.append(f"Firmware version '{new_version}' differs from current '{current_version}'. Verify this is the intended update or downgrade.")
    elif not current_version or not new_version:
        warnings.append("Firmware version metadata is incomplete; rejoin confirmation may use online status only.")

    return warnings
