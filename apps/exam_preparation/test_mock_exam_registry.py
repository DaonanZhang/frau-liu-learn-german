from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase

from apps.exam_preparation.mock_exam.registry import get_mock_exam_rules
from apps.exam_preparation.mock_exam.telc.scoring import calculate_result
from apps.exam_preparation.serializers import ReadingAdMatchingItemDetailSerializer
from apps.exam_preparation.models import (
    ClozeMatchingBlankAnswer,
    ClozeMatchingExercise,
    ClozeMatchingOption,
    ExerciseBase,
    ListeningExercise,
    ReadingAdMatchingAd,
    ReadingAdMatchingExercise,
    ReadingAdMatchingItem,
)


class MockExamRegistryTests(SimpleTestCase):
    def test_only_configured_telc_scopes_resolve_rules(self):
        self.assertIsNotNone(get_mock_exam_rules("TELC", "B1"))
        self.assertIsNotNone(get_mock_exam_rules("TELC", "B2"))
        self.assertIsNotNone(get_mock_exam_rules("TELC", "C1"))
        self.assertIsNone(get_mock_exam_rules("TESTDAF", "B2"))

    def test_version2_marker_matches_importer_prefix_semantics(self):
        from apps.exam_preparation.mock_exam.telc.reading_ad_matching import is_version2_item_text

        self.assertTrue(is_version2_item_text("  ( vErSiOn2 )   Ersatz"))
        self.assertFalse(is_version2_item_text("Frage enthält (Version2)"))


