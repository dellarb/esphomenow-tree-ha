from __future__ import annotations

import re
from typing import Any

from .models import parse_build_datetime


CHIP_TYPE_DECIMAL = {
    1: "ESP32",
    2: "ESP32-S2",
    5: "ESP32-C3",
    9: "ESP32-S3",
    12: "ESP32-C2",
    13: "ESP32-C6",
    16: "ESP32-H2",
    18: "ESP32-P4",
    20: "ESP32-C61",
    23: "ESP32-C5",
    25: "ESP32-H21",
    28: "ESP32-H4",
    31: "ESP32-S3/FH",
}


def preflight_comparison(node: dict[str, Any], info: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []

    current_name = str(node.get("esphome_name") or "").strip()
    new_name = str(info.get("esphome_name") or "").strip()
    name_match = bool(current_name and new_name and current_name == new_name)

    current_build_date = str(node.get("firmware_build_date") or "").strip()
    new_build_date = str(info.get("parsed_build_date") or "").strip()
    build_date_status = "unknown"
    build_date_delta = ""
    if current_build_date and new_build_date:
        try:
            current_ts = parse_build_datetime(current_build_date)
            new_ts = parse_build_datetime(new_build_date)
            if current_ts is not None and new_ts is not None:
                diff = current_ts - new_ts
                abs_diff = abs(diff)
                if diff == 0:
                    build_date_status = "same"
                elif diff > 0:
                    build_date_status = "older"
                    build_date_delta = _format_time_delta(abs_diff)
                else:
                    build_date_status = "newer"
                    build_date_delta = _format_time_delta(abs_diff)
        except Exception:
            pass


def _format_time_delta(seconds: float) -> str:
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    mins = int((seconds % 3600) // 60)
    if days > 0:
        return f"+{days}d"
    if hours > 0:
        return f"+{hours}h"
    return f"+{mins}m"

    current_chip_name = node.get("chip_name")
    new_chip_name = info.get("chip_name")
    chip_match = bool(current_chip_name and new_chip_name and current_chip_name == new_chip_name)
    if current_chip_name and new_chip_name and current_chip_name != new_chip_name:
        warnings.append(f"Firmware chip '{new_chip_name}' does not match device chip '{current_chip_name}'.")
    elif not current_chip_name or not new_chip_name:
        warnings.append("Chip metadata is incomplete; the remote will perform final image validation.")
    if build_date_status == "newer":
        warnings.append(f"Uploaded firmware build date is newer than the device's current firmware (current: {current_build_date}, new: {new_build_date}). This is a normal upgrade.")
    elif build_date_status == "older":
        warnings.append(f"Uploaded firmware build date is older than the device's current firmware (current: {current_build_date}, new: {new_build_date}). This is a downgrade — verify intentional.")

    return {
        "name": {"current": current_name, "new": new_name, "match": name_match},
        "build_date": {"current": current_build_date, "new": new_build_date, "status": build_date_status, "delta": build_date_delta},
        "chip": {"current": current_chip_name or "", "new": new_chip_name or "", "match": chip_match},
        "has_warnings": len(warnings) > 0,
        "warnings": warnings,
    }