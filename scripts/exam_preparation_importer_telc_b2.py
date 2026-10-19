#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import tempfile
from collections import defaultdict
from pathlib import Path

import pandas as pd

import exam_preparation_importer as shared


READING_TEIL3_INSTRUCTION = (
    "Lesen Sie zuerst die zehn Situationen und dann die zwölf Info-Texte (a–l).\n"
    "Welcher Info-Text passt zu welcher Situation? Sie können jeden Info-Text nur einmal "
    "verwenden. Markieren Sie Ihre Lösungen auf dem Antwortbogen bei den Aufgaben.\n"
    "Manchmal gibt es keine Lösung. Markieren Sie dann x."
)
CLOZE_PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*blank[\s_]*(\d+)\s*\}\}", re.IGNORECASE)


def _parse_b2_bool(value) -> bool:
    text = shared.clean_text(value).lower()
    if text == "richtig":
        return True
    if text == "falsch":
        return False
    return shared.parse_bool(value)


def _normalize_cloze_placeholders(value) -> str:
    return CLOZE_PLACEHOLDER_PATTERN.sub(
        lambda match: f"{{{{blank_{match.group(1)}}}}}",
        shared.clean_text(value),
    )


def _filename_external_id(path: Path) -> str:
    match = re.search(r"_(\d+)$", path.stem)
    if not match:
        raise shared.ImportErrorWithContext(
            f"{path.name}: numeric filename suffix is required"
        )
    return shared.normalize_link_id(match.group(1))


def _validated_external_id(path: Path, workbook_id) -> str:
    external_id = shared.normalize_link_id(workbook_id)
    filename_id = _filename_external_id(path)
    if external_id != filename_id:
        raise shared.ImportErrorWithContext(
            f"{path.name}: workbook ID {external_id!r} does not match filename ID {filename_id!r}"
        )
    return external_id


def _single_row(path: Path, frame: pd.DataFrame) -> dict[str, str]:
    shared.require_columns(frame, ["ID"], frame.attrs.get("sheet_name", "exercise"))
    rows = [
        (index, {key: shared.clean_text(value) for key, value in row.to_dict().items()})
        for index, row in frame.iterrows()
        if any(shared.clean_text(value) for value in row.to_dict().values())
    ]
    shared.require_one_exercise_per_file(path, len(rows))
    index, row = rows[0]
    if not row["ID"]:
        row["ID"] = _filename_external_id(path)
        frame["ID"] = frame["ID"].astype(object)
        frame.at[index, "ID"] = row["ID"]
    return row


def _import_with_column_mapping(
    path: Path,
    importer: shared.ImporterFn,
    *,
    sheet_name: str,
    renames: dict[str, str],
    replacements: dict[str, object] | None = None,
    transforms: dict[str, object] | None = None,
) -> int:
    sheets = pd.read_excel(path, sheet_name=None, engine="openpyxl")
    frame = sheets[sheet_name].rename(columns=renames)
    _validated_external_id(path, _single_row(path, frame)["ID"])
    for column, value in (replacements or {}).items():
        frame[column] = value
    for column, transform in (transforms or {}).items():
        frame[column] = frame[column].map(transform)
    sheets[sheet_name] = frame
    with tempfile.TemporaryDirectory() as directory:
        normalized_path = Path(directory) / path.name
        with pd.ExcelWriter(normalized_path, engine="openpyxl") as writer:
            for name, sheet in sheets.items():
                sheet.to_excel(writer, sheet_name=name, index=False)
        return importer(normalized_path)


def import_reading_title_matching(path: Path) -> int:
    return _import_with_column_mapping(
        path,
        shared.import_reading_title_matching,
        sheet_name="meta",
        renames={},
    )


def import_reading_understanding(path: Path) -> int:
    sheets = pd.read_excel(path, sheet_name=None, engine="openpyxl")
    meta = sheets["meta"]
    _validated_external_id(path, _single_row(path, meta)["ID"])
    sheets["meta"] = meta[meta["ID"].notna() & meta["ID"].astype(str).str.strip().ne("")]
    sheets["exercise"]["is_correct"] = sheets["exercise"]["is_correct"].map(_parse_b2_bool)
    with tempfile.TemporaryDirectory() as directory:
        normalized_path = Path(directory) / path.name
        with pd.ExcelWriter(normalized_path, engine="openpyxl") as writer:
            for name, sheet in sheets.items():
                sheet.to_excel(writer, sheet_name=name, index=False)
        return shared.import_reading_understanding(normalized_path)


