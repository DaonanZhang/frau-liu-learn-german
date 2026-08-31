#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable, Iterable
from urllib.parse import quote

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.exam_preparation.models import (  # noqa: E402
    ClozeChoiceBlank,
    ClozeChoiceExercise,
    ClozeChoiceOption,
    ClozeMatchingBlankAnswer,
    ClozeMatchingExercise,
    ClozeMatchingOption,
    ExerciseBase,
    ListeningAnswerOption,
    ListeningExercise,
    ListeningQuestion,
    ReadingAdMatchingAd,
    ReadingAdMatchingExercise,
    ReadingAdMatchingItem,
    ReadingTitleMatchingExercise,
    ReadingTitleMatchingItem,
    ReadingTitleMatchingOption,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingExercise,
    ReadingUnderstandingQuestion,
    SpeakingTeilExercise,
    WritingExampleText,
    WritingExercise,
)


ImporterFn = Callable[[Path], int]


class ImportErrorWithContext(Exception):
    pass


LISTENING_AUDIO_ROOT = REPO_ROOT / "frontend/public/resources/ExamPreparation/exam_preparation_audio"
LISTENING_AUDIO_SUBFOLDERS = {
    ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP: "Teil1",
    ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE: "Teil2",
    ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE: "Teil3",
}
LISTENING_TYPE_BY_TEIL = {
    "1": ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
    "2": ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
    "3": ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE,
}
LISTENING_EXERCISE_TYPE_BY_TEIL = {
    "1": ExerciseBase.ExerciseType.LISTENING_TEIL1,
    "2": ExerciseBase.ExerciseType.LISTENING_TEIL2,
    "3": ExerciseBase.ExerciseType.LISTENING_TEIL3,
}


def log(message: str) -> None:
    print(message)


def parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "y", "是"}:
        return True
    if text in {"false", "0", "no", "n", "否", ""}:
        return False
    try:
        numeric_value = float(text)
    except ValueError:
        numeric_value = None
    if numeric_value == 1:
        return True
    if numeric_value == 0:
        return False
    raise ImportErrorWithContext(f"Cannot parse boolean value: {value!r}")


def parse_int(value, field_name: str) -> int:
    text = str(value).strip()
    if not text:
        raise ImportErrorWithContext(f"Missing integer field: {field_name}")
    try:
        return int(float(text))
    except ValueError as exc:
        raise ImportErrorWithContext(f"Invalid integer for {field_name}: {value!r}") from exc


def clean_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    return str(value).strip()


def normalize_link_id(value) -> str:
    text = clean_text(value)
    if re.fullmatch(r"[+-]?\d+(?:\.0+)?", text):
        return str(int(text.split(".", 1)[0]))
    return text


def external_id_from_filename(xlsx_path: Path, workbook_external_id) -> str:
    workbook_id = normalize_link_id(workbook_external_id)
    if not workbook_id:
        raise ImportErrorWithContext(f"{xlsx_path.name}: missing workbook exercise ID")
    match = re.search(r"_(\d+)$", xlsx_path.stem)
    if not match:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: filename must end with a numeric exercise ID"
        )
    filename_id = normalize_link_id(match.group(1))
    if filename_id != workbook_id:
        log(
            f"ID OVERRIDE: {xlsx_path.name} workbook_id={workbook_id} "
            f"filename_id={filename_id}"
        )
    return filename_id


def listening_type_from_filename(xlsx_path: Path) -> str:
    match = re.search(r"(?:^|_)teil([123])(?:_|$)", xlsx_path.stem, re.IGNORECASE)
    if not match:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: listening filename must include Teil1, Teil2, or Teil3"
        )
    return LISTENING_TYPE_BY_TEIL[match.group(1)]


def listening_exercise_type_from_filename(xlsx_path: Path) -> str:
    match = re.search(r"(?:^|_)teil([123])(?:_|$)", xlsx_path.stem, re.IGNORECASE)
    if not match:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: listening filename must include Teil1, Teil2, or Teil3"
        )
    return LISTENING_EXERCISE_TYPE_BY_TEIL[match.group(1)]


def require_one_exercise_per_file(xlsx_path: Path, exercise_count: int) -> None:
    if exercise_count != 1:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: expected exactly one exercise per workbook; "
            f"found {exercise_count}"
        )


def resolve_listening_audio(
    *,
    xlsx_path: Path,
    listening_type: str,
    audio_file_id: str,
) -> tuple[str, Path]:
    subfolder = LISTENING_AUDIO_SUBFOLDERS.get(listening_type)
    if not subfolder:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: unsupported listening_type={listening_type!r}; "
            f"expected one of {sorted(LISTENING_AUDIO_SUBFOLDERS)}"
        )

    audio_file_id = clean_text(audio_file_id)
    if not audio_file_id:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: missing 音频文件_ID required for local audio lookup"
        )

    audio_dir = LISTENING_AUDIO_ROOT / subfolder
    audio_dir.mkdir(parents=True, exist_ok=True)

    exact_stems = {f"{subfolder}_{audio_file_id}"}
    normalized_id = normalize_link_id(audio_file_id)
    if normalized_id:
        exact_stems.add(f"{subfolder}_{normalized_id}")
    filename_match = re.search(r"_(\d+)$", xlsx_path.stem)
    if filename_match and normalized_id.isdigit():
        exact_stems.add(f"{subfolder}_{normalized_id.zfill(len(filename_match.group(1)))}")

    matches = sorted(
        path
        for path in audio_dir.iterdir()
        if path.is_file() and path.stem in exact_stems
    )
    if not matches:
        expected = f"{subfolder}_{audio_file_id}.*"
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: local listening audio not found: "
            f"{audio_dir / expected}"
        )
    if len(matches) > 1:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: multiple local listening audio files match "
            f"{subfolder}_{audio_file_id}: {[path.name for path in matches]}"
        )

    audio_path = matches[0]
    audio_url = (
        f"/resources/ExamPreparation/exam_preparation_audio/{subfolder}/{quote(audio_path.name)}"
    )
    return audio_url, audio_path


