#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import tempfile
from pathlib import Path

from openpyxl import load_workbook

import generate_telc_b2_listening_teil2_audio as b2

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_DIR = Path("/private/tmp/b1_audio_generation_ready")
OUTPUT_DIRS = {
    part: REPO_ROOT / f"frontend/public/resources/ExamPreparation/exam_preparation_audio/telc_b1_teil{part}"
    for part in (1, 2, 3)
}
NARRATOR_VOICE = b2.NARRATOR_VOICE
VOICE_POOLS = b2.VOICE_POOLS
PAUSE = re.compile(r"<(\d+)''>")
Turn = tuple[tuple[str, ...], str]
Timeline = list[tuple[str, object]]


def headers_for(sheet) -> dict[str, int]:
    return {
        str(cell.value).strip(): cell.column
        for cell in sheet[1]
        if cell.value is not None
    }


def value_for(sheet, headers: dict[str, int], name: str) -> str:
    if name not in headers:
        raise ValueError(f"Missing meta column: {name}")
    value = sheet.cell(2, headers[name]).value
    return str(value or "").strip()


def split_numbered_segments(copy: str, preparation: int, pause_count: int) -> list[str]:
    markers = b2.parse_pause_markers(copy)
    if not markers or markers[0][1] != preparation:
        raise ValueError(f"Expected a {preparation}-second preparation marker")
    if [seconds for _match, seconds in markers[1:]] != [2] * pause_count:
        raise ValueError(f"Expected {pause_count} two-second segment markers")
    segments = []
    position = markers[0][0].end()
    for marker, _seconds in markers[1:]:
        segments.append(copy[position:marker.start()])
        position = marker.end()
    segments.append(copy[position:])
    if len(segments) != pause_count + 1:
        raise ValueError("The pause markers did not produce the expected number of segments")
    return segments


def clean_numbering(text: str, expected: int, *, nummer: bool) -> str:
    text = text.strip()
    if nummer:
        text, count = re.subn(rf"(?m)^\s*Nummer\s+{expected}\s*:?\s*", "", text, count=1)
        if count != 1:
            raise ValueError(f"Expected Nummer {expected} segment heading")
    else:
        lines = text.splitlines()
        lines = [line for line in lines if not re.fullmatch(r"\s*[1-5]\s*", line)]
        text = "\n".join(lines).strip()
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        raise ValueError(f"Segment {expected} is empty")
    return text


def parse_item_genders(value: str) -> list[tuple[str, str]]:
    participants = []
    for item in value.split(","):
        match = re.fullmatch(r"\s*Nummer\s+([1-5])\s*\((Frau|Mann)\)\s*", item, re.IGNORECASE)
        if not match:
            raise ValueError(f"Invalid numbered participant declaration: {item!r}")
        participants.append((f"Nummer {match.group(1)}", match.group(2).lower()))
    if [name for name, _gender in participants] != [f"Nummer {i}" for i in range(1, 6)]:
        raise ValueError("Teil 1 requires participants Nummer 1 through Nummer 5 in order")
    return participants


def parse_part1_timeline(copy: str, participants: list[tuple[str, str]]) -> Timeline:
    segments = split_numbered_segments(copy, 30, 4)
    timeline: Timeline = []
    for index, segment in enumerate(segments, start=1):
        name = f"Nummer {index}"
        text = clean_numbering(segment, index, nummer=True)
        if index > 1:
            timeline.append(("pause", 2))
        timeline.append(("speech", ((name,), text)))
    return timeline


def parse_part3_timeline(copy: str) -> Timeline:
    segments = split_numbered_segments(copy, 30, 4)
    genders = [(f"speaker_{index}", "frau" if index % 2 else "mann") for index in range(1, 6)]
    voices = b2.assign_voices(genders)
    timeline: Timeline = []
    for index, segment in enumerate(segments, start=1):
        text = clean_numbering(segment, index, nummer=False)
        if index > 1:
            timeline.append(("pause", 2))
        timeline.append(("speech", ((f"speaker_{index}",), text)))
    return timeline, voices


