from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

LOG_TAIL_BYTES = 256 * 1024


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

    def get_log_tail(self, esphome_name: str, *, error: bool = False, max_bytes: int = LOG_TAIL_BYTES) -> str:
        path = self._error_path(esphome_name) if error else self._log_path(esphome_name)
        if not path.exists():
            return ""
        size = path.stat().st_size
        offset = max(0, size - max_bytes)
        with path.open("rb") as handle:
            handle.seek(offset)
            content = handle.read()
        text = content.decode("utf-8", errors="replace")
        if offset > 0:
            text = f"[log truncated to last {max_bytes // 1024} KiB]\n{text}"
        return text

    def copy_log_to_error(self, esphome_name: str) -> None:
        log_path = self._log_path(esphome_name)
        if not log_path.exists():
            return
        error_path = self._error_path(esphome_name)
        error_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(log_path, error_path)

    def is_any_compiling(self) -> bool:
        if not self.root.exists():
            return False
        for entry in self.root.iterdir():
            if entry.is_dir():
                status = self.get_status(entry.name)
                if status.get("status") in {"pulling_image", "compiling"}:
                    return True
        return False