def infer_level_from_filename(path: Path) -> str:
    match = re.match(r"^([a-z0-9]+)_", path.name.lower())
    if not match:
        raise ImportErrorWithContext(f"Cannot infer level from filename: {path.name}")
    candidate = match.group(1).upper()
    valid = {choice for choice, _ in ExerciseBase.Level.choices}
    if candidate not in valid:
        raise ImportErrorWithContext(f"Unsupported level in filename {path.name!r}: {candidate}")
    return candidate


def option_key_from_index(index: int) -> str:
    value = index + 1
    chars: list[str] = []
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        chars.append(chr(65 + remainder))
    return "".join(reversed(chars))


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result.columns = [clean_text(column) for column in result.columns]
    return result.fillna("")


def get_sheet(xlsx: pd.ExcelFile, sheet_name: str) -> pd.DataFrame:
    if sheet_name not in xlsx.sheet_names:
        raise ImportErrorWithContext(
            f"{xlsx.io}: missing sheet {sheet_name!r}; found {xlsx.sheet_names}"
        )
    return normalize_columns(pd.read_excel(xlsx, sheet_name=sheet_name, engine="openpyxl"))


def require_columns(df: pd.DataFrame, columns: list[str], sheet_name: str) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        raise ImportErrorWithContext(
            f"Sheet {sheet_name!r} missing columns: {missing}; found={list(df.columns)}"
        )


def iter_records(df: pd.DataFrame) -> Iterable[dict[str, str]]:
    for _, row in df.iterrows():
        yield {key: clean_text(value) for key, value in row.to_dict().items()}


def upsert_base(
    *,
    level: str,
    skill: str,
    exercise_type: str,
    external_id: str,
    title: str,
    exam_type: str,
    is_real_exam: bool,
    imported_from_file: str,
    source_name: str = "",
    source_reference: str = "",
) -> ExerciseBase:
    if not external_id:
        raise ImportErrorWithContext("Missing external exercise ID.")
    exam_type = clean_text(exam_type)
    if not exam_type:
        raise ImportErrorWithContext(
            f"Missing exam type for exercise {external_id!r}; "
            "the XLSX field '考试类型' is required."
        )
    base, _ = ExerciseBase.objects.update_or_create(
        level=level,
        exercise_type=exercise_type,
        external_id=external_id,
        defaults={
            "skill": skill,
            "exam_type": exam_type,
            "title": title,
            "difficulty": "",
            "is_real_exam": is_real_exam,
            "source_name": source_name,
            "source_reference": source_reference,
            "imported_from_file": imported_from_file,
            "imported_at": timezone.now(),
            "creation_method": ExerciseBase.CreationMethod.XLSX_IMPORT,
        },
    )
    return base


