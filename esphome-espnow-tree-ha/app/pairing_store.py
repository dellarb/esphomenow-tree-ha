from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any


class PendingImportStore:
    def __init__(self, path: Path, ttl_s: int = 600) -> None:
        self.path = path
        self.ttl_s = ttl_s

    def create(self, record: dict[str, Any]) -> dict[str, Any]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = self.list(include_expired=False)
        import_id = uuid.uuid4().hex
        pending = {
            "id": import_id,
            "created_ts": int(time.time()),
            "expires_ts": int(time.time()) + self.ttl_s,
            **record,
        }
        data[import_id] = pending
        self._write(data)
        return pending

    def list(self, include_expired: bool = False) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            raw = json.loads(self.path.read_text())
        except (OSError, json.JSONDecodeError):
            return {}
        now = int(time.time())
        data = {
            key: value
            for key, value in raw.items()
            if include_expired or int(value.get("expires_ts", 0)) > now
        }
        if data != raw:
            self._write(data)
        return data

    def pop(self, import_id: str) -> dict[str, Any] | None:
        data = self.list(include_expired=False)
        record = data.pop(import_id, None)
        self._write(data)
        return record

    def _write(self, data: dict[str, dict[str, Any]]) -> None:
        self.path.write_text(json.dumps(data, indent=2, sort_keys=True))
