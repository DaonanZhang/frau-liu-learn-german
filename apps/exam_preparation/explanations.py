from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from apps.exam_preparation.models.base import ExplanationScope


@dataclass(frozen=True)
class ExplanationResolution:
    scope: str
    question_explanation: str
    option_explanations: tuple[str, ...]


def clean_explanation(value: object) -> str:
    return str(value or "").strip()


def resolve_explanations(values: Iterable[object]) -> ExplanationResolution:
    cleaned = tuple(clean_explanation(value) for value in values)
    non_empty = [value for value in cleaned if value]

    if len(non_empty) <= 1:
        return ExplanationResolution(
            scope=ExplanationScope.QUESTION,
            question_explanation=non_empty[0] if non_empty else "",
            option_explanations=tuple("" for _ in cleaned),
        )

    return ExplanationResolution(
        scope=ExplanationScope.OPTION,
        question_explanation="",
        option_explanations=cleaned,
    )
