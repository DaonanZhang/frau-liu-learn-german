#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/load_cos_env.sh"
load_cos_env_file "${COS_ENV_FILE:-$ROOT_DIR/.env}"

SYNC_SCRIPT="${COS_SYNC_HELPER:-$ROOT_DIR/scripts/sync_vlog_to_frankfurt_cos.sh}"
SOURCE_DIR="${EXAM_AUDIO_SOURCE_DIR:-$ROOT_DIR/frontend/public/resources/ExamPreparation/exam_preparation_audio}"
OBJECT_PREFIX="resources/ExamPreparation/exam_preparation_audio"

if [[ ! -x "$SYNC_SCRIPT" ]]; then
  echo "COS sync helper is missing or not executable: $SYNC_SCRIPT" >&2
  exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Exam-preparation audio directory not found: $SOURCE_DIR" >&2
  exit 1
fi

run_target() {
  local name="$1"
  local bucket="$2"
  local region="$3"
  local domain="$4"
  shift 4

  echo
  echo "===== Syncing exam-preparation audio to $name COS ====="
  "$SYNC_SCRIPT" "$@" \
    --source-dir "$SOURCE_DIR" \
    --scan-all \
    --object-prefix "$OBJECT_PREFIX" \
    --bucket "$bucket" \
    --region "$region" \
    --domain "$domain" \
    --target-name "$name"
}

shanghai_status=0
frankfurt_status=0

if run_target \
  "Shanghai" \
  "${COS_SHANGHAI_BUCKET:-${COS_SH_BUCKET:-frauliu-1335740446}}" \
  "${COS_SHANGHAI_REGION:-${COS_SH_REGION:-ap-shanghai}}" \
  "${COS_SHANGHAI_DOMAIN:-${COS_SH_DOMAIN:-https://frauliu-1335740446.cos.ap-shanghai.myqcloud.com}}" \
  "$@"; then
  :
else
  shanghai_status=$?
  echo "Shanghai COS audio sync failed; Frankfurt COS will still be attempted." >&2
fi

if run_target \
  "Frankfurt" \
  "${COS_FRANKFURT_BUCKET:-${COS_EU_BUCKET:-frauliu-eu-1335740446}}" \
  "${COS_FRANKFURT_REGION:-${COS_EU_REGION:-eu-frankfurt}}" \
  "${COS_FRANKFURT_DOMAIN:-${COS_EU_DOMAIN:-https://frauliu-eu-1335740446.cos.eu-frankfurt.myqcloud.com}}" \
  "$@"; then
  :
else
  frankfurt_status=$?
  echo "Frankfurt COS audio sync failed." >&2
fi

echo
echo "Dual COS exam audio sync summary: Shanghai status=$shanghai_status, Frankfurt status=$frankfurt_status"
if [[ "$shanghai_status" -ne 0 || "$frankfurt_status" -ne 0 ]]; then
  exit 2
fi
