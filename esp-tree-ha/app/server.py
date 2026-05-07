from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import re
import shutil
import sys
import time
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bridge_ws_client import BridgeWsClient, BridgeWsManager, ConfigTimeoutError
from .network_discovery import NetworkDiscovery
from .compile_store import CompileStore
from .compiler import ESPHomeCompiler
from .config import _bool_option, _int_option, _read_options, load_settings
from .db import Database
from .firmware_store import FirmwareStore
from .compile_worker import CompileWorker
from .integration_ws_client import IntegrationWsManager
from .models import (
    ABORTED,
    COMPILING,
    COMPILE_QUEUED,
    PENDING_CONFIRM,
    QUEUED,
    STARTING,
    TRANSFERRING,
    VERIFYING,
    BridgeTarget,
    find_node_by_mac,
    normalize_mac,
    now_ts,
)
from .ota_worker import OTAWorker
from .pairing_store import PendingImportStore
from .preflight import preflight_comparison
from .yaml_scaffold import generate_scaffold
from .yaml_store import YAMLStore


logger = logging.getLogger(__name__)
bridge_api_logger = logging.getLogger("bridge_api")
bridge_api_logger.setLevel(logging.INFO)
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(logging.Formatter("INFO:     %(message)s\n"))
bridge_api_logger.addHandler(_handler)
bridge_api_logger.propagate = False

