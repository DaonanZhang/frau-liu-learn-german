#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/run_learning_video_pipeline.sh [options]

One-stop pipeline (Step 0 -> Step 4):
  0) Convert MOV -> MP4 (optional, auto-skip if no MOV)
  1) Build HLS from MP4
  2) Import XLSX into DB (videos/subtitles/exercises/expressions/words; includes youtube -> Video.source)
  3) Backfill video_url / cover_letter_url
  4) Aggregate full German/Chinese subtitles onto Video fields

Assumptions:
  - cover_letter files already exist in resources folder
  - mp4 files already exist (or MOV files exist for step 0 conversion)
  - xlsx files are in apps/learning_by_video/data/raw by default

Options:
  --video-dir DIR       Video resource dir
                        (default: <repo>/frontend/public/resources/ScienceSeason1/learning_by_video_video)
  --cover-dir DIR       Cover resource dir
                        (default: <repo>/frontend/public/resources/ScienceSeason1/learning_by_video_cover_letters)
  --resource-profile P  Resource profile used to derive default video/cover dirs
                        (default: auto; supported: auto, science, vlog)
  --xlsx-dir DIR        XLSX raw dir
                        (default: <repo>/apps/learning_by_video/data/raw)
  --module-key KEY      Django module key for import/sync (default: learning_by_video)
  --season-number N     Season number for import/sync (default: 1)

  --overwrite           Overwrite ffmpeg outputs when rebuilding
  --reencode            Re-encode during HLS build (enable_hls_5seg.sh --reencode)
  --keep-mov            Do NOT delete MOV source files after step 0 conversion
  --upload-cos          Upload HLS outputs to Tencent COS after Step 1
  --video-url-prefix U  Explicit URL prefix for Step 3 video_url backfill
  --cover-url-prefix U  Explicit URL prefix for Step 3 cover_letter_url backfill

  --skip-step0          Skip MOV -> MP4
  --skip-step1          Skip HLS build
  --skip-step2          Skip XLSX import
  --skip-step3          Skip URL backfill
  --skip-step4          Skip subtitle aggregate backfill
  --dry-run             Print commands only (no execution)
  -h, --help            Show this help
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_XLSX_DIR="$ROOT_DIR/apps/learning_by_video/data/raw"
DEFAULT_RESOURCE_PROFILE="auto"

VIDEO_DIR=""
COVER_DIR=""
XLSX_DIR="$DEFAULT_XLSX_DIR"
MODULE_KEY="learning_by_video"
SEASON_NUMBER="1"
RESOURCE_PROFILE="$DEFAULT_RESOURCE_PROFILE"
VIDEO_URL_PREFIX=""
COVER_URL_PREFIX=""

OVERWRITE=0
REENCODE=0
DELETE_MOV=1
UPLOAD_COS=0
SKIP_STEP0=0
SKIP_STEP1=0
SKIP_STEP2=0
SKIP_STEP3=0
SKIP_STEP4=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --video-dir)
      VIDEO_DIR="${2:-}"
      shift 2
      ;;
    --cover-dir)
      COVER_DIR="${2:-}"
      shift 2
      ;;
    --resource-profile)
      RESOURCE_PROFILE="${2:-}"
      shift 2
      ;;
    --xlsx-dir)
      XLSX_DIR="${2:-}"
      shift 2
      ;;
    --module-key)
      MODULE_KEY="${2:-}"
      shift 2
      ;;
    --season-number)
      SEASON_NUMBER="${2:-}"
      shift 2
      ;;
    --overwrite)
      OVERWRITE=1
      shift
      ;;
    --reencode)
      REENCODE=1
      shift
      ;;
    --keep-mov)
      DELETE_MOV=0
      shift
      ;;
    --upload-cos)
      UPLOAD_COS=1
      shift
      ;;
    --video-url-prefix)
      VIDEO_URL_PREFIX="${2:-}"
      shift 2
      ;;
    --cover-url-prefix)
      COVER_URL_PREFIX="${2:-}"
      shift 2
      ;;
    --skip-step0)
      SKIP_STEP0=1
      shift
      ;;
    --skip-step1)
      SKIP_STEP1=1
      shift
      ;;
    --skip-step2)
      SKIP_STEP2=1
      shift
      ;;
    --skip-step3)
      SKIP_STEP3=1
      shift
      ;;
    --skip-step4)
      SKIP_STEP4=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

