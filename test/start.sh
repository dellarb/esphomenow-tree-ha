#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="${CACHE_DIR:-/home/ben/ai-hermes-agent/cache/ha-tree-addon-cache}"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

BRIDGE_HOST="${BRIDGE_HOST:-192.168.1.50}"
BRIDGE_PORT="${BRIDGE_PORT:-80}"
BRIDGE_TRANSPORT="${BRIDGE_TRANSPORT:-ws}"

mkdir -p "$CACHE_DIR"

docker run -it --rm \
  -p 8099:8099 \
  -e BRIDGE_HOST="$BRIDGE_HOST" \
  -e BRIDGE_PORT="$BRIDGE_PORT" \
  -e BRIDGE_TRANSPORT="$BRIDGE_TRANSPORT" \
  -e BRIDGE_API_KEY="$BRIDGE_API_KEY" \
  -e ESPNOW_TREE_DATA_DIR=/data \
  -e LOG_LEVEL=info \
  -v "${CACHE_DIR}:/data" \
  esphome-espnow-tree-ha-test