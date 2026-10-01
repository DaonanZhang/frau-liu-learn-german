from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable

from django.core.exceptions import ObjectDoesNotExist, ValidationError

from apps.exam_preparation.models import ExerciseBase


MAX_QUERY_LENGTH = 200
MAX_EXCERPT_LENGTH = 240


@dataclass(frozen=True)
class SearchQuery:
    query: str
    terms: tuple[str, ...]
    skill: str | None
    teil: int | None


SKILLS = {
    "listening": {
        "model_value": ExerciseBase.Skill.LISTENING,
        "label": "Hören",
        "types": {
            1: ExerciseBase.ExerciseType.LISTENING_TEIL1,
            2: ExerciseBase.ExerciseType.LISTENING_TEIL2,
            3: ExerciseBase.ExerciseType.LISTENING_TEIL3,
        },
    },
    "reading": {
        "model_value": ExerciseBase.Skill.READING,
        "label": "Lesen",
        "types": {
            1: ExerciseBase.ExerciseType.READING_TITLE_MATCHING,
            2: ExerciseBase.ExerciseType.READING_UNDERSTANDING,
            3: ExerciseBase.ExerciseType.READING_AD_MATCHING,
        },
    },
    "sprachbausteine": {
        "model_value": ExerciseBase.Skill.SPRACHBAUSTEIN,
        "label": "Sprachbausteine",
        "types": {
            1: ExerciseBase.ExerciseType.CLOZE_CHOICE,
            2: ExerciseBase.ExerciseType.CLOZE_MATCHING,
        },
    },
    "writing": {
        "model_value": ExerciseBase.Skill.WRITING,
        "label": "Schreiben",
        "types": {},
    },
    "speaking": {
        "model_value": ExerciseBase.Skill.SPEAKING,
        "label": "Sprechen",
        "types": {
            1: ExerciseBase.ExerciseType.SPEAKING_TEIL1,
            2: ExerciseBase.ExerciseType.SPEAKING_TEIL2,
            3: ExerciseBase.ExerciseType.SPEAKING_TEIL3,
        },
    },
}

SKILL_BY_MODEL_VALUE = {
    config["model_value"]: (key, config["label"])
    for key, config in SKILLS.items()
}

TEIL_BY_EXERCISE_TYPE = {
    exercise_type: teil
    for config in SKILLS.values()
    for teil, exercise_type in config["types"].items()
}


def parse_search_query(
    *,
    query: str,
    skill: str | None = None,
    teil: str | int | None = None,
) -> SearchQuery:
    normalized_query = " ".join(str(query or "").split())
    if not normalized_query:
        raise ValidationError({"q": "请输入搜索内容。"})
    if len(normalized_query) > MAX_QUERY_LENGTH:
        raise ValidationError({"q": f"搜索内容不能超过 {MAX_QUERY_LENGTH} 个字符。"})

    normalized_skill = str(skill or "").strip().lower() or None
    if normalized_skill not in {None, *SKILLS.keys()}:
        raise ValidationError({"skill": "未知模块。"})

    normalized_teil = None
    if teil not in (None, ""):
        try:
            normalized_teil = int(teil)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"teil": "Teil 必须是数字。"}) from exc

        if normalized_skill is None:
            raise ValidationError({"teil": "选择 Teil 前请先选择模块。"})
        valid_types = SKILLS[normalized_skill]["types"]
        if normalized_teil not in valid_types:
            raise ValidationError({"teil": "该模块不支持这个 Teil。"})

    return SearchQuery(
        query=normalized_query,
        terms=tuple(term.casefold() for term in normalized_query.split()),
        skill=normalized_skill,
        teil=normalized_teil,
    )


