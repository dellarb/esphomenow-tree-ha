#!/bin/sh

set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

cmp -s "$repo_root/components/include/espnow_types.h" \
       "$repo_root/components/espnow_lr_bridge/espnow_types.h"
cmp -s "$repo_root/components/include/espnow_types.h" \
       "$repo_root/components/espnow_lr_remote/espnow_types.h"

if find "$repo_root/components/espnow_lr_bridge/protocol" -type f 2>/dev/null | grep -q .; then
  echo "stale bridge/protocol files still exist" >&2
  exit 1
fi

echo "protocol copies are in sync"
