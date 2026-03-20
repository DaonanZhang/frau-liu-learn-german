#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/enable_hls_5seg.sh [input] [output_dir] [--overwrite] [--reencode] [--update-db]

Input:
  - a single .mp4 file, or
  - a directory containqing .mp4 files
  - if omitted, defaults to the server path:
    /srv/projects/frau-liu-learn-german/frontend/public/resources/ScienceSeason1/learning_by_video_video

Behavior:
  - Creates an HLS playlist (.m3u8)
  - Splits each video into ~5 segments (fMP4)

Options:
  --overwrite   Overwrite existing outputs
  --reencode    Re-encode to H.264/AAC for maximum HLS compatibility
  --update-db   Update Video.video_url in DB to use .m3u8 for ScienceSeason1
EOF
}

input=""
output_dir=""
overwrite=0
reencode=0
update_db=0

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

if [[ -d "$input" ]]; then
  shopt -s nullglob
  files=("$input"/*.mp4 "$input"/*.MP4)
  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "No .mp4 files found in: $input" >&2
    exit 1
  fi
  for f in "${files[@]}"; do
    build_hls "$f"
  done
else
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
