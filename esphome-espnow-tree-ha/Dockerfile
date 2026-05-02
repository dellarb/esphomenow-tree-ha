ARG BUILD_ARCH=amd64
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base-python:3.13-alpine3.22

ARG BUILD_ARCH
ARG GIT_HASH=unknown
ARG GIT_DATE=unknown
ARG BUILD_VERSION=0.1.20
ENV GIT_HASH=${GIT_HASH} GIT_DATE=${GIT_DATE}

LABEL \
  io.hass.version=${BUILD_VERSION} \
  io.hass.type=app \
  io.hass.arch=${BUILD_ARCH} \
  org.opencontainers.image.title="ESPHome ESPNow Tree" \
  org.opencontainers.image.description="Home Assistant add-on for ESP-NOW LR topology and OTA" \
  org.opencontainers.image.source="https://github.com/local/esphome-espnow-tree-ha"

SHELL ["/bin/ash", "-o", "pipefail", "-c"]

ENV PYTHONUNBUFFERED=1 \
    APP_DIR=/opt/espnow-tree \
    ESPNOW_TREE_DATA_DIR=/data

WORKDIR ${APP_DIR}

RUN apk add --no-cache nodejs~22 npm

COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

COPY ui/package*.json ./ui/
WORKDIR ${APP_DIR}/ui
RUN npm ci

COPY ui/ ./
RUN npm run build

WORKDIR ${APP_DIR}
COPY components /opt/espnow-tree/components/
COPY app/ ./app/
COPY rootfs/ /

RUN chmod +x /etc/cont-init.d/00-prepare.sh \
    && chmod +x /etc/services.d/esphome-espnow-tree-ha/run
