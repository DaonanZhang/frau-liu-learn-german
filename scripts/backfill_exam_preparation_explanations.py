#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
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
from django.utils import timezone  # noqa: E402

from apps.exam_preparation.explanations import (  # noqa: E402
    ExplanationResolution,
    clean_explanation,
    resolve_explanations,
)
from apps.exam_preparation.models import (  # noqa: E402
    ClozeChoiceBlank,
    ClozeChoiceOption,
    ExplanationScope,
    ListeningAnswerOption,
    ListeningQuestion,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingQuestion,
)


@dataclass(frozen=True)
class TargetSpec:
    name: str
    parent_model: type
    option_model: type
    option_parent_field: str
    option_ordering: tuple[str, ...]


@dataclass(frozen=True)
class BackfillDecision:
    status: str
    resolution: ExplanationResolution
    option_ids_to_clear: tuple[int, ...] = ()


@dataclass(frozen=True)
class PlannedUpdate:
    target_name: str
    parent_id: int
    decision: BackfillDecision


TARGETS = (
    TargetSpec(
        name="listening",
        parent_model=ListeningQuestion,
        option_model=ListeningAnswerOption,
        option_parent_field="question_id",
        option_ordering=("sort_order", "id"),
    ),
    TargetSpec(
        name="reading_understanding",
        parent_model=ReadingUnderstandingQuestion,
        option_model=ReadingUnderstandingAnswerOption,
        option_parent_field="question_id",
        option_ordering=("sort_order", "id"),
    ),
    TargetSpec(
        name="cloze_choice",
        parent_model=ClozeChoiceBlank,
        option_model=ClozeChoiceOption,
        option_parent_field="blank_id",
        option_ordering=("sort_order", "id"),
    ),
)
TARGET_BY_NAME = {target.name: target for target in TARGETS}


def decide_backfill(parent: object, options: Iterable[object]) -> BackfillDecision:
    option_list = list(options)
    option_values = [option.explanation for option in option_list]
    resolution = resolve_explanations(option_values)
    parent_explanation = clean_explanation(parent.explanation)
    parent_scope = parent.explanation_scope

    if parent_explanation:
        if parent_scope != ExplanationScope.QUESTION:
            raise ValueError("a parent explanation requires question scope")
        if any(clean_explanation(value) for value in option_values):
            raise ValueError("question scope contains both parent and option explanations")
        return BackfillDecision(
            status="existing_question",
            resolution=ExplanationResolution(
                scope=ExplanationScope.QUESTION,
                question_explanation=parent_explanation,
                option_explanations=tuple("" for _ in option_values),
            ),
        )

    if parent_scope == ExplanationScope.OPTION:
        if resolution.scope != ExplanationScope.OPTION:
            raise ValueError("option scope requires explanations on at least two options")
        return BackfillDecision(status="existing_option", resolution=resolution)

    non_empty_options = [
        option for option in option_list if clean_explanation(option.explanation)
    ]
    if not non_empty_options:
        return BackfillDecision(status="missing", resolution=resolution)

    if resolution.scope == ExplanationScope.OPTION:
        return BackfillDecision(status="planned_option", resolution=resolution)

    return BackfillDecision(
        status="planned_question",
        resolution=resolution,
        option_ids_to_clear=tuple(option.pk for option in non_empty_options),
    )


def options_for(target: TargetSpec, parent_id: int, *, lock: bool = False) -> list[object]:
    queryset = target.option_model.objects.filter(
        **{target.option_parent_field: parent_id}
    ).order_by(*target.option_ordering)
    if lock:
        queryset = queryset.select_for_update()
    return list(queryset)


def collect_updates() -> tuple[list[PlannedUpdate], dict[str, Counter]]:
    updates: list[PlannedUpdate] = []
    summaries: dict[str, Counter] = {}

    for target in TARGETS:
        summary = Counter()
        for parent in target.parent_model.objects.order_by("id").iterator():
            try:
                decision = decide_backfill(parent, options_for(target, parent.pk))
            except ValueError as error:
                raise ValueError(
                    f"{target.name} parent_id={parent.pk}: {error}"
                ) from error
            summary[decision.status] += 1
            if decision.status.startswith("planned_"):
                updates.append(
                    PlannedUpdate(
                        target_name=target.name,
                        parent_id=parent.pk,
                        decision=decision,
                    )
                )
        summaries[target.name] = summary

    return updates, summaries


def apply_updates(updates: list[PlannedUpdate]) -> None:
    with transaction.atomic():
        for update in updates:
            target = TARGET_BY_NAME[update.target_name]
            parent = target.parent_model.objects.select_for_update().get(
                pk=update.parent_id
            )
            options = options_for(target, parent.pk, lock=True)
            current_decision = decide_backfill(parent, options)
            if current_decision != update.decision:
                raise ValueError(
                    f"{target.name} parent_id={parent.pk}: data changed after planning"
                )

            parent.explanation = current_decision.resolution.question_explanation
            parent.explanation_scope = current_decision.resolution.scope
            parent.save(update_fields=["explanation", "explanation_scope", "updated_at"])

            if current_decision.option_ids_to_clear:
                target.option_model.objects.filter(
                    pk__in=current_decision.option_ids_to_clear
                ).update(explanation="", updated_at=timezone.now())


def print_summaries(summaries: dict[str, Counter]) -> None:
    for target in TARGETS:
        summary = summaries[target.name]
        print(
            f"{target.name}: total={sum(summary.values())} "
            f"planned_question={summary['planned_question']} "
            f"planned_option={summary['planned_option']} "
            f"existing_question={summary['existing_question']} "
            f"existing_option={summary['existing_option']} "
            f"missing={summary['missing']}"
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Move a single option explanation to its exam-preparation question, "
            "while preserving two or more option explanations as option-level data. "
            "The default is a read-only dry run."
        )
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the planned updates in one transaction.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    updates, summaries = collect_updates()
    print_summaries(summaries)
    print(f"planned_updates={len(updates)}")

    if not args.apply:
        print("Dry run only. Re-run with --apply after reviewing the counts.")
        return 0

    apply_updates(updates)
    remaining_updates, verified_summaries = collect_updates()
    if remaining_updates:
        raise ValueError(
            f"Backfill verification found {len(remaining_updates)} remaining updates"
        )
    print("Backfill applied and verified.")
    print_summaries(verified_summaries)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