class C1MockExamScoringTests(TestCase):
    def test_c1_listening_teil3_scores_alternative_answers_and_requires_all_components(self):
        base = ExerciseBase.objects.create(
            exam_type="TELC", level="C1", skill=ExerciseBase.Skill.LISTENING,
            exercise_type=ExerciseBase.ExerciseType.LISTENING_TEIL3,
            external_id="score-listening-teil3-alternatives", title="Hören Teil 3",
        )
        listening = ListeningExercise.objects.create(
            exercise_base=base,
            listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
            audio_file_identifier="Teil3_alternatives",
            content={"slides": [{"number": 1, "answers": [
                {"blank_id": "alternative", "answer": "didaktische Spiele <or> therapeutische Spiele"},
                {"blank_id": "components", "answer": "doppelsinnig;lustig"},
            ]}]},
        )
        result = calculate_result(SimpleNamespace(
            paper=SimpleNamespace(level="C1", exercise_selection={"listening_teil3": listening.pk}),
            answers={
                "listening_teil3:note-1-alternative": "THERAPEUTISCHE SPIELE",
                "listening_teil3:note-1-components": "doppelsinnig",
            },
            writing_assessment={}, writing_grade="",
        ))

        self.assertEqual(result["score_breakdown"]["listening_correct"], 1)
        self.assertEqual(result["score_breakdown"]["listening_score"], 2.0)

    def test_c1_reading_ad_variant_selects_six_real_items_and_scores_only_them(self):
        base = ExerciseBase.objects.create(
            exam_type="TELC", level="C1", skill=ExerciseBase.Skill.READING,
            exercise_type=ExerciseBase.ExerciseType.READING_AD_MATCHING,
            external_id="variant-reading", title="Lesen",
        )
        exercise = ReadingAdMatchingExercise.objects.create(exercise_base=base)
        ads = [ReadingAdMatchingAd.objects.create(exercise=exercise, ad_key=f"A{i}", ad_text_markdown="Ad") for i in range(7)]
        items = [ReadingAdMatchingItem.objects.create(
            exercise=exercise, item_number=i + 1,
            item_text="  ( vErSiOn2 )   Ersatz" if i == 6 else f"Frage {i}", correct_ad=ads[i],
        ) for i in range(7)]

        for variant in range(7):
            from apps.exam_preparation.mock_exam.telc.reading_ad_matching import selected_item_ids
            ids = selected_item_ids(ReadingAdMatchingItem.objects.filter(exercise=exercise), variant)
            expected_items = list(items[:6])
            if variant:
                expected_items[variant - 1] = items[6]
            expected = [item.pk for item in expected_items]
            self.assertEqual(ids, expected)
            self.assertEqual(len(ids), 6)
            self.assertEqual(len(set(ids)), 6)

        self.assertTrue(ReadingAdMatchingItemDetailSerializer(items[6]).data["is_version2"])
        result = calculate_result(SimpleNamespace(
            paper=SimpleNamespace(level="C1", exercise_selection={
                "reading_ad_matching": exercise.pk, "reading_ad_matching_variant": 1,
            }),
            answers={f"reading_ad_matching:{item_id}": f"A{next(item.item_number - 1 for item in items if item.pk == item_id)}"
                     for item_id in selected_item_ids(items, 1)},
            writing_assessment={}, writing_grade="",
        ))
        self.assertEqual(result["score_breakdown"]["reading_correct"], 6)

    def test_scores_c1_content_formats_with_official_written_exam_weights(self):
        matching_base = ExerciseBase.objects.create(
            exam_type="TELC", level="C1", skill=ExerciseBase.Skill.READING,
            exercise_type=ExerciseBase.ExerciseType.CLOZE_MATCHING,
            external_id="score-reading-1", title="Lesen 1",
        )
        matching = ClozeMatchingExercise.objects.create(
            exercise_base=matching_base, content_with_placeholders="{{blank_0}} {{blank_1}}"
        )
        example = ClozeMatchingOption.objects.create(
            exercise=matching, option_key="beispiel", option_text="Beispiel", option_order=0
        )
        regular = ClozeMatchingOption.objects.create(
            exercise=matching, option_key="A", option_text="Antwort", option_order=1
        )
        example_answer = ClozeMatchingBlankAnswer.objects.create(
            exercise=matching, blank_key="blank_0", blank_number=0, correct_option=example
        )
        regular_answer = ClozeMatchingBlankAnswer.objects.create(
            exercise=matching, blank_key="blank_1", blank_number=1, correct_option=regular
        )
        listening = {}
        for teil, content in (
            (1, {"format": "speaker_matching", "statements": [{"statement": "A", "speaker": "S1"}]}),
            (3, {"format": "presentation_notes", "slides": [{"number": "1", "answers": [{"blank_id": "a", "answer": "Lernen"}]}]}),
        ):
            base = ExerciseBase.objects.create(
                exam_type="TELC", level="C1", skill=ExerciseBase.Skill.LISTENING,
                exercise_type=getattr(ExerciseBase.ExerciseType, f"LISTENING_TEIL{teil}"),
                external_id=f"score-listening-{teil}", title=f"Hören {teil}",
            )
            listening[teil] = ListeningExercise.objects.create(
                exercise_base=base,
                listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
                audio_file_identifier=f"Teil{teil}_1", content=content,
            )
        instance = SimpleNamespace(
            paper=SimpleNamespace(level="C1", exercise_selection={
                "cloze_matching": matching.id,
                "listening_teil1": listening[1].id,
                "listening_teil3": listening[3].id,
            }),
            answers={
                f"cloze_matching:{example_answer.id}": "beispiel",
                f"cloze_matching:{regular_answer.id}": "A",
                "listening_teil1:statement-1": "S1",
                "listening_teil3:note-1-a": "lernen",
            },
            writing_assessment={
                "topic_relevant": True,
                "task_completion": "A", "communicative_design": "A", "formal_accuracy": "A",
            },
            writing_grade="",
        )

        result = calculate_result(instance)

        self.assertEqual(result["score_breakdown"]["reading_correct"], 1)
        self.assertEqual(result["score_breakdown"]["reading_score"], 2.0)
        self.assertEqual(result["score_breakdown"]["listening_score"], 3.0)
        self.assertEqual(result["score_breakdown"]["writing_score"], 48.0)
        self.assertEqual(float(result["total_score"]), 53.0)
        self.assertEqual(float(result["score_percentage"]), 31.9)