def append_speech_and_pauses(timeline: Timeline, speakers: tuple[str, ...], text: str) -> None:
    position = 0
    for marker, seconds in b2.parse_pause_markers(text):
        spoken = re.sub(r"\s+", " ", text[position:marker.start()]).strip()
        if spoken:
            timeline.append(("speech", (speakers, spoken)))
        timeline.append(("pause", seconds))
        position = marker.end()
    spoken = re.sub(r"\s+", " ", text[position:]).strip()
    if spoken:
        timeline.append(("speech", (speakers, spoken)))


def parse_part2_dialogue(copy: str, participants: list[tuple[str, str]]) -> Timeline:
    markers = b2.parse_pause_markers(copy)
    if not markers or markers[0][1] != 60:
        raise ValueError("Teil 2 copy must begin with a 60-second preparation marker")
    body = copy[markers[0][0].end():]
    declared = {name for name, _gender in participants}
    timeline: Timeline = []
    speakers: tuple[str, ...] | None = None
    lines: list[str] = []

    def flush() -> None:
        nonlocal speakers, lines
        if speakers is not None:
            append_speech_and_pauses(timeline, speakers, "\n".join(lines))
        speakers, lines = None, []

    label_pattern = re.compile(r"^\s*(.*?)\s*:\s*(.*?)\s*$")
    for line in body.replace("\r\n", "\n").splitlines():
        match = label_pattern.match(line)
        candidates = tuple(
            name.strip() for name in re.split(r"\s*(?:&|/|\+)\s*", match.group(1))
        ) if match else ()
        if candidates and all(name in declared for name in candidates):
            flush()
            content = match.group(2)
            if content.lstrip().startswith("="):
                continue
            speakers = candidates
            if content.strip():
                lines.append(content)
        elif speakers is not None:
            lines.append(line)
        elif line.strip():
            raise ValueError(f"Text appears before the first participant label: {line!r}")
    flush()
    if not any(kind == "speech" for kind, _value in timeline):
        raise ValueError("Teil 2 conversation contains no speech")
    return timeline


def parse_part2_timeline(copy: str, participants: list[tuple[str, str]]) -> Timeline:
    dialogue = parse_part2_dialogue(copy, participants)
    return [*dialogue, ("pause", 2), *dialogue]


def read_workbook(path: Path) -> dict[str, object]:
    match = re.fullmatch(r"b1_listening_teil([123])_(\d{3})\.xlsm", path.name)
    if not match:
        raise ValueError(f"Unexpected workbook name: {path.name}")
    part, filename_id = int(match.group(1)), match.group(2)
    workbook = load_workbook(path, data_only=True, keep_vba=True)
    try:
        if "meta" not in workbook.sheetnames:
            raise ValueError(f"{path.name}: missing meta sheet")
        sheet = workbook["meta"]
        headers = headers_for(sheet)
        audio_id = value_for(sheet, headers, "音频文件_ID").removesuffix(".0").zfill(3)
        if audio_id != filename_id:
            raise ValueError(f"{path.name}: audio ID {audio_id} does not match filename")
        copy = value_for(sheet, headers, "copy")
        intro = value_for(sheet, headers, "Einleitung")
        if not copy or not intro:
            raise ValueError(f"{path.name}: copy and Einleitung must be non-empty")
        if part == 1:
            participants = parse_item_genders(value_for(sheet, headers, "出场人物"))
            timeline = parse_part1_timeline(copy, participants)
            voices = b2.assign_voices(participants)
        elif part == 2:
            participants = b2.parse_participants(value_for(sheet, headers, "出场人物"))
            timeline = parse_part2_timeline(copy, participants)
            voices = b2.assign_voices(participants)
        else:
            timeline, voices = parse_part3_timeline(copy)
        return {
            "part": part,
            "id": filename_id,
            "intro": intro,
            "preparation_seconds": 30 if part in {1, 3} else 60,
            "timeline": timeline,
            "voices": voices,
        }
    finally:
        workbook.close()
        vba_archive = getattr(workbook, "vba_archive", None)
        if vba_archive is not None:
            vba_archive.close()


def resolve_target_file(output_dir: Path, stem: str) -> Path:
    candidates = [output_dir / f"{stem}{suffix}" for suffix in (".mp3", ".m4a")]
    candidates = [path for path in candidates if path.is_file()]
    if len(candidates) > 1:
        raise ValueError(f"multiple output files share stem {stem}: {', '.join(p.name for p in candidates)}")
    if candidates:
        return candidates[0]
    return output_dir / f"{stem}.mp3"


