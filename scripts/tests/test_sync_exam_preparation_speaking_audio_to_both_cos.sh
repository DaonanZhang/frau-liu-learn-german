#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/audio/teil1" "$TMP_DIR/audio/teil2" "$TMP_DIR/audio/teil3"
printf 'audio' > "$TMP_DIR/audio/teil1/B1_7_1.mp3"
printf 'audio' > "$TMP_DIR/audio/teil2/B1_8_1.mp3"
printf 'audio' > "$TMP_DIR/audio/teil3/B1_9_1.mp3"

FAKE_HELPER="$TMP_DIR/fake-sync-helper.sh"
LOG_FILE="$TMP_DIR/calls.log"
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
EXAM_SPEAKING_AUDIO_SOURCE_DIR="$TMP_DIR/audio" \
  "$ROOT_DIR/scripts/sync_exam_preparation_speaking_audio_to_both_cos.sh" --dedupe-etag --dry-run

[[ "$(wc -l < "$LOG_FILE" | tr -d ' ')" == "2" ]]
[[ "$(grep -c -- '--source-dir .*audio --scan-all --object-prefix resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking' "$LOG_FILE")" == "2" ]]
grep -q -- '--target-name Shanghai' "$LOG_FILE"
grep -q -- '--target-name Frankfurt' "$LOG_FILE"

: > "$LOG_FILE"
set +e
SYNC_TEST_LOG="$LOG_FILE" \
FAIL_SHANGHAI=1 \
COS_SYNC_HELPER="$FAKE_HELPER" \
EXAM_SPEAKING_AUDIO_SOURCE_DIR="$TMP_DIR/audio" \
  "$ROOT_DIR/scripts/sync_exam_preparation_speaking_audio_to_both_cos.sh" --dry-run
status=$?
set -e

[[ "$status" == "2" ]]
[[ "$(wc -l < "$LOG_FILE" | tr -d ' ')" == "2" ]]
grep -q -- '--target-name Frankfurt' "$LOG_FILE"

echo "Speaking-only dual COS sync tests passed"
