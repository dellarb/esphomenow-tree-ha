#!/bin/bash
set -e
cd "$(dirname "$0")/.." && docker build -t esphome-espnow-tree-ha-test -f test/Dockerfile.standalone .