def _exercise_queryset(search_query: SearchQuery):
    queryset = ExerciseBase.objects.select_related(
        "listening_exercise",
        "reading_title_matching_exercise",
        "reading_understanding_exercise",
        "reading_ad_matching_exercise",
        "cloze_choice_exercise",
        "cloze_matching_exercise",
        "writing_exercise",
        "speaking_teil_exercise",
    ).prefetch_related(
        "listening_exercise__questions__answer_options",
        "reading_title_matching_exercise__options",
        "reading_title_matching_exercise__items__correct_option",
        "reading_understanding_exercise__questions__answer_options",
        "reading_ad_matching_exercise__ads",
        "reading_ad_matching_exercise__items__correct_ad",
        "cloze_choice_exercise__blanks__options",
        "cloze_matching_exercise__options",
        "cloze_matching_exercise__blank_answers__correct_option",
        "writing_exercise__example_texts",
    )
    if search_query.skill:
        config = SKILLS[search_query.skill]
        queryset = queryset.filter(skill=config["model_value"])
        if search_query.teil is not None:
            queryset = queryset.filter(exercise_type=config["types"][search_query.teil])
    return queryset


def _append(fields: list[tuple[str, str]], label: str, value: Any) -> None:
    if value is None:
        return
    text = re.sub(r"\s+", " ", str(value)).strip()
    if text:
        fields.append((label, text))


def _flatten_json_strings(value: Any, path: str = "") -> Iterable[tuple[str, str]]:
    if isinstance(value, str):
        text = re.sub(r"\s+", " ", value).strip()
        if text:
            yield path, text
        return
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            yield from _flatten_json_strings(child, child_path)
        return
    if isinstance(value, list):
        for index, child in enumerate(value, start=1):
            child_path = f"{path}[{index}]" if path else f"[{index}]"
            yield from _flatten_json_strings(child, child_path)


def _base_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    fields: list[tuple[str, str]] = []
    _append(fields, "标题", base.title)
    _append(fields, "考试类型", base.exam_type)
    _append(fields, "难度", base.difficulty)
    _append(fields, "来源", base.source_name)
    _append(fields, "来源说明", base.source_reference)
    return fields


def _listening_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.listening_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "听力原文", exercise.script)
    for question in exercise.questions.all():
        prefix = f"第 {question.question_number} 题"
        _append(fields, prefix, question.question_text)
        _append(fields, f"{prefix} · 解析", question.explanation)
        for option in question.answer_options.all():
            option_label = "正确答案" if option.is_correct else "选项"
            _append(fields, f"{prefix} · {option_label}", option.option_text)
            _append(fields, f"{prefix} · 选项解析", option.explanation)
    return fields


def _reading_title_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.reading_title_matching_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "题目说明", exercise.instruction)
    for option in exercise.options.all():
        _append(fields, f"标题选项 {option.option_key}", option.option_text)
    for item in exercise.items.all():
        prefix = f"第 {item.item_number} 题"
        _append(fields, prefix, item.text)
        _append(fields, f"{prefix} · 正确答案", item.correct_option.option_text)
        _append(fields, f"{prefix} · 解析", item.explanation)
    return fields


def _reading_understanding_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.reading_understanding_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "阅读文章", exercise.text_markdown)
    for question in exercise.questions.all():
        prefix = f"第 {question.question_number} 题"
        _append(fields, prefix, question.question_text)
        _append(fields, f"{prefix} · 解析", question.explanation)
        for option in question.answer_options.all():
            option_label = "正确答案" if option.is_correct else "选项"
            _append(fields, f"{prefix} · {option_label}", option.option_text)
            _append(fields, f"{prefix} · 选项解析", option.explanation)
    return fields


def _reading_ad_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.reading_ad_matching_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "题目说明", exercise.instruction)
    for ad in exercise.ads.all():
        _append(fields, f"广告 {ad.ad_key}", ad.ad_text_markdown)
    for item in exercise.items.all():
        prefix = f"第 {item.item_number} 题"
        _append(fields, prefix, item.item_text)
        _append(fields, f"{prefix} · 正确答案", item.correct_ad.ad_text_markdown)
        _append(fields, f"{prefix} · 解析", item.explanation)
    return fields


