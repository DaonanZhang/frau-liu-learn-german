#!/usr/bin/env python3
from __future__ import annotations

import argparse
from http.client import IncompleteRead
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = REPO_ROOT / "apps/exam_preparation/data/imports/telc/b2/listening/raw"
OUTPUT_DIR = (
    REPO_ROOT
    / "frontend/public/resources/ExamPreparation/exam_preparation_audio/telc_b2_teil2"
)
NARRATOR_VOICE = "de-DE-SeraphinaMultilingualNeural"
MAX_SYNTHESIS_TEXT_CHARS = 4500
VOICE_POOLS = {
    "frau": [
        "de-DE-KatjaNeural",
        "de-DE-AmalaNeural",
        "de-DE-LouisaNeural",
        "de-DE-MajaNeural",
        "de-DE-GiselaNeural",
        "de-DE-ElkeNeural",
    ],
    "mann": [
        "de-DE-ConradNeural",
        "de-DE-KillianNeural",
        "de-DE-KasperNeural",
        "de-DE-KlausNeural",
        "de-DE-RalfNeural",
        "de-DE-ChristophNeural",
        "de-DE-BerndNeural",
    ],
}
Turn = tuple[tuple[str, ...], str]


def parse_participants(value: object) -> list[tuple[str, str]]:
    result = []
    for item in str(value or "").split(","):
        match = re.fullmatch(r"\s*(.+?)\s*\((mann|frau)\)\s*", item, re.IGNORECASE)
        if not match:
            raise ValueError(f"Invalid participant declaration: {item!r}")
        result.append((match.group(1).strip(), match.group(2).lower()))
    if not result:
        raise ValueError("At least one dialogue participant is required")
    return result


def assign_voices(participants: list[tuple[str, str]]) -> dict[str, str]:
    offsets = {gender: 0 for gender in VOICE_POOLS}
    result = {}
    for name, gender in participants:
        if gender not in VOICE_POOLS:
            raise ValueError(f"Unsupported participant gender: {gender!r}")
        offset = offsets[gender]
        if offset >= len(VOICE_POOLS[gender]):
            raise ValueError(f"Not enough distinct {gender} voices for the participant list")
        result[name] = VOICE_POOLS[gender][offset]
        offsets[gender] += 1
    if len(result) != len(participants) or len(set(result.values())) != len(result):
        raise ValueError("Every participant must have one distinct voice")
    if NARRATOR_VOICE in result.values():
        raise ValueError("The narrator voice cannot be assigned to a dialogue participant")
    return result


def parse_dialogue(value: object, participants: list[tuple[str, str]]) -> list[Turn]:
    names = {name for name, _ in participants}
    turns: list[Turn] = []
    speakers: tuple[str, ...] | None = None
    text_lines: list[str] = []

    def flush() -> None:
        nonlocal speakers, text_lines
        if speakers is None:
            return
        text = "\n".join(text_lines).strip()
        if not text:
            raise ValueError(f"Dialogue turn has no text: {' / '.join(speakers)}")
        turns.append((speakers, text))
        speakers = None
        text_lines = []

    for line in str(value or "").replace("\r\n", "\n").splitlines():
        label = re.fullmatch(r"\s*([^:\n]+?)\s*:\s*", line)
        if label:
            candidates = tuple(part.strip() for part in label.group(1).split("/") if part.strip())
            if candidates and all(candidate in names for candidate in candidates):
                flush()
                speakers = candidates
                continue
        if speakers is None:
            if line.strip():
                raise ValueError(f"Text appears before the first valid speaker label: {line!r}")
            continue
        text_lines.append(line)
    flush()
    if not turns:
        raise ValueError("Dialogue contains no turns")
    return turns


def build_dialogue_ssml(turns: list[Turn], voices: dict[str, str]) -> bytes:
    parts = [
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">'
    ]
    for speakers, text in turns:
        if len(speakers) != 1:
            raise ValueError("Simultaneous turns must be synthesized as separate tracks")
        speaker = speakers[0]
        if speaker not in voices:
            raise ValueError(f"No voice assigned for speaker {speaker!r}")
        normalized_text = re.sub(r"\s+", " ", text).strip()
        parts.append(
            f'<voice name="{escape(voices[speaker])}">{escape(normalized_text)}'
            '<break time="350ms"/></voice>'
        )
    parts.append("</speak>")
    return "".join(parts).encode("utf-8")


def build_single_voice_ssml(text: str, voice: str) -> bytes:
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">'
        f'<voice name="{escape(voice)}">{escape(re.sub(r"\s+", " ", text).strip())}</voice>'
        "</speak>"
    ).encode("utf-8")


