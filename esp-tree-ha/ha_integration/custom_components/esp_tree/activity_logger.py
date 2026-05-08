from __future__ import annotations

import logging
import logging.handlers
from pathlib import Path

from .const import SHARED_LOG_PATH


def _ensure_share_dir() -> None:
    share_dir = Path(SHARED_LOG_PATH).parent
    share_dir.mkdir(parents=True, exist_ok=True)


class ActivityLogger:
    _instance: logging.Logger | None = None

    @classmethod
    def get(cls) -> logging.Logger:
        if cls._instance is None:
            _ensure_share_dir()
            logger = logging.getLogger("esp_tree.activity")
            logger.setLevel(logging.INFO)
            if not logger.handlers:
                handler = logging.handlers.RotatingFileHandler(
                    SHARED_LOG_PATH,
                    maxBytes=5 * 1024 * 1024,
                    backupCount=3,
                )
                formatter = logging.Formatter(
                    "%(asctime)s %(levelname)-8s %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S",
                )
                handler.setFormatter(formatter)
                logger.addHandler(handler)
                logger.propagate = False
            cls._instance = logger
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        if cls._instance:
            for h in cls._instance.handlers[:]:
                cls._instance.removeHandler(h)
                h.close()
            cls._instance = None
