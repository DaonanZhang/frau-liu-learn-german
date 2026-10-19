from __future__ import annotations

import re
from dataclasses import dataclass

from apps.exam_preparation.models.base import ExerciseBase


_OMITTED = object()
_FAMILY_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")
_LEGACY_SCOPE_PATTERN = re.compile(r"^(.+?)\s+([A-Z][0-9])$", re.IGNORECASE)


def normalize_exam_type(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Exam type must be a non-empty family name.")
    normalized = value.strip().upper()
    if not normalized or not _FAMILY_PATTERN.fullmatch(normalized):
        raise ValueError(f"Invalid exam type: {value!r}.")
    return normalized


def normalize_exam_level(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Exam level must be a supported CEFR level.")
    normalized = value.strip().upper()
    if normalized not in ExerciseBase.Level.values:
        raise ValueError(f"Invalid exam level: {value!r}.")
    return normalized


@dataclass(frozen=True)
class ExamScope:
    exam_type: str = "TELC"
    level: str = "B1"

    def __post_init__(self):
        object.__setattr__(self, "exam_type", normalize_exam_type(self.exam_type))
        object.__setattr__(self, "level", normalize_exam_level(self.level))

    @classmethod
    def from_values(cls, exam_type: object = _OMITTED, level: object = _OMITTED) -> ExamScope:
        raw_exam_type = "TELC" if exam_type is _OMITTED else exam_type
        raw_level = "B1" if level is _OMITTED else level
        normalized_level = normalize_exam_level(raw_level)
        if not isinstance(raw_exam_type, str):
            raise ValueError("Exam type must be a non-empty family name.")

        legacy_match = _LEGACY_SCOPE_PATTERN.fullmatch(raw_exam_type.strip())
        if legacy_match:
            legacy_level = normalize_exam_level(legacy_match.group(2))
            if legacy_level != normalized_level:
                raise ValueError(
                    f"Exam type level {legacy_level} does not match requested level {normalized_level}."
                )
            raw_exam_type = legacy_match.group(1)
        return cls(normalize_exam_type(raw_exam_type), normalized_level)
