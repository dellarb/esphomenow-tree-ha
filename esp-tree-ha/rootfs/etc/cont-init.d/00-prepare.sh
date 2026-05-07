#!/usr/bin/with-contenv sh
set -eu

mkdir -p /data/firmware/tmp /data/firmware/active /data/firmware/retained
mkdir -p /data/esp_tree
mkdir -p /data/devices
mkdir -p /data/platformio_cache

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

  echo "Announcing ESP Tree discovery via Supervisor..."
  ESP_TREE_NEEDS_RESTART="$NEEDS_RESTART" python3 - <<'PY'
import json
import os
import time
import sys
import urllib.request

TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
if not TOKEN:
    print("No SUPERVISOR_TOKEN, skipping discovery announcement")
    sys.exit(0)

token_path = "/data/esp_tree/integration_token"
try:
    with open(token_path, "r", encoding="utf-8") as handle:
        integration_token = handle.read().strip()
except OSError:
    integration_token = ""
if not integration_token:
    import uuid
    integration_token = uuid.uuid4().hex + uuid.uuid4().hex
    with open(token_path, "w", encoding="utf-8") as handle:
        handle.write(integration_token)

def default_addon_url() -> str:
    explicit = os.environ.get("ESP_TREE_ADDON_URL", "").strip().rstrip("/")
    if explicit:
        return explicit
    req = urllib.request.Request(
        "http://supervisor/addons/self/info",
        headers={"Authorization": f"Bearer {TOKEN}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            return "http://127.0.0.1:8099"
        repository = str(data.get("repository") or "").strip()
        slug = str(data.get("slug") or "").strip()
        if not repository or not slug:
            return "http://127.0.0.1:8099"
        hostname = f"{repository}_{slug}".replace("_", "-")
        return f"http://{hostname}:8099"
    except Exception as exc:
        print(f"Could not resolve add-on hostname from Supervisor: {exc}")
        return "http://127.0.0.1:8099"

payload = {
    "addon": "esp-tree",
    "service": "esp_tree",
    "config": {
        "addon_url": default_addon_url(),
        "integration_token": integration_token,
    },
}

if os.environ.get("ESP_TREE_NEEDS_RESTART") == "1":
    message = (
        "ESP Tree installed or updated its Home Assistant integration. "
        "Restart Home Assistant from Settings to finish loading the integration."
    )
    notify_req = urllib.request.Request(
        "http://supervisor/core/api/services/persistent_notification/create",
        data=json.dumps(
            {
                "title": "ESP Tree integration restart required",
                "message": message,
                "notification_id": "esp_tree_restart_required",
            }
        ).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(notify_req, timeout=10) as resp:
            print(f"Created Home Assistant restart notification: {resp.status}")
    except Exception as exc:
        print(f"Could not create restart notification; Core may still be starting: {exc}")

last_error = None
for attempt in range(30):
    req = urllib.request.Request(
        "http://supervisor/discovery",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"Discovery announced: {resp.status} ({payload['config']['addon_url']})")
            sys.exit(0)
    except Exception as exc:
        last_error = exc
        time.sleep(2)

print(f"Discovery announcement failed after retries: {last_error}")
PY
else
  echo "Home Assistant config mount /homeassistant not available; skipping esp_tree integration install"
fi
