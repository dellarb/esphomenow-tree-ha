#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEV_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUICK_MODE=false

if [[ "${1:-}" == "quick" ]]; then
    QUICK_MODE=true
fi

COMPILE_SCRIPT="${SCRIPT_DIR}/device_code/scripts/ha_compile.sh"
LOG_LISTENER="${SCRIPT_DIR}/log_listener.py"

show_menu() {
    echo ""
    echo "================================================"
    echo "  ESP Tree Dev Menu"
    echo "================================================"
    echo ""
    echo "  [Build]"
    echo "  1)  ESPHome build menu"
    echo "  2)  Build C++ tests"
    echo ""
    echo "  [QA & Release]"
    echo "  3)  Quick Commit"
    echo "  4)  Version info"
    echo ""
    echo "  [Utilities]"
    echo "  5)  USB flash (manual port)"
    echo "  6)  View esplog"
    echo "  7)  Clean builds / __pycache__"
    echo "  0)  Exit"
    echo ""
}

show_version_info() {
    local server="${SCRIPT_DIR}/app/server.py"
    local pkg_json="${SCRIPT_DIR}/ui/package.json"
    local cfg_yaml="${SCRIPT_DIR}/config.yaml"
    local manifest="${SCRIPT_DIR}/ha_integration/custom_components/esp_tree/manifest.json"

    echo ""
    echo "  Version Info"
    echo "  ------------"
    echo "  server.py:      $(grep -oP 'version="\K[^"]+' "$server")"
    echo "  package.json:    $(grep -oP '"version": "\K[^"]+' "$pkg_json")"
    echo "  config.yaml:    $(grep -oP '^version: \K\S+' "$cfg_yaml")"
    echo "  manifest.json:   $(grep -oP '"version": "\K[^"]+' "$manifest")"
    echo ""
}

do_build_menu() {
    export CACHE_DIR="${SCRIPT_DIR}/cache/builds"
    export DOCKER_CACHE_DIR="${SCRIPT_DIR}/cache/docker_compiler"
    bash "${COMPILE_SCRIPT}" "$@"
}

do_build_cpp() {
    echo "==> Building C++ tests..."
    local test_dir="${SCRIPT_DIR}/device_code/tests"
    local build_dir="${test_dir}/build"
    mkdir -p "${build_dir}"
    cd "${build_dir}"
    cmake .. && make
    echo "==> C++ build complete."
}

do_run_cpp() {
    echo "==> Running C++ tests..."
    local build_dir="${SCRIPT_DIR}/device_code/tests/build"
    if [ ! -f "${build_dir}/CTest" ] && [ -d "${build_dir}" ]; then
        cd "${build_dir}" && ctest --output-on-failure
    else
        echo "No tests found. Run 'dev.sh build-cpp' first."
    fi
}

do_qc() {
    echo ""
    echo "==> Starting QC pipeline..."
    echo ""

    LOG_SESSION="esp_tree_log"
    if ! screen -ls 2>/dev/null | grep -q "$LOG_SESSION"; then
        echo "Starting log listener in screen session '$LOG_SESSION'..."
        screen -dmS "$LOG_SESSION" python3 "$LOG_LISTENER"
    else
        echo "Log listener already running in screen session '$LOG_SESSION'."
    fi

    echo ""
    echo "==> Regenerating protobuf..."
    local proto_dir="${SCRIPT_DIR}/app/protobuf"
    local ha_proto_dir="${SCRIPT_DIR}/ha_integration/custom_components/esp_tree/protobuf"

    rm -f "${proto_dir}/esp_tree_runtime_pb2.py" \
           "${proto_dir}/esp_tree_runtime_pb2.pyi" \
           "${ha_proto_dir}/esp_tree_runtime_pb2.py" \
           "${ha_proto_dir}/esp_tree_runtime_pb2.pyi"

    for out_dir in "${proto_dir}/generated" "${ha_proto_dir}/generated"; do
        python3 -m grpc_tools.protoc \
            -I "${proto_dir}" \
            --python_out="${out_dir}" \
            --pyi_out="${out_dir}" \
            "${proto_dir}/esp_tree_runtime.proto"
    done

    python3 -c "
import sys
sys.path.insert(0, '${proto_dir}/generated')
from esp_tree_runtime_pb2 import RemoteRuntime, RemoteAvailabilityEvent, TopologyChangedEvent, RemoteStateEvent
assert hasattr(RemoteRuntime(), 'uptime_s')
assert hasattr(RemoteAvailabilityEvent(), 'uptime_s')
assert hasattr(TopologyChangedEvent(), 'uptime_s')
assert hasattr(RemoteStateEvent(), 'uptime_s')
assert hasattr(RemoteStateEvent(), 'rssi')
assert hasattr(RemoteStateEvent(), 'hops_to_bridge')
assert hasattr(RemoteStateEvent(), 'tx_counter')
assert hasattr(RemoteStateEvent(), 'bridge_mac')
"

    if ! diff -q "${proto_dir}/esp_tree_runtime.proto" "${ha_proto_dir}/esp_tree_runtime.proto" > /dev/null 2>&1; then
        echo "ERROR: .proto files are out of sync!"
        diff "${proto_dir}/esp_tree_runtime.proto" "${ha_proto_dir}/esp_tree_runtime.proto"
        exit 1
    fi

    for f in esp_tree_runtime_pb2.py esp_tree_runtime_pb2.pyi; do
        if ! diff -q "${proto_dir}/generated/$f" "${ha_proto_dir}/generated/$f" > /dev/null 2>&1; then
            echo "ERROR: Generated $f files are out of sync!"
            exit 1
        fi
    done

    echo "Protobuf sync check OK."
    echo "Protobuf regeneration OK."

    if [ -f "${SCRIPT_DIR}/requirements-compile.txt" ]; then
        echo "Current ESPHome version: $(grep 'esphome==' "${SCRIPT_DIR}/requirements-compile.txt" | cut -d= -f3)"
    fi

    echo ""
    echo "==> Bumping versions..."
    bump_patch() {
        local ver="$1"
        IFS='.' read -ra parts <<< "$ver"
        local major="${parts[0]}"
        local minor="${parts[1]:-0}"
        local patch="${parts[2]:-0}"
        patch=$((patch + 1))
        echo "${major}.${minor}.${patch}"
    }

    compare_versions() {
        local ver1="$1"
        local ver2="$2"
        IFS='.' read -ra parts1 <<< "$ver1"
        IFS='.' read -ra parts2 <<< "$ver2"
        for i in 0 1 2; do
            local p1="${parts1[$i]:-0}"
            local p2="${parts2[$i]:-0}"
            if [ "$p1" -lt "$p2" ]; then return 1; fi
            if [ "$p1" -gt "$p2" ]; then return 2; fi
        done
        return 0
    }

    max_version() {
        local v1="$1"
        local v2="$2"
        compare_versions "$v1" "$v2"
        case $? in
            0) echo "$v2" ;;
            1) echo "$v2" ;;
            2) echo "$v1" ;;
        esac
    }

local server_py="${SCRIPT_DIR}/app/server.py"
    local old_server=$(grep -oP 'version="\K[^"]+' "$server_py")

    local pkg_json="${SCRIPT_DIR}/ui/package.json"
    local old_ui=$(grep -oP '"version": "\K[^"]+' "$pkg_json")

    local cfg_yaml="${SCRIPT_DIR}/config.yaml"
    local old_cfg=$(grep -oP '^version: \K\S+' "$cfg_yaml")

    local root_manifest="${SCRIPT_DIR}/ha_integration/custom_components/esp_tree/manifest.json"
    local old_manifest_root=$(grep -oP '"version": "\K[^"]+' "$root_manifest")

    local addon_max=$(max_version "$old_server" "$old_ui")
    addon_max=$(max_version "$addon_max" "$old_cfg")

    local new_addon_version=$(bump_patch "$addon_max")
    local new_integration_version=$(bump_patch "$old_manifest_root")

    sed -i "s/version=\"$old_server\"/version=\"$new_addon_version\"/" "$server_py"
    sed -i "s/\"version\": \"$old_ui\"/\"version\": \"$new_addon_version\"/" "$pkg_json"
    sed -i "s/^version: $old_cfg/version: $new_addon_version/" "$cfg_yaml"
    sed -i "s/\"version\": \"$old_manifest_root\"/\"version\": \"$new_integration_version\"/" "$root_manifest"

    if $QUICK_MODE; then
        commit_msg="QuickPush"
    else
        local diff_output
        diff_output=$(git diff HEAD -- ':!ui/dist/**')
        if [ -n "$diff_output" ]; then
            local tmpfile
            tmpfile=$(mktemp)
            echo "$diff_output" > "$tmpfile"
            echo "Generating commit message..."
            if commit_msg=$(ask-kimi --paths "$tmpfile" --question "Return ONLY the commit message line. Format: type: description. Types: feat, fix, chore, refactor, docs." --max-tokens 500 2>&1); then
                rm -f "$tmpfile"
                commit_msg=$(echo "$commit_msg" | sed 's/<[^>]*>//g' | grep -v '^$' | tail -1)
            else
                rm -f "$tmpfile"
                echo "Warning: Failed to generate commit message"
                read -r -p "Enter commit message manually: " commit_msg
                if [ -z "$commit_msg" ]; then
                    echo "Cancelled."
                    exit 0
                fi
            fi
            echo ""
            echo "Proposed commit message:"
            echo "$commit_msg"
            echo ""
            read -r -p "Use this message? [Y/n] " -n 1 confirm
            echo
            if [[ "$confirm" =~ ^[Nn]$ ]]; then
                echo "Cancelled."
                exit 0
            fi
        else
            commit_msg="bump versions"
        fi
    fi

    echo ""
    echo "==> Building UI..."
    cd "${SCRIPT_DIR}/ui"
    rm -rf dist
    npm ci
    npm run build
    cd "${SCRIPT_DIR}"
    git add ui/dist/

    echo ""
    echo "==> Committing..."
    git add -A
    git commit -m "$commit_msg"
    git push

    echo ""
    echo "Released Version:"
    echo ""
    echo "   ____  _____  ____  ____  ____  _     _____ ____  "
    echo "  / ___||_   _||  _ \|  _ \|  _ \| |   | ____|  _ \ "
    echo "  \___ \  | |  | |_) | |_) | |_) | |   |  _| | |_) |"
    echo "   ___) | | |  |  __/|  __/|  __/| |___| |___|  _ < "
    echo "  |____/  |_|  |_|   |_|   |_|   |_____|_____|_| \_\ "
    printf '\n  v%s  %s\n\n' "$new_addon_version" "$(date '+%Y-%m-%d %H:%M:%S')"
}

