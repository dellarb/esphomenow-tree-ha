from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any


PENDING_CONFIRM = "pending_confirm"
QUEUED = "queued"
STARTING = "starting"
TRANSFERRING = "transferring"
VERIFYING = "verifying"
WAITING_REJOIN = "transfer_success_waiting_rejoin"
SUCCESS = "success"
FAILED = "failed"
ABORTED = "aborted"
REJOIN_TIMEOUT = "rejoin_timeout"
VERSION_MISMATCH = "version_mismatch"

TERMINAL_STATUSES = {SUCCESS, FAILED, ABORTED, REJOIN_TIMEOUT, VERSION_MISMATCH}
ACTIVE_STATUSES = {PENDING_CONFIRM, QUEUED, STARTING, TRANSFERRING, VERIFYING, WAITING_REJOIN}


@dataclass(frozen=True)
class BridgeTarget:
    host: str
    port: int = 80
    source: str = "manual"

    @property
    def base_url(self) -> str:
        host = self.host.strip()
        if host.startswith("http://") or host.startswith("https://"):
            return host.rstrip("/")
        return f"http://{host}:{self.port}".rstrip("/")


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


def is_active(status: str | None) -> bool:
    return (status or "") in ACTIVE_STATUSES


def find_node_by_mac(topology: list[dict[str, Any]], target_mac: str) -> dict[str, Any] | None:
    normalized_target = normalize_mac(target_mac)
    for node in topology:
        if normalize_mac(str(node.get("mac") or "")) == normalized_target:
            return node
    return None
