from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.exam_preparation.models import (
    ClozeChoiceExercise,
    ClozeMatchingExercise,
    ExerciseBase,
    ListeningExercise,
    ReadingAdMatchingExercise,
    ReadingTitleMatchingExercise,
    ReadingUnderstandingExercise,
    SpeakingTeilExercise,
    WritingExercise,
)


SCHEMA_VERSION = 1
EXAM_TYPE = "TELC"
LEVEL = "C1"


class ContentBundleError(ValueError):
    pass


def _related(base: ExerciseBase, attribute: str):
    try:
        return getattr(base, attribute)
    except ObjectDoesNotExist as exc:
        raise ContentBundleError(f"{base} is missing {attribute}") from exc


def _base_payload(base: ExerciseBase) -> dict[str, Any]:
    return {
        "exam_type": base.exam_type,
        "level": base.level,
        "skill": base.skill,
        "exercise_type": base.exercise_type,
        "external_id": base.external_id,
        "title": base.title,
        "difficulty": base.difficulty,
        "is_real_exam": base.is_real_exam,
        "source_name": base.source_name,
        "source_reference": base.source_reference,
        "imported_from_file": base.imported_from_file,
        "imported_at": base.imported_at.isoformat() if base.imported_at else None,
        "creation_method": base.creation_method,
    }


def _serialize_cloze_choice(base: ExerciseBase) -> dict[str, Any]:
    exercise: ClozeChoiceExercise = _related(base, "cloze_choice_exercise")
    return {
        "content_with_placeholders": exercise.content_with_placeholders,
        "original_source_text": exercise.original_source_text,
        "blanks": [
            {
                "blank_key": blank.blank_key,
                "blank_number": blank.blank_number,
                "explanation": blank.explanation,
                "explanation_scope": blank.explanation_scope,
                "options": [
                    {
                        "option_key": option.option_key,
                        "option_text": option.option_text,
                        "is_correct": option.is_correct,
                        "explanation": option.explanation,
                        "sort_order": option.sort_order,
                    }
                    for option in blank.options.all()
                ],
            }
            for blank in exercise.blanks.all()
        ],
    }


def _serialize_cloze_matching(base: ExerciseBase) -> dict[str, Any]:
    exercise: ClozeMatchingExercise = _related(base, "cloze_matching_exercise")
    return {
        "content_with_placeholders": exercise.content_with_placeholders,
        "original_source_text": exercise.original_source_text,
        "options": [
            {
                "option_key": option.option_key,
                "option_text": option.option_text,
                "option_order": option.option_order,
                "is_extra": option.is_extra,
            }
            for option in exercise.options.all()
        ],
        "blank_answers": [
            {
                "blank_key": blank.blank_key,
                "blank_number": blank.blank_number,
                "correct_option_key": blank.correct_option.option_key,
                "explanation": blank.explanation,
            }
            for blank in exercise.blank_answers.select_related("correct_option").all()
        ],
    }


def _serialize_title_matching(base: ExerciseBase) -> dict[str, Any]:
    exercise: ReadingTitleMatchingExercise = _related(base, "reading_title_matching_exercise")
    return {
        "instruction": exercise.instruction,
        "options": [
            {
                "option_key": option.option_key,
                "option_text": option.option_text,
                "option_order": option.option_order,
            }
            for option in exercise.options.all()
        ],
        "items": [
            {
                "item_number": item.item_number,
                "text": item.text,
                "correct_option_key": item.correct_option.option_key,
                "explanation": item.explanation,
            }
            for item in exercise.items.select_related("correct_option").all()
        ],
    }


def _serialize_understanding(base: ExerciseBase) -> dict[str, Any]:
    exercise: ReadingUnderstandingExercise = _related(base, "reading_understanding_exercise")
    return {
        "text_markdown": exercise.text_markdown,
        "questions": [
            {
                "question_number": question.question_number,
                "question_text": question.question_text,
                "explanation": question.explanation,
                "explanation_scope": question.explanation_scope,
                "answer_options": [
                    {
                        "option_key": option.option_key,
                        "option_text": option.option_text,
                        "is_correct": option.is_correct,
                        "explanation": option.explanation,
                        "sort_order": option.sort_order,
                    }
                    for option in question.answer_options.all()
                ],
            }
            for question in exercise.questions.all()
        ],
    }