def _cloze_choice_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.cloze_choice_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "填空文章", exercise.content_with_placeholders)
    _append(fields, "原文", exercise.original_source_text)
    for blank in exercise.blanks.all():
        prefix = f"第 {blank.blank_number} 空"
        _append(fields, f"{prefix} · 解析", blank.explanation)
        for option in blank.options.all():
            option_label = "正确答案" if option.is_correct else "选项"
            _append(fields, f"{prefix} · {option_label}", option.option_text)
            _append(fields, f"{prefix} · 选项解析", option.explanation)
    return fields


def _cloze_matching_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.cloze_matching_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "填空文章", exercise.content_with_placeholders)
    _append(fields, "原文", exercise.original_source_text)
    for option in exercise.options.all():
        _append(fields, f"备选词 {option.option_key}", option.option_text)
    for blank in exercise.blank_answers.all():
        prefix = f"第 {blank.blank_number} 空"
        _append(fields, f"{prefix} · 正确答案", blank.correct_option.option_text)
        _append(fields, f"{prefix} · 解析", blank.explanation)
    return fields


def _writing_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.writing_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "写作来信", exercise.request_text)
    _append(fields, "写作要求", exercise.task_text)
    for example in exercise.example_texts.all():
        prefix = example.label or f"范文 {example.sort_order + 1}"
        _append(fields, "范文标签", example.label)
        _append(fields, prefix, example.example_text)
        _append(fields, f"{prefix} · 说明", example.note)
    return fields


def _speaking_fields(base: ExerciseBase) -> list[tuple[str, str]]:
    exercise = base.speaking_teil_exercise
    fields: list[tuple[str, str]] = []
    _append(fields, "口语说明", exercise.instruction)
    for path, text in _flatten_json_strings(exercise.content):
        _append(fields, f"口语内容 · {path}", text)
    return fields


FIELD_BUILDERS = {
    ExerciseBase.ExerciseType.LISTENING_TEIL1: _listening_fields,
    ExerciseBase.ExerciseType.LISTENING_TEIL2: _listening_fields,
    ExerciseBase.ExerciseType.LISTENING_TEIL3: _listening_fields,
    ExerciseBase.ExerciseType.READING_TITLE_MATCHING: _reading_title_fields,
    ExerciseBase.ExerciseType.READING_UNDERSTANDING: _reading_understanding_fields,
    ExerciseBase.ExerciseType.READING_AD_MATCHING: _reading_ad_fields,
    ExerciseBase.ExerciseType.CLOZE_CHOICE: _cloze_choice_fields,
    ExerciseBase.ExerciseType.CLOZE_MATCHING: _cloze_matching_fields,
    ExerciseBase.ExerciseType.WRITING_PROMPT: _writing_fields,
    ExerciseBase.ExerciseType.SPEAKING_TEIL1: _speaking_fields,
    ExerciseBase.ExerciseType.SPEAKING_TEIL2: _speaking_fields,
    ExerciseBase.ExerciseType.SPEAKING_TEIL3: _speaking_fields,
}


def _exercise_object(base: ExerciseBase):
    relations = {
        ExerciseBase.ExerciseType.LISTENING_TEIL1: "listening_exercise",
        ExerciseBase.ExerciseType.LISTENING_TEIL2: "listening_exercise",
        ExerciseBase.ExerciseType.LISTENING_TEIL3: "listening_exercise",
        ExerciseBase.ExerciseType.READING_TITLE_MATCHING: "reading_title_matching_exercise",
        ExerciseBase.ExerciseType.READING_UNDERSTANDING: "reading_understanding_exercise",
        ExerciseBase.ExerciseType.READING_AD_MATCHING: "reading_ad_matching_exercise",
        ExerciseBase.ExerciseType.CLOZE_CHOICE: "cloze_choice_exercise",
        ExerciseBase.ExerciseType.CLOZE_MATCHING: "cloze_matching_exercise",
        ExerciseBase.ExerciseType.WRITING_PROMPT: "writing_exercise",
        ExerciseBase.ExerciseType.SPEAKING_TEIL1: "speaking_teil_exercise",
        ExerciseBase.ExerciseType.SPEAKING_TEIL2: "speaking_teil_exercise",
        ExerciseBase.ExerciseType.SPEAKING_TEIL3: "speaking_teil_exercise",
    }
    return getattr(base, relations[base.exercise_type])


