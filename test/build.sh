#!/bin/bash
set -e
cd "$(dirname "$0")/.." && docker build -t esp-tree-ha-test -f test/Dockerfile.standalone .