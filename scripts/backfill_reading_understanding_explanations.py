#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402

from apps.exam_preparation.models import (  # noqa: E402
    ExerciseBase,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingQuestion,
)


@dataclass(frozen=True)
class OptionExplanationMove:
    correct_option_id: int
    correct_option_key: str
    source_option_ids: tuple[int, ...]
    source_option_keys: tuple[str, ...]
    explanation: str


@dataclass(frozen=True)
class PlannedQuestionMove:
    question_id: int
    level: str
    external_id: str
    question_number: int
    move: OptionExplanationMove


def clean_text(value: object) -> str:
    return str(value or "").strip()


def resolve_option_explanation_move(
    options: Iterable[object],
    *,
    context: str,
) -> tuple[str, OptionExplanationMove | None]:
    option_list = list(options)
    correct_options = [option for option in option_list if option.is_correct]
    if len(correct_options) != 1:
        raise ValueError(
            f"{context}: expected exactly one correct option; found {len(correct_options)}"
        )

    correct_option = correct_options[0]
    if clean_text(correct_option.explanation):
        return "existing", None

    source_options = [
        option
        for option in option_list
        if not option.is_correct and clean_text(option.explanation)
    ]
    explanations = {clean_text(option.explanation) for option in source_options}
    if not explanations:
        return "missing", None
    if len(explanations) > 1:
        raise ValueError(
            f"{context}: correct option has no explanation and false options contain "
            f"{len(explanations)} different explanations"
        )

    explanation = explanations.pop()
    matching_sources = [
        option
        for option in source_options
        if clean_text(option.explanation) == explanation
    ]
    return (
        "planned",
        OptionExplanationMove(
            correct_option_id=correct_option.pk,
            correct_option_key=correct_option.option_key,
            source_option_ids=tuple(option.pk for option in matching_sources),
            source_option_keys=tuple(option.option_key for option in matching_sources),
            explanation=explanation,
        ),
    )


def collect_planned_moves() -> tuple[list[PlannedQuestionMove], int, int]:
    questions = (
        ReadingUnderstandingQuestion.objects.filter(
            exercise__exercise_base__exercise_type=(
                ExerciseBase.ExerciseType.READING_UNDERSTANDING
            )
        )
        .select_related("exercise__exercise_base")
        .prefetch_related("answer_options")
        .order_by(
            "exercise__exercise_base__level",
            "exercise__exercise_base__external_id",
            "question_number",
        )
    )
    planned: list[PlannedQuestionMove] = []
    existing = 0
    missing = 0
    for question in questions:
        base = question.exercise.exercise_base
        context = f"exercise={base.external_id} question={question.question_number}"
        status, move = resolve_option_explanation_move(
            question.answer_options.all(), context=context
        )
        if status == "existing":
            existing += 1
        elif status == "missing":
            missing += 1
        else:
            assert move is not None
            planned.append(
                PlannedQuestionMove(
                    question_id=question.pk,
                    level=base.level,
                    external_id=base.external_id,
                    question_number=question.question_number,
                    move=move,
                )
            )
    return planned, existing, missing


def apply_moves(planned: list[PlannedQuestionMove]) -> tuple[int, int]:
    moved_questions = 0
    cleared_options = 0
    with transaction.atomic():
        for item in planned:
            locked_options = list(
                ReadingUnderstandingAnswerOption.objects.select_for_update()
                .filter(question_id=item.question_id)
                .order_by("sort_order", "id")
            )
            status, current_move = resolve_option_explanation_move(
                locked_options,
                context=f"exercise={item.external_id} question={item.question_number}",
            )
            if status == "existing":
                continue
            if status != "planned" or current_move != item.move:
                raise ValueError(
                    f"exercise={item.external_id} question={item.question_number}: "
                    "database changed after dry-run planning"
                )

            options_by_id = {option.pk: option for option in locked_options}
            correct_option = options_by_id[current_move.correct_option_id]
            correct_option.explanation = current_move.explanation
            correct_option.save(update_fields=["explanation", "updated_at"])

            for source_option_id in current_move.source_option_ids:
                source_option = options_by_id[source_option_id]
                source_option.explanation = ""
                source_option.save(update_fields=["explanation", "updated_at"])
            moved_questions += 1
            cleared_options += len(current_move.source_option_ids)
    return moved_questions, cleared_options


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Move uniquely misplaced Lesen Teil 2 explanations from false options "
            "to an empty correct option. The default is a read-only dry run."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply planned moves. Without this flag, no database rows are changed.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    planned, existing, missing = collect_planned_moves()
    for item in planned:
        action = "MOVE" if args.apply else "DRY-RUN"
        print(
            f"{action}: level={item.level} exercise={item.external_id} "
            f"question={item.question_number} "
            f"from={','.join(item.move.source_option_keys)} "
            f"to={item.move.correct_option_key}"
        )

    moved, cleared = apply_moves(planned) if args.apply else (0, 0)
    print(
        "Summary: "
        f"existing={existing} missing_without_explanation={missing} "
        f"planned={len(planned)} moved={moved} cleared_false_options={cleared}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
