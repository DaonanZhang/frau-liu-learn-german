#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/audio/telc_b1_teil1"
printf 'audio' > "$TMP_DIR/audio/telc_b1_teil1/Teil1_001.mp3"

FAKE_HELPER="$TMP_DIR/fake-sync-helper.sh"
LOG_FILE="$TMP_DIR/calls.log"
printf '%s\n' \
  'COS_SH_BUCKET=existing-shanghai-bucket' \
  'COS_SH_REGION=existing-shanghai-region' \
  'COS_SH_DOMAIN=https://existing-shanghai.example' \
  'COS_EU_BUCKET=existing-frankfurt-bucket' \
  'COS_EU_REGION=existing-frankfurt-region' \
  'COS_EU_DOMAIN=https://existing-frankfurt.example' \
  'IGNORED_SECRET=must-not-be-loaded' \
  > "$TMP_DIR/cos.env"
cat > "$FAKE_HELPER" <<'EOF'
#!/usr/bin/env bash
printf '%q ' "$@" >> "$SYNC_TEST_LOG"
printf '\n' >> "$SYNC_TEST_LOG"
if [[ " $* " == *" --target-name Shanghai "* && "${FAIL_SHANGHAI:-0}" == "1" ]]; then
  exit 7
fi
EOF
chmod +x "$FAKE_HELPER"

SYNC_TEST_LOG="$LOG_FILE" \
COS_SYNC_HELPER="$FAKE_HELPER" \
EXAM_AUDIO_SOURCE_DIR="$TMP_DIR/audio" \
COS_ENV_FILE="$TMP_DIR/cos.env" \
  "$ROOT_DIR/scripts/sync_exam_preparation_audio_to_both_cos.sh" --dedupe-etag --dry-run

[[ "$(wc -l < "$LOG_FILE" | tr -d ' ')" == "2" ]]
grep -q -- '--bucket existing-shanghai-bucket' "$LOG_FILE"
grep -q -- '--region existing-shanghai-region' "$LOG_FILE"
grep -q -- '--domain https://existing-shanghai.example' "$LOG_FILE"
grep -q -- '--bucket existing-frankfurt-bucket' "$LOG_FILE"
grep -q -- '--region existing-frankfurt-region' "$LOG_FILE"
grep -q -- '--domain https://existing-frankfurt.example' "$LOG_FILE"
[[ "$(grep -c -- '--source-dir .*audio --scan-all --object-prefix resources/ExamPreparation/exam_preparation_audio' "$LOG_FILE")" == "2" ]]

: > "$LOG_FILE"
set +e
SYNC_TEST_LOG="$LOG_FILE" \
FAIL_SHANGHAI=1 \
COS_SYNC_HELPER="$FAKE_HELPER" \
EXAM_AUDIO_SOURCE_DIR="$TMP_DIR/audio" \
  "$ROOT_DIR/scripts/sync_exam_preparation_audio_to_both_cos.sh" --dry-run
status=$?
set -e

[[ "$status" == "2" ]]
[[ "$(wc -l < "$LOG_FILE" | tr -d ' ')" == "2" ]]
grep -q -- '--target-name Frankfurt' "$LOG_FILE"

echo "dual exam-preparation audio COS sync tests passed"