do_usb_flash() {
    local port="${1:-}"
    local demo="${2:-}"

    if [ -z "$port" ] || [ -z "$demo" ]; then
        echo "Usage: dev.sh flash-usb <port> <demo>"
        echo "  port: /dev/ttyUSB0 or ttyUSB0"
        echo "  demo: e.g. espnow-bridge-c5"
        exit 1
    fi

    export CACHE_DIR="${SCRIPT_DIR}/cache/builds"
    export DOCKER_CACHE_DIR="${SCRIPT_DIR}/cache/docker_compiler"
    bash "${COMPILE_SCRIPT}" usb "$port" "$demo"
}

do_view_esplog() {
    bash "${SCRIPT_DIR}/device_code/scripts/ha_esplog.sh" "$@"
}

do_clean() {
    echo "==> Cleaning __pycache__..."
    local count
    count=$(find "${SCRIPT_DIR}" -type d -name "__pycache__" 2>/dev/null | wc -l)
    if [ "${count}" -gt 0 ]; then
        find "${SCRIPT_DIR}" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
        echo "==> Removed ${count} __pycache__ folder(s)"
    else
        echo "No __pycache__ folders found."
    fi

    echo ""
    echo "==> Cleaning ESPhome build cache..."
    rm -rf "${SCRIPT_DIR}/device_code/demos/.esphome"
    echo "==> ESPhome cache cleaned."
}

