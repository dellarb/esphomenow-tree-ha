from __future__ import annotations

from typing import Any


def integration_restart_decision(
    status: dict[str, Any],
    latest_version: str | None,
    marker: dict[str, Any] | None = None,
    marker_exists: bool = False,
) -> dict[str, Any]:
    marker = marker or {}
    latest = str(latest_version or marker.get("integration_version") or "")
    live_connected = bool(status.get("live_connected") or status.get("ws_client_connected"))
    live_version = str(status.get("live_version") or "")
    fallback_version = str(
        status.get("ha_status_version")
        or status.get("runtime_version")
        or (status.get("version") if not live_version else "")
        or ""
    )
    running_version = live_version or fallback_version
    fallback_loaded = bool(status.get("loaded") or status.get("runtime_loaded") or status.get("entry_loaded"))
    reason = marker.get("reason")
    source = "none"

    if live_connected:
        source = "live"
        if running_version and latest:
            required = running_version != latest
        else:
            required = bool(marker_exists)
    elif fallback_loaded and running_version and latest:
        source = "fallback"
        required = running_version != latest
    else:
        source = "marker" if marker_exists else "none"
        required = bool(marker_exists)

    if required and not reason and running_version and latest and running_version != latest:
        reason = "integration_version_mismatch"

    clear_marker = bool(marker_exists and running_version and latest and running_version == latest)
    return {
        "required": bool(required),
        "running_version": running_version or None,
        "latest_version": latest or None,
        "target_version": latest or None,
        "reason": reason,
        "source": source,
        "marker_present": bool(marker_exists),
        "clear_marker": clear_marker,
    }