def build_intro_ssml(text: str, voice: str = NARRATOR_VOICE) -> bytes:
    lines = []
    for raw_line in str(text).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"\b1\s*[–-]\s*10\b", "eins bis zehn", line)
        line = re.sub(r"\bPLUS\s*\(\s*\+\s*\)", "Plus", line, flags=re.IGNORECASE)
        line = re.sub(r"\bMINUS\s*\(\s*[–−-]\s*\)", "Minus", line, flags=re.IGNORECASE)
        lines.append(line)
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">'
        f'<voice name="{escape(voice)}">'
        + '<break time="700ms"/>'.join(escape(line) for line in lines)
        + "</voice></speak>"
    ).encode("utf-8")


def synthesize_ssml(ssml: bytes, *, region: str, key: str) -> bytes:
    request = Request(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=ssml,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "frau-liu-listening-audio/1.0",
        },
        method="POST",
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=180) as response:
                audio = response.read()
                if not audio:
                    raise RuntimeError("Azure returned an empty audio file")
                return audio
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f"Azure Speech failed with HTTP {error.code}") from error
        except URLError as error:
            if attempt == 2:
                raise RuntimeError(f"Azure Speech connection failed: {error.reason}") from error
        except IncompleteRead as error:
            if attempt == 2:
                raise RuntimeError("Azure Speech returned incomplete audio") from error
        time.sleep(2**attempt)
    raise RuntimeError("Azure Speech did not return audio")


def run_ffmpeg(arguments: list[str]) -> None:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *arguments],
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


def create_silence(path: Path, seconds: int) -> None:
    run_ffmpeg([
        "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(seconds),
        "-ar", "24000", "-ac", "1", "-b:a", "48k", str(path),
    ])


def concatenate_audio(inputs: list[Path], output: Path) -> None:
    command = []
    for input_path in inputs:
        command.extend(["-i", str(input_path)])
    labels = "".join(f"[{index}:a]" for index in range(len(inputs)))
    command.extend([
        "-filter_complex", f"{labels}concat=n={len(inputs)}:v=0:a=1[out]",
        "-map", "[out]", "-ar", "24000", "-ac", "1", "-b:a", "48k", str(output),
    ])
    run_ffmpeg(command)


def mix_audio(inputs: list[Path], output: Path) -> None:
    command = []
    for input_path in inputs:
        command.extend(["-i", str(input_path)])
    labels = "".join(f"[{index}:a]" for index in range(len(inputs)))
    command.extend([
        "-filter_complex",
        f"{labels}amix=inputs={len(inputs)}:duration=longest:normalize=0,alimiter=limit=0.95[out]",
        "-map", "[out]", "-ar", "24000", "-ac", "1", "-b:a", "48k", str(output),
    ])
    run_ffmpeg(command)


def audio_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"ffprobe failed for {path}")
    return float(result.stdout.strip())


def load_azure_environment() -> tuple[str, str]:
    env_path = REPO_ROOT / ".env"
    if env_path.is_file():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            if name not in {"AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"}:
                continue
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            os.environ.setdefault(name, value)
    key = os.getenv("AZURE_SPEECH_KEY", "")
    region = os.getenv("AZURE_SPEECH_REGION", "").lower()
    if not key or not re.fullmatch(r"[a-z0-9]+", region):
        raise RuntimeError("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env or the environment")
    return key, region


def read_workbook(path: Path) -> dict[str, object]:
    meta = pd.read_excel(path, sheet_name="meta", dtype=object)
    meta = meta.where(meta.notna(), "")
    if len(meta) != 1:
        raise ValueError(f"{path.name}: expected exactly one meta row")
    row = meta.iloc[0]
    external_id = str(row["音频文件_ID"]).removesuffix(".0").zfill(3)
    if path.stem.rsplit("_", 1)[-1] != external_id:
        raise ValueError(f"{path.name}: filename ID does not match workbook ID {external_id}")
    copy = str(row["copy"])
    participants = parse_participants(row["出场人物"])
    dialogue_boundary = len(copy)
    for name, _gender in participants:
        label = re.search(
            rf"(?:^|\r?\n|<br\s*/?>|>)(\s*{re.escape(name)}\s*:)",
            copy,
            flags=re.IGNORECASE,
        )
        if label:
            dialogue_boundary = min(dialogue_boundary, label.start(1))
    preparation_marker, preparation_seconds = parse_preparation_marker(
        copy, path.name, boundary=dialogue_boundary
    )
    dialogue_copy = copy[preparation_marker.end():]
    timeline = build_dialogue_timeline(dialogue_copy, participants)
    return {
        "id": external_id,
        "intro": str(row["Einleitung"]).strip(),
        "participants": participants,
        "voices": assign_voices(participants),
        "preparation_seconds": preparation_seconds,
        "pause_markers": parse_pause_markers(dialogue_copy),
        "timeline": timeline,
        "turns": [value for kind, value in timeline if kind == "speech"],
    }


