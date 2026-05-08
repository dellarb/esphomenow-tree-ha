from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def norm_mac(value: str) -> str:
    clean = "".join(ch for ch in value.upper() if ch in "0123456789ABCDEF")
    if len(clean) == 12:
        return ":".join(clean[i : i + 2] for i in range(0, 12, 2))
    return value.upper()


@dataclass(slots=True)
class EntityModel:
    remote_mac: str
    object_id: str
    platform: str
    name: str
    native_type: str = ""
    unit: str = ""
    device_class: str = ""
    state_class: str = ""
    options_json: str = ""
    writable: bool = False
    available: bool = False
    value: Any = None
    observed_unix_ms: int = 0
    missing_from_schema: bool = False

    @property
    def unique_id(self) -> str:
        return f"{norm_mac(self.remote_mac).replace(':', '').lower()}_{self.object_id}"


@dataclass(slots=True)
class RemoteModel:
    remote_mac: str
    name: str = ""
    esphome_name: str = ""
    manufacturer: str = "ESPHome"
    model: str = "espnow_lr_remote"
    project_name: str = ""
    project_version: str = ""
    firmware_build_date: str = ""
    firmware_md5: str = ""
    schema_hash: str = ""
    bridge_mac: str = ""
    parent_mac: str = ""
    session_id: str = ""
    last_tx_counter: int = 0
    last_live_observed_ms: int = 0
    online: bool = False
    rssi: int | None = None
    hops_to_bridge: int | None = None
    chip_name: str = ""
uptime_s: int = 0
    entities: dict[str, EntityModel] = field(default_factory=dict)

    @property
    def display_name(self) -> str:
        return self.name or self.esphome_name or norm_mac(self.remote_mac)
