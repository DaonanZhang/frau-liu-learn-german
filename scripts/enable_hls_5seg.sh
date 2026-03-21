#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/enable_hls_5seg.sh [input] [output_dir] [--overwrite] [--reencode] [--update-db] [--whitelist-file FILE] [--allow NAME]

Input:
  - a single .mp4 file, or
  - a directory containqing .mp4 files
  - if omitted, defaults to the server path:
    /srv/projects/frau-liu-learn-german/frontend/public/resources/ScienceSeason1/learning_by_video_video

Behavior:
  - Creates an HLS playlist (.m3u8)
  - Splits each video into ~5 segments (fMP4)

Options:
  --overwrite            Overwrite existing outputs
  --reencode             Re-encode to H.264/AAC for maximum HLS compatibility
  --update-db            Update Video.video_url in DB to use .m3u8 for ScienceSeason1
  --whitelist-file FILE  Only process mp4 names listed in FILE (one per line, supports .mp4 or stem)
  --allow NAME           Add one whitelist item (repeatable; supports .mp4 or stem)
EOF
}

input=""
output_dir=""
overwrite=0
reencode=0
update_db=0
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

whitelist_enabled=0
declare -A whitelist_keys=()

add_whitelist_item() {
  local raw="$1"
  local item key
  item="$(printf '%s' "$raw" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -z "$item" ]]; then
    return 0
  fi
  if [[ "$item" == \#* ]]; then
    return 0
  fi
  item="$(basename "$item")"
  if [[ "${item,,}" == *.mp4 ]]; then
    item="${item:0:${#item}-4}"
  fi
  key="${item,,}"
  if [[ -z "$key" ]]; then
    return 0
  fi
  whitelist_keys["$key"]=1
  whitelist_enabled=1
}

for item in "${allow_items[@]}"; do
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
  local base
  base="$(basename "$in")"
  base="${base%.*}"

  local duration
  duration="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$in" || true)"
  if [[ -z "$duration" ]]; then
    echo "Failed to read duration: $in" >&2
    return 1
  fi

  # Segment time = duration / 5 (rounded, min 2s)
  local seg_time
  seg_time="$(awk -v d="$duration" 'BEGIN { t = int(d / 5 + 0.5); if (t < 2) t = 2; print t }')"

  echo "HLS: $in -> $output_dir/${base}.m3u8 (segment time: ${seg_time}s)"
  ffmpeg "$ffmpeg_overwrite" -i "$in" \
    "${encode_args[@]}" \
    -hls_time "$seg_time" \
    -hls_playlist_type vod \
    -hls_segment_type fmp4 \
    -hls_fmp4_init_filename "${base}-init.mp4" \
    -hls_segment_filename "$output_dir/${base}-%03d.m4s" \
    "$output_dir/${base}.m3u8"
}

is_allowed_mp4() {
  local in="$1"
  local base key
  if [[ "$whitelist_enabled" -eq 0 ]]; then
    return 0
  fi
  base="$(basename "$in")"
  base="${base%.*}"
  key="${base,,}"
  [[ -n "${whitelist_keys[$key]+x}" ]]
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
    if ! is_allowed_mp4 "$f"; then
      echo "Skip (not in whitelist): $f"
      skipped=$((skipped + 1))
      continue
    fi
    build_hls "$f"
    processed=$((processed + 1))
  done
  if [[ "$whitelist_enabled" -eq 1 ]]; then
    echo "Whitelist result: processed=${processed}, skipped=${skipped}"
    if [[ "$processed" -eq 0 ]]; then
      echo "No files matched whitelist." >&2
      exit 1
    fi
  fi
else
  if ! is_allowed_mp4 "$input"; then
    echo "Input file is not in whitelist: $input" >&2
    exit 1
  fi
  build_hls "$input"
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

  "$PY_BIN" "$repo_root/manage.py" shell -c "from urllib.parse import urlsplit,urlunsplit;import os;from django.db import transaction;from apps.learning_by_video.models import Video

VIDEO_PREFIX = '/resources/ScienceSeason1/learning_by_video_video/'

def to_m3u8(url):
    if not url or VIDEO_PREFIX not in url:
        return url
    p=urlsplit(url)
    path=p.path
    base,ext=os.path.splitext(path)
    if path.lower().endswith('.m3u8'):
        return url
    new_path=(base if ext else path)+'.m3u8'
    return urlunsplit((p.scheme,p.netloc,new_path,p.query,p.fragment))

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