def _href(base: ExerciseBase, exercise_id: int) -> str:
    routes = {
        ExerciseBase.ExerciseType.LISTENING_TEIL1: "/modules/exam-preparation/hoeren/short-text-prep/{id}",
        ExerciseBase.ExerciseType.LISTENING_TEIL2: "/modules/exam-preparation/hoeren/short-text-once/{id}",
        ExerciseBase.ExerciseType.LISTENING_TEIL3: "/modules/exam-preparation/hoeren/dialog-twice/{id}",
        ExerciseBase.ExerciseType.READING_TITLE_MATCHING: "/modules/exam-preparation/lesen/title-matching/{id}",
        ExerciseBase.ExerciseType.READING_UNDERSTANDING: "/modules/exam-preparation/lesen/understanding/{id}",
        ExerciseBase.ExerciseType.READING_AD_MATCHING: "/modules/exam-preparation/lesen/ad-matching/{id}",
        ExerciseBase.ExerciseType.CLOZE_CHOICE: "/modules/exam-preparation/sprachbausteine/cloze-choice/{id}",
        ExerciseBase.ExerciseType.CLOZE_MATCHING: "/modules/exam-preparation/sprachbausteine/cloze-matching/{id}",
        ExerciseBase.ExerciseType.WRITING_PROMPT: "/modules/exam-preparation/schreiben/{id}",
        ExerciseBase.ExerciseType.SPEAKING_TEIL1: "/modules/exam-preparation/sprechen/teil-1/{id}",
        ExerciseBase.ExerciseType.SPEAKING_TEIL2: "/modules/exam-preparation/sprechen/teil-2/{id}",
        ExerciseBase.ExerciseType.SPEAKING_TEIL3: "/modules/exam-preparation/sprechen/teil-3/{id}",
    }
    return routes[base.exercise_type].format(id=exercise_id)


def _excerpt(text: str, terms: tuple[str, ...]) -> str:
    if len(text) <= MAX_EXCERPT_LENGTH:
        return text
    folded = text.casefold()
    positions = [folded.find(term) for term in terms if folded.find(term) >= 0]
    first_match = min(positions) if positions else 0
    content_length = MAX_EXCERPT_LENGTH - 2
    start = max(0, first_match - content_length // 3)
    end = min(len(text), start + content_length)
    if end - start < content_length:
        start = max(0, end - content_length)
    excerpt = text[start:end]
    if start > 0:
        excerpt = f"…{excerpt}"
    if end < len(text):
        excerpt = f"{excerpt}…"
    return excerpt[:MAX_EXCERPT_LENGTH]


def search_exam_preparation_content(search_query: SearchQuery) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for base in _exercise_queryset(search_query):
        builder = FIELD_BUILDERS.get(base.exercise_type)
        if builder is None:
            continue
        try:
            exercise = _exercise_object(base)
        except (AttributeError, ObjectDoesNotExist):
            continue

        fields = _base_fields(base) + builder(base)
        searchable_text = "\n".join(text for _, text in fields).casefold()
        if not all(term in searchable_text for term in search_query.terms):
            continue

        matches = [
            {"label": label, "excerpt": _excerpt(text, search_query.terms)}
            for label, text in fields
            if any(term in text.casefold() for term in search_query.terms)
        ]
        skill_key, skill_label = SKILL_BY_MODEL_VALUE[base.skill]
        results.append(
            {
                "exercise_base_id": base.pk,
                "title": base.title or base.get_exercise_type_display(),
                "skill": skill_key,
                "skill_label": skill_label,
                "teil": TEIL_BY_EXERCISE_TYPE.get(base.exercise_type),
                "exercise_type": base.exercise_type,
                "href": _href(base, exercise.pk),
                "match_count": len(matches),
                "matches": matches,
            }
        )
    return results
