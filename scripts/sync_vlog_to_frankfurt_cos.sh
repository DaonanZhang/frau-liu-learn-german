#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${COS_PYTHON_BIN:-$ROOT_DIR/cos-venv/bin/python}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  else
    echo "Python is required. Set COS_PYTHON_BIN or create cos-venv/." >&2
    exit 1
  fi
fi

exec "$PYTHON_BIN" "$ROOT_DIR/scripts/sync_vlog_to_frankfurt_cos.py" "$@"
