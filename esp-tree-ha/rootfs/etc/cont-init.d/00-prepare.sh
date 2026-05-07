#!/usr/bin/with-contenv sh
set -eu

mkdir -p /data/firmware/tmp /data/firmware/active /data/firmware/retained
mkdir -p /data/devices
mkdir -p /data/platformio_cache
mkdir -p /share/esp_tree

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
  if [ ! -d "$DST" ] || [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
    NEEDS_RESTART=1
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
    echo "Integration version changed ($OLD_VERSION -> $NEW_VERSION), will request HA restart"
  else
    echo "Integration version unchanged ($NEW_VERSION)"
  fi

  echo "Attempting to create ESP Tree hub config entry via Supervisor API..."
  python3 - <<'PY'
import asyncio
import json
import os
import sys

TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
if not TOKEN:
    print("No SUPERVISOR_TOKEN, skipping config entry creation")
    sys.exit(0)


async def ensure_config_entry() -> None:
    import websockets

    try:
        async with websockets.connect("ws://supervisor/core/websocket", open_timeout=5, close_timeout=2) as ws:
            await asyncio.wait_for(ws.recv(), timeout=5)
            await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
            auth = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if auth.get("type") != "auth_ok":
                print(f"Supervisor auth failed: {auth}")
                return

            await ws.send(json.dumps({
                "id": 1,
                "type": "config_entries/flow.init",
                "handler": "esp_tree",
                "show_dialog": False,
                "context": {"source": "user"},
            }))
            result = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            result_type = result.get("type", "unknown")
            print(f"Config entry creation result: {result_type}")
            if result_type == "abort":
                print(f"Flow aborted (reason: {result.get('reason', 'unknown')})")
    except Exception as exc:
        print(f"Config entry creation failed (HA may not be ready yet): {exc}")


asyncio.run(ensure_config_entry())
PY
else
  echo "Home Assistant config mount /homeassistant not available; skipping esp_tree integration install"
fi
