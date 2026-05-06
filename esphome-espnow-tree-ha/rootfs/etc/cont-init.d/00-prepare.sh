#!/usr/bin/with-contenv sh
set -eu

mkdir -p /data/firmware/tmp /data/firmware/active /data/firmware/retained
mkdir -p /data/devices
mkdir -p /data/platformio_cache

if [ ! -f /data/devices/secrets.yaml ]; then
  echo "# ESP-NOW LR Device Secrets" > /data/devices/secrets.yaml
fi

if [ -d /homeassistant ]; then
  mkdir -p /homeassistant/custom_components
  rm -rf /homeassistant/custom_components/espnow_tree
  cp -a /opt/espnow-tree/ha_integration/custom_components/espnow_tree /homeassistant/custom_components/
  echo "Installed espnow_tree integration into /homeassistant/custom_components"
else
  echo "Home Assistant config mount /homeassistant not available; skipping espnow_tree integration install"
fi
