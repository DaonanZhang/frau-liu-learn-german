#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/enable_hls_5seg.sh [input] [output_dir] [--overwrite] [--reencode] [--update-db] [--upload-cos] [--video-url-prefix URL] [--whitelist-file FILE] [--allow NAME]

Input:
  - a single .mp4 file, or
  - a directory containqing .mp4 files
  - if omitted, defaults to the server path:
    /srv/projects/frau-liu-learn-german/frontend/public/resources/ScienceSeason1/learning_by_video_video

Behavior:
  - Creates an HLS playlist (.m3u8)
  - Splits each video into ~5 segments (fMP4)
  - HLS output filenames are normalized to ASCII-safe stems

Options:
  --overwrite            Overwrite existing outputs
  --reencode             Re-encode to H.264/AAC for maximum HLS compatibility
  --update-db            Update Video.video_url in DB to use .m3u8 under the resolved output prefix
  --upload-cos           Upload generated HLS files to Tencent COS after processing
  --video-url-prefix URL Explicit URL prefix for --update-db; auto-derived when omitted
  --whitelist-file FILE  Only process mp4 names listed in FILE (one per line, supports .mp4 or stem)
  --allow NAME           Add one whitelist item (repeatable; supports .mp4 or stem)
EOF
}

input=""
output_dir=""
overwrite=0
reencode=0
update_db=0
upload_cos=0
video_url_prefix=""
whitelist_file=""
allow_items=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --overwrite)
      overwrite=1
      shift
      ;;
    --reencode)
      reencode=1
      shift
      ;;
    --update-db)
      update_db=1
      shift
      ;;
    --upload-cos)
      upload_cos=1
      shift
      ;;
    --video-url-prefix)
      video_url_prefix="${2:-}"
      if [[ -z "$video_url_prefix" ]]; then
        echo "--video-url-prefix requires a URL prefix" >&2
        exit 1
      fi
      shift 2
      ;;
    --whitelist-file)
      whitelist_file="${2:-}"
      if [[ -z "$whitelist_file" ]]; then
        echo "--whitelist-file requires a file path" >&2
        exit 1
      fi
      shift 2
      ;;
    --allow)
      if [[ -z "${2:-}" ]]; then
        echo "--allow requires a filename/stem" >&2
        exit 1
      fi
      allow_items+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$input" ]]; then
        input="$1"
        shift
      elif [[ -z "$output_dir" ]]; then
        output_dir="$1"
        shift
      else
        echo "Unknown argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$input" ]]; then
  default_input="/srv/projects/frau-liu-learn-german/frontend/public/resources/ScienceSeason1/learning_by_video_video"
  if [[ -d "$default_input" ]]; then
    input="$default_input"
  else
    usage
    exit 1
  fi
fi

if [[ -z "$output_dir" ]]; then
  if [[ -d "$input" ]]; then
    output_dir="$input"
  else
    output_dir="$(dirname "$input")"
  fi
fi

mkdir -p "$output_dir"