def _serialize_ad_matching(base: ExerciseBase) -> dict[str, Any]:
    exercise: ReadingAdMatchingExercise = _related(base, "reading_ad_matching_exercise")
    return {
        "instruction": exercise.instruction,
        "ads": [
            {
                "ad_key": ad.ad_key,
                "ad_text_markdown": ad.ad_text_markdown,
                "ad_order": ad.ad_order,
                "is_no_match_option": ad.is_no_match_option,
            }
            for ad in exercise.ads.all()
        ],
        "items": [
            {
                "item_number": item.item_number,
                "item_text": item.item_text,
                "correct_ad_key": item.correct_ad.ad_key,
                "explanation": item.explanation,
            }
            for item in exercise.items.select_related("correct_ad").all()
        ],
    }


def _serialize_listening(base: ExerciseBase) -> dict[str, Any]:
    exercise: ListeningExercise = _related(base, "listening_exercise")
    return {
        "listening_type": exercise.listening_type,
        "audio_file_identifier": exercise.audio_file_identifier,
        "audio_file_url": exercise.audio_file_url,
        "script": exercise.script,
        "content": exercise.content,
        "questions": [
            {
                "question_number": question.question_number,
                "question_key": question.question_key,
                "question_type": question.question_type,
                "question_text": question.question_text,
                "correct_answer": question.correct_answer,
                "explanation": question.explanation,
                "explanation_scope": question.explanation_scope,
                "answer_options": [
                    {
                        "option_key": option.option_key,
                        "option_text": option.option_text,
                        "is_correct": option.is_correct,
                        "explanation": option.explanation,
                        "sort_order": option.sort_order,
                    }
                    for option in question.answer_options.all()
                ],
            }
            for question in exercise.questions.all()
        ],
    }


def _serialize_writing(base: ExerciseBase) -> dict[str, Any]:
    exercise: WritingExercise = _related(base, "writing_exercise")
    return {
        "request_text": exercise.request_text,
        "time_limit_minutes": exercise.time_limit_minutes,
        "words_limit": exercise.words_limit,
        "task_text": exercise.task_text,
        "content": exercise.content,
        "example_texts": [
            {
                "example_text": example.example_text,
                "translation_zh": example.translation_zh,
                "label": example.label,
                "note": example.note,
                "sort_order": example.sort_order,
            }
            for example in exercise.example_texts.all()
        ],
    }


def _serialize_speaking(base: ExerciseBase) -> dict[str, Any]:
    exercise: SpeakingTeilExercise = _related(base, "speaking_teil_exercise")
    return {"instruction": exercise.instruction, "task": exercise.task, "content": exercise.content}


SERIALIZERS = {
    ExerciseBase.ExerciseType.CLOZE_CHOICE: _serialize_cloze_choice,
    ExerciseBase.ExerciseType.CLOZE_MATCHING: _serialize_cloze_matching,
    ExerciseBase.ExerciseType.READING_TITLE_MATCHING: _serialize_title_matching,
    ExerciseBase.ExerciseType.READING_UNDERSTANDING: _serialize_understanding,
    ExerciseBase.ExerciseType.READING_AD_MATCHING: _serialize_ad_matching,
    ExerciseBase.ExerciseType.LISTENING_TEIL1: _serialize_listening,
    ExerciseBase.ExerciseType.LISTENING_TEIL2: _serialize_listening,
    ExerciseBase.ExerciseType.LISTENING_TEIL3: _serialize_listening,
    ExerciseBase.ExerciseType.WRITING_PROMPT: _serialize_writing,
    ExerciseBase.ExerciseType.SPEAKING_TEIL1: _serialize_speaking,
    ExerciseBase.ExerciseType.SPEAKING_TEIL2: _serialize_speaking,
    ExerciseBase.ExerciseType.SPEAKING_TEIL3: _serialize_speaking,
}


def export_telc_c1_bundle() -> dict[str, Any]:
    bases = ExerciseBase.objects.filter(exam_type=EXAM_TYPE, level=LEVEL).order_by(
        "exercise_type", "external_id", "id"
    )
    exercises = []
    counts: Counter[str] = Counter()
    for base in bases.iterator():
        serializer = SERIALIZERS.get(base.exercise_type)
        if serializer is None:
            raise ContentBundleError(f"Unsupported exercise type: {base.exercise_type}")
        exercises.append({"base": _base_payload(base), "data": serializer(base)})
        counts[base.exercise_type] += 1
    if not exercises:
        raise ContentBundleError("No TELC/C1 exercises found")
    return {
        "schema_version": SCHEMA_VERSION,
        "scope": {"exam_type": EXAM_TYPE, "level": LEVEL},
        "generated_at": timezone.now().isoformat(),
        "counts": {"exercises": len(exercises), "by_type": dict(sorted(counts.items()))},
        "exercises": exercises,
    }


