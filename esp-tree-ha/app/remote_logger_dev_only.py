from __future__ import annotations

import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Any

LOG_SERVER_URL = "http://10.1.1.23:9999"
SOURCE = "addon"


class RemoteLoggerDevOnly(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "source": SOURCE,
                "component": record.module,
                "message": record.getMessage(),
                "data": _extract_data(record),
            }
            body = __import__("json").dumps(entry, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(
                f"{LOG_SERVER_URL}/log",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=1.0)
        except Exception:
            pass


def _extract_data(record: logging.LogRecord) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if record.exc_info:
        result["exc_info"] = __import__("traceback").format_exception(*record.exc_info)
    if record.stack_info:
        result["stack_info"] = record.stack_info
    return result


_remote_logger: logging.Logger | None = None


def setup_remote_logger() -> logging.Logger:
    global _remote_logger
    if _remote_logger is None:
        _remote_logger = logging.getLogger()
        _remote_logger.addHandler(RemoteLoggerDevOnly())
    return _remote_logger


def get_remote_logger() -> logging.Logger:
    return setup_remote_logger()
