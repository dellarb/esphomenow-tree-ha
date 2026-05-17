from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal


PENDING_CONFIRM = "pending_confirm"
COMPILE_QUEUED = "compile_queued"
COMPILING = "compiling"
COMPILE_SUCCESS = "compile_success"
QUEUED = "queued"
STARTING = "starting"
ANNOUNCING = "announcing"
TRANSFERRING = "transferring"
VERIFYING = "verifying"
WAITING_REJOIN = "transfer_success_waiting_rejoin"
SUCCESS = "success"
FAILED = "failed"
ABORTED = "aborted"
REJOIN_TIMEOUT = "rejoin_timeout"
VERSION_MISMATCH = "version_mismatch"

TERMINAL_STATUSES = {COMPILE_SUCCESS, SUCCESS, FAILED, ABORTED, REJOIN_TIMEOUT, VERSION_MISMATCH}
ACTIVE_STATUSES = {COMPILE_QUEUED, COMPILING, QUEUED, STARTING, ANNOUNCING, TRANSFERRING, VERIFYING, WAITING_REJOIN}
FLASH_STATUSES = {STARTING, ANNOUNCING, TRANSFERRING, VERIFYING, WAITING_REJOIN}


@dataclass
class BridgeTarget:
    host: str
    port: int = 80
    source: str = "manual"
    name: str = ""
    api_key: str = ""
    transport: Literal["wifi", "serial"] = "wifi"
    serial_port: str = ""
    baud: int = 460800


@dataclass
class DiscoveredBridge:
    host: str
    port: int
    name: str
    version: str
    network_id: str = ""
    hostname: str = ""


def now_ts() -> int:
    return int(time.time())


def normalize_mac(value: str | None) -> str:
    if not value:
        return ""
    compact = re.sub(r"[^0-9A-Fa-f]", "", value)
    if len(compact) != 12:
        return value.strip().upper()
    pairs = [compact[i : i + 2].upper() for i in range(0, 12, 2)]
    return ":".join(pairs)


def mac_key(value: str | None) -> str:
    return re.sub(r"[^0-9A-Fa-f]", "", value or "").lower()


def slugish(value: str | None) -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"[^a-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def node_key_from_topology(node: dict[str, Any]) -> str:
    explicit = slugish(str(node.get("esphome_name") or ""))
    if explicit:
        return explicit
    return mac_key(str(node.get("mac") or ""))


def is_terminal(status: str | None) -> bool:
    return (status or "") in TERMINAL_STATUSES


def find_node_by_mac(topology: list[dict[str, Any]], target_mac: str) -> dict[str, Any] | None:
    normalized_target = normalize_mac(target_mac)
    for node in topology:
        if normalize_mac(str(node.get("mac") or "")) == normalized_target:
            return node
    return None


def parse_build_datetime(s: str) -> float | None:
    cleaned = s.strip()
    cleaned = re.sub(r"\s+UTC\s*$", "", cleaned)

    m = re.match(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})", cleaned)
    if m:
        dt = datetime.fromisoformat(f"{m.group(1)}T{m.group(2)}")
        return dt.replace(tzinfo=timezone.utc).timestamp()

    m = re.match(r"(\w{3,9})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}:\d{2}:\d{2})", cleaned)
    if m:
        dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)} {m.group(4)}", "%b %d %Y %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).timestamp()

    m = re.match(r"(\w{3,9})\s+(\d{1,2})\s+(\d{4})$", cleaned)
    if m:
        dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%b %d %Y")
        return dt.replace(hour=0, minute=0, second=0, tzinfo=timezone.utc).timestamp()

    m = re.match(r"(\d{4}-\d{2}-\d{2})$", cleaned)
    if m:
        dt = datetime.strptime(m.group(1), "%Y-%m-%d")
        return dt.replace(hour=0, minute=0, second=0, tzinfo=timezone.utc).timestamp()

    return None