def import_reading_ad_matching(path: Path) -> int:
    meta = pd.read_excel(path, sheet_name="meta", engine="openpyxl")
    row = _single_row(path, meta)
    external_id = _validated_external_id(path, row["ID"])
    count = _import_with_column_mapping(
        path,
        shared.import_reading_ad_matching,
        sheet_name="meta",
        renames={},
    )
    shared.ReadingAdMatchingExercise.objects.filter(
        exercise_base__exam_type="TELC",
        exercise_base__level="B2",
        exercise_base__external_id=external_id,
    ).update(instruction=READING_TEIL3_INSTRUCTION)
    return count


def _import_cloze(path: Path, *, matching: bool) -> int:
    sheets = pd.read_excel(path, sheet_name=None, engine="openpyxl")
    meta = sheets["meta"]
    row = _single_row(path, meta)
    external_id = _validated_external_id(path, row["ID"])
    real_exam_column = "是否原题" if matching else "是否真题"
    shared.require_columns(meta, [real_exam_column], "meta")
    is_real_exam = _parse_b2_bool(row[real_exam_column])
    importer = shared.import_cloze_matching if matching else shared.import_cloze_choice
    sheets["meta"] = sheets["meta"].rename(columns={real_exam_column: "原题"})
    sheets["meta"]["原题"] = ""
    sheets["meta"]["内容"] = sheets["meta"]["内容"].map(_normalize_cloze_placeholders)
    if not matching:
        sheets["exercise"]["is_correct"] = sheets["exercise"]["is_correct"].map(_parse_b2_bool)
    with tempfile.TemporaryDirectory() as directory:
        normalized_path = Path(directory) / path.name
        with pd.ExcelWriter(normalized_path, engine="openpyxl") as writer:
            for name, sheet in sheets.items():
                sheet.to_excel(writer, sheet_name=name, index=False)
        count = importer(normalized_path)
    exercise_type = (
        shared.ExerciseBase.ExerciseType.CLOZE_MATCHING
        if matching
        else shared.ExerciseBase.ExerciseType.CLOZE_CHOICE
    )
    base = shared.ExerciseBase.objects.get(
        exam_type="TELC",
        level="B2",
        exercise_type=exercise_type,
        external_id=external_id,
    )
    base.is_real_exam = is_real_exam
    base.source_reference = ""
    base.save(update_fields=["is_real_exam", "source_reference"])
    if matching:
        shared.ClozeMatchingExercise.objects.filter(exercise_base=base).update(original_source_text="")
    else:
        shared.ClozeChoiceExercise.objects.filter(exercise_base=base).update(original_source_text="")
    return count


def import_cloze_choice(path: Path) -> int:
    return _import_cloze(path, matching=False)


def import_cloze_matching(path: Path) -> int:
    return _import_cloze(path, matching=True)


def import_writing(path: Path) -> int:
    return _import_with_column_mapping(
        path,
        shared.import_writing,
        sheet_name="exercise",
        renames={"Anzeige": "request", "words_limit_min": "words_limit"},
    )


def _dialogue(path: Path, frame: pd.DataFrame, external_id: str) -> list[dict[str, object]]:
    shared.require_columns(frame, ["exercise_id", "Role", "内容"], "example")
    dialogue = []
    for row in shared.iter_records(frame):
        if not row["内容"]:
            continue
        if shared.normalize_link_id(row["exercise_id"]) != external_id:
            raise shared.ImportErrorWithContext(f"{path.name}: example.exercise_id does not match meta.ID")
        dialogue.append(
            {
                "sequence": len(dialogue) + 1,
                "role": row["Role"],
                "text": row["内容"],
                **({"sentence_type": row["句子类型"]} if row.get("句子类型") else {}),
            }
        )
    if not dialogue:
        raise shared.ImportErrorWithContext(f"{path.name}: example dialogue is empty")
    return dialogue


def parse_speaking_praesentation(path: Path) -> dict[str, object]:
    xlsx = pd.ExcelFile(path, engine="openpyxl")
    meta = shared.get_sheet(xlsx, "meta")
    example = shared.get_sheet(xlsx, "example")
    shared.require_columns(meta, ["ID", "request", "titel"], "meta")
    row = _single_row(path, meta)
    external_id = _validated_external_id(path, row["ID"])
    title = row["titel"]
    return {
        "external_id": external_id,
        "level": "B2",
        "title": title,
        "exam_type": "TELC",
        "is_real_exam": True,
        "instruction": row["request"],
        "content": {
            "schema_version": 1,
            "teil": "1",
            "task": row["request"],
            "topics": [title],
            "dialogue": _dialogue(path, example, external_id),
        },
    }


