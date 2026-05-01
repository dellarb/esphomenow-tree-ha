from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


APP_DESC_MAGIC = b"\x32\x54\xcd\xab"
ESP_IMAGE_MAGIC = 0xE9

CHIP_TYPES = {
    0x0000: "ESP32",
    0x0002: "ESP32-S2",
    0x0005: "ESP32-C3",
    0x0009: "ESP32-S3",
    0x000C: "ESP32-C2",
    0x000D: "ESP32-C6",
    0x0010: "ESP32-H2",
    0x0012: "ESP32-P4",
    0x0014: "ESP32-C61",
    0x0017: "ESP32-C5",
    0x0019: "ESP32-H21",
    0x001C: "ESP32-H4",
    0x001F: "ESP32-S3/FH",
}


@dataclass
class FirmwareInfo:
    valid: bool
    error: str | None
    chip_type: int | None
    chip_name: str | None
    app_version: str
    project_name: str
    build_time: str
    build_date: str
    idf_version: str
    parsed_version: str
    app_desc_offset: int | None

    def as_dict(self) -> dict:
        return {
            "valid": self.valid,
            "error": self.error,
            "chip_type": self.chip_type,
            "chip_name": self.chip_name,
            "app_version": self.app_version,
            "project_name": self.project_name,
            "build_time": self.build_time,
            "build_date": self.build_date,
            "idf_version": self.idf_version,
            "parsed_version": self.parsed_version,
            "esphome_name": self.project_name,
            "esphome_version": self.app_version,
            "parsed_build_date": self.formatted_build_date,
            "app_desc_offset": self.app_desc_offset,
        }

    @property
    def formatted_build_date(self) -> str:
        if not self.build_date:
            return ""
        return f"{self.build_date} {self.build_time}".strip()


def _read_c_string(data: bytes, offset: int, length: int) -> str:
    if offset < 0 or offset >= len(data):
        return ""
    raw = data[offset : offset + length]
    raw = raw.split(b"\x00", 1)[0]
    return raw.decode("utf-8", errors="replace").strip()


def _find_app_desc(data: bytes) -> int | None:
    limit = min(len(data), 8192)
    found = data[:limit].find(APP_DESC_MAGIC)
    if found >= 0:
        return found
    return None


def parse_firmware(path: Path) -> FirmwareInfo:
    with path.open("rb") as handle:
        data = handle.read(8192)

    if not data:
        return FirmwareInfo(False, "firmware file is empty", None, None, "", "", "", "", "", "", None)
    if data[0] != ESP_IMAGE_MAGIC:
        return FirmwareInfo(False, "file does not start with an ESP image magic byte", None, None, "", "", "", "", "", "", None)
    if len(data) < 16:
        return FirmwareInfo(False, "firmware file is too small to contain an ESP image header", None, None, "", "", "", "", "", "", None)

    chip_type = int.from_bytes(data[12:14], "little", signed=False)
    chip_name = CHIP_TYPES.get(chip_type, f"Unknown 0x{chip_type:04x}")
    desc_offset = _find_app_desc(data)
    if desc_offset is None or desc_offset + 160 > len(data):
        return FirmwareInfo(True, None, chip_type, chip_name, "", "", "", "", "", "", desc_offset)

    app_version = _read_c_string(data, desc_offset + 16, 32)
    project_name = _read_c_string(data, desc_offset + 48, 32)
    build_time = _read_c_string(data, desc_offset + 80, 16)
    build_date = _read_c_string(data, desc_offset + 96, 16)
    idf_version = _read_c_string(data, desc_offset + 112, 32)
    parsed_version = app_version or idf_version

    return FirmwareInfo(
        valid=True,
        error=None,
        chip_type=chip_type,
        chip_name=chip_name,
        app_version=app_version,
        project_name=project_name,
        build_time=build_time,
        build_date=build_date,
        idf_version=idf_version,
        parsed_version=parsed_version,
        app_desc_offset=desc_offset,
    )