CLEANUP_PAGE_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESP Tree - Cleanup Required</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .container {
      background: #16213e;
      border-radius: 12px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      text-align: center;
    }
    h1 {
      color: #e94560;
      margin: 0 0 20px;
      font-size: 1.5rem;
    }
    p {
      color: #a0a0a0;
      line-height: 1.6;
      margin: 0 0 30px;
    }
    .info {
      background: #0f3460;
      border-radius: 8px;
      padding: 15px;
      margin: 0 0 30px;
      text-align: left;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid #1a4a7a;
    }
    .info-item:last-child {
      border-bottom: none;
    }
    .label {
      color: #a0a0a0;
    }
    .value {
      color: #fff;
      font-weight: 500;
    }
    .value.dirty {
      color: #e94560;
    }
    .buttons {
      display: flex;
      gap: 15px;
      flex-direction: column;
    }
    button {
      padding: 14px 24px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-cleanup {
      background: #e94560;
      color: white;
    }
    .btn-cleanup:hover {
      background: #d63850;
    }
    .btn-continue {
      background: #2a2a4a;
      color: #a0a0a0;
      border: 1px solid #3a3a5a;
    }
    .btn-continue:hover {
      background: #3a3a5a;
      color: #e0e0e0;
    }
    .spinner {
      display: none;
      border: 3px solid #2a2a4a;
      border-top: 3px solid #e94560;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      animation: spin 1s linear infinite;
      margin: 0 auto 15px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .loading .spinner { display: block; }
    .loading .btn-cleanup { opacity: 0.5; pointer-events: none; }
    .loading .btn-continue { display: none; }
    .result {
      margin-top: 20px;
      padding: 15px;
      border-radius: 8px;
      display: none;
    }
    .result.success {
      background: #1a4a3a;
      color: #4ade80;
      display: block;
    }
    .result.error {
      background: #4a1a2a;
      color: #f87171;
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚠️ Previous Installation Detected</h1>
    <p>It looks like ESP Tree was previously installed and then removed. Would you like to clean up the old integration data before continuing?</p>

    <div class="info">
      <div class="info-item">
        <span class="label">Shared DB</span>
        <span class="value" id="db-status">Checking...</span>
      </div>
      <div class="info-item">
        <span class="label">Integration</span>
        <span class="value" id="integration-status">Checking...</span>
      </div>
    </div>

    <div id="loading-section">
      <div class="spinner"></div>
    </div>

    <div class="buttons">
      <button class="btn-cleanup" id="btn-cleanup" onclick="doCleanup()">Clean Up &amp; Restart Home Assistant</button>
      <button class="btn-continue" id="btn-continue" onclick="continueAnyway()">Continue Without Cleaning Up</button>
    </div>

    <div class="result" id="result"></div>
  </div>

  <script>
    const basePath = window.location.pathname.replace(/\\/$/, '');
    const apiPath = (path) => `${basePath}${path}`;

    async function checkStatus() {
      try {
        const res = await fetch(apiPath('/api/cleanup/status'));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        document.getElementById('db-status').textContent = data.shared_db_exists ? 'Has data (dirty)' : 'Empty / Not found';
        document.getElementById('db-status').className = data.shared_db_exists ? 'value dirty' : 'value';
        document.getElementById('integration-status').textContent = data.integration_installed ? 'Installed (dirty)' : 'Not installed';
        document.getElementById('integration-status').className = data.integration_installed ? 'value dirty' : 'value';
      } catch (e) {
        document.getElementById('db-status').textContent = 'Check failed: ' + e.message;
        document.getElementById('integration-status').textContent = 'Check failed: ' + e.message;
      }
    }

    async function doCleanup() {
      const section = document.getElementById('loading-section');
      const result = document.getElementById('result');
      section.classList.add('loading');
      result.className = 'result';
      result.textContent = 'Starting cleanup...';

      try {
        const res = await fetch(apiPath('/api/cleanup/trigger'), { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          result.className = 'result success';
          result.textContent = 'Cleanup Success - Restarting Home Assistant';
          setTimeout(() => { window.location.reload(); }, 3000);
        } else {
          result.className = 'result error';
          result.textContent = 'Cleanup failed: ' + (data.error || 'Unknown error');
          section.classList.remove('loading');
        }
      } catch (e) {
        result.className = 'result error';
        result.textContent = 'Network error: ' + e.message;
        section.classList.remove('loading');
      }
    }

    async function continueAnyway() {
      try {
        const res = await fetch(apiPath('/api/cleanup/dismiss'), { method: 'POST' });
        const data = await res.json();
      } catch (e) {}
      window.location.reload();
    }

    checkStatus();
  </script>
</body>
</html>"""


class BridgeAddRequest(BaseModel):
    host: str
    port: int = 80
    name: str | None = None
    api_key: str = ""


class BridgeUpdateRequest(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    api_key: str | None = None


class BridgeSelectRequest(BaseModel):
    host: str
    port: int = 80
    name: str | None = None
    version: str | None = None
    api_key: str = ""
    network_id: str = ""


class HeartbeatConfigRequest(BaseModel):
    interval_seconds: int


class ParentConfigRequest(BaseModel):
    parent_mac: str
    clear: bool = True


class RelayConfigRequest(BaseModel):
    enable: bool


class PendingImportRequest(BaseModel):
    host: str
    port: int = 80
    api_key: str
    bridge_mac: str = ""
    network_id: str = ""
    name: str = "ESP Tree Bridge"


def create_app() -> FastAPI:
    settings = load_settings()
    db = Database(settings.database_path)
    firmware_store = FirmwareStore(settings.firmware_dir, settings.firmware_retention_days)
    ota_worker = OTAWorker(
        db=db,
        firmware_store=firmware_store,
        rejoin_timeout_s=settings.ota_rejoin_timeout_s,
        transfer_timeout_s=settings.ota_transfer_timeout_s,
    )
    ws_manager: BridgeWsManager | None = None
    integration_manager: IntegrationWsManager | None = None

    app = FastAPI(title="ESP Tree Add-on", version="0.1.87")
    app.state.settings = settings
    app.state.db = db
    app.state.firmware_store = firmware_store
    app.state.ota_worker = ota_worker
    app.state.ws_manager = None
    app.state.integration_manager = None
    app.state.autoconfig_task = None
    app.state.pending_imports = PendingImportStore(settings.data_dir / "pending_imports.json")

    @app.middleware("http")
    async def log_bridge_api_access(request: Request, call_next):
        path = request.url.path
        response = await call_next(request)
        if path.startswith("/api/bridge"):
            client = request.client
            client_info = f"{client.host}:{client.port}" if client else "unknown"
            status = response.status_code
            size = response.headers.get("content-length", "-")
            bridge_api_logger.info(
                '[bridge_api] %s - "GET %s HTTP/1.1" %s %s',
                client_info, path, status, size
            )
        return response

    yaml_store = YAMLStore(settings.data_dir / "devices")
    compile_store = CompileStore(settings.data_dir / "devices")
    compiler = ESPHomeCompiler(
        compile_store=compile_store,
        devices_root=settings.data_dir / "devices",
        components_root=Path("/opt/esp-tree/components"),
        platformio_cache=settings.data_dir / "platformio_cache",
    )
    compile_worker = CompileWorker(
        db=db,
        compiler=compiler,
        ws_manager=ws_manager,
        firmware_store=firmware_store,
        yaml_store=yaml_store,
        settings=settings,
        ota_worker=ota_worker,
    )
    app.state.yaml_store = yaml_store
    app.state.compile_store = compile_store
    app.state.compiler = compiler
    app.state.compile_worker = compile_worker

    prev_bytes_up = 0
    prev_bytes_dn = 0

    async def log_health_periodically() -> None:
        nonlocal prev_bytes_up, prev_bytes_dn
        while True:
            try:
                cache_ts = ws_manager._topology_cache_ts if ws_manager else 0
                cache_age = time.monotonic() - cache_ts if cache_ts else -1
                client = ws_manager._client if ws_manager else None
                bytes_up = client._bytes_sent if client else 0
                bytes_dn = client._bytes_received if client else 0
                delta_up = bytes_up - prev_bytes_up
                delta_dn = bytes_dn - prev_bytes_dn
                prev_bytes_up = bytes_up
                prev_bytes_dn = bytes_dn
                bridge_api_logger.info(
                    "HEALTH: ws_connected=%s, persistent=%s, cache_age=%.1fs, bytes_up=%.1fKB, bytes_dn=%.1fKB",
                    ws_manager.connected if ws_manager else False,
                    settings.bridge_ws_persistent,
                    cache_age,
                    delta_up / 1024,
                    delta_dn / 1024,
                )
            except Exception as exc:
                bridge_api_logger.warning("health check failed: %s", exc)
            await asyncio.sleep(30)

    def bridge_target_from_row(bridge: dict[str, Any] | None) -> BridgeTarget | None:
        if not bridge or not bridge.get("host"):
            return None
        api_key = str(bridge.get("api_key") or "")
        if not api_key:
            return None
        return BridgeTarget(
            host=str(bridge["host"]),
            port=int(bridge.get("port") or 80),
            source="shared_db",
            name=str(bridge.get("name") or ""),
            api_key=api_key,
        )

    async def validate_bridge_if_possible(bridge: dict[str, Any]) -> None:
        api_key = str(bridge.get("api_key") or "")
        if not api_key:
            return
        host = str(bridge.get("host") or "").strip()
        port = int(bridge.get("port") or 80)
        already_connected = (
            ws_manager
            and ws_manager.connected
            and ws_manager._target
            and ws_manager._target.host == host
            and ws_manager._target.port == port
        )
        if already_connected:
            return
        await BridgeWsClient.validate_connection(
            BridgeTarget(
                host=host,
                port=port,
                source="shared_db",
                name=str(bridge.get("name") or ""),
                api_key=api_key,
            ),
            api_key,
        )

    async def reconnect_ws_manager() -> None:
        nonlocal ws_manager
        if ws_manager is not None:
            await ws_manager.stop()
            ws_manager = None
            app.state.ws_manager = None
            ota_worker.ws_manager = None
        if not settings.ws_client_enabled:
            return
        target = bridge_target_from_row(db.get_active_bridge())
        if target is None:
            return
        ws_manager = BridgeWsManager(settings, db)
        if settings.bridge_ws_persistent:
            ws_manager.start(target)
        else:
            ws_manager.set_target(target)
        ota_worker.ws_manager = ws_manager
        app.state.ws_manager = ws_manager

    def control_manager() -> Any | None:
        if integration_manager and integration_manager.connected:
            topology = integration_manager.get_topology_list()
            if topology:
                return integration_manager
        return ws_manager or integration_manager

    async def ha_ws_call(command: dict[str, Any], timeout: float = 10.0) -> dict[str, Any]:
        if not settings.supervisor_token:
            raise RuntimeError("SUPERVISOR_TOKEN not available")
        import websockets

        async with websockets.connect("ws://supervisor/core/websocket", open_timeout=timeout, close_timeout=2) as ws:
            await asyncio.wait_for(ws.recv(), timeout=timeout)
            await ws.send(json.dumps({"type": "auth", "access_token": settings.supervisor_token}))
            auth = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
            if auth.get("type") != "auth_ok":
                raise RuntimeError("HA auth failed")
            await ws.send(json.dumps({"id": 1, **command}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get("id") != 1:
                    continue
                if not msg.get("success", False):
                    error = msg.get("error") or {}
                    raise RuntimeError(error.get("message") or error.get("code") or "Home Assistant command failed")
                return msg

    async def ha_config_entries(timeout: float = 5.0) -> list[dict[str, Any]]:
        msg = await ha_ws_call({"type": "config_entries/list"}, timeout=timeout)
        entries = msg.get("result", [])
        return entries if isinstance(entries, list) else []

    async def integration_status() -> dict[str, Any]:
        installed = Path("/homeassistant/custom_components/esp_tree/manifest.json").exists()
        entries: list[dict[str, Any]] = []
        status: dict[str, Any] | None = None
        loaded = False
        if settings.supervisor_token:
            try:
                entries = [entry for entry in await ha_config_entries(timeout=3.0) if entry.get("domain") == "esp_tree"]
            except Exception:
                entries = []
            try:
                msg = await ha_ws_call({"type": "esp_tree/status"}, timeout=3.0)
                result = msg.get("result")
                if isinstance(result, dict):
                    status = result
                    loaded = True
            except Exception:
                loaded = False
        bridge_count = int((status or {}).get("bridge_count") or 0)
        remote_count = int((status or {}).get("remote_count") or 0)
        return {
            "installed": installed,
            "loaded": loaded,
            "configured": bool(entries),
            "entry_count": len(entries),
            "bridge_count": bridge_count,
            "remote_count": remote_count,
            "connected": bool((status or {}).get("connected", False)),
        }

    async def clear_local_state() -> None:
        db.init()
        with db.connect() as conn:
            conn.executescript(
                """
                DELETE FROM ota_jobs;
                DELETE FROM devices;
                DELETE FROM bridges;
                """
            )
        marker_path = settings.data_dir / ".cleanup_dismissed"
        marker_path.write_text(str(int(time.time())))
        app.state.cleanup_required = False

    async def validate_cleanup_complete() -> dict[str, Any]:
        try:
            db.init()
            with db.connect() as conn:
                bridges = conn.execute("SELECT COUNT(*) FROM bridges").fetchone()[0]
                devices = conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
                ota_jobs = conn.execute("SELECT COUNT(*) FROM ota_jobs").fetchone()[0]
            if bridges > 0 or devices > 0 or ota_jobs > 0:
                return {
                    "valid": False,
                    "error": f"DB not clean: {bridges} bridges, {devices} devices, {ota_jobs} ota_jobs remain",
                }
            return {"valid": True}
        except Exception as exc:
            return {"valid": False, "error": str(exc)}

    def install_integration_files(reason: str = "custom_component_updated") -> dict[str, Any]:
        src_candidates = [
            Path("/opt/esp-tree/ha_integration/custom_components/esp_tree"),
            Path(__file__).resolve().parents[1] / "ha_integration/custom_components/esp_tree",
        ]
        src = next((path for path in src_candidates if path.exists()), None)
        dst = Path("/homeassistant/custom_components/esp_tree")
        if src is None:
            raise RuntimeError("ESP Tree integration source directory not found")
        if not dst.parent.exists():
            raise RuntimeError("/homeassistant/custom_components is not available")

        version = None
        manifest_path = src / "manifest.json"
        if manifest_path.exists():
            try:
                version = json.loads(manifest_path.read_text(encoding="utf-8")).get("version")
            except Exception:
                version = None

        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        marker_path = dst / ".restart_required.json"
        marker_path.write_text(
            json.dumps(
                {
                    "integration_version": version,
                    "created_at": int(time.time()),
                    "reason": reason,
                }
            ),
            encoding="utf-8",
        )
        return {"source": str(src), "destination": str(dst), "version": version}

    async def announce_supervisor_discovery() -> None:
        if not settings.supervisor_token:
            return
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                "http://supervisor/discovery",
                headers={"Authorization": f"Bearer {settings.supervisor_token}"},
                json={"addon": "esp-tree", "service": "esp_tree"},
            )

    async def integration_autoconfigure_loop() -> None:
        while True:
            try:
                if getattr(app.state, "cleanup_required", False):
                    await asyncio.sleep(30)
                    continue
                status = await integration_status()
                if status["configured"]:
                    return
                if status["installed"]:
                    await announce_supervisor_discovery()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.info("integration auto-configure deferred: %s", exc)
            await asyncio.sleep(30)

    async def check_cleanup_required(include_integration: bool = False) -> tuple[bool, dict[str, Any]]:
        marker_path = settings.data_dir / ".cleanup_dismissed"
        if marker_path.exists():
            return False, {"dismissed": True}
        shared_db_path = settings.database_path
        db_exists = shared_db_path.exists() and shared_db_path.stat().st_size > 0
        bridges_count = 0
        if db_exists:
            try:
                with db.connect() as conn:
                    row = conn.execute("SELECT COUNT(*) as cnt FROM bridges").fetchone()
                    bridges_count = row["cnt"] if row else 0
            except Exception:
                pass
        status = await integration_status() if include_integration else None
        integration_installed = bool(status and status["configured"])
        needs_cleanup = db_exists and (bridges_count > 0 or integration_installed)
        return needs_cleanup, {
            "shared_db_exists": db_exists,
            "bridges_count": bridges_count,
            "integration_installed": integration_installed,
            "integration_loaded": bool(status and status["loaded"]),
        }

    @app.on_event("startup")
    async def startup() -> None:
        nonlocal integration_manager
        db.init()
        server_id_path = settings.data_dir / "server_id"
        if server_id_path.exists():
            server_id = server_id_path.read_text().strip()
        else:
            server_id = uuid.uuid4().hex[:8]
            server_id_path.write_text(server_id)
        app.state.server_id = server_id
        cleanup_required, cleanup_info = await check_cleanup_required()
        app.state.cleanup_required = cleanup_required
        app.state.cleanup_info = cleanup_info
        firmware_store.init()
        firmware_store.cleanup_partials()
        ota_worker.start()
        compile_worker.start()
        integration_manager = IntegrationWsManager(settings, db)
        integration_manager.start()
        app.state.integration_manager = integration_manager
        app.state.autoconfig_task = asyncio.create_task(
            integration_autoconfigure_loop(),
            name="esp-tree-integration-autoconfigure",
        )
        await reconnect_ws_manager()
        asyncio.create_task(log_health_periodically())

    @app.on_event("shutdown")
    async def shutdown() -> None:
        if ws_manager:
            await ws_manager.stop()
        if integration_manager:
            await integration_manager.stop()
        autoconfig_task = getattr(app.state, "autoconfig_task", None)
        if autoconfig_task and not autoconfig_task.done():
            autoconfig_task.cancel()
            try:
                await autoconfig_task
            except asyncio.CancelledError:
                pass
        await compile_worker.stop()
        await ota_worker.stop()

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {
            "ok": True,
            "ws_connected": ws_manager.connected if ws_manager else False,
            "integration_ws_connected": integration_manager.connected if integration_manager else False,
            "bridge_ws_persistent": settings.bridge_ws_persistent,
        }

    @app.get("/api/cleanup/status")
    async def cleanup_status() -> dict[str, Any]:
        if not hasattr(app.state, "cleanup_required"):
            _, info = await check_cleanup_required(include_integration=True)
            return {"cleanup_required": False, **info}
        info = dict(getattr(app.state, "cleanup_info", {}))
        try:
            status = await integration_status()
            info["integration_installed"] = bool(status["configured"])
            info["integration_loaded"] = bool(status["loaded"])
        except Exception:
            pass
        return {
            "cleanup_required": app.state.cleanup_required,
            **info,
        }

    @app.post("/api/cleanup/dismiss")
    async def cleanup_dismiss() -> dict[str, Any]:
        marker_path = settings.data_dir / ".cleanup_dismissed"
        marker_path.write_text(str(int(time.time())))
        app.state.cleanup_required = False
        return {"success": True}

    @app.post("/api/cleanup/trigger")
    async def cleanup_trigger() -> dict[str, Any]:
        if not settings.supervisor_token:
            return {"success": False, "error": "SUPERVISOR_TOKEN not available"}
        try:
            cleanup_result: Any = None
            try:
                cleanup_msg = await ha_ws_call(
                    {"type": "call_service", "domain": "esp_tree", "service": "cleanup"},
                    timeout=30.0,
                )
                cleanup_result = cleanup_msg.get("result")
                await clear_local_state()
            except Exception as service_exc:
                logger.info("ESP Tree cleanup service unavailable, falling back to config entry removal: %s", service_exc)
                for entry in await ha_config_entries():
                    if entry.get("domain") != "esp_tree" or not entry.get("entry_id"):
                        continue
                    await ha_ws_call({"type": "config_entries/remove", "entry_id": entry["entry_id"]}, timeout=15.0)
                await clear_local_state()

            validation = await validate_cleanup_complete()
            if not validation["valid"]:
                return {"success": False, "error": "Cleanup validation failed: " + validation["error"]}

            install_result = install_integration_files(reason="cleanup_reinstall")
            restart_msg: dict[str, Any] = {"success": True, "assumed": True}
            try:
                restart_msg = await ha_ws_call(
                    {"type": "call_service", "domain": "homeassistant", "service": "restart"},
                    timeout=10.0,
                )
            except Exception as restart_exc:
                # Home Assistant may accept the restart request and then close the
                # supervisor WebSocket before sending a result frame.
                if "1000 (OK)" not in str(restart_exc):
                    raise
                logger.info("Home Assistant closed the WebSocket during restart: %s", restart_exc)
            return {
                "success": True,
                "restart_requested": restart_msg.get("success", True),
                "cleanup_result": cleanup_result,
                "install_result": install_result,
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    @app.get("/api/restart-required")
    async def restart_required() -> dict[str, Any]:
        marker_path = Path("/homeassistant/custom_components/esp_tree/.restart_required.json")
        status = await integration_status()
        if marker_path.exists():
            try:
                data = json.loads(marker_path.read_text(encoding="utf-8"))
                return {
                    "restart_required": True,
                    "integration_version": data.get("integration_version"),
                    "created_at": data.get("created_at"),
                    "reason": data.get("reason") or "custom_component_updated",
                    "integration": status,
                }
            except Exception:
                return {
                    "restart_required": True,
                    "integration_version": None,
                    "created_at": None,
                    "reason": "custom_component_updated",
                    "integration": status,
                }
        needs_restart = bool(status["installed"] and not status["loaded"])
        return {
            "restart_required": needs_restart,
            "integration_version": None,
            "created_at": None,
            "reason": "integration_not_loaded" if needs_restart else None,
            "integration": status,
        }

    @app.post("/api/restart")
    async def request_restart() -> dict[str, Any]:
        if not settings.supervisor_token:
            return {"success": False, "error": "SUPERVISOR_TOKEN not available"}
        try:
            import websockets
            async with websockets.connect("ws://supervisor/core/websocket", open_timeout=10, close_timeout=2) as ws:
                await ws.recv()
                await ws.send(json.dumps({"type": "auth", "access_token": settings.supervisor_token}))
                auth = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                if auth.get("type") != "auth_ok":
                    return {"success": False, "error": "HA auth failed"}
                await ws.send(json.dumps({
                    "id": 1,
                    "type": "call_service",
                    "domain": "homeassistant",
                    "service": "restart",
                }))
                result_msg = None
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                    if msg.get("id") == 1:
                        result_msg = msg
                        break
                marker_path = Path("/homeassistant/custom_components/esp_tree/.restart_required.json")
                if marker_path.exists():
                    marker_path.unlink(missing_ok=True)
                return {"success": result_msg.get("success") if result_msg else False, "restart_requested": True}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    @app.get("/api/integration/pending_imports")
    async def pending_imports() -> dict[str, Any]:
        return {"imports": list(app.state.pending_imports.list().values())}

    @app.post("/api/integration/pending_imports")
    async def create_pending_import(request: PendingImportRequest) -> dict[str, Any]:
        return app.state.pending_imports.create(request.model_dump())

    @app.delete("/api/integration/pending_imports/{import_id}")
    async def consume_pending_import(import_id: str) -> dict[str, Any]:
        record = app.state.pending_imports.pop(import_id)
        if record is None:
            raise HTTPException(status_code=404, detail="pending import not found")
        return record

    @app.post("/api/bridge/ws/refresh")
    async def ws_refresh_topology() -> dict[str, Any]:
        manager = control_manager()
        if not manager:
            raise HTTPException(status_code=400, detail="WebSocket transport is not active")
        try:
            await manager.refresh_once()
            return {"type": "topology.snapshot", "nodes": len(manager.get_topology_list())}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.websocket("/ws/topology")
    async def ws_topology(websocket: WebSocket) -> None:
        await websocket.accept()
        manager = control_manager()
        if not manager:
            await websocket.close(code=1011, reason="WebSocket transport is not active")
            return
        q = manager.broadcast.add_client()
        try:
            await websocket.send_json({"type": "server_id", "value": app.state.server_id})
            try:
                topo = await manager.topology()
                await websocket.send_json({"type": "topology.snapshot", "payload": {"nodes": topo}})
            except Exception as exc:
                await websocket.close(code=1011, reason=f"failed to get topology: {exc}")
                return
            while True:
                msg = await q.get()
                await websocket.send_text(msg)
        except Exception:
            pass
        finally:
            manager.broadcast.remove_client(q)

    @app.get("/api/config")
    async def config() -> dict[str, Any]:
        active_bridge = db.get_active_bridge()
        if active_bridge:
            active_bridge = {**active_bridge, "source": "shared_db"}
            if ws_manager and ws_manager.connected:
                topology = ws_manager._topology_cache
                if topology and topology.get("bridge"):
                    bridge_info = topology["bridge"]
                    active_bridge["friendly_name"] = bridge_info.get("friendly_name") or bridge_info.get("label") or bridge_info.get("name", "")
        ws_status = None
        manager = control_manager()
        if manager:
            ws_status = {
                "connected": manager.connected,
                "transport": "ha_integration_ws" if manager is integration_manager else "ws",
                "persistent": settings.bridge_ws_persistent,
            }
        status = await integration_status()
        return {
            "bridge": active_bridge or {},
            "active_bridge": active_bridge,
            "firmware_retention_days": settings.firmware_retention_days,
            "ws_client_enabled": settings.ws_client_enabled,
            "ws_status": ws_status,
            "integration": status,
        }

    @app.put("/api/config")
    async def update_config(patch: dict[str, Any]) -> dict[str, Any]:
        options = _read_options(settings.options_path)
        old_ws_client_enabled = settings.ws_client_enabled
        if "ws_client_enabled" in patch:
            options["ws_client_enabled"] = bool(patch["ws_client_enabled"])
        if "firmware_retention_days" in patch:
            options["firmware_retention_days"] = max(1, int(patch["firmware_retention_days"]))
        settings.options_path.write_text(json.dumps(options, indent=2), encoding="utf-8")
        settings.ws_client_enabled = _bool_option(options, "ws_client_enabled", True)
        settings.firmware_retention_days = max(1, _int_option(options, "firmware_retention_days", 7))
        if old_ws_client_enabled != settings.ws_client_enabled:
            await reconnect_ws_manager()
        return await config()

    @app.get("/api/bridge/discover")
    async def discover_bridges() -> list[dict[str, Any]]:
        net = NetworkDiscovery()
        discovered = await net.discover(timeout=8.0)
        return [{"host": b.host, "port": b.port, "name": b.name, "version": b.version, "network_id": b.network_id} for b in discovered]

    @app.get("/api/bridges")
    async def list_bridges() -> list[dict[str, Any]]:
        return db.list_bridges()

    @app.post("/api/bridges")
    async def add_bridge(req: BridgeAddRequest) -> dict[str, Any]:
        host = req.host.strip()
        if not host:
            raise HTTPException(status_code=400, detail="host is required")
        bridge_candidate = {
            "host": host,
            "port": req.port,
            "name": req.name or "",
            "api_key": req.api_key or "",
        }
        try:
            await validate_bridge_if_possible(bridge_candidate)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        bridge = db.add_bridge(
            host=host,
            port=req.port,
            name=req.name,
            discovered_via="manual",
            api_key=req.api_key or "",
        )
        if not db.get_active_bridge():
            db.set_active_bridge(str(bridge["uuid"]))
            await reconnect_ws_manager()
            bridge = db.get_bridge(str(bridge["uuid"])) or bridge
        return bridge

    @app.put("/api/bridges/{bridge_uuid}")
    async def update_bridge(bridge_uuid: str, req: BridgeUpdateRequest) -> dict[str, Any]:
        existing = db.get_bridge(bridge_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="bridge not found")
        updates: dict[str, Any] = {}
        if req.name is not None:
            updates["name"] = req.name
        if req.host is not None:
            updates["host"] = req.host.strip()
        if req.port is not None:
            updates["port"] = req.port
        if req.api_key is not None:
            updates["api_key"] = req.api_key
        if not updates:
            return existing
        needs_validate = "host" in updates or "port" in updates or "api_key" in updates
        if needs_validate:
            try:
                merged = {**existing, **updates}
                await validate_bridge_if_possible(merged)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        result = db.update_bridge(bridge_uuid, **updates)
        if needs_validate and existing.get("is_active"):
            await reconnect_ws_manager()
        return result or {}

    @app.delete("/api/bridges/{bridge_uuid}")
    async def delete_bridge(bridge_uuid: str) -> dict[str, Any]:
        existing = db.get_bridge(bridge_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="bridge not found")
        db.delete_bridge(bridge_uuid)
        if existing.get("is_active"):
            await reconnect_ws_manager()
        return {"deleted": True, "uuid": bridge_uuid}

    @app.put("/api/bridges/{bridge_uuid}/activate")
    async def activate_bridge(bridge_uuid: str) -> dict[str, Any]:
        existing = db.get_bridge(bridge_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="bridge not found")
        if not str(existing.get("api_key") or "").strip():
            raise HTTPException(status_code=400, detail="API key is required before activation")
        try:
            await validate_bridge_if_possible(existing)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        result = db.set_active_bridge(bridge_uuid)
        await reconnect_ws_manager()
        return result or {}

    @app.put("/api/bridges/{bridge_uuid}/deactivate")
    async def deactivate_bridge(bridge_uuid: str) -> dict[str, Any]:
        existing = db.get_bridge(bridge_uuid)
        if not existing:
            raise HTTPException(status_code=404, detail="bridge not found")
        db.clear_active_bridge(bridge_uuid)
        if existing.get("is_active"):
            await reconnect_ws_manager()
        return db.get_bridge(bridge_uuid) or {}

    @app.post("/api/bridge/select")
    async def select_discovered_bridge(req: BridgeSelectRequest) -> dict[str, Any]:
        host = req.host.strip()
        if not host:
            raise HTTPException(status_code=400, detail="host is required")
        bridge_candidate = {
            "host": host,
            "port": req.port,
            "name": req.name or "",
            "api_key": req.api_key or "",
        }
        try:
            await validate_bridge_if_possible(bridge_candidate)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        bridge = db.add_bridge(
            host=host,
            port=req.port,
            name=req.name,
            discovered_via="network_scan",
            api_key=req.api_key or "",
            network_id=req.network_id or '',
        )
        if not db.get_active_bridge():
            db.set_active_bridge(str(bridge["uuid"]))
            await reconnect_ws_manager()
            bridge = db.get_bridge(str(bridge["uuid"])) or bridge
        return bridge

    @app.get("/api/bridge/topology.json")
    async def topology() -> list[dict[str, Any]]:
        manager = control_manager()
        if not manager:
            raise HTTPException(status_code=503, detail="WebSocket transport is not active")
        try:
            cached = await manager.topology()
            if cached:
                hidden_macs = db.get_hidden_macs()
                for node in cached:
                    node["hidden"] = node.get("mac") in hidden_macs
                return cached
            raise RuntimeError("bridge returned an empty topology")
        except Exception as exc:
            cached = manager.get_topology_list()
            if cached:
                hidden_macs = db.get_hidden_macs()
                for node in cached:
                    node["hidden"] = node.get("mac") in hidden_macs
                return cached
            msg = str(exc)
            if isinstance(exc, OSError) and exc.errno == 113:
                msg = "Bridge is unreachable — make sure the bridge is powered on and connected to the network, then restart the add-on"
            elif "Cannot connect to bridge" in msg:
                msg = "Bridge is unreachable — make sure the bridge is powered on and connected to the network, then restart the add-on"
            raise HTTPException(status_code=502, detail=msg) from exc

    @app.delete("/api/topology/hide/{mac}")
    async def hide_device(mac: str) -> dict[str, Any]:
        target_mac = validate_mac_or_400(mac)
        db.hide_device(target_mac)
        return {"mac": target_mac, "hidden": True}

    @app.post("/api/topology/unhide/{mac}")
    async def unhide_device(mac: str) -> dict[str, Any]:
        target_mac = validate_mac_or_400(mac)
        db.unhide_device(target_mac)
        return {"mac": target_mac, "hidden": False}

    def validate_mac_or_400(value: str, field: str = "mac") -> str:
        compact = re.sub(r"[^0-9A-Fa-f]", "", value or "")
        if len(compact) != 12:
            raise HTTPException(status_code=400, detail=f"{field} must be a valid MAC address")
        return normalize_mac(value)

    async def require_remote_node(mac: str) -> dict[str, Any]:
        target_mac = validate_mac_or_400(mac)
        manager = control_manager()
        if not manager:
            raise HTTPException(status_code=503, detail="WebSocket transport is not active")
        try:
            topo = await manager.topology()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"bridge unavailable: {exc}") from exc
        node = find_node_by_mac(topo, target_mac)
        if not node:
            raise HTTPException(status_code=404, detail="device not found in current topology")
        try:
            hops = int(node.get("hops") or 0)
        except (TypeError, ValueError):
            hops = 0
        if node.get("is_bridge") or hops == 0:
            raise HTTPException(status_code=409, detail="config commands require a remote node")
        if not node.get("online", False):
            raise HTTPException(status_code=409, detail="device is offline")
        return node

    def config_status_code(result: str) -> int:
        if result == "timeout":
            return 504
        if result in {"no_session", "not_remote"}:
            return 409
        return 200

    async def post_device_config(mac: str, command: str, params: dict[str, Any] | None = None) -> JSONResponse:
        await require_remote_node(mac)
        manager = control_manager()
        if not manager or not manager.connected:
            raise HTTPException(status_code=503, detail="WebSocket transport is not connected")
        try:
            result = await manager.send_config(normalize_mac(mac), command, params or {})
        except ConfigTimeoutError:
            return JSONResponse(status_code=504, content={"result": "timeout", "command": command})
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        status = str(result.get("result") or "rejected")
        return JSONResponse(status_code=config_status_code(status), content=result)

    @app.post("/api/devices/{mac}/reboot")
    async def reboot_device(mac: str) -> JSONResponse:
        return await post_device_config(mac, "reboot")

    @app.post("/api/devices/{mac}/heartbeat")
    async def set_device_heartbeat(mac: str, body: HeartbeatConfigRequest) -> JSONResponse:
        if body.interval_seconds < 5 or body.interval_seconds > 3600:
            raise HTTPException(status_code=400, detail="interval_seconds must be 5-3600")
        return await post_device_config(mac, "heartbeat_interval", {"interval_seconds": body.interval_seconds})

    @app.post("/api/devices/{mac}/rediscover")
    async def rediscover_device(mac: str) -> JSONResponse:
        return await post_device_config(mac, "force_rediscover")

    @app.post("/api/devices/{mac}/parent")
    async def set_device_parent(mac: str, body: ParentConfigRequest) -> JSONResponse:
        parent_mac = validate_mac_or_400(body.parent_mac, "parent_mac")
        return await post_device_config(mac, "set_parent_mac", {"parent_mac": parent_mac, "clear": body.clear})

    @app.post("/api/devices/{mac}/relay")
    async def set_device_relay(mac: str, body: RelayConfigRequest) -> JSONResponse:
        return await post_device_config(mac, "relay", {"enable": body.enable})


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
        existing = db.active_job_for_device(target_mac)
        if existing:
            raise HTTPException(status_code=409, detail="this device already has an active or pending OTA job")
        pending = db.get_job_by_mac_and_status(target_mac, PENDING_CONFIRM)
        if pending:
            db.abort_queued_job(pending["id"])
            firmware_store.delete_file(pending.get("firmware_path"))

        try:
            topo = await ws_manager.topology()
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
            db.append_job_event(job_id, "flash_queued", position=queue_order + 1, firmware_name=job.get("firmware_name"), firmware_size=job.get("firmware_size"))
            ota_worker.wake()
            return {"job": db.get_job(job_id), "queue_position": queue_order + 1}
        db.update_job(job_id, status=STARTING, percent=0, error_msg=None)
        db.append_job_event(job_id, "flash_starting")
        ota_worker.wake()
        return {"job": db.get_job(job_id)}

    @app.post("/api/ota/abort")
    async def ota_abort() -> dict[str, Any]:
        job = db.active_job()
        if not job:
            return {"job": None}
        bridge_abort_failed = False
        if ws_manager and ws_manager.connected:
            try:
                ota_client = ws_manager.ota_client
                if ota_client and ota_client.job_id:
                    await ota_client.abort("user")
            except Exception:
                bridge_abort_failed = True
        retained_path, retained_until = firmware_store.retain(job.get("firmware_path"), int(job["id"]))
        db.update_job(int(job["id"]), firmware_path=retained_path, retained_until=retained_until)
        error_msg = "aborted by user"
        if bridge_abort_failed:
            error_msg += " (warning: bridge abort request failed, bridge may still have an active session)"
        db.mark_terminal(int(job["id"]), ABORTED, error_msg=error_msg)
        db.append_job_event(int(job["id"]), "flash_aborted", reason=error_msg)
        ota_worker.wake()
        return {"job": db.get_job(int(job["id"]))}

    @app.delete("/api/ota/pending/{job_id}")
    async def ota_cancel_pending(job_id: int) -> dict[str, Any]:
        job = db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        if job["status"] != PENDING_CONFIRM:
            raise HTTPException(status_code=409, detail=f"job is not in pending_confirm status: {job['status']}")
        firmware_store.delete_file(job.get("firmware_path"))
        db.abort_queued_job(job_id)
        return {"ok": True, "job_id": job_id}

    @app.get("/api/ota/history")
    async def ota_history(limit: int = 100) -> dict[str, Any]:
        return {"jobs": db.list_history(limit=limit)}

    @app.get("/api/ota/history/{mac}")
    async def ota_history_for_mac(mac: str, limit: int = 100) -> dict[str, Any]:
        return {"jobs": db.list_history(mac=mac, limit=limit)}

    @app.get("/api/ota/jobs/{job_id}/log")
    async def ota_job_log(job_id: int) -> dict[str, Any]:
        result = db.get_job_log(job_id)
        if not result:
            raise HTTPException(status_code=404, detail="job not found")
        return result

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
        source_firmware_info = {
            "esphome_name": source.get("parsed_esphome_name"),
            "parsed_build_date": source.get("parsed_build_date"),
            "chip_name": source.get("parsed_chip_name"),
        }
        node_for_preflight = {
            "esphome_name": device.get("esphome_name"),
            "firmware_build_date": device.get("firmware_build_date"),
            "chip_name": device.get("chip_name"),
        }
        preflight = preflight_comparison(node_for_preflight, source_firmware_info)
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
                "preflight_warnings": json.dumps(preflight["warnings"]),
            }
        )
        return {"job": job, "preflight": preflight}

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
            manager = control_manager()
            if not manager:
                raise HTTPException(status_code=503, detail="WebSocket transport is not active")
            try:
                topo = await manager.topology()
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
        raise HTTPException(
            status_code=503,
            detail="Compilation is not available. Native ESPHome compilation is not yet implemented in this build.",
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
            topo = await ws_manager.topology()
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
        queue_position = db.count_compile_queued_before(job["id"]) + 1 + (1 if active_compile else 0)

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
                pos = db.count_compile_queued_before(compile_job["id"]) + 1
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
            pos = db.count_queued_before(compile_job["id"]) + 1
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
                    yield "event: status\ndata: compile_queued\n\n"
                    yield f"event: queue_position\ndata: {pos}\n\n"
                    await asyncio.sleep(2)
                    current = db.get_job(compile_job["id"])
                    if not current or current["status"] not in (COMPILE_QUEUED, COMPILING):
                        yield "event: status\ndata: queued\n\n"
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
                yield "event: status\ndata: queued\n\n"
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
        return {
            "image": "",
            "available": False,
            "tag": "",
            "error": "Native compilation not implemented",
        }

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
            job = db.get_job_by_mac_and_status(nm, PENDING_CONFIRM)
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

    @app.get("/api/integration/activity")
    async def integration_activity(request: Request) -> StreamingResponse:
        share_log_path = settings.database_path.parent / "activity.log"

        async def event_generator() -> AsyncGenerator[str, None]:
            conn_id = uuid.uuid4().hex
            pos_key = f"activity_{conn_id}"
            _activity_log_positions[pos_key] = None

            try:
                if not share_log_path.exists():
                    yield "event: error\ndata: log file not found\n\n"
                    return

                file_size = share_log_path.stat().st_size
                chunk_size = 64 * 1024

                if _activity_log_positions.get(pos_key) is None:
                    if file_size <= chunk_size:
                        content = await asyncio.to_thread(share_log_path.read_text, encoding="utf-8")
                        lines = content.splitlines()
                    else:
                        lines = await asyncio.to_thread(_read_last_lines_backward, share_log_path, chunk_size)
                    _activity_log_positions[pos_key] = file_size
                    for line in lines:
                        if line.strip():
                            yield f"event: line\ndata: {line}\n\n"
                else:
                    prev_pos = _activity_log_positions.get(pos_key) or 0
                    current_size = share_log_path.stat().st_size
                    if current_size < prev_pos:
                        prev_pos = 0
                    if current_size > prev_pos:
                        new_content = await asyncio.to_thread(
                            lambda: share_log_path.read_text(encoding="utf-8")[prev_pos:]
                        )
                        _activity_log_positions[pos_key] = current_size
                        for line in new_content.splitlines():
                            if line.strip():
                                yield f"event: line\ndata: {line}\n\n"

                yield "event: end\ndata: \n\n"

            except Exception as exc:
                yield f"event: error\ndata: {exc}\n\n"
            finally:
                _activity_log_positions.pop(pos_key, None)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    _activity_log_positions: dict[str, int | None] = {}

    def _read_last_lines_backward(path: Path, chunk_size: int = 65536) -> list[str]:
        lines: list[str] = []
        with open(path, "rb") as f:
            f.seek(0, 2)
            file_size = f.tell()
            remain = file_size
            while remain > 0:
                seek_pos = max(0, f.tell() - chunk_size)
                f.seek(seek_pos)
                chunk = f.read(chunk_size)
                remain = seek_pos
                chunk_lines = chunk.decode("utf-8", errors="replace").splitlines()
                if not chunk_lines:
                    continue
                if remain > 0:
                    chunk_lines = chunk_lines[1:]
                lines = chunk_lines + lines
                if seek_pos == 0:
                    break
                f.seek(seek_pos)
        return lines

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
        if getattr(app.state, "cleanup_required", False):
            return HTMLResponse(CLEANUP_PAGE_HTML)
        index_path = static_dir / "index.html"
        if not index_path.exists():
            return HTMLResponse("<!doctype html><title>ESP Tree</title><p>Frontend build is missing.</p>", status_code=503)
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
