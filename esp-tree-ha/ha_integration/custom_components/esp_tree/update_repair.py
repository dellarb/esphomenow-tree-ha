from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import async_track_time_interval

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
_MODULE_IMPORTED_AT = int(time.time())

MARKER_FILE = ".restart_required.json"
ISSUE_ID = "restart_required"


async def async_start_update_repair_watcher(hass: HomeAssistant) -> None:
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("update_repair_unsub"):
        return

    async def _tick(_now=None) -> None:
        await _sync_restart_issue(hass)

    await _sync_restart_issue(hass)
    unsub: Callable[[], None] = async_track_time_interval(hass, _tick, timedelta(seconds=60))
    domain_data["update_repair_unsub"] = unsub


async def _sync_restart_issue(hass: HomeAssistant) -> None:
    marker_path = Path(__file__).resolve().parent / MARKER_FILE
    if not marker_path.exists():
        ir.async_delete_issue(hass, DOMAIN, ISSUE_ID)
        return
    if _restart_marker_is_stale(marker_path):
        try:
            marker_path.unlink()
        except OSError as exc:
            _LOGGER.debug("Could not remove stale ESP Tree restart marker: %s", exc)
        ir.async_delete_issue(hass, DOMAIN, ISSUE_ID)
        return

    ir.async_create_issue(
        hass,
        DOMAIN,
        ISSUE_ID,
        is_fixable=True,
        severity=ir.IssueSeverity.WARNING,
        translation_key=ISSUE_ID,
        translation_placeholders={"name": "ESP Tree"},
    )


def _restart_marker_is_stale(marker_path: Path) -> bool:
    try:
        created_at = int(json.loads(marker_path.read_text(encoding="utf-8")).get("created_at") or 0)
    except Exception:
        created_at = 0
    return created_at <= _MODULE_IMPORTED_AT
