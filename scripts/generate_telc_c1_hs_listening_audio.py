#!/usr/bin/env python3
"""Generate TELC C1 Hochschule listening MP3s locally; dry-run unless --execute is set."""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
import generate_telc_b2_listening_teil2_audio as b2_audio

IMPORT_ROOT = ROOT / "apps/exam_preparation/data/imports/telc/c1_hs"
OUTPUT_ROOT = ROOT / "frontend/public/resources/ExamPreparation/exam_preparation_audio"
MODERATOR_VOICES = {
    "mann": b2_audio.VOICE_POOLS["mann"][0],
    "frau": b2_audio.VOICE_POOLS["frau"][0],
}


def source_files() -> list[Path]:
    files = {}
    for kind in ("listening_teil1", "listening_teil2", "listening_teil3"):
        for state in ("raw", "processed"):
            for path in sorted((IMPORT_ROOT / kind / state).glob("*.xlsx")):
                files.setdefault(path.name, path)
    return list(files.values())


def _participant_items(value: object) -> list[str]:
    items = []
    start = depth = 0
    text = str(value or "")
    for index, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            items.append(text[start:index].strip())
            start = index + 1
    items.append(text[start:].strip())
    return [item for item in items if item]


def _parse_participants(value: object) -> list[tuple[str, str]]:
    participants = []
    for item in _participant_items(value):
        match = re.fullmatch(r"\s*([^()]+?)\s*(?:\(([^()]*)\))?\s*", item)
        if not match:
            raise ValueError(f"Invalid participant declaration: {item!r}")
        name, details = match.group(1).strip(), match.group(2) or ""
        genders = re.findall(r"(?<!\w)(mann|frau)(?!\w)", details, flags=re.IGNORECASE)
        if len({gender.lower() for gender in genders}) > 1:
            raise ValueError(f"Conflicting participant genders: {item!r}")
        if genders:
            gender = genders[0].lower()
        elif re.fullmatch(r"Sprecher\s+([1-8])", name, flags=re.IGNORECASE):
            # Generic speaker labels carry no gender; alternate voices predictably.
            number = int(re.search(r"\d+", name).group())
            gender = "mann" if number % 2 else "frau"
        elif re.fullmatch(r"Moderator(?:in)?(?:\s+.+)?", name, flags=re.IGNORECASE):
            gender = "frau" if re.match(r"Moderatorin", name, flags=re.IGNORECASE) else "mann"
        else:
            raise ValueError(f"Invalid participant declaration: {item!r}")
        participants.append((name, gender))
    if not participants:
        raise ValueError("At least one dialogue participant is required")
    return participants


def _assign_voices(participants: list[tuple[str, str]]) -> dict[str, str]:
    guest_pools = {
        gender: [voice for voice in voices if voice not in MODERATOR_VOICES.values()]
        for gender, voices in b2_audio.VOICE_POOLS.items()
    }
    offsets = {gender: 0 for gender in guest_pools}
    result = {}
    for name, gender in participants:
        moderator = re.match(r"^Moderator(in)?(?:\s|$)", name, flags=re.IGNORECASE)
        if moderator:
            host_gender = "frau" if moderator.group(1) else "mann"
            result[name] = MODERATOR_VOICES[host_gender]
            continue
        pool = guest_pools.get(gender)
        if pool is None:
            raise ValueError(f"Unsupported participant gender: {gender!r}")
        offset = offsets[gender]
        if offset >= len(pool):
            raise ValueError(f"Not enough distinct {gender} guest voices for the participant list")
        result[name] = pool[offset]
        offsets[gender] += 1
    if len(result) != len(participants) or len(set(result.values())) != len(result):
        raise ValueError("Every participant must have one distinct voice")
    return result


