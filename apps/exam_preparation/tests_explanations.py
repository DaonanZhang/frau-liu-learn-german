from django.test import TestCase

from apps.exam_preparation.models import (
    ClozeChoiceBlank,
    ClozeChoiceExercise,
    ClozeChoiceOption,
    ExerciseBase,
    ExplanationScope,
    ListeningAnswerOption,
    ListeningExercise,
    ListeningQuestion,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingExercise,
    ReadingUnderstandingQuestion,
)
from scripts.backfill_exam_preparation_explanations import (
    apply_updates,
    collect_updates,
)


class ExplanationBackfillIntegrationTests(TestCase):
    def create_base(self, *, skill: str, exercise_type: str, external_id: str):
        return ExerciseBase.objects.create(
            level=ExerciseBase.Level.B1,
            skill=skill,
            exercise_type=exercise_type,
            external_id=external_id,
            exam_type="telc B1",
        )

    def setUp(self):
        listening_base = self.create_base(
            skill=ExerciseBase.Skill.LISTENING,
            exercise_type=ExerciseBase.ExerciseType.LISTENING_TEIL1,
            external_id="BACKFILL-LISTENING",
        )
        listening_exercise = ListeningExercise.objects.create(
            exercise_base=listening_base
        )
        self.listening_question = ListeningQuestion.objects.create(
            listening_exercise=listening_exercise,
            question_number=1,
            question_type=ListeningQuestion.QuestionType.SINGLE_CHOICE,
            question_text="Question",
        )
        ListeningAnswerOption.objects.create(
            question=self.listening_question,
            option_key="A",
            option_text="First",
            is_correct=False,
            explanation="Question-level explanation",
            sort_order=1,
        )
        ListeningAnswerOption.objects.create(
            question=self.listening_question,
            option_key="B",
            option_text="Second",
            is_correct=True,
            sort_order=2,
        )

        reading_base = self.create_base(
            skill=ExerciseBase.Skill.READING,
            exercise_type=ExerciseBase.ExerciseType.READING_UNDERSTANDING,
            external_id="BACKFILL-READING",
        )
        reading_exercise = ReadingUnderstandingExercise.objects.create(
            exercise_base=reading_base,
            text_markdown="Text",
        )
        self.reading_question = ReadingUnderstandingQuestion.objects.create(
            exercise=reading_exercise,
            question_number=1,
            question_text="Question",
        )
        ReadingUnderstandingAnswerOption.objects.create(
            question=self.reading_question,
            option_key="A",
            option_text="First",
            is_correct=False,
            explanation="First explanation",
            sort_order=1,
        )
        ReadingUnderstandingAnswerOption.objects.create(
            question=self.reading_question,
            option_key="B",
            option_text="Second",
            is_correct=True,
            explanation="Second explanation",
            sort_order=2,
        )

        cloze_base = self.create_base(
            skill=ExerciseBase.Skill.SPRACHBAUSTEIN,
            exercise_type=ExerciseBase.ExerciseType.CLOZE_CHOICE,
            external_id="BACKFILL-CLOZE",
        )
        cloze_exercise = ClozeChoiceExercise.objects.create(
            exercise_base=cloze_base,
            content_with_placeholders="Text {{blank_1}}",
        )
        self.cloze_blank = ClozeChoiceBlank.objects.create(
            exercise=cloze_exercise,
            blank_key="blank_1",
            blank_number=1,
        )
        ClozeChoiceOption.objects.create(
            blank=self.cloze_blank,
            option_key="A",
            option_text="First",
            is_correct=True,
            explanation="Cloze explanation",
            sort_order=1,
        )
        ClozeChoiceOption.objects.create(
            blank=self.cloze_blank,
            option_key="B",
            option_text="Second",
            is_correct=False,
            sort_order=2,
        )

    def test_backfill_moves_single_explanations_and_preserves_multiple(self):
        updates, _ = collect_updates()

        self.assertEqual(len(updates), 3)
        apply_updates(updates)

        self.listening_question.refresh_from_db()
        self.assertEqual(
            self.listening_question.explanation,
            "Question-level explanation",
        )
        self.assertEqual(
            self.listening_question.explanation_scope,
            ExplanationScope.QUESTION,
        )
        self.assertFalse(
            self.listening_question.answer_options.exclude(explanation="").exists()
        )

        self.cloze_blank.refresh_from_db()
        self.assertEqual(self.cloze_blank.explanation, "Cloze explanation")
        self.assertFalse(self.cloze_blank.options.exclude(explanation="").exists())

        self.reading_question.refresh_from_db()
        self.assertEqual(self.reading_question.explanation, "")
        self.assertEqual(
            self.reading_question.explanation_scope,
            ExplanationScope.OPTION,
        )
        self.assertEqual(
            list(
                self.reading_question.answer_options.values_list(
                    "explanation", flat=True
                )
            ),
            ["First explanation", "Second explanation"],
        )

        remaining_updates, _ = collect_updates()
        self.assertEqual(remaining_updates, [])
