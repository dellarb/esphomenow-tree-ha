from __future__ import annotations

from typing import Any

CHIP_TYPE_TO_BOARD: dict[int, dict[str, str]] = {
    1: {"platform": "esp32", "board": "esp32dev", "framework": "esp-idf"},
    2: {"platform": "esp32-s2", "board": "esp32-s2-saola", "framework": "esp-idf"},
    5: {"platform": "esp32-c3", "board": "esp32-c3-devkitm-1", "framework": "esp-idf"},
    9: {"platform": "esp32-s3", "board": "esp32-s3-devkitc-1", "framework": "esp-idf"},
    12: {"platform": "esp32-c2", "board": "esp32-c2-devkitm-1", "framework": "esp-idf"},
    13: {"platform": "esp32-c6", "board": "esp32-c6-devkitc", "framework": "esp-idf"},
    16: {"platform": "esp32-h2", "board": "esp32-h2-devkitm-1", "framework": "esp-idf"},
    23: {"platform": "esp32-c5", "board": "esp32-c5-devkitc", "framework": "esp-idf"},
    0x8266: {"platform": "esp8266", "board": "esp01_1m", "framework": "arduino"},
    0x8236: {"platform": "esp8266", "board": "esp01_1m", "framework": "arduino"},
}


def chip_type_to_board(chip_type: int) -> dict[str, str] | None:
    return CHIP_TYPE_TO_BOARD.get(chip_type)


def generate_scaffold(node: dict[str, Any]) -> tuple[str, bool]:
    esphome_name = str(node.get("esphome_name") or node.get("label") or "").strip()
    if not esphome_name:
        raise ValueError("device has no esphome_name or label, cannot generate scaffold")

    chip_type = node.get("chip_type")
    try:
        chip_type_int = int(chip_type) if chip_type is not None else 0
    except (TypeError, ValueError):
        chip_type_int = 0

    board_info = chip_type_to_board(chip_type_int)
    is_bridge = bool(node.get("is_bridge"))
    remote_component = "esp_tree_bridge" if is_bridge else "esp_tree_remote"

    if board_info is None:
        lines = [
            "esphome:",
            f"  name: {esphome_name}",
            "",
            "external_components:",
            "  - source:",
            "      type: local",
            "      path: /external/components",
            "",
            f"esp32:  # TODO: Unknown chip type {chip_type_int}. Verify in topology settings before compiling.",
            "  board: esp32-NONE",
            "  framework:",
            "    type: esp-idf",
            "",
            "logger:",
            "  level: DEBUG",
            "",
            f"{remote_component}:",
            "  network_id: !secret network_id",
            "  psk: !secret psk",
            "  ota_over_espnow: true",
            "  espnow_mode: lr",
            "",
            "# Add your sensors, switches, etc. below",
            "",
        ]
        return "\n".join(lines), True

    lines = [
        "esphome:",
        f"  name: {esphome_name}",
        "",
        "external_components:",
        "  - source:",
        "      type: local",
        "      path: /external/components",
        "",
        f"{board_info['platform']}:",
        f"  board: {board_info['board']}",
        "  framework:",
        f"    type: {board_info['framework']}",
        "",
        "logger:",
        "  level: DEBUG",
        "",
        f"{remote_component}:",
        "  network_id: !secret network_id",
        "  psk: !secret psk",
        "  ota_over_espnow: true",
        "  espnow_mode: lr",
        "",
        "# Add your sensors, switches, etc. below",
        "",
    ]

    return "\n".join(lines), False