def import_listening(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    exercise_df = get_sheet(xlsx, "exercise")
    real_exam_column = next(
        (column for column in ("是否真题", "什么真题") if column in meta_df.columns),
        None,
    )
    require_columns(meta_df, ["音频文件_ID", "音频文件网盘地址", "考试类型"], "meta")
    if real_exam_column is None:
        raise ImportErrorWithContext(
            "Sheet 'meta' missing columns: ['是否真题' or '什么真题']; "
            f"found={list(meta_df.columns)}"
        )
    require_columns(
        exercise_df,
        ["exercise_id", "question_type", "question_id", "question", "answer", "is_correct", "Explanation"],
        "exercise",
    )

    meta_by_id = {clean_text(row["音频文件_ID"]): row for row in iter_records(meta_df)}
    require_one_exercise_per_file(xlsx_path, len(meta_by_id))
    exercise_rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(exercise_df):
        exercise_rows_by_id[normalize_link_id(row["exercise_id"])].append(row)

    level = infer_level_from_filename(xlsx_path)
    filename_listening_type = listening_type_from_filename(xlsx_path)
    filename_exercise_type = listening_exercise_type_from_filename(xlsx_path)
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.LISTENING,
            exercise_type=filename_exercise_type,
            external_id=external_id,
            title=clean_text(meta.get("原标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=parse_bool(meta.get(real_exam_column)),
            imported_from_file=xlsx_path.name,
        )
        meta_listening_type = clean_text(meta.get("listening_type"))
        if meta_listening_type and meta_listening_type != filename_listening_type:
            raise ImportErrorWithContext(
                f"{xlsx_path.name}: filename identifies {filename_listening_type}, "
                f"but meta.listening_type is {meta_listening_type!r}"
            )
        listening_type = filename_listening_type
        audio_url, audio_path = resolve_listening_audio(
            xlsx_path=xlsx_path,
            listening_type=listening_type,
            audio_file_id=meta.get("音频文件_ID"),
        )
        exercise, _ = ListeningExercise.objects.update_or_create(
            exercise_base=base,
            defaults={
                "listening_type": listening_type,
                "audio_file_identifier": audio_path.stem,
                "audio_file_url": audio_url,
                "script": clean_text(meta.get("script")),
            },
        )
        exercise.questions.all().delete()
        grouped_questions: dict[int, list[dict[str, str]]] = defaultdict(list)
        for row in exercise_rows_by_id.get(normalize_link_id(workbook_external_id), []):
            grouped_questions[parse_int(row["question_id"], "question_id")].append(row)
        for question_number in sorted(grouped_questions):
            rows = grouped_questions[question_number]
            question = ListeningQuestion.objects.create(
                listening_exercise=exercise,
                question_number=question_number,
                question_type=clean_text(rows[0]["question_type"]) or ListeningQuestion.QuestionType.SINGLE_CHOICE,
                question_text=clean_text(rows[0]["question"]),
            )
            for index, row in enumerate(rows):
                ListeningAnswerOption.objects.create(
                    question=question,
                    option_key=option_key_from_index(index),
                    option_text=clean_text(row["answer"]),
                    is_correct=parse_bool(row["is_correct"]),
                    explanation=clean_text(row["Explanation"]),
                    sort_order=index + 1,
                )
        imported_count += 1
    return imported_count


def import_reading_title_matching(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    exercise_df = get_sheet(xlsx, "exercise")
    question_bank_df = get_sheet(xlsx, "question_bank")
    require_columns(meta_df, ["ID", "考试类型", "是否真题"], "meta")
    require_columns(exercise_df, ["exercise_id", "Text", "Title", "Explanation"], "exercise")
    require_columns(question_bank_df, ["exercise_id", "question_bank"], "question_bank")

    meta_by_id = {clean_text(row["ID"]): row for row in iter_records(meta_df)}
    require_one_exercise_per_file(xlsx_path, len(meta_by_id))
    item_rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(exercise_df):
        item_rows_by_id[normalize_link_id(row["exercise_id"])].append(row)
    option_rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(question_bank_df):
        option_rows_by_id[normalize_link_id(row["exercise_id"])].append(row)

    level = infer_level_from_filename(xlsx_path)
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.READING,
            exercise_type=ExerciseBase.ExerciseType.READING_TITLE_MATCHING,
            external_id=external_id,
            title=clean_text(meta.get("原标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=parse_bool(meta.get("是否真题")),
            imported_from_file=xlsx_path.name,
        )
        exercise, _ = ReadingTitleMatchingExercise.objects.update_or_create(
            exercise_base=base,
            defaults={"instruction": ""},
        )
        exercise.items.all().delete()
        exercise.options.all().delete()

        link_id = normalize_link_id(workbook_external_id)
        option_map: dict[str, ReadingTitleMatchingOption] = {}
        for index, row in enumerate(option_rows_by_id.get(link_id, [])):
            option = ReadingTitleMatchingOption.objects.create(
                exercise=exercise,
                option_key=option_key_from_index(index),
                option_text=clean_text(row["question_bank"]),
                option_order=index + 1,
            )
            option_map[option.option_text] = option

        for index, row in enumerate(item_rows_by_id.get(link_id, []), start=1):
            title_text = clean_text(row["Title"])
            if title_text not in option_map:
                raise ImportErrorWithContext(
                    f"{xlsx_path.name}: title {title_text!r} not found in question_bank for exercise {external_id}"
                )
            ReadingTitleMatchingItem.objects.create(
                exercise=exercise,
                item_number=index,
                text=clean_text(row["Text"]),
                correct_option=option_map[title_text],
                explanation=clean_text(row["Explanation"]),
            )
        imported_count += 1
    return imported_count


def import_reading_understanding(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    exercise_df = get_sheet(xlsx, "exercise")
    require_columns(meta_df, ["ID", "标题", "文本", "考试类型", "是否真题"], "meta")
    require_columns(exercise_df, ["exercise_id", "question_id", "question", "answer", "is_correct", "explanation"], "exercise")

    meta_by_id = {clean_text(row["ID"]): row for row in iter_records(meta_df)}
    require_one_exercise_per_file(xlsx_path, len(meta_by_id))
    rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(exercise_df):
        rows_by_id[normalize_link_id(row["exercise_id"])].append(row)

    level = infer_level_from_filename(xlsx_path)
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.READING,
            exercise_type=ExerciseBase.ExerciseType.READING_UNDERSTANDING,
            external_id=external_id,
            title=clean_text(meta.get("标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=parse_bool(meta.get("是否真题")),
            imported_from_file=xlsx_path.name,
        )
        exercise, _ = ReadingUnderstandingExercise.objects.update_or_create(
            exercise_base=base,
            defaults={"text_markdown": clean_text(meta.get("文本"))},
        )
        exercise.questions.all().delete()

        grouped_questions: dict[int, list[dict[str, str]]] = defaultdict(list)
        for row in rows_by_id.get(normalize_link_id(workbook_external_id), []):
            grouped_questions[parse_int(row["question_id"], "question_id")].append(row)
        for question_number in sorted(grouped_questions):
            rows = grouped_questions[question_number]
            question = ReadingUnderstandingQuestion.objects.create(
                exercise=exercise,
                question_number=question_number,
                question_text=clean_text(rows[0]["question"]),
            )
            correct_count = 0
            for index, row in enumerate(rows):
                is_correct = parse_bool(row["is_correct"])
                correct_count += int(is_correct)
                ReadingUnderstandingAnswerOption.objects.create(
                    question=question,
                    option_key=option_key_from_index(index),
                    option_text=clean_text(row["answer"]),
                    is_correct=is_correct,
                    explanation=clean_text(row["explanation"]),
                    sort_order=index + 1,
                )
            if correct_count != 1:
                raise ImportErrorWithContext(
                    f"{xlsx_path.name}: question_id {question_number} in exercise {external_id} must have exactly one correct answer."
                )
        imported_count += 1
    return imported_count


def import_reading_ad_matching(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    exercise_df = get_sheet(xlsx, "exercise")
    require_columns(meta_df, ["ID", "考试类型", "是否真题"], "meta")
    require_columns(exercise_df, ["exercise_id", "situation", "Ad"], "exercise")

    meta_by_id = {clean_text(row["ID"]): row for row in iter_records(meta_df)}
    require_one_exercise_per_file(xlsx_path, len(meta_by_id))
    rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(exercise_df):
        situation_text = clean_text(row["situation"])
        ad_text = clean_text(row["Ad"])
        if not situation_text and not ad_text:
            continue
        rows_by_id[normalize_link_id(row["exercise_id"])].append(row)

    level = infer_level_from_filename(xlsx_path)
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.READING,
            exercise_type=ExerciseBase.ExerciseType.READING_AD_MATCHING,
            external_id=external_id,
            title=clean_text(meta.get("原标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=parse_bool(meta.get("是否真题")),
            imported_from_file=xlsx_path.name,
        )
        exercise, _ = ReadingAdMatchingExercise.objects.update_or_create(
            exercise_base=base,
            defaults={"instruction": ""},
        )
        exercise.items.all().delete()
        exercise.ads.all().delete()

        linked_rows = rows_by_id.get(normalize_link_id(workbook_external_id), [])
        ad_by_text: dict[str, ReadingAdMatchingAd] = {}
        ad_counter = 0
        for row in linked_rows:
            ad_text = clean_text(row["Ad"])
            if not ad_text:
                raise ImportErrorWithContext(f"{xlsx_path.name}: empty Ad for exercise {external_id}")
            normalized = ad_text
            if normalized not in ad_by_text:
                is_x = normalized.upper() == "X"
                ad_key = "X" if is_x else option_key_from_index(ad_counter)
                ad_counter += 0 if is_x else 1
                ad_by_text[normalized] = ReadingAdMatchingAd.objects.create(
                    exercise=exercise,
                    ad_key=ad_key,
                    ad_text_markdown="Keine Anzeige passt." if is_x else normalized,
                    ad_order=999 if is_x else ad_counter,
                    is_no_match_option=is_x,
                )
        item_number = 0
        for row in linked_rows:
            situation_text = clean_text(row["situation"])
            if not situation_text:
                continue
            item_number += 1
            ReadingAdMatchingItem.objects.create(
                exercise=exercise,
                item_number=item_number,
                item_text=situation_text,
                correct_ad=ad_by_text[clean_text(row["Ad"])],
                explanation="",
            )
        imported_count += 1
    return imported_count


def import_cloze_choice(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    exercise_df = get_sheet(xlsx, "exercise")
    require_columns(meta_df, ["ID", "标题", "内容", "考试类型", "原题"], "meta")
    require_columns(exercise_df, ["exercise_id", "blank_key", "blank_number", "Option", "is_correct", "explanation"], "exercise")

    meta_by_id = {clean_text(row["ID"]): row for row in iter_records(meta_df)}
    require_one_exercise_per_file(xlsx_path, len(meta_by_id))
    rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(exercise_df):
        rows_by_id[normalize_link_id(row["exercise_id"])].append(row)

    level = infer_level_from_filename(xlsx_path)
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.SPRACHBAUSTEIN,
            exercise_type=ExerciseBase.ExerciseType.CLOZE_CHOICE,
            external_id=external_id,
            title=clean_text(meta.get("标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=False,
            imported_from_file=xlsx_path.name,
            source_reference=clean_text(meta.get("原题")),
        )
        exercise, _ = ClozeChoiceExercise.objects.update_or_create(
            exercise_base=base,
            defaults={
                "content_with_placeholders": clean_text(meta.get("内容")),
                "original_source_text": clean_text(meta.get("原题")),
            },
        )
        exercise.blanks.all().delete()

        grouped_blanks: dict[tuple[str, int], list[dict[str, str]]] = defaultdict(list)
        for row in rows_by_id.get(normalize_link_id(workbook_external_id), []):
            key = (clean_text(row["blank_key"]), parse_int(row["blank_number"], "blank_number"))
            grouped_blanks[key].append(row)
        for index, (key, rows) in enumerate(sorted(grouped_blanks.items(), key=lambda item: item[0][1]), start=1):
            blank_key, blank_number = key
            blank = ClozeChoiceBlank.objects.create(
                exercise=exercise,
                blank_key=blank_key,
                blank_number=blank_number,
            )
            correct_count = 0
            for option_index, row in enumerate(rows):
                is_correct = parse_bool(row["is_correct"])
                correct_count += int(is_correct)
                ClozeChoiceOption.objects.create(
                    blank=blank,
                    option_key=option_key_from_index(option_index),
                    option_text=clean_text(row["Option"]),
                    is_correct=is_correct,
                    explanation=clean_text(row["explanation"]),
                    sort_order=option_index + 1,
                )
            if correct_count != 1:
                raise ImportErrorWithContext(
                    f"{xlsx_path.name}: blank {blank_key} in exercise {external_id} must have exactly one correct option."
                )
        imported_count += 1
    return imported_count


def import_cloze_matching(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    options_df = get_sheet(xlsx, "options")
    answer_df = get_sheet(xlsx, "answer")
    require_columns(meta_df, ["ID", "标题", "内容", "考试类型", "原题"], "meta")
    require_columns(options_df, ["exercise_id", "option_key", "option_text"], "options")
    require_columns(answer_df, ["exercise_id", "blank_key", "blank_number", "correct_option_text", "explanation"], "answer")

    meta_by_id = {clean_text(row["ID"]): row for row in iter_records(meta_df)}
    require_one_exercise_per_file(xlsx_path, len(meta_by_id))
    option_rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(options_df):
        option_rows_by_id[normalize_link_id(row["exercise_id"])].append(row)
    answer_rows_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in iter_records(answer_df):
        answer_rows_by_id[normalize_link_id(row["exercise_id"])].append(row)

    level = infer_level_from_filename(xlsx_path)
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.SPRACHBAUSTEIN,
            exercise_type=ExerciseBase.ExerciseType.CLOZE_MATCHING,
            external_id=external_id,
            title=clean_text(meta.get("标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=False,
            imported_from_file=xlsx_path.name,
            source_reference=clean_text(meta.get("原题")),
        )
        exercise, _ = ClozeMatchingExercise.objects.update_or_create(
            exercise_base=base,
            defaults={
                "content_with_placeholders": clean_text(meta.get("内容")),
                "original_source_text": clean_text(meta.get("原题")),
            },
        )
        exercise.blank_answers.all().delete()
        exercise.options.all().delete()

        link_id = normalize_link_id(workbook_external_id)
        options_by_text: dict[str, ClozeMatchingOption] = {}
        referenced_texts = {clean_text(row["correct_option_text"]) for row in answer_rows_by_id.get(link_id, [])}
        for index, row in enumerate(option_rows_by_id.get(link_id, []), start=1):
            option_key = clean_text(row["option_key"])
            option_text = clean_text(row["option_text"])
            if option_text in options_by_text:
                raise ImportErrorWithContext(
                    f"{xlsx_path.name}: duplicate option text {option_text!r} "
                    f"for cloze matching exercise {external_id}"
                )
            option = ClozeMatchingOption.objects.create(
                exercise=exercise,
                option_key=option_key,
                option_text=option_text,
                option_order=parse_int(row["option_order"], "option_order") if clean_text(row.get("option_order")) else index,
                is_extra=parse_bool(row["is_extra"]) if clean_text(row.get("is_extra")) else option_text not in referenced_texts,
            )
            options_by_text[option_text] = option
        for row in answer_rows_by_id.get(link_id, []):
            correct_option_text = clean_text(row["correct_option_text"])
            if correct_option_text not in options_by_text:
                raise ImportErrorWithContext(
                    f"{xlsx_path.name}: missing option text {correct_option_text!r} "
                    f"for cloze matching exercise {external_id}"
                )
            ClozeMatchingBlankAnswer.objects.create(
                exercise=exercise,
                blank_key=clean_text(row["blank_key"]),
                blank_number=parse_int(row["blank_number"], "blank_number"),
                correct_option=options_by_text[correct_option_text],
                explanation=clean_text(row["explanation"]),
            )
        imported_count += 1
    return imported_count


def import_writing(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    exercise_df = get_sheet(xlsx, "exercise")
    require_columns(
        exercise_df,
        ["ID", "Title", "request", "考试类型", "是否真题", "time_limit", "words_limit", "task", "Example_Text"],
        "exercise",
    )
    level = infer_level_from_filename(xlsx_path)
    imported_count = 0
    exercise_rows = list(iter_records(exercise_df))
    require_one_exercise_per_file(xlsx_path, len(exercise_rows))
    for row in exercise_rows:
        external_id = external_id_from_filename(xlsx_path, row["ID"])
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.WRITING,
            exercise_type=ExerciseBase.ExerciseType.WRITING_PROMPT,
            external_id=external_id,
            title=clean_text(row["Title"]),
            exam_type=clean_text(row["考试类型"]),
            is_real_exam=parse_bool(row["是否真题"]),
            imported_from_file=xlsx_path.name,
        )
        exercise, _ = WritingExercise.objects.update_or_create(
            exercise_base=base,
            defaults={
                "request_text": clean_text(row["request"]),
                "time_limit_minutes": parse_int(row["time_limit"], "time_limit") if clean_text(row["time_limit"]) else None,
                "words_limit": parse_int(row["words_limit"], "words_limit") if clean_text(row["words_limit"]) else None,
                "task_text": clean_text(row["task"]),
            },
        )
        exercise.example_texts.all().delete()
        example_text = clean_text(row["Example_Text"])
        if example_text:
            WritingExampleText.objects.create(
                writing_exercise=exercise,
                example_text=example_text,
                label="example_text",
                note="",
                sort_order=1,
            )
        imported_count += 1
    return imported_count


SPEAKING_TEIL_CONFIG = {
    "1": {
        "exercise_type": ExerciseBase.ExerciseType.SPEAKING_TEIL1,
        "title": "Einander kennenlernen",
        "instruction": (
            "Unterhalten Sie sich mit Ihrer Partnerin bzw. Ihrem Partner "
            "über die angegebenen Themen."
        ),
    },
    "2": {
        "exercise_type": ExerciseBase.ExerciseType.SPEAKING_TEIL2,
        "title": "Über ein Thema sprechen",
        "instruction": (
            "Berichten Sie über Ihren Text, tauschen Sie Meinungen aus und "
            "erzählen Sie von eigenen Erfahrungen."
        ),
    },
    "3": {
        "exercise_type": ExerciseBase.ExerciseType.SPEAKING_TEIL3,
        "title": "Gemeinsam etwas planen",
        "instruction": "Tauschen Sie Ideen aus, diskutieren Sie darüber und einigen Sie sich zum Schluss.",
    },
}


def single_workbook_value(
    xlsx_path: Path,
    rows: list[dict[str, str]],
    column: str,
    *,
    required: bool = True,
) -> str:
    values = {clean_text(row.get(column)) for row in rows if clean_text(row.get(column))}
    if not values and required:
        raise ImportErrorWithContext(f"{xlsx_path.name}: missing value for {column!r}")
    if len(values) > 1:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: inconsistent values for {column!r}: {sorted(values)}"
        )
    return next(iter(values), "")


def parse_speaking_einander_kennenlernen_workbook(xlsx_path: Path) -> dict[str, object]:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    if len(xlsx.sheet_names) != 1:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: Teil 1 expects one worksheet; found {xlsx.sheet_names}"
        )
    sheet_name = xlsx.sheet_names[0]
    dialogue_df = get_sheet(xlsx, sheet_name)
    require_columns(dialogue_df, ["ID", "Role", "内容"], sheet_name)
    rows = [row for row in iter_records(dialogue_df) if clean_text(row.get("内容"))]
    if not rows:
        raise ImportErrorWithContext(f"{xlsx_path.name}: Teil 1 dialogue is empty")

    workbook_id = single_workbook_value(xlsx_path, rows, "ID")
    dialogue = []
    participants: list[str] = []
    for sequence, row in enumerate(rows, start=1):
        role = clean_text(row.get("Role"))
        if not role:
            raise ImportErrorWithContext(
                f"{xlsx_path.name}: missing Role in dialogue row {sequence + 1}"
            )
        dialogue.append({"sequence": sequence, "role": role, "text": row["内容"]})
        if role in {"TN1", "TN2"} and role not in participants:
            participants.append(role)

    return {
        "external_id": external_id_from_filename(xlsx_path, workbook_id),
        "level": ExerciseBase.Level.B1,
        "title": SPEAKING_TEIL_CONFIG["1"]["title"],
        "exam_type": "telc",
        "is_real_exam": False,
        "instruction": SPEAKING_TEIL_CONFIG["1"]["instruction"],
        "content": {
            "schema_version": 1,
            "teil": "1",
            "topics": [
                "Name und Herkunft",
                "Wohnort und Familie",
                "Deutschlernen",
                "Beruf, Ausbildung oder Studium",
                "Sprachen und Interessen",
            ],
            "participants": participants,
            "has_examiner_prompts": any(item["role"].startswith("Prüfer") for item in dialogue),
            "dialogue": dialogue,
        },
    }


def parse_tagged_dialogue(xlsx_path: Path, example_text: str) -> list[dict[str, object]]:
    dialogue = []
    for sequence, match in enumerate(
        re.finditer(r"<(TN[12])>\s*(.*?)\s*</\1>", example_text, flags=re.DOTALL),
        start=1,
    ):
        dialogue.append(
            {"sequence": sequence, "role": match.group(1), "text": clean_text(match.group(2))}
        )
    if not dialogue:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: example_text must contain <TN1>...</TN1> and <TN2>...</TN2> turns"
        )
    unmatched = re.sub(r"<(TN[12])>\s*(.*?)\s*</\1>", "", example_text, flags=re.DOTALL)
    if clean_text(unmatched):
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: example_text contains content outside TN1/TN2 tags"
        )
    return dialogue


def parse_speaking_ueber_ein_thema_sprechen_workbook(xlsx_path: Path) -> dict[str, object]:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    example_df = get_sheet(xlsx, "example")
    require_columns(
        meta_df,
        [
            "ID",
            "标题",
            "题目",
            "Card1_Titel",
            "Card1_content",
            "Card2_Titel",
            "Card2_content",
            "考试类型",
            "是否真题",
            "分段符号",
        ],
        "meta",
    )
    require_columns(example_df, ["exercise_id", "example_text"], "example")
    meta_rows = [row for row in iter_records(meta_df) if clean_text(row.get("ID"))]
    example_rows = [row for row in iter_records(example_df) if clean_text(row.get("exercise_id"))]
    require_one_exercise_per_file(xlsx_path, len(meta_rows))
    require_one_exercise_per_file(xlsx_path, len(example_rows))

    meta = meta_rows[0]
    example = example_rows[0]
    workbook_id = normalize_link_id(meta["ID"])
    if workbook_id != normalize_link_id(example["exercise_id"]):
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: meta.ID and example.exercise_id do not match"
        )
    example_text = clean_text(example["example_text"])
    cards = [
        {
            "participant": "TN1",
            "title": clean_text(meta["Card1_Titel"]),
            "content": clean_text(meta["Card1_content"]),
        },
        {
            "participant": "TN2",
            "title": clean_text(meta["Card2_Titel"]),
            "content": clean_text(meta["Card2_content"]),
        },
    ]
    if any(not card["title"] or not card["content"] for card in cards):
        raise ImportErrorWithContext(f"{xlsx_path.name}: both opinion cards must be complete")

    return {
        "external_id": external_id_from_filename(xlsx_path, workbook_id),
        "level": infer_level_from_filename(xlsx_path),
        "title": clean_text(meta["标题"]) or SPEAKING_TEIL_CONFIG["2"]["title"],
        "exam_type": clean_text(meta["考试类型"]),
        "is_real_exam": parse_bool(meta["是否真题"]),
        "instruction": SPEAKING_TEIL_CONFIG["2"]["instruction"],
        "content": {
            "schema_version": 1,
            "teil": "2",
            "task": clean_text(meta["题目"]),
            "cards": cards,
            "delimiter": clean_text(meta["分段符号"]),
            "dialogue": parse_tagged_dialogue(xlsx_path, example_text),
        },
    }


def parse_speaking_gemeinsam_etwas_planen_workbook(xlsx_path: Path) -> dict[str, object]:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    require_columns(
        meta_df,
        ["ID", "标题", "内容", "句子类型", "考试类型", "是否真题"],
        "meta",
    )
    rows = [row for row in iter_records(meta_df) if clean_text(row.get("内容"))]
    if not rows:
        raise ImportErrorWithContext(f"{xlsx_path.name}: Teil 3 dialogue is empty")

    workbook_id = single_workbook_value(xlsx_path, rows, "ID")
    title = single_workbook_value(xlsx_path, rows, "标题")
    exam_type = single_workbook_value(xlsx_path, rows, "考试类型")
    is_real_exam = parse_bool(single_workbook_value(xlsx_path, rows, "是否真题"))
    dialogue = []
    sections: list[dict[str, object]] = []
    turns_by_type: dict[str, list[dict[str, object]]] = {}
    for sequence, row in enumerate(rows, start=1):
        sentence_type = clean_text(row["句子类型"])
        if not sentence_type:
            raise ImportErrorWithContext(
                f"{xlsx_path.name}: missing 句子类型 in dialogue row {sequence + 1}"
            )
        turn = {
            "sequence": sequence,
            "role": "TN1" if sequence % 2 else "TN2",
            "text": clean_text(row["内容"]),
            "sentence_type": sentence_type,
        }
        dialogue.append(turn)
        if sentence_type not in turns_by_type:
            turns_by_type[sentence_type] = []
            sections.append({"type": sentence_type, "turns": turns_by_type[sentence_type]})
        turns_by_type[sentence_type].append(turn)

    return {
        "external_id": external_id_from_filename(xlsx_path, workbook_id),
        "level": infer_level_from_filename(xlsx_path),
        "title": title or SPEAKING_TEIL_CONFIG["3"]["title"],
        "exam_type": exam_type,
        "is_real_exam": is_real_exam,
        "instruction": SPEAKING_TEIL_CONFIG["3"]["instruction"],
        "content": {
            "schema_version": 1,
            "teil": "3",
            "sections": sections,
            "dialogue": dialogue,
        },
    }


def save_speaking_exercise(
    xlsx_path: Path,
    parsed: dict[str, object],
    exercise_type: str,
) -> int:
    base = upsert_base(
        level=parsed["level"],
        skill=ExerciseBase.Skill.SPEAKING,
        exercise_type=exercise_type,
        external_id=parsed["external_id"],
        title=parsed["title"],
        exam_type=parsed["exam_type"],
        is_real_exam=parsed["is_real_exam"],
        imported_from_file=xlsx_path.name,
    )
    SpeakingTeilExercise.objects.update_or_create(
        exercise_base=base,
        defaults={"instruction": parsed["instruction"], "content": parsed["content"]},
    )
    return 1


def import_speaking_einander_kennenlernen(xlsx_path: Path) -> int:
    return save_speaking_exercise(
        xlsx_path,
        parse_speaking_einander_kennenlernen_workbook(xlsx_path),
        ExerciseBase.ExerciseType.SPEAKING_TEIL1,
    )


def import_speaking_ueber_ein_thema_sprechen(xlsx_path: Path) -> int:
    return save_speaking_exercise(
        xlsx_path,
        parse_speaking_ueber_ein_thema_sprechen_workbook(xlsx_path),
        ExerciseBase.ExerciseType.SPEAKING_TEIL2,
    )


def import_speaking_gemeinsam_etwas_planen(xlsx_path: Path) -> int:
    return save_speaking_exercise(
        xlsx_path,
        parse_speaking_gemeinsam_etwas_planen_workbook(xlsx_path),
        ExerciseBase.ExerciseType.SPEAKING_TEIL3,
    )


TYPE_CONFIG: dict[str, dict[str, object]] = {
    "listening": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/listening/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/listening/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/listening/failed",
        "importer": import_listening,
    },
    "reading_title_matching": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_title_matching/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_title_matching/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_title_matching/failed",
        "importer": import_reading_title_matching,
    },
    "reading_understanding": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_understanding/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_understanding/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_understanding/failed",
        "importer": import_reading_understanding,
    },
    "reading_ad_matching": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_ad_matching/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_ad_matching/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/reading_ad_matching/failed",
        "importer": import_reading_ad_matching,
    },
    "cloze_choice": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/cloze_choice/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/cloze_choice/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/cloze_choice/failed",
        "importer": import_cloze_choice,
    },
    "cloze_matching": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/cloze_matching/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/cloze_matching/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/cloze_matching/failed",
        "importer": import_cloze_matching,
    },
    "writing": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/writing/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/writing/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/writing/failed",
        "importer": import_writing,
    },
    "speaking_einander_kennenlernen": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_einander_kennenlernen/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_einander_kennenlernen/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_einander_kennenlernen/failed",
        "importer": import_speaking_einander_kennenlernen,
    },
    "speaking_ueber_ein_thema_sprechen": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_ueber_ein_thema_sprechen/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_ueber_ein_thema_sprechen/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_ueber_ein_thema_sprechen/failed",
        "importer": import_speaking_ueber_ein_thema_sprechen,
    },
    "speaking_gemeinsam_etwas_planen": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_gemeinsam_etwas_planen/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_gemeinsam_etwas_planen/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_gemeinsam_etwas_planen/failed",
        "importer": import_speaking_gemeinsam_etwas_planen,
    },
}


