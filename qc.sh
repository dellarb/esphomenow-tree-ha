#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ESPLR_V2_DIR="$(realpath "$SCRIPT_DIR/../ESPLR_V2" 2>/dev/null || echo "")"

# --- Sync ESPHome components from ESPLR_V2 ---
COMPONENTS_DIR="$SCRIPT_DIR/esphome-espnow-tree-ha/components"
if [ -n "$ESPLR_V2_DIR" ] && [ -d "$ESPLR_V2_DIR/components" ]; then
  echo "ESPLR_V2 found at $ESPLR_V2_DIR"
  read -r -p "Sync components from ESPLR_V2? [y/N] " -n 1 reply
  echo
  if [[ "$reply" =~ ^[Yy]$ ]]; then
    echo "Syncing components from ESPLR_V2..."
    rsync -a --delete "$ESPLR_V2_DIR/components/" "$COMPONENTS_DIR/"
    echo "Components synced."
  else
    echo "Skipping component sync."
  fi
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
    IFS='.' read -ra v1 <<< "$ver1"
    IFS='.' read -ra v2 <<< "$ver2"
    for i in 0 1 2; do
        local p1="${v1[$i]:-0}"
        local p2="${v2[$i]:-0}"
        if [ "$p1" -lt "$p2" ]; then return 1; fi
        if [ "$p1" -gt "$p2" ]; then return 2; fi
    done
    return 0
}

max_version() {
    local v1="$1"
    local v2="$2"
    if compare_versions "$v1" "$v2"; then
        echo "$v1"
    else
        echo "$v2"
    fi
}

SERVER_PY="$SCRIPT_DIR/esphome-espnow-tree-ha/app/server.py"
old_server=$(grep -oP 'version="\K[^"]+' "$SERVER_PY")

PKG_JSON="$SCRIPT_DIR/esphome-espnow-tree-ha/ui/package.json"
old_ui=$(grep -oP '"version": "\K[^"]+' "$PKG_JSON")

CONFIG_YAML="$SCRIPT_DIR/esphome-espnow-tree-ha/config.yaml"
old_cfg=$(grep -oP '^version: \K\S+' "$CONFIG_YAML")

max=$(max_version "$old_server" "$old_ui")
max=$(max_version "$max" "$old_cfg")

if [ "$old_server" = "$old_ui" ] && [ "$old_ui" = "$old_cfg" ]; then
    new_version=$(bump_patch "$old_server")
    echo "Versions aligned at $old_server, bumping to $new_version"
else
    new_version=$(bump_patch "$max")
    echo "Versions out of alignment (server=$old_server, ui=$old_ui, cfg=$old_cfg)"
    echo "Using highest ($max) +1 = $new_version for all"
fi

new_server="$new_version"
new_ui="$new_version"
new_cfg="$new_version"

# --- Prompt for commit message ---
read -r -p "Commit message: " commit_msg

# --- Confirm before applying bumps and committing (only if no commit message provided) ---
if [ -z "$commit_msg" ]; then
    read -r -p "No commit message provided. Go ahead with version bump and commit? [y/N] " -n 1 confirm
    echo
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Cancelled - no files edited."
        exit 0
    fi
fi

# --- Apply version bumps ---
sed -i "s/version=\"$old_server\"/version=\"$new_server\"/" "$SERVER_PY"
sed -i "s/\"version\": \"$old_ui\"/\"version\": \"$new_ui\"/" "$PKG_JSON"
sed -i "s/^version: $old_cfg/version: $new_cfg/" "$CONFIG_YAML"

# --- Commit and push ---
cd "$SCRIPT_DIR"
git add -A
git commit -m "$commit_msg"
git push

rm -rf "$COMPONENTS_DIR"
echo "Components folder removed."
