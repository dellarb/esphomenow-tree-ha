from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Settings:
    data_dir: Path
    options_path: Path
    database_path: Path
    firmware_dir: Path
    static_dir: Path
    supervisor_token: str
    bridge_host: str
    bridge_port: int
    firmware_retention_days: int
    bridge_transport: str = "http"
    bridge_api_key: str = ""
    bridge_ws_persistent: bool = False
    ota_rejoin_timeout_s: int = 180
    ota_transfer_timeout_s: int = 1800


def _read_options(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _int_option(options: dict, key: str, default: int) -> int:
    value = os.environ.get(key.upper(), options.get(key, default))
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _bool_option(options: dict, key: str, default: bool = False) -> bool:
    value = os.environ.get(key.upper(), options.get(key, default))
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def load_settings() -> Settings:
    root = Path(__file__).resolve().parents[1]
    data_dir = Path(os.environ.get("ESPNOW_TREE_DATA_DIR", "/data"))
    options_path = Path(os.environ.get("ESPNOW_TREE_OPTIONS_PATH", data_dir / "options.json"))
    options = _read_options(options_path)

    bridge_host = os.environ.get("BRIDGE_HOST", str(options.get("bridge_host", "") or "")).strip()
    bridge_port = _int_option(options, "bridge_port", 80)
    retention_days = max(1, _int_option(options, "firmware_retention_days", 7))
    bridge_transport = os.environ.get("BRIDGE_TRANSPORT", str(options.get("bridge_transport", "http") or "http")).strip().lower()
    if bridge_transport not in ("http", "ws"):
        bridge_transport = "http"
    bridge_api_key = os.environ.get("BRIDGE_API_KEY", str(options.get("bridge_api_key", "") or "")).strip()
    bridge_ws_persistent = _bool_option(options, "bridge_ws_persistent", False)

    return Settings(
        data_dir=data_dir,
        options_path=options_path,
        database_path=Path(os.environ.get("ESPNOW_TREE_DB", data_dir / "espnow_tree.db")),
        firmware_dir=Path(os.environ.get("ESPNOW_TREE_FIRMWARE_DIR", data_dir / "firmware")),
        static_dir=Path(os.environ.get("ESPNOW_TREE_STATIC_DIR", root / "ui" / "dist")),
        supervisor_token=os.environ.get("SUPERVISOR_TOKEN", ""),
        bridge_host=bridge_host,
        bridge_port=bridge_port,
        firmware_retention_days=retention_days,
        bridge_transport=bridge_transport,
        bridge_api_key=bridge_api_key,
        bridge_ws_persistent=bridge_ws_persistent,
    )
