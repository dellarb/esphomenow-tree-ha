ARG BUILD_FROM
FROM ${BUILD_FROM} 

ARG GIT_HASH=unknown
ARG GIT_DATE=unknown
ENV GIT_HASH=${GIT_HASH} GIT_DATE=${GIT_DATE}

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
COPY app/ ./app/
COPY rootfs/ /

RUN chmod +x /etc/cont-init.d/00-prepare.sh \
    && chmod +x /etc/services.d/esphome-espnow-tree-ha/run
