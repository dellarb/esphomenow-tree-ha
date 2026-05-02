from __future__ import annotations

import json
from pathlib import Path
from typing import Any


COMPILE_STATUSES = {"idle", "pulling_image", "compiling", "success", "failed"}


class CompileStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def _status_path(self, esphome_name: str) -> Path:
        return self.root / esphome_name / "compile_status.json"

    def _log_path(self, esphome_name: str) -> Path:
        return self.root / esphome_name / "compile.log"

    def _error_path(self, esphome_name: str) -> Path:
        return self.root / esphome_name / "compile_error.log"

    def get_status(self, esphome_name: str) -> dict[str, Any]:
        path = self._status_path(esphome_name)
        if not path.exists():
            return {"status": "idle", "esphome_name": esphome_name}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"status": "idle", "esphome_name": esphome_name}

    def set_status(self, esphome_name: str, status: str, **kwargs: Any) -> None:
        path = self._status_path(esphome_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {"status": status, "esphome_name": esphome_name, **kwargs}
        path.write_text(json.dumps(data), encoding="utf-8")

    def clear_status(self, esphome_name: str) -> None:
        self.set_status(esphome_name, "idle")

    def save_log(self, esphome_name: str, log_text: str) -> None:
        path = self._log_path(esphome_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(log_text, encoding="utf-8")

    def save_error_log(self, esphome_name: str, log_text: str) -> None:
        path = self._error_path(esphome_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(log_text, encoding="utf-8")

    def get_log(self, esphome_name: str) -> str:
        path = self._log_path(esphome_name)
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8")

    def get_error_log(self, esphome_name: str) -> str:
        path = self._error_path(esphome_name)
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8")

    def is_any_compiling(self) -> bool:
        if not self.root.exists():
            return False
        for entry in self.root.iterdir():
            if entry.is_dir():
                status = self.get_status(entry.name)
                if status.get("status") in {"pulling_image", "compiling"}:
                    return True
        return False

    def current_compiling(self) -> str | None:
        if not self.root.exists():
            return None
        for entry in self.root.iterdir():
            if entry.is_dir():
                status = self.get_status(entry.name)
                if status.get("status") in {"pulling_image", "compiling"}:
                    return entry.name
        return None