resolve_resource_root() {
  local profile="$1"
  case "$profile" in
    auto)
      if [[ "$SEASON_NUMBER" == "4" ]]; then
        printf '%s' "$ROOT_DIR/frontend/public/resources/VlogSeason1"
      else
        printf '%s' "$ROOT_DIR/frontend/public/resources/ScienceSeason1"
      fi
      ;;
    science)
      printf '%s' "$ROOT_DIR/frontend/public/resources/ScienceSeason1"
      ;;
    vlog)
      printf '%s' "$ROOT_DIR/frontend/public/resources/VlogSeason1"
      ;;
    *)
      echo "Unsupported --resource-profile: $profile" >&2
      exit 1
      ;;
  esac
}

RESOURCE_ROOT="$(resolve_resource_root "$RESOURCE_PROFILE")"
DEFAULT_VIDEO_DIR="$RESOURCE_ROOT/learning_by_video_video"
DEFAULT_COVER_DIR="$RESOURCE_ROOT/learning_by_video_cover_letters"

if [[ -z "$VIDEO_DIR" ]]; then
  VIDEO_DIR="$DEFAULT_VIDEO_DIR"
fi
if [[ -z "$COVER_DIR" ]]; then
  COVER_DIR="$DEFAULT_COVER_DIR"
fi

run_cmd() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  "$@"
}

count_files() {
  local dir="$1"
  local pattern="$2"
  find "$dir" -maxdepth 1 -type f -iname "$pattern" | wc -l | tr -d ' '
}

