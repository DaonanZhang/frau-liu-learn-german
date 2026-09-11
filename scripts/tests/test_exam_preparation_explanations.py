from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPTS_DIR.parent
for path in (REPO_ROOT, SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from apps.exam_preparation.explanations import resolve_explanations  # noqa: E402
from apps.exam_preparation.models import ExplanationScope  # noqa: E402
from backfill_exam_preparation_explanations import decide_backfill  # noqa: E402
from exam_preparation_importer import (  # noqa: E402
    ImportErrorWithContext,
    require_exactly_one_correct_answer,
)


def option(pk: int, explanation: str) -> SimpleNamespace:
    return SimpleNamespace(pk=pk, explanation=explanation)


def parent(*, explanation: str = "", scope: str = ExplanationScope.QUESTION):
    return SimpleNamespace(explanation=explanation, explanation_scope=scope)


class ResolveExplanationsTests(unittest.TestCase):
    def test_moves_one_non_empty_explanation_to_question(self):
        result = resolve_explanations(["", "Question explanation", ""])

        self.assertEqual(result.scope, ExplanationScope.QUESTION)
        self.assertEqual(result.question_explanation, "Question explanation")
        self.assertEqual(result.option_explanations, ("", "", ""))

    def test_preserves_two_option_explanations(self):
        result = resolve_explanations(["First", "", "Second"])

        self.assertEqual(result.scope, ExplanationScope.OPTION)
        self.assertEqual(result.question_explanation, "")
        self.assertEqual(result.option_explanations, ("First", "", "Second"))

    def test_counts_populated_options_even_when_text_is_identical(self):
        result = resolve_explanations(["Same", "Same", ""])

        self.assertEqual(result.scope, ExplanationScope.OPTION)
        self.assertEqual(result.option_explanations, ("Same", "Same", ""))

    def test_keeps_empty_group_at_question_scope(self):
        result = resolve_explanations(["", ""])

        self.assertEqual(result.scope, ExplanationScope.QUESTION)
        self.assertEqual(result.question_explanation, "")


class CorrectAnswerValidationTests(unittest.TestCase):
    def test_accepts_exactly_one_correct_answer(self):
        rows = [{"is_correct": "false"}, {"is_correct": "true"}]

        require_exactly_one_correct_answer(rows, context="question")

    def test_rejects_multiple_correct_answers(self):
        rows = [{"is_correct": "true"}, {"is_correct": "true"}]

        with self.assertRaisesRegex(ImportErrorWithContext, "exactly one"):
            require_exactly_one_correct_answer(rows, context="question")


class BackfillDecisionTests(unittest.TestCase):
    def test_plans_question_level_move_and_source_clear(self):
        decision = decide_backfill(
            parent(),
            [option(1, ""), option(2, "Question explanation"), option(3, "")],
        )

        self.assertEqual(decision.status, "planned_question")
        self.assertEqual(decision.resolution.question_explanation, "Question explanation")
        self.assertEqual(decision.option_ids_to_clear, (2,))

    def test_plans_option_scope_without_clearing_options(self):
        decision = decide_backfill(
            parent(),
            [option(1, "First"), option(2, "Second"), option(3, "")],
        )

        self.assertEqual(decision.status, "planned_option")
        self.assertEqual(decision.option_ids_to_clear, ())

    def test_recognizes_already_backfilled_question(self):
        decision = decide_backfill(
            parent(explanation="Question explanation"),
            [option(1, ""), option(2, "")],
        )

        self.assertEqual(decision.status, "existing_question")

    def test_rejects_mixed_parent_and_option_data(self):
        with self.assertRaisesRegex(ValueError, "both parent and option"):
            decide_backfill(
                parent(explanation="Question explanation"),
                [option(1, "Option explanation"), option(2, "")],
            )


if __name__ == "__main__":
    unittest.main()
