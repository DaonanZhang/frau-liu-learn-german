#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_DIR = (
    REPO_ROOT
    / "frontend/public/resources/ExamPreparation/exam_preparation_audio/telc_b1_teil3"
)
DEFAULT_BACKUP_DIR = REPO_ROOT / "tmp/exam-preparation-listening-teil3-originals"
SILENCE_RE = re.compile(r"silence_(start|end):\s*([0-9.]+)")


def select_single_play_segments(
    silences: list[tuple[float, float]], duration: float | None = None
) -> list[tuple[float, float]]:
    """Select the first recording from each repeated Teil 3 pair.

    Args:
        silences: Detected silence start and end timestamps.
        duration: Total audio duration when the final pair reaches file end.

    Returns:
        Audio segments containing one copy of each prompt.

    Raises:
        ValueError: If the detected structure does not contain matching pairs.
    """
    if len(silences) not in {9, 10, 11, 13}:
        raise ValueError("expected one preparation silence followed by five repeated pairs")

    pair_count = 6 if len(silences) == 13 else 5
    segments = []
    speech_start = silences[0][1]
    complete_pair_count = pair_count if len(silences) in {11, 13} else 4
    for pair_index in range(complete_pair_count):
        first_silence = silences[1 + pair_index * 2]
        repeat_silence = silences[2 + pair_index * 2]
        first_duration = first_silence[0] - speech_start
        repeat_duration = repeat_silence[0] - first_silence[1]
        if abs(first_duration - repeat_duration) > 1.1:
            raise ValueError(
                f"recording pair {pair_index + 1} differs by more than 1.1 seconds"
            )
        segments.append((speech_start, first_silence[1]))
        speech_start = repeat_silence[1]

    if len(silences) in {11, 13}:
        return segments

    if duration is None and len(silences) < 11:
        raise ValueError("audio duration is required when the final pair reaches file end")

    if len(silences) == 9:
        final_pair_duration = duration - speech_start
        if final_pair_duration <= 0:
            raise ValueError("final recording pair has no audio")
        segments.append((speech_start, speech_start + final_pair_duration / 2))
        return segments

    first_silence = silences[9]
    repeat_end = silences[10][0] if len(silences) == 11 else duration
    first_duration = first_silence[0] - speech_start
    repeat_duration = repeat_end - first_silence[1]
    if abs(first_duration - repeat_duration) > 1.1:
        raise ValueError("recording pair 5 differs by more than 1.1 seconds")
    segments.append((speech_start, first_silence[1]))
    return segments


def detect_long_silences(
    path: Path, minimum_duration: float = 2
) -> list[tuple[float, float]]:
    """Return long silence ranges detected by ffmpeg.

    Args:
        path: Audio file to inspect.
        minimum_duration: Minimum silence duration in seconds.

    Returns:
        Detected silence start and end timestamps.

    Raises:
        RuntimeError: If ffmpeg cannot inspect the audio file.
    """
    result = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-i", str(path),
            "-af", f"silencedetect=noise=-35dB:d={minimum_duration}",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"ffmpeg could not inspect {path}")

    silences = []
    pending_start = None
    for kind, raw_value in SILENCE_RE.findall(result.stderr):
        value = float(raw_value)
        if kind == "start":
            pending_start = value
        elif pending_start is not None:
            silences.append((pending_start, value))
            pending_start = None
    return silences


def probe_duration(path: Path) -> float:
    """Return an audio file's duration in seconds."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def normalize_audio(path: Path, backup_dir: Path, dry_run: bool) -> list[tuple[float, float]]:
    """Keep one copy of each Teil 3 prompt and preserve the source backup.

    Args:
        path: Audio file to normalize.
        backup_dir: Directory for untouched source copies.
        dry_run: Whether to inspect without writing files.

    Returns:
        Audio segments selected for the normalized output.
    """
    duration = probe_duration(path)
    try:
        segments = select_single_play_segments(
            detect_long_silences(path), duration=duration
        )
    except ValueError:
        shorter_silences = detect_long_silences(path, minimum_duration=0.8)
        if len(shorter_silences) != 13:
            raise
        segments = select_single_play_segments(shorter_silences, duration=duration)
    if dry_run:
        return segments

    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / path.name
    if not backup_path.exists():
        shutil.copy2(path, backup_path)

    filters = []
    labels = []
    for index, (start, end) in enumerate(segments):
        label = f"segment{index}"
        filters.append(
            f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[{label}]"
        )
        labels.append(f"[{label}]")
    filters.append(f"{''.join(labels)}concat=n={len(labels)}:v=0:a=1[out]")

    with tempfile.NamedTemporaryFile(suffix=".m4a", dir=path.parent, delete=False) as handle:
        output_path = Path(handle.name)
    try:
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
                "-filter_complex", ";".join(filters), "-map", "[out]",
                "-c:a", "aac", "-b:a", "192k", str(output_path),
            ],
            check=True,
        )
        output_path.replace(path)
    finally:
        output_path.unlink(missing_ok=True)
    return segments


def main() -> int:
    """Run the Teil 3 audio normalization command."""
    parser = argparse.ArgumentParser(
        description="Keep one recording of each prompt in telc B1 Hören Teil 3 audio files."
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    paths = sorted(args.source_dir.glob("Teil3_*.m4a"))
    if not paths:
        parser.error(f"no Teil3_*.m4a files found in {args.source_dir}")

    for path in paths:
        segments = normalize_audio(path, args.backup_dir, args.dry_run)
        print(f"{path.name}: keep {len(segments)} single-play segments")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
