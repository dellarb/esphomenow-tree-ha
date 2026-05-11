#!/usr/bin/env python3
import os
import re


def fix_includes_in_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    old_content = content
    content = re.sub(
        r'#include\s+"\.\./include/([^"]+)"', r'#include "include/\1"', content
    )
    content = re.sub(
        r'#include\s+"\.\./\.\./include/([^"]+)"', r'#include "include/\1"', content
    )

    if content != old_content:
        print(f"Fixed includes in {filepath}")
        with open(filepath, "w") as f:
            f.write(content)
        return True
    return False


def main():
    bridge_files = [
        "device_code/components/esp_tree_bridge/bridge_protocol.h",
        "device_code/components/esp_tree_bridge/bridge_protocol.cpp",
        "device_code/components/esp_tree_bridge/esp_tree_bridge.h",
        "device_code/components/esp_tree_bridge/esp_tree_bridge.cpp",
        "device_code/components/esp_tree_bridge/protocol/bridge_protocol.h",
        "device_code/components/esp_tree_bridge/protocol/bridge_protocol.cpp",
        "device_code/components/esp_tree_bridge/protocol/remote_protocol.h",
        "device_code/components/esp_tree_bridge/protocol/remote_protocol.cpp",
    ]

    remote_files = [
        "device_code/components/esp_tree_remote/esp_tree_remote.h",
        "device_code/components/esp_tree_remote/esp_tree_remote.cpp",
        "device_code/components/esp_tree_remote/remote_protocol.h",
        "device_code/components/esp_tree_remote/remote_protocol.cpp",
    ]

    all_files = bridge_files + remote_files

    fixed_count = 0
    for filepath in all_files:
        if os.path.exists(filepath):
            if fix_includes_in_file(filepath):
                fixed_count += 1

    print(f"Fixed {fixed_count} files")

    crypto_cpp = "device_code/components/esp_tree_bridge/include/espnow_crypto.cpp"
    crypto_h = "device_code/components/esp_tree_bridge/include/espnow_crypto.h"

    if os.path.exists(crypto_h):
        with open(crypto_h, "r") as f:
            content = f.read()
        content = re.sub(
            r'#include\s+"espnow_types.h"', r'#include "espnow_types.h"', content
        )
        with open(crypto_h, "w") as f:
            f.write(content)
        print(f"Checked {crypto_h}")


if __name__ == "__main__":
    main()
