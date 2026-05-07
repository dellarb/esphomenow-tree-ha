#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ESPLR_V2_DIR="$(realpath "$SCRIPT_DIR/../ESPLR_V2" 2>/dev/null || echo "")"
QUICK_MODE=false

if [[ "${1:-}" == "quick" ]]; then
    QUICK_MODE=true
fi

# --- Sync ESPHome components from ESPLR_V2 ---
COMPONENTS_DIR="$SCRIPT_DIR/esp-tree-ha/components"
if [ -n "$ESPLR_V2_DIR" ] && [ -d "$ESPLR_V2_DIR/components" ]; then
    echo "ESPLR_V2 found at $ESPLR_V2_DIR"
    echo "Syncing components from ESPLR_V2..."
    rsync -a --delete "$ESPLR_V2_DIR/components/" "$COMPONENTS_DIR/"
    echo "Components synced."
else
    echo "Warning: ESPLR_V2 not found at $ESPLR_V2_DIR, components directory may be stale."
fi

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

SERVER_PY="$SCRIPT_DIR/esp-tree-ha/app/server.py"
old_server=$(grep -oP 'version="\K[^"]+' "$SERVER_PY")

PKG_JSON="$SCRIPT_DIR/esp-tree-ha/ui/package.json"
old_ui=$(grep -oP '"version": "\K[^"]+' "$PKG_JSON")

CONFIG_YAML="$SCRIPT_DIR/esp-tree-ha/config.yaml"
old_cfg=$(grep -oP '^version: \K\S+' "$CONFIG_YAML")

ROOT_MANIFEST="$SCRIPT_DIR/esp-tree-ha/ha_integration/custom_components/esp_tree/manifest.json"
old_manifest_root=$(grep -oP '"version": "\K[^"]+' "$ROOT_MANIFEST")

addon_max=$(max_version "$old_server" "$old_ui")
addon_max=$(max_version "$addon_max" "$old_cfg")

new_addon_version=$(bump_patch "$addon_max")

new_integration_version=$(bump_patch "$old_manifest_root")

new_server="$new_addon_version"
new_ui="$new_addon_version"
new_cfg="$new_addon_version"
new_manifest_root="$new_integration_version"

# --- Apply version bumps ---
sed -i "s/version=\"$old_server\"/version=\"$new_server\"/" "$SERVER_PY"
sed -i "s/\"version\": \"$old_ui\"/\"version\": \"$new_ui\"/" "$PKG_JSON"
sed -i "s/^version: $old_cfg/version: $new_cfg/" "$CONFIG_YAML"
sed -i "s/\"version\": \"$old_manifest_root\"/\"version\": \"$new_manifest_root\"/" "$ROOT_MANIFEST"

cd "$SCRIPT_DIR"

if $QUICK_MODE; then
    commit_msg="QuickPush"
else
    # --- Generate commit message via ask-kimi ---
    DIFF=$(git diff HEAD -- ':!esp-tree-ha/components/**')
    if [ -n "$DIFF" ]; then
        TMPFILE=$(mktemp)
        echo "$DIFF" > "$TMPFILE"
        echo "Generating commit message..."
        if ! commit_msg=$(ask-kimi --paths "$TMPFILE" --question "Return ONLY the commit message line. Format: type: description. Types: feat, fix, chore, refactor, docs." --max-tokens 500 2>&1); then
            rm -f "$TMPFILE"
            echo "Warning: Failed to generate commit message: $commit_msg"
            read -r -p "Enter commit message manually: " commit_msg
            if [ -z "$commit_msg" ]; then
                echo "Cancelled."
                exit 0
            fi
        else
            rm -f "$TMPFILE"
            commit_msg=$(echo "$commit_msg" | sed 's/<[^>]*>//g' | grep -v '^$' | tail -1)
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

# --- Commit and push ---
git add -A
git commit -m "$commit_msg"
git push

rm -rf "$COMPONENTS_DIR"
echo "Components folder removed."

echo ""
echo "Released Version:"
echo ""
echo "  _____   ____   _____ _______ ______   _  ____  _   _______      _  _  _  _  _   "
echo " |_____) |  _ \ |____/ |  ____ |_____/  | |/ _ \| | |  ___  |    | || |_| | |   |"
echo " |  \_   | |_) ||  \  | |___  |  \     | || |_| || | | |   | |    | ||  _  || |   |"
echo " |____)  |____/ |__|  |______|_|  \____|_|\___/|___|_|_|   |_|    |_|_| |_||___| |_|"
printf '\n  v%s\n\n' "$new_addon_version"