PY_BIN="${PYTHON_BIN:-}"
if [[ -z "$PY_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PY_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PY_BIN="python"
  else
    echo "python3/python is required for filename normalization." >&2
    exit 1
  fi
fi

whitelist_enabled=0
whitelist_keys=()

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

add_whitelist_item() {
  local raw="$1"
  local item key existing
  item="$(printf '%s' "$raw" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -z "$item" ]]; then
    return 0
  fi
  if [[ "$item" == \#* ]]; then
    return 0
  fi
  item="$(basename "$item")"
  if [[ "$(to_lower "$item")" == *.mp4 ]]; then
    item="${item:0:${#item}-4}"
  fi
  key="$(to_lower "$item")"
  if [[ -z "$key" ]]; then
    return 0
  fi
  existing=0
  for existing_key in "${whitelist_keys[@]}"; do
    if [[ "$existing_key" == "$key" ]]; then
      existing=1
      break
    fi
  done
  if [[ "$existing" -eq 0 ]]; then
    whitelist_keys+=("$key")
  fi
  whitelist_enabled=1
}

for item in "${allow_items[@]-}"; do
  add_whitelist_item "$item"
done

if [[ -n "$whitelist_file" ]]; then
  if [[ ! -f "$whitelist_file" ]]; then
    echo "Whitelist file not found: $whitelist_file" >&2
    exit 1
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    add_whitelist_item "$line"
  done < "$whitelist_file"
fi

if [[ "$whitelist_enabled" -eq 1 ]]; then
  echo "Whitelist enabled: ${#whitelist_keys[@]} item(s)"
fi

ffmpeg_overwrite="-n"
if [[ "$overwrite" -eq 1 ]]; then
  ffmpeg_overwrite="-y"
fi

encode_args=("-c" "copy")
if [[ "$reencode" -eq 1 ]]; then
  encode_args=(
    "-c:v" "libx264" "-preset" "medium" "-crf" "23" "-profile:v" "high" "-level" "4.0" "-pix_fmt" "yuv420p"
    "-c:a" "aac" "-b:a" "128k"
  )
fi

build_hls() {
  local in="$1"
  local base out_base
  base="$(basename "$in")"
  base="${base%.*}"
  out_base="$("$PY_BIN" - "$base" <<'PY'
import re
import sys
import unicodedata

s = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
s = s.replace("ß", "ss").replace("ẞ", "SS")
s = unicodedata.normalize("NFKD", s)
s = "".join(ch for ch in s if not unicodedata.combining(ch))
s = s.replace("?", "_").replace("#", "_").replace("%", "_")
s = re.sub(r"\s+", "_", s)
s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
s = re.sub(r"_+", "_", s).strip("._")
print(s or "media")
PY
)"
  if [[ "$base" != "$out_base" ]]; then
    echo "Normalized HLS stem: '$base' -> '$out_base'"
  fi

  if [[ "$overwrite" -ne 1 && -f "$output_dir/${out_base}.m3u8" ]]; then
    echo "Skip (playlist already exists): $output_dir/${out_base}.m3u8"
    return 2
  fi

  local duration
  duration="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$in" || true)"
  if [[ -z "$duration" ]]; then
    echo "Failed to read duration: $in" >&2
    return 1
  fi

  # Segment time = duration / 5 (rounded, min 2s)
  local seg_time
  seg_time="$(awk -v d="$duration" 'BEGIN { t = int(d / 5 + 0.5); if (t < 2) t = 2; print t }')"

  echo "HLS: $in -> $output_dir/${out_base}.m3u8 (segment time: ${seg_time}s)"
  ffmpeg "$ffmpeg_overwrite" -i "$in" \
    "${encode_args[@]}" \
    -hls_time "$seg_time" \
    -hls_playlist_type vod \
    -hls_segment_type fmp4 \
    -hls_fmp4_init_filename "${out_base}-init.mp4" \
    -hls_segment_filename "$output_dir/${out_base}-%03d.m4s" \
    "$output_dir/${out_base}.m3u8"
}

upload_hls_to_cos() {
  local repo_root="$1"
  local output_dir_abs public_root cos_prefix file filename
  local coscmd="/srv/projects/frau-liu-learn-german/cos-venv/bin/coscmd"

  if [[ ! -x "$coscmd" ]]; then
    echo "COS upload requested, but coscmd is not executable: $coscmd" >&2
    return 1
  fi

  output_dir_abs="$(cd "$output_dir" && pwd)"
  public_root="$repo_root/frontend/public"
  if [[ "$output_dir_abs" == "$public_root"/* ]]; then
    cos_prefix="${output_dir_abs#$public_root/}"
  else
    cos_prefix="resources/ScienceSeason1/learning_by_video_video"
  fi

  echo "Uploading HLS files to COS: cos://$cos_prefix/"

  shopt -s nullglob

  # Upload fragments first, then publish the playlist last so clients do not see incomplete media.
  for file in "$output_dir_abs"/*-init.mp4 "$output_dir_abs"/*.m4s; do
    if [[ -f "$file" ]]; then
      filename="$(basename "$file")"
      echo "Uploading: $filename -> cos://$cos_prefix/"
      "$coscmd" upload "$file" "$cos_prefix/$filename" || echo "Upload failed: $filename" >&2
    fi
  done

  for file in "$output_dir_abs"/*.m3u8; do
    if [[ -f "$file" ]]; then
      filename="$(basename "$file")"
      echo "Uploading: $filename -> cos://$cos_prefix/"
      "$coscmd" upload "$file" "$cos_prefix/$filename" || echo "Upload failed: $filename" >&2
    fi
  done

  echo "COS upload completed."
}

derive_output_relative_path() {
  local repo_root="$1"
  local output_dir_abs public_root
  output_dir_abs="$(cd "$output_dir" && pwd)"
  public_root="$repo_root/frontend/public"
  if [[ "$output_dir_abs" == "$public_root"/* ]]; then
    printf '%s' "${output_dir_abs#$public_root/}"
  else
    printf '%s' "resources/ScienceSeason1/learning_by_video_video"
  fi
}

is_allowed_mp4() {
  local in="$1"
  local base key existing_key
  if [[ "$whitelist_enabled" -eq 0 ]]; then
    return 0
  fi
  base="$(basename "$in")"
  base="${base%.*}"
  key="$(to_lower "$base")"
  for existing_key in "${whitelist_keys[@]}"; do
    if [[ "$existing_key" == "$key" ]]; then
      return 0
    fi
  done
  return 1
}

is_hls_init_mp4() {
  local in="$1"
  local base
  base="$(basename "$in")"
  base="${base%.*}"
  [[ "$(to_lower "$base")" == *-init ]]
}

if [[ -d "$input" ]]; then
  shopt -s nullglob
  files=("$input"/*.mp4 "$input"/*.MP4)
  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "No .mp4 files found in: $input" >&2
    exit 1
  fi
  processed=0
  skipped=0
  for f in "${files[@]}"; do
    if is_hls_init_mp4 "$f"; then
      echo "Skip (HLS init file): $f"
      skipped=$((skipped + 1))
      continue
    fi
    if ! is_allowed_mp4 "$f"; then
      echo "Skip (not in whitelist): $f"
      skipped=$((skipped + 1))
      continue
    fi
    if build_hls "$f"; then
      processed=$((processed + 1))
    else
      rc=$?
      if [[ "$rc" -eq 2 ]]; then
        skipped=$((skipped + 1))
      else
        exit "$rc"
      fi
    fi
  done
  if [[ "$whitelist_enabled" -eq 1 ]]; then
    echo "Whitelist result: processed=${processed}, skipped=${skipped}"
    if [[ "$processed" -eq 0 ]]; then
      echo "No files matched whitelist." >&2
      exit 1
    fi
  fi
else
  if is_hls_init_mp4 "$input"; then
    echo "Input is an HLS init file, skipping: $input"
    exit 0
  fi
  if ! is_allowed_mp4 "$input"; then
    echo "Input file is not in whitelist: $input" >&2
    exit 1
  fi
  if ! build_hls "$input"; then
    rc=$?
    if [[ "$rc" -ne 2 ]]; then
      exit "$rc"
    fi
  fi
fi

if [[ "$update_db" -eq 1 ]]; then
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  repo_root="$(cd "$script_dir/.." && pwd)"
  if [[ ! -f "$repo_root/manage.py" ]]; then
    echo "manage.py not found under: $repo_root" >&2
    exit 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    PY_BIN="${PYTHON_BIN:-python3}"
  else
    PY_BIN="${PYTHON_BIN:-python}"
  fi

  rel_path="$(derive_output_relative_path "$repo_root")"
  if [[ -n "$video_url_prefix" ]]; then
    resolved_video_prefix="${video_url_prefix%/}"
  else
    resolved_video_prefix="/${rel_path%/}"
  fi

  "$PY_BIN" "$repo_root/manage.py" shell -c "from urllib.parse import urlsplit,urlunsplit;import os;from django.db import transaction;from apps.learning_by_video.models import Video

VIDEO_PREFIX = '$resolved_video_prefix'

def to_m3u8(url):
    if not url:
        return url
    parsed_prefix = urlsplit(VIDEO_PREFIX)
    current = urlsplit(url)
    current_name = os.path.basename(current.path or '')
    stem, _ext = os.path.splitext(current_name)
    if not stem:
        return url
    if parsed_prefix.scheme and parsed_prefix.netloc:
        prefix_path = '/' + parsed_prefix.path.lstrip('/')
        new_path = prefix_path.rstrip('/') + '/' + stem + '.m3u8'
        return urlunsplit((parsed_prefix.scheme, parsed_prefix.netloc, new_path, '', ''))
    prefix_path = '/' + VIDEO_PREFIX.lstrip('/')
    new_path = prefix_path.rstrip('/') + '/' + stem + '.m3u8'
    return urlunsplit((current.scheme, current.netloc, new_path, current.query, current.fragment))

with transaction.atomic():
    qs=Video.objects.all().only('id','video_url')
    updates=[]
    for v in qs:
        new=to_m3u8(v.video_url)
        if new!=v.video_url:
            v.video_url=new
            updates.append(v)
    if updates:
        Video.objects.bulk_update(updates,['video_url'])
    print(f'updated={len(updates)} total={qs.count()}')"
fi

if [[ "$upload_cos" -eq 1 ]]; then
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  repo_root="$(cd "$script_dir/.." && pwd)"
  upload_hls_to_cos "$repo_root"
fi