def _records(data: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = data.get(key, [])
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ContentBundleError(f"{key} must be a list of objects")
    return value


def _sync_simple(manager, records, key_field: str, fields: tuple[str, ...]):
    objects = {}
    for record in records:
        if key_field not in record:
            raise ContentBundleError(f"Missing {key_field}")
        key = record[key_field]
        if key in objects:
            raise ContentBundleError(f"Duplicate {key_field}: {key}")
        obj, _ = manager.update_or_create(
            **{key_field: key},
            defaults={field: record.get(field) for field in fields},
        )
        objects[key] = obj
    return objects


def _sync_cloze_choice(base: ExerciseBase, data: dict[str, Any]):
    exercise, _ = ClozeChoiceExercise.objects.update_or_create(
        exercise_base=base,
        defaults={
            "content_with_placeholders": data.get("content_with_placeholders", ""),
            "original_source_text": data.get("original_source_text", ""),
        },
    )
    blank_keys = set()
    for record in _records(data, "blanks"):
        blank_key = record.get("blank_key")
        if not blank_key or blank_key in blank_keys:
            raise ContentBundleError(f"Invalid or duplicate blank_key: {blank_key!r}")
        blank, _ = exercise.blanks.update_or_create(
            blank_key=blank_key,
            defaults={
                "blank_number": record.get("blank_number"),
                "explanation": record.get("explanation", ""),
                "explanation_scope": record.get("explanation_scope", "question"),
            },
        )
        _sync_simple(
            blank.options,
            _records(record, "options"),
            "option_key",
            ("option_text", "is_correct", "explanation", "sort_order"),
        )
        blank_keys.add(blank_key)


def _sync_cloze_matching(base: ExerciseBase, data: dict[str, Any]):
    exercise, _ = ClozeMatchingExercise.objects.update_or_create(
        exercise_base=base,
        defaults={
            "content_with_placeholders": data.get("content_with_placeholders", ""),
            "original_source_text": data.get("original_source_text", ""),
        },
    )
    options = _sync_simple(
        exercise.options,
        _records(data, "options"),
        "option_key",
        ("option_text", "option_order", "is_extra"),
    )
    blank_keys = set()
    for record in _records(data, "blank_answers"):
        blank_key = record.get("blank_key")
        option_key = record.get("correct_option_key")
        if not blank_key or blank_key in blank_keys:
            raise ContentBundleError(f"Invalid or duplicate blank_key: {blank_key!r}")
        if option_key not in options:
            raise ContentBundleError(f"Unknown correct_option_key: {option_key!r}")
        exercise.blank_answers.update_or_create(
            blank_key=blank_key,
            defaults={
                "blank_number": record.get("blank_number"),
                "correct_option": options[option_key],
                "explanation": record.get("explanation", ""),
            },
        )
        blank_keys.add(blank_key)


def _sync_title_matching(base: ExerciseBase, data: dict[str, Any]):
    exercise, _ = ReadingTitleMatchingExercise.objects.update_or_create(
        exercise_base=base, defaults={"instruction": data.get("instruction", "")}
    )
    options = _sync_simple(
        exercise.options,
        _records(data, "options"),
        "option_key",
        ("option_text", "option_order"),
    )
    item_numbers = set()
    for record in _records(data, "items"):
        number = record.get("item_number")
        option_key = record.get("correct_option_key")
        if number is None or number in item_numbers:
            raise ContentBundleError(f"Invalid or duplicate item_number: {number!r}")
        if option_key not in options:
            raise ContentBundleError(f"Unknown correct_option_key: {option_key!r}")
        exercise.items.update_or_create(
            item_number=number,
            defaults={
                "text": record.get("text", ""),
                "correct_option": options[option_key],
                "explanation": record.get("explanation", ""),
            },
        )
        item_numbers.add(number)


def _sync_understanding(base: ExerciseBase, data: dict[str, Any]):
    exercise, _ = ReadingUnderstandingExercise.objects.update_or_create(
        exercise_base=base, defaults={"text_markdown": data.get("text_markdown", "")}
    )
    question_numbers = set()
    for record in _records(data, "questions"):
        number = record.get("question_number")
        if number is None or number in question_numbers:
            raise ContentBundleError(f"Invalid or duplicate question_number: {number!r}")
        question, _ = exercise.questions.update_or_create(
            question_number=number,
            defaults={
                "question_text": record.get("question_text", ""),
                "explanation": record.get("explanation", ""),
                "explanation_scope": record.get("explanation_scope", "question"),
            },
        )
        _sync_simple(
            question.answer_options,
            _records(record, "answer_options"),
            "option_key",
            ("option_text", "is_correct", "explanation", "sort_order"),
        )
        question_numbers.add(number)


def _sync_ad_matching(base: ExerciseBase, data: dict[str, Any]):
    exercise, _ = ReadingAdMatchingExercise.objects.update_or_create(
        exercise_base=base, defaults={"instruction": data.get("instruction", "")}
    )
    ads = _sync_simple(
        exercise.ads,
        _records(data, "ads"),
        "ad_key",
        ("ad_text_markdown", "ad_order", "is_no_match_option"),
    )
    item_numbers = set()
    for record in _records(data, "items"):
        number = record.get("item_number")
        ad_key = record.get("correct_ad_key")
        if number is None or number in item_numbers:
            raise ContentBundleError(f"Invalid or duplicate item_number: {number!r}")
        if ad_key not in ads:
            raise ContentBundleError(f"Unknown correct_ad_key: {ad_key!r}")
        exercise.items.update_or_create(
            item_number=number,
            defaults={
                "item_text": record.get("item_text", ""),
                "correct_ad": ads[ad_key],
                "explanation": record.get("explanation", ""),
            },
        )
        item_numbers.add(number)


def _sync_listening(base: ExerciseBase, data: dict[str, Any]):
    exercise, _ = ListeningExercise.objects.update_or_create(
        exercise_base=base,
        defaults={
            "listening_type": data.get("listening_type", ""),
            "audio_file_identifier": data.get("audio_file_identifier", ""),
            "audio_file_url": data.get("audio_file_url", ""),
            "script": data.get("script", ""),
            "content": data.get("content", {}),
        },
    )
    question_numbers = set()
    for record in _records(data, "questions"):
        number = record.get("question_number")
        if number is None or number in question_numbers:
            raise ContentBundleError(f"Invalid or duplicate question_number: {number!r}")
        question, _ = exercise.questions.update_or_create(
            question_number=number,
            defaults={
                "question_key": record.get("question_key", ""),
                "question_type": record.get("question_type", ""),
                "question_text": record.get("question_text", ""),
                "correct_answer": record.get("correct_answer", ""),
                "explanation": record.get("explanation", ""),
                "explanation_scope": record.get("explanation_scope", "question"),
            },
        )
        _sync_simple(
            question.answer_options,
            _records(record, "answer_options"),
            "option_key",
            ("option_text", "is_correct", "explanation", "sort_order"),
        )
        question_numbers.add(number)


def _sync_writing(base: ExerciseBase, data: dict[str, Any]):
    exercise, _ = WritingExercise.objects.update_or_create(
        exercise_base=base,
        defaults={
            "request_text": data.get("request_text", ""),
            "time_limit_minutes": data.get("time_limit_minutes"),
            "words_limit": data.get("words_limit"),
            "task_text": data.get("task_text", ""),
            "content": data.get("content", {}),
        },
    )
    _sync_simple(
        exercise.example_texts,
        _records(data, "example_texts"),
        "sort_order",
        ("example_text", "translation_zh", "label", "note"),
    )


def _sync_speaking(base: ExerciseBase, data: dict[str, Any]):
    SpeakingTeilExercise.objects.update_or_create(
        exercise_base=base,
        defaults={"instruction": data.get("instruction", ""), "task": data.get("task", ""), "content": data.get("content", {})},
    )


IMPORTERS = {
    ExerciseBase.ExerciseType.CLOZE_CHOICE: _sync_cloze_choice,
    ExerciseBase.ExerciseType.CLOZE_MATCHING: _sync_cloze_matching,
    ExerciseBase.ExerciseType.READING_TITLE_MATCHING: _sync_title_matching,
    ExerciseBase.ExerciseType.READING_UNDERSTANDING: _sync_understanding,
    ExerciseBase.ExerciseType.READING_AD_MATCHING: _sync_ad_matching,
    ExerciseBase.ExerciseType.LISTENING_TEIL1: _sync_listening,
    ExerciseBase.ExerciseType.LISTENING_TEIL2: _sync_listening,
    ExerciseBase.ExerciseType.LISTENING_TEIL3: _sync_listening,
    ExerciseBase.ExerciseType.WRITING_PROMPT: _sync_writing,
    ExerciseBase.ExerciseType.SPEAKING_TEIL1: _sync_speaking,
    ExerciseBase.ExerciseType.SPEAKING_TEIL2: _sync_speaking,
    ExerciseBase.ExerciseType.SPEAKING_TEIL3: _sync_speaking,
}


def _parse_imported_at(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str) or (parsed := parse_datetime(value)) is None:
        raise ContentBundleError(f"Invalid imported_at value: {value!r}")
    return parsed


def _validate_bundle(bundle: Any) -> list[dict[str, Any]]:
    if not isinstance(bundle, dict):
        raise ContentBundleError("Bundle must be a JSON object")
    if bundle.get("schema_version") != SCHEMA_VERSION:
        raise ContentBundleError(f"Unsupported schema_version: {bundle.get('schema_version')!r}")
    if bundle.get("scope") != {"exam_type": EXAM_TYPE, "level": LEVEL}:
        raise ContentBundleError("Bundle scope must be TELC/C1")
    exercises = bundle.get("exercises")
    if not isinstance(exercises, list) or not all(isinstance(item, dict) for item in exercises):
        raise ContentBundleError("exercises must be a list of objects")
    keys = set()
    for entry in exercises:
        base = entry.get("base")
        data = entry.get("data")
        if not isinstance(base, dict) or not isinstance(data, dict):
            raise ContentBundleError("Each exercise requires base and data objects")
        if base.get("exam_type") != EXAM_TYPE or base.get("level") != LEVEL:
            raise ContentBundleError("Every exercise must belong to TELC/C1")
        key = (base.get("exercise_type"), base.get("external_id"))
        if not all(isinstance(value, str) and value for value in key):
            raise ContentBundleError(f"Invalid exercise key: {key!r}")
        if key in keys:
            raise ContentBundleError(f"Duplicate exercise key: {key!r}")
        if key[0] not in IMPORTERS:
            raise ContentBundleError(f"Unsupported exercise type: {key[0]}")
        keys.add(key)
    expected = bundle.get("counts", {}).get("exercises")
    if expected != len(exercises):
        raise ContentBundleError(f"Exercise count mismatch: metadata={expected!r}, actual={len(exercises)}")
    return exercises


@transaction.atomic
def import_telc_c1_bundle(bundle: Any, *, apply: bool = False) -> dict[str, int]:
    exercises = _validate_bundle(bundle)
    keep_keys = set()
    created = 0
    updated = 0
    for entry in exercises:
        payload = entry["base"]
        exercise_type = payload["exercise_type"]
        external_id = payload["external_id"]
        base, was_created = ExerciseBase.objects.update_or_create(
            exam_type=EXAM_TYPE,
            level=LEVEL,
            exercise_type=exercise_type,
            external_id=external_id,
            defaults={
                "skill": payload.get("skill", ""),
                "title": payload.get("title", ""),
                "difficulty": payload.get("difficulty", ""),
                "is_real_exam": payload.get("is_real_exam", False),
                "source_name": payload.get("source_name", ""),
                "source_reference": payload.get("source_reference", ""),
                "imported_from_file": payload.get("imported_from_file", ""),
                "imported_at": _parse_imported_at(payload.get("imported_at")),
                "creation_method": payload.get("creation_method", ExerciseBase.CreationMethod.MANUAL),
            },
        )
        IMPORTERS[exercise_type](base, entry["data"])
        keep_keys.add((exercise_type, external_id))
        created += int(was_created)
        updated += int(not was_created)

    existing_keys = set(
        ExerciseBase.objects.filter(exam_type=EXAM_TYPE, level=LEVEL).values_list(
            "exercise_type", "external_id"
        )
    )
    result = {
        "exercises": len(exercises),
        "created": created,
        "updated": updated,
        "unlisted": len(existing_keys - keep_keys),
    }
    if not apply:
        transaction.set_rollback(True)
    return result
