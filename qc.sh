#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

# --- Prompt for commit message ---
read -r -p "Commit message: " commit_msg

# --- Commit and push ---
cd "$SCRIPT_DIR"
git add -A
git commit -m "$commit_msg"
git push