make_step1_whitelist_from_xlsx() {
  local xlsx_dir="$1"
  local whitelist_file="$2"
  local found=0
  local xlsx base

  : > "$whitelist_file"
  shopt -s nullglob
  for xlsx in "$xlsx_dir"/*.xlsx "$xlsx_dir"/*.XLSX; do
    if [[ -f "$xlsx" ]]; then
      found=1
      base="$(basename "$xlsx")"
      base="${base%.*}"
      printf '%s\n' "$base" >> "$whitelist_file"
    fi
  done
  if [[ "$found" -eq 1 ]]; then
    return 0
  fi
  return 1
}

if [[ ! -d "$VIDEO_DIR" ]]; then
  echo "Video dir not found: $VIDEO_DIR" >&2
  exit 1
fi

if [[ ! -d "$COVER_DIR" ]]; then
  echo "Cover dir not found: $COVER_DIR" >&2
  exit 1
fi

if [[ ! -d "$XLSX_DIR" ]]; then
  echo "XLSX dir not found: $XLSX_DIR" >&2
  exit 1
fi

if [[ "$SKIP_STEP0" -ne 1 || "$SKIP_STEP1" -ne 1 ]]; then
  command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is required." >&2; exit 1; }
fi

if [[ "$SKIP_STEP1" -ne 1 ]]; then
  command -v ffprobe >/dev/null 2>&1 || { echo "ffprobe is required for Step 1 (HLS)." >&2; exit 1; }
fi

if command -v uv >/dev/null 2>&1 && [[ -f "$ROOT_DIR/pyproject.toml" ]]; then
  MANAGE_RUNNER=(uv run python "$ROOT_DIR/manage.py")
elif [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  MANAGE_RUNNER=("$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/manage.py")
elif command -v python3 >/dev/null 2>&1; then
  MANAGE_RUNNER=(python3 "$ROOT_DIR/manage.py")
else
  echo "No Python runner found for manage.py (tried uv, .venv, python3)." >&2
  exit 1
fi

echo "Pipeline root: $ROOT_DIR"
echo "Video dir: $VIDEO_DIR"
echo "Cover dir: $COVER_DIR"
echo "XLSX dir: $XLSX_DIR"
echo "Module/Season: $MODULE_KEY / $SEASON_NUMBER"
echo "Resource profile: $RESOURCE_PROFILE"
echo "Upload COS: $UPLOAD_COS"
echo "Dry run: $DRY_RUN"

if [[ -n "$VIDEO_URL_PREFIX" ]]; then
  echo "Video URL prefix: $VIDEO_URL_PREFIX"
fi

if [[ -n "$COVER_URL_PREFIX" ]]; then
  echo "Cover URL prefix: $COVER_URL_PREFIX"
fi

# Step 0: MOV -> MP4
if [[ "$SKIP_STEP0" -eq 1 ]]; then
  echo "Step 0 skipped."
else
  mov_count="$(count_files "$VIDEO_DIR" "*.mov")"
  echo "Step 0: MOV files found: $mov_count"
  if [[ "$mov_count" -gt 0 ]]; then
    cmd=("$ROOT_DIR/scripts/convert_mov_to_mp4.sh" "$VIDEO_DIR")
    if [[ "$OVERWRITE" -eq 1 ]]; then
      cmd+=("--overwrite")
    fi
    if [[ "$DELETE_MOV" -eq 1 ]]; then
      cmd+=("--delete-source")
    fi
    run_cmd "${cmd[@]}"
  else
    echo "Step 0 auto-skip: no MOV files."
  fi
fi

# Step 1: MP4 -> HLS
if [[ "$SKIP_STEP1" -eq 1 ]]; then
  echo "Step 1 skipped."
else
  mp4_count="$(count_files "$VIDEO_DIR" "*.mp4")"
  xlsx_count_for_step1="$(count_files "$XLSX_DIR" "*.xlsx")"
  echo "Step 1: MP4 files found: $mp4_count"
  if [[ "$mp4_count" -gt 0 ]]; then
    cmd=("$ROOT_DIR/scripts/enable_hls_5seg.sh" "$VIDEO_DIR" "$VIDEO_DIR")
    step1_whitelist_file=""
    if [[ "$OVERWRITE" -eq 1 ]]; then
      cmd+=("--overwrite")
    fi
    if [[ "$REENCODE" -eq 1 ]]; then
      cmd+=("--reencode")
    fi
    if [[ "$xlsx_count_for_step1" -gt 0 ]]; then
      step1_whitelist_file="$(mktemp)"
      if make_step1_whitelist_from_xlsx "$XLSX_DIR" "$step1_whitelist_file"; then
        echo "Step 1 whitelist derived from XLSX batch: $xlsx_count_for_step1 file(s)"
        cmd+=("--whitelist-file" "$step1_whitelist_file")
      else
        rm -f "$step1_whitelist_file"
        step1_whitelist_file=""
      fi
    fi
    if [[ "$UPLOAD_COS" -eq 1 ]]; then
      cmd+=("--upload-cos")
    fi
    run_cmd "${cmd[@]}"
    if [[ -n "$step1_whitelist_file" ]]; then
      rm -f "$step1_whitelist_file"
    fi
  else
    echo "Step 1 auto-skip: no MP4 files."
  fi
fi

# Step 2: import xlsx
if [[ "$SKIP_STEP2" -eq 1 ]]; then
  echo "Step 2 skipped."
else
  xlsx_count="$(count_files "$XLSX_DIR" "*.xlsx")"
  echo "Step 2: XLSX files found: $xlsx_count"
  if [[ "$xlsx_count" -gt 0 ]]; then
    if [[ "$XLSX_DIR" == "$DEFAULT_XLSX_DIR" ]]; then
      run_cmd "${MANAGE_RUNNER[@]}" import_xlsx_all \
        --module-key "$MODULE_KEY" \
        --season-number "$SEASON_NUMBER"
    else
      shopt -s nullglob
      files=("$XLSX_DIR"/*.xlsx)
      for f in "${files[@]}"; do
        run_cmd "${MANAGE_RUNNER[@]}" import_xlsx_all \
          --file "$f" \
          --module-key "$MODULE_KEY" \
          --season-number "$SEASON_NUMBER"
      done
    fi
  else
    echo "Step 2 auto-skip: no XLSX files."
  fi
fi

# Step 3: sync urls
if [[ "$SKIP_STEP3" -eq 1 ]]; then
  echo "Step 3 skipped."
else
  cmd=("${MANAGE_RUNNER[@]}" sync_video_media_urls \
    --mode apply \
    --only-missing \
    --empty-only \
    --module-key "$MODULE_KEY" \
    --video-dir "$VIDEO_DIR" \
    --cover-dir "$COVER_DIR" \
    --season-number "$SEASON_NUMBER")
  if [[ -n "$VIDEO_URL_PREFIX" ]]; then
    cmd+=("--video-url-prefix" "$VIDEO_URL_PREFIX")
  fi
  if [[ -n "$COVER_URL_PREFIX" ]]; then
    cmd+=("--cover-url-prefix" "$COVER_URL_PREFIX")
  fi
  run_cmd "${cmd[@]}"
fi

# Step 4: aggregate subtitle text
if [[ "$SKIP_STEP4" -eq 1 ]]; then
  echo "Step 4 skipped."
else
  run_cmd "${MANAGE_RUNNER[@]}" backfill_video_full_subtitles \
    --only-missing \
    --module-key "$MODULE_KEY" \
    --season-number "$SEASON_NUMBER"
fi

echo "Pipeline finished."
