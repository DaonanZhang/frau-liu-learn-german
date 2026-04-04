#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/convert_mov_to_mp4.sh <input> [output_dir] [--overwrite] [--delete-source]

Input:
  - a single .mov file, or
  - a directory containing .mov/.MOV files

Behavior:
  - Converts MOV to MP4 (H.264/AAC)
  - Output filename is normalized to ASCII-safe format
    (example: "München (1).mov" -> "Munchen_1.mp4")

Options:
  --overwrite      Overwrite existing outputs
  --delete-source  Delete source .mov after successful conversion
EOF
}

input=""
output_dir=""
overwrite=0
delete_source=0
PY_BIN="${PYTHON_BIN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --overwrite)
      overwrite=1
      shift
      ;;
    --delete-source)
      delete_source=1
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

out_stems_seen_keys=()
out_stems_seen_values=()

normalize_stem() {
  local raw="$1"
  "$PY_BIN" - "$raw" <<'PY'
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
}

convert_one() {
  local in="$1"
  local base out_base out_mp4 existing_in idx
  base="$(basename "$in")"
  base="${base%.*}"
  out_base="$(normalize_stem "$base")"
  out_mp4="$output_dir/${out_base}.mp4"

  existing_in=""
  for idx in "${!out_stems_seen_keys[@]}"; do
    if [[ "${out_stems_seen_keys[$idx]}" == "$out_base" ]]; then
      existing_in="${out_stems_seen_values[$idx]}"
      break
    fi
  done
  if [[ -n "$existing_in" && "$existing_in" != "$in" ]]; then
    echo "Name collision after normalization:" >&2
    echo "  - $existing_in" >&2
    echo "  - $in" >&2
    echo "Both map to: ${out_base}.mp4" >&2
    exit 1
  fi
  if [[ -z "$existing_in" ]]; then
    out_stems_seen_keys+=("$out_base")
    out_stems_seen_values+=("$in")
  fi

  if [[ "$base" != "$out_base" ]]; then
    echo "Normalized filename: '$base' -> '$out_base'"
  fi

  echo "Transcoding to MP4: $in -> $out_mp4"
  ffmpeg "$ffmpeg_overwrite" -i "$in" \
    -c:v libx264 -preset medium -crf 23 -profile:v high -level 4.0 -pix_fmt yuv420p \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    "$out_mp4"

  if [[ "$delete_source" -eq 1 ]]; then
    rm -f "$in"
    echo "Deleted source MOV: $in"
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
    convert_one "$f"
  done
else
  convert_one "$input"
fi
