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
    firmware_retention_days: int
    bridge_ws_persistent: bool = True
    ws_client_enabled: bool = True
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
    data_dir = Path(os.environ.get("ESP_TREE_DATA_DIR", "/data"))
    shared_dir = Path(os.environ.get("ESP_TREE_SHARED_DIR", "/share/esp_tree"))
    options_path = Path(os.environ.get("ESP_TREE_OPTIONS_PATH", data_dir / "options.json"))
    options = _read_options(options_path)

    retention_days = max(1, _int_option(options, "firmware_retention_days", 7))
    bridge_ws_persistent = _bool_option(options, "bridge_ws_persistent", True)
    ws_client_enabled = _bool_option(options, "ws_client_enabled", True)

    return Settings(
        data_dir=data_dir,
        options_path=options_path,
        database_path=Path(os.environ.get("ESP_TREE_DB", shared_dir / "esp_tree.db")),
        firmware_dir=Path(os.environ.get("ESP_TREE_FIRMWARE_DIR", data_dir / "firmware")),
        static_dir=Path(os.environ.get("ESP_TREE_STATIC_DIR", root / "ui" / "dist")),
        supervisor_token=os.environ.get("SUPERVISOR_TOKEN", ""),
        firmware_retention_days=retention_days,
        bridge_ws_persistent=bridge_ws_persistent,
        ws_client_enabled=ws_client_enabled,
    )
