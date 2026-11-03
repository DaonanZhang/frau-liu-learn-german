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


def source_files() -> list[Path]:
    files = {}
    for kind in ("listening_teil1", "listening_teil2", "listening_teil3"):
        for state in ("raw", "processed"):
            for path in sorted((IMPORT_ROOT / kind / state).glob("*.xlsx")):
                files.setdefault(path.name, path)
    return list(files.values())


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
    participants = b2_audio.parse_participants(participants_text)
    voices = b2_audio.assign_voices(participants)
    copy = str(meta.get("copy") or meta.get("script") or "")
    if "<60''>" not in copy:
        raise ValueError(f"{path.name}: copy must contain a preparation-time marker")
    dialogue = copy.rsplit("<60''>", 1)[1]
    dialogue = re.sub(r"<br\s*/?>", "\n", dialogue, flags=re.IGNORECASE)
    dialogue = re.sub(r"<[^>]*>", "", dialogue)
    normalized_lines = []
    participant_names = [name for name, _gender in participants]
    for line in dialogue.splitlines():
        stripped = line.strip()
        normalized = None
        for name in participant_names:
            if stripped in {name, f"{name}:"}:
                normalized = f"{name}:"
                break
            prefix = f"{name}:"
            if stripped.startswith(prefix):
                text = stripped[len(prefix):].strip()
                normalized = f"{name}:\n{text}" if text else f"{name}:"
                break
        normalized_lines.append(normalized if normalized is not None else line)
    dialogue = "\n".join(normalized_lines)
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
