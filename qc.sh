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

# --- Bump server.py ---
SERVER_PY="$SCRIPT_DIR/esphome-espnow-tree-ha/app/server.py"
old_server=$(grep -oP 'version="\K[^"]+' "$SERVER_PY")
new_server=$(bump_patch "$old_server")
sed -i "s/version=\"$old_server\"/version=\"$new_server\"/" "$SERVER_PY"
echo "server.py: $old_server -> $new_server"

# --- Bump package.json ---
PKG_JSON="$SCRIPT_DIR/esphome-espnow-tree-ha/ui/package.json"
old_ui=$(grep -oP '"version": "\K[^"]+' "$PKG_JSON")
new_ui=$(bump_patch "$old_ui")
sed -i "s/\"version\": \"$old_ui\"/\"version\": \"$new_ui\"/" "$PKG_JSON"
echo "package.json: $old_ui -> $new_ui"

# --- Bump config.yaml ---
CONFIG_YAML="$SCRIPT_DIR/esphome-espnow-tree-ha/config.yaml"
old_cfg=$(grep -oP '^version: \K\S+' "$CONFIG_YAML")
new_cfg=$(bump_patch "$old_cfg")
sed -i "s/^version: $old_cfg/version: $new_cfg/" "$CONFIG_YAML"
echo "config.yaml: $old_cfg -> $new_cfg"

# --- Prompt for commit message ---
read -r -p "Commit message: " commit_msg

# --- Commit and push ---
cd "$SCRIPT_DIR"
git add -A
git commit -m "$commit_msg"
git push
