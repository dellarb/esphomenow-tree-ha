#!/usr/bin/with-contenv sh
set -eu

mkdir -p /data/firmware/tmp /data/firmware/active /data/firmware/retained
mkdir -p /data/devices
mkdir -p /data/platformio_cache

if [ ! -f /data/devices/secrets.yaml ]; then
  echo "# ESP-NOW LR Device Secrets" > /data/devices/secrets.yaml
fi
