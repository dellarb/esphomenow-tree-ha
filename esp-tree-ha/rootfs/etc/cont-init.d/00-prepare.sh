#!/usr/bin/with-contenv sh
set -eu

mkdir -p /data/firmware/tmp /data/firmware/active /data/firmware/retained
mkdir -p /data/esp_tree
mkdir -p /data/devices
mkdir -p /data/platformio_cache
mkdir -p /share/esp_tree
ln -sf /opt/esp-tree /external

if [ ! -f /data/devices/secrets.yaml ]; then
  echo "# ESP-NOW LR Device Secrets" > /data/devices/secrets.yaml
fi

if [ -d /homeassistant ]; then
  mkdir -p /homeassistant/custom_components
  SRC="/opt/esp-tree/ha_integration/custom_components/esp_tree"
  DST="/homeassistant/custom_components/esp_tree"
  OLD_VERSION="$(python3 - "$DST/manifest.json" <<'PY' || true
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
if path.exists():
    print(json.loads(path.read_text(encoding="utf-8")).get("version", ""))
PY
)"
  NEW_VERSION="$(python3 - "$SRC/manifest.json" <<'PY'
import json
import sys
from pathlib import Path

print(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")).get("version", ""))
PY
)"
  NEEDS_RESTART=0
  FRESH_INSTALL=0
  if [ ! -d "$DST" ]; then
    NEEDS_RESTART=1
    FRESH_INSTALL=1
  elif [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
    if [ -n "$OLD_VERSION" ]; then
      NEEDS_RESTART=1
    fi
  fi

  rm -rf "$DST"
  cp -a "$SRC" /homeassistant/custom_components/
  if [ "$NEEDS_RESTART" = "1" ]; then
    python3 - "$DST/.restart_required.json" "$NEW_VERSION" <<'PY'
import json
import sys
import time
from pathlib import Path

Path(sys.argv[1]).write_text(
    json.dumps(
        {
            "integration_version": sys.argv[2],
            "created_at": int(time.time()),
            "reason": "custom_component_updated",
        }
    ),
    encoding="utf-8",
)
PY
  fi
  echo "Installed esp_tree integration into /homeassistant/custom_components"

  if [ "$NEEDS_RESTART" = "1" ]; then
    echo "Integration version changed ($OLD_VERSION -> $NEW_VERSION), will request HA restart notification"
  else
    echo "Integration version unchanged ($NEW_VERSION)"
  fi

  echo "Announcing ESP Tree discovery via Supervisor (background)..."
  ESP_TREE_NEEDS_RESTART="$NEEDS_RESTART" python3 /opt/esp-tree/app/discover_helper.py > /tmp/discover_helper.log 2>&1 &
  echo "Discovery running in background"

else
  echo "Home Assistant config mount /homeassistant not available; skipping esp_tree integration install"
fi
