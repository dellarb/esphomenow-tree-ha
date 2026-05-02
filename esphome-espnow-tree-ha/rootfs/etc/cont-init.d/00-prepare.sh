#!/usr/bin/with-contenv sh
set -eu

mkdir -p /data/firmware/tmp /data/firmware/active /data/firmware/retained
mkdir -p /data/devices
mkdir -p /data/platformio_cache

if [ ! -f /data/devices/secrets.yaml ]; then
  echo "# ESP-NOW LR Device Secrets" > /data/devices/secrets.yaml
fi

# ── Docker socket discovery ──
# The Supervisor should mount /var/run/docker.sock when docker_api is enabled,
# but on some platforms (HA Supervised, HA Container, certain HAOS versions)
# the socket may be at an alternate path or not mounted at all.
# This script searches common locations and sets up DOCKER_HOST for the app.

DOCKER_SOCKET_CANDIDATES="
/var/run/docker.sock
/run/docker.sock
/etc/docker.sock
/docker.sock
/run/docker.sock
/host_var_run/docker.sock
/host/run/docker.sock
"

FOUND_SOCKET=""
for sock in ${DOCKER_SOCKET_CANDIDATES}; do
  if [ -S "${sock}" ]; then
    FOUND_SOCKET="${sock}"
    echo "Found Docker socket at ${sock}"
    break
  fi
done

# If we found a socket at a non-standard path, symlink it to the standard location
if [ -n "${FOUND_SOCKET}" ] && [ "${FOUND_SOCKET}" != "/var/run/docker.sock" ]; then
  mkdir -p /var/run
  ln -sf "${FOUND_SOCKET}" /var/run/docker.sock
  echo "Symlinked ${FOUND_SOCKET} -> /var/run/docker.sock"
  FOUND_SOCKET="/var/run/docker.sock"
fi

# Set DOCKER_HOST env for the app service
if [ -n "${FOUND_SOCKET}" ]; then
  s6-setenv DOCKER_HOST "unix://${FOUND_SOCKET}"
  echo "Set DOCKER_HOST=unix://${FOUND_SOCKET}"
else
  echo "WARNING: No Docker socket found. Compilation will not work."
  echo "Ensure the add-on has Docker access enabled and try reinstalling."
  echo "Searched: ${DOCKER_SOCKET_CANDIDATES}"
fi