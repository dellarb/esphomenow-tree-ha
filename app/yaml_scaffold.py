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

CHIP_NAME_TO_BOARD: dict[str, dict[str, str]] = {
    "ESP32": {"platform": "esp32", "board": "esp32dev", "framework": "esp-idf"},
    "ESP32-S2": {"platform": "esp32-s2", "board": "esp32-s2-saola", "framework": "esp-idf"},
    "ESP32-S3": {"platform": "esp32-s3", "board": "esp32-s3-devkitc-1", "framework": "esp-idf"},
    "ESP32-C3": {"platform": "esp32-c3", "board": "esp32-c3-devkitm-1", "framework": "esp-idf"},
    "ESP32-C2": {"platform": "esp32-c2", "board": "esp32-c2-devkitm-1", "framework": "esp-idf"},
    "ESP32-C6": {"platform": "esp32-c6", "board": "esp32-c6-devkitc", "framework": "esp-idf"},
    "ESP32-H2": {"platform": "esp32-h2", "board": "esp32-h2-devkitm-1", "framework": "esp-idf"},
    "ESP32-C5": {"platform": "esp32-c5", "board": "esp32-c5-devkitc", "framework": "esp-idf"},
    "ESP32-C61": {"platform": "esp32-c5", "board": "esp32-c5-devkitc", "framework": "esp-idf"},
    "ESP32-P4": {"platform": "esp32-s3", "board": "esp32-s3-devkitc-1", "framework": "esp-idf"},
    "ESP8266": {"platform": "esp8266", "board": "esp01_1m", "framework": "arduino"},
}


def esphome_platform_key(board_info: dict[str, str]) -> str:
    platform = board_info["platform"]
    if platform.startswith("esp32"):
        return "esp32"
    return platform


def chip_type_to_board(chip_type: int) -> dict[str, str] | None:
    return CHIP_TYPE_TO_BOARD.get(chip_type)


def chip_name_to_board(chip_name: str | None) -> dict[str, str] | None:
    if chip_name is None:
        return None
    return CHIP_NAME_TO_BOARD.get(chip_name)


def find_board_info(node: dict[str, Any]) -> tuple[dict[str, str] | None, bool]:
    chip_type = node.get("chip_type")
    try:
        chip_type_int = int(chip_type) if chip_type is not None else 0
    except (TypeError, ValueError):
        chip_type_int = 0

    board_info = chip_type_to_board(chip_type_int)
    if board_info is not None:
        return board_info, False

    chip_name = node.get("chip_name")
    board_info = chip_name_to_board(chip_name)
    if board_info is not None:
        return board_info, False

    return None, chip_name


def generate_scaffold(node: dict[str, Any]) -> tuple[str, bool]:
    esphome_name = str(node.get("esphome_name") or node.get("label") or "").strip()
    if not esphome_name:
        raise ValueError("device has no esphome_name or label, cannot generate scaffold")

    board_info, chip_unknown = find_board_info(node)
    is_bridge = bool(node.get("is_bridge"))
    is_8266 = board_info is not None and board_info["platform"] == "esp8266"
    if is_bridge:
        remote_component = "esp_tree_bridge"
    elif is_8266:
        remote_component = "espnow_82xx_remote"
    else:
        remote_component = "esp_tree_remote"
    espnow_mode = "regular" if is_8266 else "lr"

    if board_info is None:
        chip_type = node.get("chip_type")
        try:
            chip_type_int = int(chip_type) if chip_type is not None else 0
        except (TypeError, ValueError):
            chip_type_int = 0
        chip_name = chip_unknown if isinstance(chip_unknown, str) else node.get("chip_name", "unknown")
        lines = [
            "esphome:",
            f"  name: {esphome_name}",
            "",
            f"# Unknown chip (chip_type={chip_type_int}, chip_name={chip_name}).",
            "# Create a config manually or use import.",
            "",
            "external_components:",
            "  - source:",
            "      type: local",
            "      path: /opt/esp-tree/components",
            f"    components: [{remote_component}, esp_tree_common]",
            "",
            "logger:",
            "  level: DEBUG",
            "",
            f"{remote_component}:",
            "  network_id: !secret espnow_network_id",
            "  psk: !secret espnow_psk",
            "  ota_over_espnow: true",
            f"  espnow_mode: {espnow_mode}",
            "",
            "# Add your sensors, switches, etc. below",
            "",
        ]
        return "\n".join(lines), True

    lines = [
        "esphome:",
        f"  name: {esphome_name}",
        "",
        f"{esphome_platform_key(board_info)}:",
        f"  board: {board_info['board']}",
        "  framework:",
        f"    type: {board_info['framework']}",
        "",
        "external_components:",
        "  - source:",
        "      type: local",
        "      path: /opt/esp-tree/components",
        f"    components: [{remote_component}, esp_tree_common]",
        "",
        "logger:",
        "  level: DEBUG",
        "",
        f"{remote_component}:",
        "  network_id: !secret espnow_network_id",
        "  psk: !secret espnow_psk",
        "  ota_over_espnow: true",
        "  espnow_mode: lr",
        "",
        "# Add your sensors, switches, etc. below",
        "",
    ]

    return "\n".join(lines), False
