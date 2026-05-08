#!/usr/bin/env python3
"""Background discovery announcement to Supervisor.

Runs from the cont-init hook so the add-on UI can start immediately
while discovery is attempted in the background.
"""

import json
import os
import sys
import time
import uuid
import urllib.request
from pathlib import Path

TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
if not TOKEN:
    print("No SUPERVISOR_TOKEN, skipping discovery announcement")
    sys.exit(0)

TOKEN_PATH = "/data/esp_tree/integration_token"
try:
    integration_token = Path(TOKEN_PATH).read_text(encoding="utf-8").strip()
except OSError:
    integration_token = ""
if not integration_token:
    integration_token = uuid.uuid4().hex + uuid.uuid4().hex
    Path(TOKEN_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(TOKEN_PATH).write_text(integration_token, encoding="utf-8")


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
        with urllib.request.urlopen(req, timeout=5) as resp:
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

for attempt in range(10):
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
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"Discovery announced: {resp.status} ({payload['config']['addon_url']})")
            sys.exit(0)
    except Exception as exc:
        if attempt < 9:
            time.sleep(2)

print(f"Discovery announcement failed after retries")
