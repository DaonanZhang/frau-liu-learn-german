#!/usr/bin/env bash
set -euo pipefail

# Push new learning_by_video media files to server.
# - Uses rsync (faster than scp for many small files)
# - only adds missing files on server (won't overwrite existing files)
#
# Usage:
#   bash scripts/push_learning_media.sh
#   bash scripts/push_learning_media.sh --dry-run
#   bash scripts/push_learning_media.sh --host ubuntu@81.68.211.13
#   bash scripts/push_learning_media.sh --remote-root /srv/projects/frau-liu-learn-german
#   bash scripts/push_learning_media.sh --resource-profile vlog

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HOST="ubuntu@81.68.211.13"
REMOTE_ROOT="/srv/projects/frau-liu-learn-german"
DRY_RUN=0
RESOURCE_PROFILE="science"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run|-n)
      DRY_RUN=1
      shift
      ;;
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --remote-root)
      REMOTE_ROOT="${2:-}"
      shift 2
      ;;
    --resource-profile)
      RESOURCE_PROFILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$HOST" || -z "$REMOTE_ROOT" ]]; then
  echo "HOST and REMOTE_ROOT must not be empty." >&2
  exit 1
fi

case "$RESOURCE_PROFILE" in
  science)
    RESOURCE_BUCKET="ScienceSeason1"
    ;;
  vlog)
    RESOURCE_BUCKET="VlogSeason1"
    ;;
  *)
    echo "Unsupported --resource-profile: $RESOURCE_PROFILE" >&2
    exit 1
    ;;
esac

LOCAL_BASE="$ROOT_DIR/frontend/public/resources/$RESOURCE_BUCKET"
LOCAL_VIDEO="$LOCAL_BASE/learning_by_video_video/"
LOCAL_COVER="$LOCAL_BASE/learning_by_video_cover_letters/"

REMOTE_BASE="$REMOTE_ROOT/frontend/public/resources/$RESOURCE_BUCKET"
REMOTE_VIDEO="$HOST:$REMOTE_BASE/learning_by_video_video/"
REMOTE_COVER="$HOST:$REMOTE_BASE/learning_by_video_cover_letters/"

if [[ ! -d "$LOCAL_VIDEO" ]]; then
  echo "Local video dir not found: $LOCAL_VIDEO" >&2
  exit 1
fi

if [[ ! -d "$LOCAL_COVER" ]]; then
  echo "Local cover dir not found: $LOCAL_COVER" >&2
  exit 1
fi

RSYNC_ARGS=(-avh --ignore-existing --partial --whole-file --progress)
if [[ "$DRY_RUN" -eq 1 ]]; then
  RSYNC_ARGS+=(-n)
fi

RSYNC_SSH="ssh -T -c aes128-gcm@openssh.com -o Compression=no"

echo "[1/2] Sync cover files -> $REMOTE_COVER"
rsync "${RSYNC_ARGS[@]}" -e "$RSYNC_SSH" "$LOCAL_COVER" "$REMOTE_COVER"

echo "[2/2] Sync video files -> $REMOTE_VIDEO"
rsync "${RSYNC_ARGS[@]}" -e "$RSYNC_SSH" "$LOCAL_VIDEO" "$REMOTE_VIDEO"

echo "Done."
