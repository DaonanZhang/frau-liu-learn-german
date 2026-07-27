#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable, Iterable

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
    SpeakingGapBlank,
    SpeakingGapMatchingExercise,
    SpeakingGapOption,
    SpeakingPromptSegment,
    SpeakingPromptSegmentedExercise,
    WritingExampleText,
    WritingExercise,
)


ImporterFn = Callable[[Path], int]


class ImportErrorWithContext(Exception):
    pass


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


def require_one_exercise_per_file(xlsx_path: Path, exercise_count: int) -> None:
    if exercise_count != 1:
        raise ImportErrorWithContext(
            f"{xlsx_path.name}: expected exactly one exercise per workbook; "
            f"found {exercise_count}"
        )


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
    require_columns(meta_df, ["音频文件_ID", "音频文件网盘地址", "考试类型"], "meta")
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
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.LISTENING,
            exercise_type=ExerciseBase.ExerciseType.LISTENING_CHOICE,
            external_id=external_id,
            title=clean_text(meta.get("原标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=bool(clean_text(meta.get("什么真题"))),
            imported_from_file=xlsx_path.name,
            source_reference=clean_text(meta.get("什么真题")),
        )
        listening_type = clean_text(meta.get("listening_type")) or ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP
        exercise, _ = ListeningExercise.objects.update_or_create(
            exercise_base=base,
            defaults={
                "listening_type": listening_type,
                "audio_file_identifier": external_id,
                "audio_file_url": clean_text(meta.get("音频文件网盘地址")),
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


def import_speaking_gap_matching(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    exercise_df = get_sheet(xlsx, "exercise")
    require_columns(meta_df, ["ID", "标题", "内容", "考试类型", "是否真题"], "meta")
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
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_GAP_MATCHING,
            external_id=external_id,
            title=clean_text(meta.get("标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=parse_bool(meta.get("是否真题")),
            imported_from_file=xlsx_path.name,
        )
        exercise, _ = SpeakingGapMatchingExercise.objects.update_or_create(
            exercise_base=base,
            defaults={"content_with_placeholders": clean_text(meta.get("内容"))},
        )
        exercise.blanks.all().delete()
        exercise.options.all().delete()

        grouped_blanks: dict[tuple[str, int], list[dict[str, str]]] = defaultdict(list)
        for row in rows_by_id.get(normalize_link_id(workbook_external_id), []):
            key = (clean_text(row["blank_key"]), parse_int(row["blank_number"], "blank_number"))
            grouped_blanks[key].append(row)

        option_counter = 1
        for (blank_key, blank_number), rows in sorted(grouped_blanks.items(), key=lambda item: item[0][1]):
            correct_option = None
            correct_explanation = ""
            for row in rows:
                is_correct = parse_bool(row["is_correct"])
                option = SpeakingGapOption.objects.create(
                    exercise=exercise,
                    option_key=f"option_{option_counter}",
                    option_text=clean_text(row["Option"]),
                    option_order=option_counter,
                    is_extra=not is_correct,
                )
                option_counter += 1
                if is_correct:
                    if correct_option is not None:
                        raise ImportErrorWithContext(
                            f"{xlsx_path.name}: blank {blank_key} in exercise {external_id} has multiple correct options."
                        )
                    correct_option = option
                    correct_explanation = clean_text(row["explanation"])
            if correct_option is None:
                raise ImportErrorWithContext(
                    f"{xlsx_path.name}: blank {blank_key} in exercise {external_id} has no correct option."
                )
            SpeakingGapBlank.objects.create(
                exercise=exercise,
                blank_key=blank_key,
                blank_number=blank_number,
                correct_option=correct_option,
                explanation=correct_explanation,
            )
        imported_count += 1
    return imported_count


def import_speaking_prompt_segmented(xlsx_path: Path) -> int:
    xlsx = pd.ExcelFile(xlsx_path, engine="openpyxl")
    meta_df = get_sheet(xlsx, "meta")
    example_df = get_sheet(xlsx, "example")
    require_columns(meta_df, ["ID", "标题", "题目", "考试类型", "是否真题", "分段符号"], "meta")
    require_columns(example_df, ["exercise_id", "example_text"], "example")

    meta_by_id = {clean_text(row["ID"]): row for row in iter_records(meta_df)}
    require_one_exercise_per_file(xlsx_path, len(meta_by_id))
    example_by_id = {normalize_link_id(row["exercise_id"]): row for row in iter_records(example_df)}

    level = infer_level_from_filename(xlsx_path)
    imported_count = 0
    for workbook_external_id, meta in meta_by_id.items():
        external_id = external_id_from_filename(xlsx_path, workbook_external_id)
        delimiter = clean_text(meta.get("分段符号")) or "<分段>"
        example_row = example_by_id.get(normalize_link_id(workbook_external_id), {})
        example_text = clean_text(example_row.get("example_text"))
        base = upsert_base(
            level=level,
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_PROMPT_SEGMENTED,
            external_id=external_id,
            title=clean_text(meta.get("标题")),
            exam_type=clean_text(meta.get("考试类型")),
            is_real_exam=parse_bool(meta.get("是否真题")),
            imported_from_file=xlsx_path.name,
        )
        exercise, _ = SpeakingPromptSegmentedExercise.objects.update_or_create(
            exercise_base=base,
            defaults={
                "prompt_text": clean_text(meta.get("题目")),
                "segment_delimiter": delimiter,
                "example_text_raw": example_text,
            },
        )
        exercise.segments.all().delete()
        segments = [segment.strip() for segment in example_text.split(delimiter) if segment.strip()]
        for index, segment_text in enumerate(segments, start=1):
            SpeakingPromptSegment.objects.create(
                exercise=exercise,
                segment_order=index,
                segment_text=segment_text,
            )
        imported_count += 1
    return imported_count


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
    "speaking_gap_matching": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_gap_matching/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_gap_matching/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_gap_matching/failed",
        "importer": import_speaking_gap_matching,
    },
    "speaking_prompt_segmented": {
        "raw_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_prompt_segmented/raw",
        "processed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_prompt_segmented/processed",
        "failed_dir": REPO_ROOT / "apps/exam_preparation/data/imports/speaking_prompt_segmented/failed",
        "importer": import_speaking_prompt_segmented,
    },
}


def move_file(path: Path, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / path.name
    if target.exists():
        target.unlink()
    path.replace(target)


def collect_files(base_dir: Path, file_arg: str) -> list[Path]:
    if file_arg:
        candidate = Path(file_arg)
        if not candidate.is_absolute():
            candidate = base_dir / file_arg
        return [candidate]
    return sorted(
        path
        for path in base_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() in {".xlsx", ".xlsm"}
        and not path.stem.lower().endswith("_example")
    )


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

    source_dir = failed_dir if retry_failed else raw_dir
    files = collect_files(source_dir, file_arg)
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
                move_file(path, processed_dir)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            log(f"FAILED: {path.name} error={exc}")
            if not no_move and path.parent == raw_dir:
                move_file(path, failed_dir)
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
