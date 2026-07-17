#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "$FAKE_COSCMD_LOG"

bucket=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b)
      bucket="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -n "${FAKE_FAIL_BUCKET:-}" && "$bucket" == "$FAKE_FAIL_BUCKET" ]]; then
  exit 42
fi
