#!/usr/bin/env python3
import os
import re


def fix_includes_in_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    # Fix include paths
    # Change "../include/" to "include/" (relative to component root)
    # Change "../../include/" to "include/" (relative to subdirectory)
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
    # Fix bridge component
    bridge_files = [
        "components/esp_tree_bridge/bridge_protocol.h",
        "components/esp_tree_bridge/bridge_protocol.cpp",
        "components/esp_tree_bridge/esp_tree_bridge.h",
        "components/esp_tree_bridge/esp_tree_bridge.cpp",
        "components/esp_tree_bridge/protocol/bridge_protocol.h",
        "components/esp_tree_bridge/protocol/bridge_protocol.cpp",
        "components/esp_tree_bridge/protocol/remote_protocol.h",
        "components/esp_tree_bridge/protocol/remote_protocol.cpp",
    ]

    # Fix remote component
    remote_files = [
        "components/esp_tree_remote/esp_tree_remote.h",
        "components/esp_tree_remote/esp_tree_remote.cpp",
        "components/esp_tree_remote/remote_protocol.h",
        "components/esp_tree_remote/remote_protocol.cpp",
    ]

    all_files = bridge_files + remote_files

    fixed_count = 0
    for filepath in all_files:
        if os.path.exists(filepath):
            if fix_includes_in_file(filepath):
                fixed_count += 1

    print(f"Fixed {fixed_count} files")

    # Also need to update the include path in the shared crypto files
    crypto_cpp = "components/esp_tree_bridge/include/espnow_crypto.cpp"
    crypto_h = "components/esp_tree_bridge/include/espnow_crypto.h"

    # The crypto files might include espnow_types.h
    if os.path.exists(crypto_h):
        with open(crypto_h, "r") as f:
            content = f.read()
        content = re.sub(
            r'#include\s+"espnow_types.h"', r'#include "espnow_types.h"', content
        )
        with open(crypto_h, "w") as f:
            f.write(content)
        print(f"Checked {crypto_h}")

    # Update validation script
    with open("validate_components.py", "r") as f:
        content = f.read()
    content = re.sub(
        r"components/include/", r"components/esp_tree_bridge/include/", content
    )
    content = re.sub(
        r"Shared headers directory: components/include/",
        r"Shared headers directory: components/esp_tree_bridge/include/ (copied to both components)",
        content,
    )
    with open("validate_components.py", "w") as f:
        f.write(content)
    print("Updated validation script")


if __name__ == "__main__":
    main()
