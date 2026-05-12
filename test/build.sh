#!/bin/bash
set -e
cd "$(dirname "$0")/.." && docker build -t esphome-standalone-test -f test/Dockerfile.standalone .