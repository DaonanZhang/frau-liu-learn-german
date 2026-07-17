#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/resources/Season/example"
printf 'asset' > "$TMP_DIR/resources/Season/example/file.txt"

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
COS_SYNC_SOURCE_DIR="$TMP_DIR/resources" \
  "$ROOT_DIR/scripts/sync_resources_to_both_cos.sh" --dedupe-etag --dry-run

[[ "$(wc -l < "$LOG_FILE" | tr -d ' ')" == "2" ]]
grep -q -- '--bucket frauliu-1335740446' "$LOG_FILE"
grep -q -- '--region ap-shanghai' "$LOG_FILE"
grep -q -- '--bucket frauliu-eu-1335740446' "$LOG_FILE"
grep -q -- '--region eu-frankfurt' "$LOG_FILE"
[[ "$(grep -c -- '--source-dir .*resources --scan-all --object-prefix resources' "$LOG_FILE")" == "2" ]]

: > "$LOG_FILE"
set +e
SYNC_TEST_LOG="$LOG_FILE" \
FAIL_SHANGHAI=1 \
COS_SYNC_HELPER="$FAKE_HELPER" \
COS_SYNC_SOURCE_DIR="$TMP_DIR/resources" \
  "$ROOT_DIR/scripts/sync_resources_to_both_cos.sh" --dry-run
status=$?
set -e

[[ "$status" == "2" ]]
[[ "$(wc -l < "$LOG_FILE" | tr -d ' ')" == "2" ]]
grep -q -- '--target-name Frankfurt' "$LOG_FILE"

echo "dual resources COS sync tests passed"
