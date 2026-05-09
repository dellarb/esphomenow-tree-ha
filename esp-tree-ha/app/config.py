from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


@dataclass
class Settings:
    data_dir: Path
    options_path: Path
    database_path: Path
    firmware_dir: Path
    static_dir: Path
    supervisor_token: str
    addon_url: str
    firmware_retention_days: int
    scan_subnets: str = ""
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


def _default_addon_url() -> str:
    token = os.environ.get("SUPERVISOR_TOKEN", "").strip()
    if not token:
        return "http://127.0.0.1:8099"
    request = Request(
        "http://supervisor/addons/self/info",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            return "http://127.0.0.1:8099"
        hostname = str(data.get("hostname") or data.get("slug") or "").strip()
        if not hostname:
            return "http://127.0.0.1:8099"
        hostname = hostname.replace("_", "-")
        return f"http://{hostname}:8099"
    except (OSError, ValueError, URLError):
        return "http://127.0.0.1:8099"


def load_settings() -> Settings:
    root = Path(__file__).resolve().parents[1]
    data_dir = Path(os.environ.get("ESP_TREE_DATA_DIR", "/data"))
    options_path = Path(os.environ.get("ESP_TREE_OPTIONS_PATH", data_dir / "options.json"))
    options = _read_options(options_path)

    retention_days = max(1, _int_option(options, "firmware_retention_days", 7))
    return Settings(
        data_dir=data_dir,
        options_path=options_path,
        database_path=Path(os.environ.get("ESP_TREE_DB", data_dir / "esp_tree" / "esp_tree.db")),
        firmware_dir=Path(os.environ.get("ESP_TREE_FIRMWARE_DIR", data_dir / "firmware")),
        static_dir=Path(os.environ.get("ESP_TREE_STATIC_DIR", root / "ui" / "dist")),
        supervisor_token=os.environ.get("SUPERVISOR_TOKEN", ""),
        addon_url=os.environ.get("ESP_TREE_ADDON_URL", options.get("addon_url", _default_addon_url())),
        firmware_retention_days=retention_days,
        scan_subnets=str(options.get("scan_subnets", "") or ""),
    )