def _speaker_aliases(name: str) -> set[str]:
    normalize = lambda value: re.sub(r"\s+", " ", value).strip().casefold()
    aliases = {normalize(name)}
    title = re.match(r"^(frau|herr|prof(?:essor)?\.?|dr\.?)\s+", name, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(?:frau|herr|prof(?:essor)?\.?|dr\.?)\s+", "", name, flags=re.IGNORECASE)
    aliases.add(normalize(cleaned))
    moderator = re.match(r"^Moderator(in)?(?:\s|$)", name, flags=re.IGNORECASE)
    if moderator:
        aliases.add("moderatorin" if moderator.group(1) else "moderator")
    words = re.findall(r"[^\s]+", cleaned)
    if len(words) > 1:
        aliases.add(normalize(" ".join(words[-2:])))
        aliases.add(normalize(words[-1]))
        if title:
            aliases.add(normalize(f"{title.group(1)} {words[-1]}"))
    return aliases


def _normalize_dialogue_speakers(dialogue: str, participants: list[tuple[str, str]]) -> str:
    aliases = {}
    ambiguous = set()
    for name, _gender in participants:
        for alias in _speaker_aliases(name):
            if alias in aliases and aliases[alias] != name:
                ambiguous.add(alias)
            else:
                aliases[alias] = name
    for alias in ambiguous:
        aliases.pop(alias, None)

    normalized_lines = []
    for line in dialogue.splitlines():
        stripped = line.strip()
        label = re.fullmatch(r"([^:\n]+?)\s*:\s*(.*)", stripped)
        if label:
            raw_speakers, text = label.groups()
            speakers = [part.strip() for part in raw_speakers.split("/")]
            canonical = [aliases.get(re.sub(r"\s+", " ", part).strip().casefold()) for part in speakers]
            if canonical and all(canonical):
                normalized_lines.append(" / ".join(canonical) + ":" + (f"\n{text}" if text else ""))
                continue
        plain_speaker = aliases.get(re.sub(r"\s+", " ", stripped).strip().casefold())
        normalized_lines.append(f"{plain_speaker}:" if plain_speaker else line)
    return "\n".join(normalized_lines)


def read_workbook(path: Path) -> dict:
    meta_frame = pd.read_excel(path, sheet_name="meta", dtype=object)
    if len(meta_frame) != 1:
        raise ValueError(f"{path.name}: expected exactly one meta row")
    meta = {
        str(key).strip(): "" if pd.isna(value) else value
        for key, value in meta_frame.iloc[0].to_dict().items()
    }
    teil_match = re.search(r"listening_teil([123])", path.name)
    if not teil_match:
        raise ValueError(f"{path.name}: filename must identify Teil 1, 2, or 3")
    teil = teil_match.group(1)
    raw_id = str(meta.get("音频文件_ID", "")).strip()
    filename_id = path.stem.rsplit("_", 1)[-1]
    if not filename_id.isdigit():
        raise ValueError(f"{path.name}: numeric filename suffix is required")
    exercise_id = str(int(filename_id))
    if raw_id and str(int(float(raw_id))) != exercise_id:
        raise ValueError(f"{path.name}: workbook audio ID does not match filename suffix")
    participants_text = meta.get("出场人物") or meta.get("出现人物") or ""
    participants = _parse_participants(participants_text)
    voices = _assign_voices(participants)
    copy = str(meta.get("copy") or meta.get("script") or "")
    markers = list(re.finditer(r"<60(?:''|\"\")>", copy))
    if not markers:
        raise ValueError(f"{path.name}: copy must contain a preparation-time marker")
    dialogue = copy[markers[-1].end():]
    dialogue = re.sub(r"<br\s*/?>", "\n", dialogue, flags=re.IGNORECASE)
    dialogue = re.sub(r"<[^>]*>", "", dialogue)
    dialogue = _normalize_dialogue_speakers(dialogue, participants)
    turns = b2_audio.parse_dialogue(dialogue, participants)
    intro = re.sub(r"<[^>]*>", "", str(meta.get("Einleitung", ""))).strip()
    return {
        "id": exercise_id,
        "teil": teil,
        "intro": intro,
        "participants": participants,
        "voices": voices,
        "turns": turns,
    }


def output_path(workbook: dict) -> Path:
    return OUTPUT_ROOT / f"telc_c1_hs_teil{workbook['teil']}" / f"Teil{workbook['teil']}_{workbook['id']}.mp3"


def generate(workbook: dict, target: Path, *, key: str, region: str) -> None:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required to assemble the local MP3")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="telc-c1-hs-listening-") as directory:
        temp_dir = Path(directory)
        intro = temp_dir / "intro.mp3"
        intro.write_bytes(b2_audio.synthesize_ssml(
            b2_audio.build_intro_ssml(workbook["intro"]), region=region, key=key,
        ))
        segments = b2_audio.synthesize_turn_segments(
            workbook["turns"], workbook["voices"], temp_dir, region=region, key=key,
        )
        b2_audio.concatenate_audio([intro, *segments], target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="call Azure Speech and write local MP3s")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    paths = source_files()
    if not paths:
        print(f"No C1 Hochschule listening workbooks in {IMPORT_ROOT}.")
        return 0
    workbooks = [read_workbook(path) for path in paths]
    print(f"Validated {len(workbooks)} workbooks.")
    azure = b2_audio.load_azure_environment() if args.execute else None
    for workbook in workbooks:
        target = output_path(workbook)
        if target.exists() and not args.overwrite:
            print(f"SKIP {target.relative_to(ROOT)}: already exists")
            continue
        print(f"{'GENERATE' if args.execute else 'DRY RUN'} {target.relative_to(ROOT)}: "
              f"{len(workbook['participants'])} speakers, {len(workbook['turns'])} turns")
        if args.execute:
            key, region = azure
            generate(workbook, target, key=key, region=region)
    if not args.execute:
        print("Dry run only. Use --execute to call Azure Speech and write local MP3s.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
