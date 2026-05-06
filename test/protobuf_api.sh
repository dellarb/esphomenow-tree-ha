#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Error: virtual environment not found at $VENV_DIR" >&2
    exit 1
fi

source "$VENV_DIR/bin/activate"

cd "$SCRIPT_DIR"

exec python3 protobuf_api.py "$@"
