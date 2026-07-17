#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

MEDIA_DIR="$TEST_DIR/media"
COVER_DIR="$TEST_DIR/covers"
FAKE_COSCMD="$ROOT_DIR/scripts/tests/fake_coscmd.sh"
FAKE_CONFIG="$TEST_DIR/cos.conf"
FAKE_LOG="$TEST_DIR/coscmd.log"

mkdir -p "$MEDIA_DIR" "$COVER_DIR/nested"
touch \
  "$MEDIA_DIR/Episode.mp4" \
  "$MEDIA_DIR/Episode-init.mp4" \
  "$MEDIA_DIR/Episode-000.m4s" \
  "$MEDIA_DIR/Episode.m3u8" \
  "$COVER_DIR/nested/Cover Ä.png" \
  "$FAKE_CONFIG"

run_upload() {
  COSCMD_BIN="$FAKE_COSCMD" \
  COS_CONFIG_PATH="$FAKE_CONFIG" \
  FAKE_COSCMD_LOG="$FAKE_LOG" \
  FAKE_FAIL_BUCKET="${1:-}" \
    "$ROOT_DIR/scripts/enable_hls_5seg.sh" \
      "$MEDIA_DIR" "$MEDIA_DIR" --allow Episode --upload-cos --cover-dir "$COVER_DIR"
}

run_upload_with_env_credentials() {
  COSCMD_BIN="$FAKE_COSCMD" \
  COS_SECRET_ID="test-secret-id" \
  COS_SECRET_KEY="test-secret-key" \
  FAKE_COSCMD_LOG="$FAKE_LOG" \
  FAKE_FAIL_BUCKET="" \
    "$ROOT_DIR/scripts/enable_hls_5seg.sh" \
      "$MEDIA_DIR" "$MEDIA_DIR" --allow Episode --upload-cos --cover-dir "$COVER_DIR"
}

success_output="$(run_upload "" 2>&1)"
[[ "$(wc -l < "$FAKE_LOG" | tr -d ' ')" == "8" ]]
[[ "$(grep -c -- '-b frauliu-1335740446 -r ap-shanghai upload' "$FAKE_LOG")" == "4" ]]
[[ "$(grep -c -- '-b frauliu-eu-1335740446 -r eu-frankfurt upload' "$FAKE_LOG")" == "4" ]]
[[ "$(printf '%s\n' "$success_output" | grep -c 'Uploaded \[Shanghai\]:')" == "4" ]]
[[ "$(printf '%s\n' "$success_output" | grep -c 'Uploaded \[Frankfurt\]:')" == "4" ]]
printf '%s\n' "$success_output" | grep -q 'https://frauliu-1335740446.cos.ap-shanghai.myqcloud.com/resources/ScienceSeason1/learning_by_video_video/Episode.m3u8'
printf '%s\n' "$success_output" | grep -q 'https://frauliu-eu-1335740446.cos.eu-frankfurt.myqcloud.com/resources/ScienceSeason1/learning_by_video_video/Episode.m3u8'
printf '%s\n' "$success_output" | grep -q 'https://frauliu-1335740446.cos.ap-shanghai.myqcloud.com/resources/ScienceSeason1/learning_by_video_cover_letters/nested/Cover%20%C3%84.png'
printf '%s\n' "$success_output" | grep -q 'https://frauliu-eu-1335740446.cos.eu-frankfurt.myqcloud.com/resources/ScienceSeason1/learning_by_video_cover_letters/nested/Cover%20%C3%84.png'
printf '%s\n' "$success_output" | grep -q 'Whitelist result: selected=1, processed=0'
printf '%s\n' "$success_output" | grep -q 'Cover upload scan completed: files=1'
printf '%s\n' "$success_output" | grep -q 'COS dual-upload summary: successful=8, failed=0'

: > "$FAKE_LOG"
failure_output="$(run_upload "frauliu-eu-1335740446" 2>&1)"
[[ "$(wc -l < "$FAKE_LOG" | tr -d ' ')" == "8" ]]
[[ "$(printf '%s\n' "$failure_output" | grep -c 'Uploaded \[Shanghai\]:')" == "4" ]]
[[ "$(printf '%s\n' "$failure_output" | grep -c 'COS upload failed \[Frankfurt\]:')" == "4" ]]
printf '%s\n' "$failure_output" | grep -q 'COS dual-upload summary: successful=4, failed=4'

: > "$FAKE_LOG"
env_output="$(run_upload_with_env_credentials 2>&1)"
[[ "$(wc -l < "$FAKE_LOG" | tr -d ' ')" == "8" ]]
printf '%s\n' "$env_output" | grep -q 'COS credentials loaded from environment variables.'
printf '%s\n' "$env_output" | grep -q 'COS dual-upload summary: successful=8, failed=0'

echo "dual COS upload tests passed"
