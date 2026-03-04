#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/transcode_learning_videos.sh <input> [output_dir] [--hls] [--segments N] [--hls-time SECONDS] [--overwrite]

Examples:
  # Single file -> MP4
  scripts/transcode_learning_videos.sh "path/to/video.mov"

  # Single file -> MP4 + HLS (4 segments)
  scripts/transcode_learning_videos.sh "path/to/video.mov" --hls --segments 4

  # Batch convert all .mov in a folder -> MP4 + HLS
  scripts/transcode_learning_videos.sh "frontend/public/resources/learning_by_video_video" --hls
EOF
}

input=""
output_dir=""
hls_enabled=0
segments=""
hls_time=""
overwrite=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hls)
      hls_enabled=1
      shift
      ;;
    --segments)
      segments="${2:-}"
      shift 2
      ;;
    --hls-time)
      hls_time="${2:-}"
      shift 2
      ;;
    --overwrite)
      overwrite=1
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
  usage
  exit 1
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

transcode_one() {
  local in="$1"
  local base
  base="$(basename "$in")"
  base="${base%.*}"

  echo "Transcoding to MP4: $in -> $output_dir/${base}.mp4"
  ffmpeg "$ffmpeg_overwrite" -i "$in" \
    -c:v libx264 -preset medium -crf 23 -profile:v high -level 4.0 -pix_fmt yuv420p \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$output_dir/${base}.mp4"

  if [[ "$hls_enabled" -eq 1 ]]; then
    local seg_time="6"
    if [[ -n "$hls_time" ]]; then
      seg_time="$hls_time"
    elif [[ -n "$segments" ]]; then
      local duration
      duration="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$in" || true)"
      if [[ -n "$duration" ]]; then
        seg_time="$(awk -v d="$duration" -v n="$segments" 'BEGIN { if (n < 1) n = 4; t = int(d / n + 0.5); if (t < 2) t = 2; print t }')"
      fi
    fi

    echo "Transcoding to HLS: $in -> $output_dir/${base}.m3u8 (segment time: ${seg_time}s)"
    ffmpeg "$ffmpeg_overwrite" -i "$in" \
      -c:v libx264 -preset medium -crf 23 -profile:v high -level 4.0 -pix_fmt yuv420p \
      -c:a aac -b:a 128k \
      -hls_time "$seg_time" \
      -hls_playlist_type vod \
      -hls_segment_type fmp4 \
      -hls_fmp4_init_filename "${base}-init.mp4" \
      -hls_segment_filename "$output_dir/${base}-%03d.m4s" \
      "$output_dir/${base}.m3u8"
  fi
}

if [[ -d "$input" ]]; then
  shopt -s nullglob
  files=("$input"/*.mov "$input"/*.MOV)
  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "No .mov files found in: $input" >&2
    exit 1
  fi
  for f in "${files[@]}"; do
    transcode_one "$f"
  done
else
  transcode_one "$input"
fi