def parse_pause_markers(
    copy: str, *, allow_legacy_double_quotes: bool = False
) -> list[tuple[re.Match[str], int]]:
    pattern = re.compile(r"<(\d+)(?:''|\"\")>" if allow_legacy_double_quotes else r"<(\d+)''>")
    markers = []
    for candidate in re.finditer(r"<\d+[^<>]*(?:>|(?=\s|$))", copy):
        match = pattern.fullmatch(candidate.group())
        if match is None:
            raise ValueError(f"Malformed pause marker: {candidate.group()!r}")
        original_match = pattern.search(copy, candidate.start())
        markers.append((original_match, int(original_match.group(1))))
    return markers


def parse_preparation_marker(
    copy: str, source_name: str = "copy", *, boundary: int | None = None,
    allow_legacy_double_quotes: bool = False,
) -> tuple[re.Match[str], int]:
    try:
        markers = parse_pause_markers(
            copy[:boundary], allow_legacy_double_quotes=allow_legacy_double_quotes
        )
    except ValueError as error:
        raise ValueError(f"{source_name}: malformed preparation-time marker: {error}") from error
    if not markers:
        raise ValueError(f"{source_name}: copy must contain a preparation-time marker")
    return markers[-1][0], sum(seconds for _match, seconds in markers)


def build_dialogue_timeline(
    value: object, participants: list[tuple[str, str]], *, allow_legacy_double_quotes: bool = False
) -> list[tuple[str, object]]:
    names = {name for name, _ in participants}
    timeline: list[tuple[str, object]] = []
    speakers: tuple[str, ...] | None = None
    speech: list[str] = []
    turn_has_speech = False

    def flush_speech() -> None:
        nonlocal speech, turn_has_speech
        text = "\n".join(speech).strip()
        if text:
            timeline.append(("speech", (speakers, text)))
            turn_has_speech = True
        speech = []

    def flush_turn() -> None:
        nonlocal speakers, turn_has_speech
        if speakers is None:
            return
        flush_speech()
        if not turn_has_speech:
            raise ValueError(f"Dialogue turn has no text: {' / '.join(speakers)}")
        speakers = None
        turn_has_speech = False

    for line in str(value or "").replace("\r\n", "\n").splitlines():
        label = re.fullmatch(r"\s*([^:\n]+?)\s*:\s*", line)
        if label:
            candidates = tuple(part.strip() for part in label.group(1).split("/") if part.strip())
            if candidates and all(candidate in names for candidate in candidates):
                flush_turn()
                speakers = candidates
                continue
        if speakers is None:
            if line.strip():
                raise ValueError(f"Text appears before the first valid speaker label: {line!r}")
            continue
        markers = parse_pause_markers(line, allow_legacy_double_quotes=allow_legacy_double_quotes)
        position = 0
        for match, seconds in markers:
            speech.append(line[position:match.start()])
            flush_speech()
            timeline.append(("pause", seconds))
            position = match.end()
        speech.append(line[position:])
    flush_turn()
    if not any(kind == "speech" for kind, _value in timeline):
        raise ValueError("Dialogue contains no turns")
    return timeline


def synthesize_timeline(
    timeline: list[tuple[str, object]], voices: dict[str, str], work_dir: Path, *, region: str, key: str
) -> list[Path]:
    segments = []
    pause_index = 0
    for index, (kind, value) in enumerate(timeline, start=1):
        if kind == "pause":
            pause_index += 1
            path = work_dir / f"pause_{pause_index}.mp3"
            create_silence(path, int(value))
            segments.append(path)
            continue
        speech_dir = work_dir / f"speech_{index}"
        speech_dir.mkdir()
        segments.extend(synthesize_turn_segments(
            [value], voices, speech_dir, region=region, key=key
        ))
    return segments