def output_stem(part: int, item_id: str) -> str:
    return f"Teil{part}_{item_id}"


def validate_batch(source_dir: Path) -> list[dict[str, object]]:
    paths = sorted(source_dir.glob("b1_listening_teil[123]_*.xlsm"))
    expected = {f"b1_listening_teil{part}_{item_id:03}.xlsm" for part in (1, 2, 3) for item_id in range(1, 15)}
    actual = {path.name for path in paths}
    if actual != expected:
        missing, extra = sorted(expected - actual), sorted(actual - expected)
        raise ValueError(f"Expected exactly 42 workbooks (001-014 per part); missing={missing}, extra={extra}")
    return [read_workbook(path) for path in paths]


def synthesize_timeline(
    timeline: Timeline, voices: dict[str, str], work_dir: Path, *, region: str, key: str,
    cache: dict[tuple[tuple[str, ...], str], list[Path]],
) -> list[Path]:
    segments: list[Path] = []
    for index, (kind, value) in enumerate(timeline, start=1):
        if kind == "pause":
            path = work_dir / f"pause_{index}.mp3"
            b2.create_silence(path, int(value))
            segments.append(path)
            continue
        speakers, text = value
        cache_key = (tuple(voices[speaker] for speaker in speakers), text)
        if cache_key not in cache:
            speech_dir = work_dir / f"speech_{index}"
            speech_dir.mkdir()
            cache[cache_key] = b2.synthesize_turn_segments(
                [(speakers, text)], voices, speech_dir, region=region, key=key
            )
        segments.extend(cache[cache_key])
    return segments


def generate_one(workbook: dict[str, object], target: Path, *, region: str, key: str) -> float:
    temp_root = target.parent
    with tempfile.TemporaryDirectory(prefix=f"{target.stem}-", dir=temp_root) as directory:
        work_dir = Path(directory)
        intro_path = work_dir / "intro.mp3"
        intro_path.write_bytes(
            b2.synthesize_ssml(b2.build_intro_ssml(str(workbook["intro"])), region=region, key=key)
        )
        silence_path = work_dir / "preparation.mp3"
        b2.create_silence(silence_path, int(workbook["preparation_seconds"]))
        cache: dict[tuple[tuple[str, ...], str], list[Path]] = {}
        body = synthesize_timeline(
            workbook["timeline"], workbook["voices"], work_dir,
            region=region, key=key, cache=cache,
        )
        temporary_target = target.with_name(f"{target.stem}.part{target.suffix}")
        try:
            b2.concatenate_audio([intro_path, silence_path, *body], temporary_target)
            duration = b2.audio_duration(temporary_target)
            if duration <= int(workbook["preparation_seconds"]):
                raise RuntimeError(f"Generated audio is unexpectedly short: {target.name} ({duration:.1f}s)")
            temporary_target.replace(target)
            return duration
        finally:
            temporary_target.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate or generate TELC B1 listening audio.")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--apply", action="store_true", help="Call Azure Speech and generate audio")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing audio when used with --apply")
    args = parser.parse_args(argv)
    workbooks = validate_batch(args.source_dir)
    targets = {
        (item["part"], item["id"]): resolve_target_file(
            OUTPUT_DIRS[item["part"]], output_stem(item["part"], item["id"])
        )
        for item in workbooks
    }
    generate_items = [
        item for item in workbooks
        if args.apply and (args.overwrite or not targets[(item["part"], item["id"])].is_file())
    ]
    missing = sum(not targets[(item["part"], item["id"])].is_file() for item in workbooks)
    print(f"Validated {len(workbooks)} workbooks; {missing} audio files missing.")
    if not args.apply:
        print("Dry run only. Use --apply to call Azure Speech and write audio files.")
        return 0
    if not generate_items:
        print("No audio files need generation.")
        return 0
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg and ffprobe are required")
    key, region = b2.load_azure_environment()
    for item in generate_items:
        target = targets[(item["part"], item["id"])]
        target.parent.mkdir(parents=True, exist_ok=True)
        duration = generate_one(item, target, region=region, key=key)
        print(f"Generated {target.name}: {duration:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
