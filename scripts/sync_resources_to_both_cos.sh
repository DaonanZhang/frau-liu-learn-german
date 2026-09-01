#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_SCRIPT="${COS_SYNC_HELPER:-$ROOT_DIR/scripts/sync_vlog_to_frankfurt_cos.sh}"
SOURCE_DIR="${COS_SYNC_SOURCE_DIR:-$ROOT_DIR/frontend/public/resources}"

if [[ ! -x "$SYNC_SCRIPT" ]]; then
  echo "COS sync helper is missing or not executable: $SYNC_SCRIPT" >&2
  exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Resources directory not found: $SOURCE_DIR" >&2
  exit 1
fi

run_target() {
  local name="$1"
  local bucket="$2"
  local region="$3"
  local domain="$4"
  shift 4

  echo
  echo "===== Syncing frontend resources to $name COS ====="
  "$SYNC_SCRIPT" "$@" \
    --source-dir "$SOURCE_DIR" \
    --scan-all \
    --object-prefix resources \
    --bucket "$bucket" \
    --region "$region" \
    --domain "$domain" \
    --target-name "$name"
}

shanghai_status=0
frankfurt_status=0

if run_target \
  "Shanghai" \
  "${COS_SHANGHAI_BUCKET:-frauliu-1335740446}" \
  "${COS_SHANGHAI_REGION:-ap-shanghai}" \
  "${COS_SHANGHAI_DOMAIN:-https://frauliu-1335740446.cos.ap-shanghai.myqcloud.com}" \
  "$@"; then
  :
else
  shanghai_status=$?
  echo "Shanghai COS sync failed; Frankfurt COS will still be attempted." >&2
fi

if run_target \
  "Frankfurt" \
  "${COS_FRANKFURT_BUCKET:-frauliu-eu-1335740446}" \
  "${COS_FRANKFURT_REGION:-eu-frankfurt}" \
  "${COS_FRANKFURT_DOMAIN:-https://frauliu-eu-1335740446.cos.eu-frankfurt.myqcloud.com}" \
  "$@"; then
  :
else
  frankfurt_status=$?
  echo "Frankfurt COS sync failed." >&2
fi

echo
echo "Dual COS resources sync summary: Shanghai status=$shanghai_status, Frankfurt status=$frankfurt_status"
if [[ "$shanghai_status" -ne 0 || "$frankfurt_status" -ne 0 ]]; then
  exit 2
fi
