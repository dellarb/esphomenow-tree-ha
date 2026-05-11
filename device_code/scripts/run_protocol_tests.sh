#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/tests/build"

cmake -S "${ROOT_DIR}/tests" -B "${BUILD_DIR}"
cmake --build "${BUILD_DIR}" --target protocol_test
"${BUILD_DIR}/protocol_test"