def move_file(path: Path, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / path.name
    if target.exists():
        raise ImportErrorWithContext(f"Refusing to overwrite existing file: {target}")
    path.replace(target)


def collect_files(base_dir: Path, file_arg: str, recursive: bool = False) -> list[Path]:
    if file_arg:
        candidate = Path(file_arg)
        if not candidate.is_absolute():
            candidate = base_dir / file_arg
        if not candidate.exists() and recursive:
            candidates = sorted(base_dir.rglob(candidate.name))
            if len(candidates) == 1:
                candidate = candidates[0]
        return [candidate]
    paths = base_dir.rglob("*") if recursive else base_dir.iterdir()
    return sorted(
        path
        for path in paths
        if path.is_file()
        and path.suffix.lower() in {".xlsx", ".xlsm"}
        and not path.stem.lower().endswith("_example")
    )


def archive_dir(kind: str, root_dir: Path, path: Path) -> Path:
    if kind == "listening":
        teil = re.search(r"(?:^|_)teil([123])(?:_|$)", path.stem, re.IGNORECASE)
        if not teil:
            raise ImportErrorWithContext(
                f"{path.name}: listening filename must include Teil1, Teil2, or Teil3"
            )
        return root_dir / f"Teil{teil.group(1)}"
    return root_dir


def import_kind(
    kind: str,
    file_arg: str = "",
    no_move: bool = False,
    retry_failed: bool = False,
) -> int:
    if kind not in TYPE_CONFIG:
        raise SystemExit(f"Unsupported importer kind: {kind}")
    config = TYPE_CONFIG[kind]
    raw_dir = config["raw_dir"]
    processed_dir = config["processed_dir"]
    failed_dir = config["failed_dir"]
    importer: ImporterFn = config["importer"]  # type: ignore[assignment]

    if kind == "listening":
        for teil in ("Teil1", "Teil2", "Teil3"):
            (processed_dir / teil).mkdir(parents=True, exist_ok=True)
            (failed_dir / teil).mkdir(parents=True, exist_ok=True)

    source_dir = failed_dir if retry_failed else raw_dir
    files = collect_files(source_dir, file_arg, recursive=retry_failed)
    if not files:
        source_label = "failed" if retry_failed else "raw"
        log(f"No xlsx/xlsm files found for kind={kind} in {source_label}/.")
        return 0

    ok = 0
    failed = 0
    for path in files:
        if not path.exists():
            log(f"SKIP missing file: {path}")
            failed += 1
            continue
        log(f"=== Import start: kind={kind} file={path.name} ===")
        try:
            with transaction.atomic():
                imported_count = importer(path)
            ok += 1
            log(f"OK: {path.name} imported exercises={imported_count}")
            if not no_move and path.parent in {raw_dir, failed_dir}:
                move_file(path, archive_dir(kind, processed_dir, path))
            elif not no_move and kind == "listening" and path.parent.parent == failed_dir:
                move_file(path, archive_dir(kind, processed_dir, path))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            log(f"FAILED: {path.name} error={exc}")
            if not no_move and path.parent in {raw_dir, failed_dir}:
                move_file(path, archive_dir(kind, failed_dir, path))
            elif not no_move and kind == "listening" and path.parent.parent == failed_dir:
                log(f"Keeping failed file in place: {path}")
        finally:
            log(f"=== Import end: kind={kind} file={path.name} ===")
    log(f"Summary: kind={kind} ok={ok} failed={failed} total={len(files)}")
    return 0 if failed == 0 else 1


def build_parser(kind: str | None = None) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import exam_preparation xlsx/xlsm files into the current database.",
    )
    parser.add_argument(
        "--kind",
        default=kind or "",
        choices=sorted(TYPE_CONFIG.keys()) if kind is None else [kind],
        help="Importer type. Omit only in wrapper scripts that fix the type.",
    )
    parser.add_argument(
        "--file",
        default="",
        help="Optional single xlsx/xlsm filename or full path. If omitted, scans the kind raw directory.",
    )
    parser.add_argument(
        "--no-move",
        action="store_true",
        help="Do not move successful files to processed/ or failed files to failed/.",
    )
    parser.add_argument(
        "--retryFailed",
        "--retry-failed",
        dest="retry_failed",
        action="store_true",
        help="Scan the kind failed/ directory instead of raw/ and retry those files.",
    )
    return parser


def main(kind: str | None = None) -> int:
    parser = build_parser(kind)
    args = parser.parse_args()
    selected_kind = kind or args.kind
    if not selected_kind:
        parser.error("--kind is required")
    return import_kind(
        selected_kind,
        file_arg=args.file,
        no_move=args.no_move,
        retry_failed=args.retry_failed,
    )


if __name__ == "__main__":
    raise SystemExit(main())