def parse_speaking_diskussion(path: Path) -> dict[str, object]:
    xlsx = pd.ExcelFile(path, engine="openpyxl")
    meta = shared.get_sheet(xlsx, "meta")
    example = shared.get_sheet(xlsx, "example")
    shared.require_columns(meta, ["ID", "标题", "题目", "Text", "考试类型", "是否真题"], "meta")
    row = _single_row(path, meta)
    external_id = _validated_external_id(path, row["ID"])
    return {
        "external_id": external_id,
        "level": "B2",
        "title": row["标题"],
        "exam_type": row["考试类型"],
        "is_real_exam": shared.parse_bool(row["是否真题"]),
        "instruction": row["题目"],
        "content": {
            "schema_version": 1,
            "teil": "2",
            "task": row["题目"],
            "source_text": row["Text"],
            "dialogue": _dialogue(path, example, external_id),
        },
    }


def parse_speaking_problemloesung(path: Path) -> dict[str, object]:
    xlsx = pd.ExcelFile(path, engine="openpyxl")
    meta = shared.get_sheet(xlsx, "meta")
    example = shared.get_sheet(xlsx, "example")
    shared.require_columns(meta, ["ID", "标题", "Task", "考试类型", "是否真题"], "meta")
    shared.require_columns(example, ["exercise_id", "Role", "内容", "句子类型"], "example")
    row = _single_row(path, meta)
    external_id = _validated_external_id(path, row["ID"])
    dialogue = _dialogue(path, example, external_id)
    turns_by_type: dict[str, list[dict[str, object]]] = defaultdict(list)
    for turn in dialogue:
        sentence_type = str(turn.get("sentence_type", "")).strip()
        if not sentence_type:
            raise shared.ImportErrorWithContext(f"{path.name}: missing 句子类型")
        turns_by_type[sentence_type].append(turn)
    return {
        "external_id": external_id,
        "level": "B2",
        "title": row["标题"],
        "exam_type": row["考试类型"],
        "is_real_exam": shared.parse_bool(row["是否真题"]),
        "instruction": row["Task"],
        "content": {
            "schema_version": 1,
            "teil": "3",
            "task": row["Task"],
            "sections": [
                {"type": sentence_type, "turns": turns}
                for sentence_type, turns in turns_by_type.items()
            ],
            "dialogue": dialogue,
        },
    }


def import_speaking_praesentation(path: Path, *, generate_speaking_audio: bool = False) -> int:
    return shared.save_speaking_exercise(
        path,
        parse_speaking_praesentation(path),
        shared.ExerciseBase.ExerciseType.SPEAKING_TEIL1,
        generate_speaking_audio=generate_speaking_audio,
    )


def import_speaking_diskussion(path: Path, *, generate_speaking_audio: bool = False) -> int:
    return shared.save_speaking_exercise(
        path,
        parse_speaking_diskussion(path),
        shared.ExerciseBase.ExerciseType.SPEAKING_TEIL2,
        generate_speaking_audio=generate_speaking_audio,
    )


def import_speaking_problemloesung(path: Path, *, generate_speaking_audio: bool = False) -> int:
    return shared.save_speaking_exercise(
        path,
        parse_speaking_problemloesung(path),
        shared.ExerciseBase.ExerciseType.SPEAKING_TEIL3,
        generate_speaking_audio=generate_speaking_audio,
    )


IMPORTERS = {
    "reading_title_matching": import_reading_title_matching,
    "reading_understanding": import_reading_understanding,
    "reading_ad_matching": import_reading_ad_matching,
    "cloze_choice": import_cloze_choice,
    "cloze_matching": import_cloze_matching,
    "writing": import_writing,
    "speaking_praesentation": import_speaking_praesentation,
    "speaking_diskussion": import_speaking_diskussion,
    "speaking_problemloesung": import_speaking_problemloesung,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Import TELC B2 exam-preparation workbooks.")
    parser.add_argument("--kind", required=True, choices=sorted(IMPORTERS))
    parser.add_argument("--file", default="")
    parser.add_argument("--no-move", action="store_true")
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--skip-speaking-audio", action="store_true")
    args = parser.parse_args()
    return shared.import_kind(
        args.kind,
        file_arg=args.file,
        no_move=args.no_move,
        retry_failed=args.retry_failed,
        generate_speaking_audio=not args.skip_speaking_audio,
        exam_type="TELC",
        level="B2",
        importer_override=IMPORTERS[args.kind],
    )


if __name__ == "__main__":
    raise SystemExit(main())
