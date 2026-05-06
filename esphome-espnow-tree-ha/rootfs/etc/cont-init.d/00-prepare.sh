#!/usr/bin/with-contenv sh
set -eu

mkdir -p /data/firmware/tmp /data/firmware/active /data/firmware/retained
mkdir -p /data/devices
mkdir -p /data/platformio_cache
mkdir -p /share/espnow_tree

if [ ! -f /data/devices/secrets.yaml ]; then
  echo "# ESP-NOW LR Device Secrets" > /data/devices/secrets.yaml
fi

if [ -d /homeassistant ]; then
  mkdir -p /homeassistant/custom_components
  SRC="/opt/espnow-tree/ha_integration/custom_components/espnow_tree"
  DST="/homeassistant/custom_components/espnow_tree"
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
  echo "Installed espnow_tree integration into /homeassistant/custom_components"

  python3 - "$NEEDS_RESTART" <<'PY' || true
import asyncio
import json
import os
import sys
import urllib.request

TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
NEEDS_RESTART = sys.argv[1] == "1"
if not TOKEN:
    raise SystemExit


def persistent_notification() -> None:
    body = json.dumps(
        {
            "title": "ESPNow Tree restart required",
            "message": "Restart Home Assistant to finish loading the ESPNow Tree integration update.",
            "notification_id": "espnow_tree_restart_required",
        }
    ).encode()
    req = urllib.request.Request(
        "http://supervisor/core/api/services/persistent_notification/create",
        data=body,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=3).read()
    except Exception:
        pass


async def ensure_config_entry() -> None:
    import websockets

    async with websockets.connect("ws://supervisor/core/websocket", open_timeout=3, close_timeout=1) as ws:
        await asyncio.wait_for(ws.recv(), timeout=3)
        await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        auth = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
        if auth.get("type") != "auth_ok":
            return
        await ws.send(
            json.dumps(
                {
                    "id": 1,
                    "type": "config_entries/flow/init",
                    "handler": "espnow_tree",
                    "context": {"source": "user"},
                }
            )
        )
        await asyncio.wait_for(ws.recv(), timeout=5)


if NEEDS_RESTART:
    persistent_notification()
try:
    asyncio.run(ensure_config_entry())
except Exception:
    pass
PY
else
  echo "Home Assistant config mount /homeassistant not available; skipping espnow_tree integration install"
fi