def synthesize_turn_segments(
    turns: list[Turn], voices: dict[str, str], work_dir: Path, *, region: str, key: str
) -> list[Path]:
    segments = []
    pending: list[Turn] = []
    pending_chars = 0

    def flush_pending() -> None:
        nonlocal pending_chars
        if not pending:
            return
        path = work_dir / f"dialogue_{len(segments) + 1}.mp3"
        path.write_bytes(synthesize_ssml(build_dialogue_ssml(pending, voices), region=region, key=key))
        segments.append(path)
        pending.clear()
        pending_chars = 0

    def split_text(text: str) -> list[str]:
        remaining = re.sub(r"\s+", " ", text).strip()
        chunks = []
        while len(remaining) > MAX_SYNTHESIS_TEXT_CHARS:
            window = remaining[: MAX_SYNTHESIS_TEXT_CHARS + 1]
            sentence_breaks = [match.end() for match in re.finditer(r"[.!?]\s+", window)]
            split_at = sentence_breaks[-1] if sentence_breaks else window.rfind(" ")
            if split_at <= 0:
                split_at = MAX_SYNTHESIS_TEXT_CHARS
            chunks.append(remaining[:split_at].strip())
            remaining = remaining[split_at:].strip()
        if remaining:
            chunks.append(remaining)
        return chunks

    split_turns = [
        (speakers, chunk)
        for speakers, text in turns
        for chunk in split_text(text)
    ]
    for speakers, text in split_turns:
        if len(speakers) == 1:
            if pending and pending_chars + len(text) > MAX_SYNTHESIS_TEXT_CHARS:
                flush_pending()
            pending.append((speakers, text))
            pending_chars += len(text)
            continue
        flush_pending()
        tracks = []
        for index, speaker in enumerate(speakers, start=1):
            track = work_dir / f"joint_{len(segments) + 1}_{index}.mp3"
            track.write_bytes(
                synthesize_ssml(
                    build_single_voice_ssml(text, voices[speaker]), region=region, key=key
                )
            )
            tracks.append(track)
        mixed = work_dir / f"joint_{len(segments) + 1}.mp3"
        mix_audio(tracks, mixed)
        segments.append(mixed)
    flush_pending()
    return segments


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate TELC B2 Hören Teil 2 MP3 files with Azure Speech.")
    parser.add_argument("--apply", action="store_true", help="Generate MP3 files; otherwise only validate the batch")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate existing MP3 files")
    args = parser.parse_args()

    paths = sorted(SOURCE_DIR.glob("b2_listening_teil2_*.xlsx"))
    workbooks = [read_workbook(path) for path in paths]
    expected_ids = [str(index).zfill(3) for index in range(1, 21)]
    if [workbook["id"] for workbook in workbooks] != expected_ids:
        raise RuntimeError("Teil 2 workbooks must cover IDs 001–020")
    intros = {workbook["intro"] for workbook in workbooks}
    if len(intros) != 1 or not next(iter(intros)):
        raise RuntimeError("All Teil 2 workbooks must contain the same non-empty Einleitung")

    missing = [workbook for workbook in workbooks if not (OUTPUT_DIR / f"Teil2_{workbook['id']}.mp3").is_file()]
    print(f"Validated {len(workbooks)} workbooks; {len(missing)} audio files missing.")
    if not args.apply:
        print("Dry run only. Use --apply to call Azure Speech and write MP3 files.")
        return 0

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg and ffprobe are required")
    key, region = load_azure_environment()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="telc-b2-listening-") as directory:
        temp_dir = Path(directory)
        intro_path = temp_dir / "intro.mp3"
        intro_path.write_bytes(
            synthesize_ssml(
                build_intro_ssml(next(iter(intros))),
                region=region,
                key=key,
            )
        )
        generated = 0
        for workbook in workbooks:
            target = OUTPUT_DIR / f"Teil2_{workbook['id']}.mp3"
            if target.is_file() and not args.overwrite:
                print(f"SKIP {target.name}: already exists")
                continue
            item_dir = temp_dir / str(workbook["id"])
            item_dir.mkdir()
            silence_path = item_dir / "silence.mp3"
            create_silence(silence_path, int(workbook["preparation_seconds"]))
            dialogue_segments = synthesize_timeline(
                workbook["timeline"], workbook["voices"], item_dir, region=region, key=key
            )
            temporary_target = OUTPUT_DIR / f"{target.stem}.part.mp3"
            concatenate_audio([intro_path, silence_path, *dialogue_segments], temporary_target)
            duration = audio_duration(temporary_target)
            if duration <= int(workbook["preparation_seconds"]):
                raise RuntimeError(f"Generated audio is unexpectedly short: {target.name} ({duration:.1f}s)")
            temporary_target.replace(target)
            generated += 1
            print(f"Generated {target.name}: {duration:.1f}s")
    print(f"Generated {generated} files in {OUTPUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