if [ $# -eq 0 ]; then
    show_menu
    read -rp "Select option: " CHOICE
    while [[ "${CHOICE}" != "0" ]]; do
        case "${CHOICE}" in
            1)
                do_build_menu "$@"
                ;;
            2)
                do_build_cpp
                ;;
            3)
                if [[ "${1:-}" == "quick" ]]; then
                    QUICK_MODE=true
                fi
                do_qc
                ;;
            4)
                show_version_info
                ;;
            5)
                shift
                do_usb_flash "$@"
                ;;
            6)
                shift
                do_view_esplog "$@"
                ;;
            7)
                do_clean
                ;;
            *)
                echo "Invalid option: ${CHOICE}"
                ;;
        esac
        echo ""
        show_menu
        read -rp "Select option: " CHOICE
    done
    echo "Exiting."
    exit 0
fi

case "$1" in
    compile)
        shift
        do_build_menu "$@"
        ;;
    build-cpp)
        do_build_cpp
        ;;
    run-cpp)
        do_run_cpp
        ;;
    qc)
        shift
        if [[ "${1:-}" == "quick" ]]; then
            QUICK_MODE=true
            shift
        fi
        do_qc
        ;;
    flash-usb)
        shift
        do_usb_flash "$@"
        ;;
    esplog)
        shift
        do_view_esplog "$@"
        ;;
    clean)
        do_clean
        ;;
    *)
        echo "Usage: dev.sh [compile|build-cpp|run-cpp|qc|flash-usb|esplog|clean] [args...]"
        exit 1
        ;;
esac