from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from backfill_reading_understanding_explanations import (  # noqa: E402
    resolve_option_explanation_move,
)
from exam_preparation_importer import (  # noqa: E402
    ImportErrorWithContext,
    resolve_correct_answer_explanation,
)


def xlsx_row(*, correct: bool, explanation: str) -> dict[str, str]:
    return {
        "is_correct": "true" if correct else "false",
        "explanation": explanation,
    }


def database_option(
    pk: int,
    key: str,
    *,
    correct: bool,
    explanation: str,
) -> SimpleNamespace:
    return SimpleNamespace(
        pk=pk,
        option_key=key,
        is_correct=correct,
        explanation=explanation,
    )


class ResolveCorrectAnswerExplanationTests(unittest.TestCase):
    def test_uses_explanation_already_attached_to_correct_answer(self):
        rows = [
            xlsx_row(correct=False, explanation="Explanation for another option"),
            xlsx_row(correct=True, explanation="Correct explanation"),
        ]

        result = resolve_correct_answer_explanation(rows, context="test question")

        self.assertEqual(result, "Correct explanation")

    def test_recovers_one_explanation_from_another_option(self):
        rows = [
            xlsx_row(correct=False, explanation="Group explanation"),
            xlsx_row(correct=True, explanation=""),
            xlsx_row(correct=False, explanation=""),
        ]

        result = resolve_correct_answer_explanation(rows, context="test question")

        self.assertEqual(result, "Group explanation")

    def test_returns_empty_when_workbook_has_no_explanation(self):
        rows = [
            xlsx_row(correct=False, explanation=""),
            xlsx_row(correct=True, explanation=""),
        ]

        result = resolve_correct_answer_explanation(rows, context="test question")

        self.assertEqual(result, "")

    def test_rejects_ambiguous_explanations(self):
        rows = [
            xlsx_row(correct=False, explanation="First explanation"),
            xlsx_row(correct=True, explanation=""),
            xlsx_row(correct=False, explanation="Second explanation"),
        ]

        with self.assertRaisesRegex(ImportErrorWithContext, "multiple explanations"):
            resolve_correct_answer_explanation(rows, context="test question")


class ResolveDatabaseExplanationMoveTests(unittest.TestCase):
    def test_plans_a_unique_explanation_move(self):
        options = [
            database_option(1, "A", correct=False, explanation="Explanation"),
            database_option(2, "B", correct=True, explanation=""),
            database_option(3, "C", correct=False, explanation=""),
        ]

        status, move = resolve_option_explanation_move(options, context="test question")

        self.assertEqual(status, "planned")
        self.assertEqual(move.correct_option_id, 2)
        self.assertEqual(move.source_option_ids, (1,))
        self.assertEqual(move.explanation, "Explanation")

    def test_does_not_touch_question_when_correct_option_has_explanation(self):
        options = [
            database_option(1, "A", correct=False, explanation="Other explanation"),
            database_option(2, "B", correct=True, explanation="Correct explanation"),
        ]

        status, move = resolve_option_explanation_move(options, context="test question")

        self.assertEqual(status, "existing")
        self.assertIsNone(move)

    def test_reports_question_with_no_explanation(self):
        options = [
            database_option(1, "A", correct=False, explanation=""),
            database_option(2, "B", correct=True, explanation=""),
        ]

        status, move = resolve_option_explanation_move(options, context="test question")

        self.assertEqual(status, "missing")
        self.assertIsNone(move)

    def test_rejects_multiple_different_misplaced_explanations(self):
        options = [
            database_option(1, "A", correct=False, explanation="First"),
            database_option(2, "B", correct=True, explanation=""),
            database_option(3, "C", correct=False, explanation="Second"),
        ]

        with self.assertRaisesRegex(ValueError, "different explanations"):
            resolve_option_explanation_move(options, context="test question")

    def test_rejects_multiple_correct_options(self):
        options = [
            database_option(1, "A", correct=True, explanation="First"),
            database_option(2, "B", correct=True, explanation="Second"),
        ]

        with self.assertRaisesRegex(ValueError, "exactly one correct option"):
            resolve_option_explanation_move(options, context="test question")


if __name__ == "__main__":
    unittest.main()
