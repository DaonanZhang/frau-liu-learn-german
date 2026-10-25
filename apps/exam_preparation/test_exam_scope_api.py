from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.exam_preparation.models import (
    ClozeChoiceExercise, ClozeMatchingExercise, ExerciseBase, ListeningExercise,
    ReadingAdMatchingExercise, ReadingTitleMatchingExercise,
    ReadingUnderstandingExercise, SpeakingTeilExercise, WritingExercise,
)


LIST_ENDPOINTS = (
    ("exam-prep-listening-exercises-list", ListeningExercise, ExerciseBase.Skill.LISTENING, ExerciseBase.ExerciseType.LISTENING_TEIL1),
    ("exam-prep-reading-title-matching-exercises-list", ReadingTitleMatchingExercise, ExerciseBase.Skill.READING, ExerciseBase.ExerciseType.READING_TITLE_MATCHING),
    ("exam-prep-reading-understanding-exercises-list", ReadingUnderstandingExercise, ExerciseBase.Skill.READING, ExerciseBase.ExerciseType.READING_UNDERSTANDING),
    ("exam-prep-reading-ad-matching-exercises-list", ReadingAdMatchingExercise, ExerciseBase.Skill.READING, ExerciseBase.ExerciseType.READING_AD_MATCHING),
    ("exam-prep-cloze-choice-exercises-list", ClozeChoiceExercise, ExerciseBase.Skill.SPRACHBAUSTEIN, ExerciseBase.ExerciseType.CLOZE_CHOICE),
    ("exam-prep-cloze-matching-exercises-list", ClozeMatchingExercise, ExerciseBase.Skill.SPRACHBAUSTEIN, ExerciseBase.ExerciseType.CLOZE_MATCHING),
    ("exam-prep-writing-exercises-list", WritingExercise, ExerciseBase.Skill.WRITING, ExerciseBase.ExerciseType.WRITING_PROMPT),
    ("exam-prep-speaking-teil-exercises-list", SpeakingTeilExercise, ExerciseBase.Skill.SPEAKING, ExerciseBase.ExerciseType.SPEAKING_TEIL1),
)


class ExerciseScopeApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(telephone="13800138001", password="test")
        cls.ids = {}
        for endpoint_name, exercise_model, skill, exercise_type in LIST_ENDPOINTS:
            cls.ids[endpoint_name] = {}
            for level in ("B1", "B2"):
                base = ExerciseBase.objects.create(
                    exam_type="TELC", level=level, skill=skill,
                    exercise_type=exercise_type, external_id=f"{endpoint_name}-{level}", title=level,
                )
                kwargs = {"exercise_base": base}
                if exercise_model is ListeningExercise:
                    kwargs["listening_type"] = ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP
                elif exercise_model is ReadingUnderstandingExercise:
                    kwargs["text_markdown"] = ""
                elif exercise_model is ClozeChoiceExercise or exercise_model is ClozeMatchingExercise:
                    kwargs["content_with_placeholders"] = ""
                cls.ids[endpoint_name][level] = exercise_model.objects.create(**kwargs).pk
                if exercise_model is SpeakingTeilExercise:
                    cls.ids[endpoint_name][level] = [cls.ids[endpoint_name][level]]
                    for teil, exercise_type in (
                        (2, ExerciseBase.ExerciseType.SPEAKING_TEIL2),
                        (3, ExerciseBase.ExerciseType.SPEAKING_TEIL3),
                    ):
                        speaking_base = ExerciseBase.objects.create(
                            exam_type="TELC", level=level, skill=ExerciseBase.Skill.SPEAKING,
                            exercise_type=exercise_type, external_id=f"speaking-{level}-{teil}",
                            title=f"{level}-{teil}",
                        )
                        cls.ids[endpoint_name][level].append(
                            SpeakingTeilExercise.objects.create(exercise_base=speaking_base).pk
                        )

    def setUp(self):
        self.client.force_authenticate(self.user)

    def test_each_top_level_exercise_list_isolated_by_scope(self):
        for endpoint_name, _, _, _ in LIST_ENDPOINTS:
            with self.subTest(endpoint=endpoint_name):
                url = reverse(endpoint_name)
                default = self.client.get(url)
                b2 = self.client.get(url, {"exam_type": "TELC", "level": "B2"})
                invalid = self.client.get(url, {"exam_type": "", "level": "B2"})
                self.assertEqual(default.status_code, 200)
                expected_b1 = self.ids[endpoint_name]["B1"]
                expected_b2 = self.ids[endpoint_name]["B2"]
                if endpoint_name == "exam-prep-speaking-teil-exercises-list":
                    expected_b1 = set(expected_b1)
                    expected_b2 = set(expected_b2)
                    self.assertEqual({row["id"] for row in default.data}, expected_b1)
                    self.assertEqual({row["id"] for row in b2.data}, expected_b2)
                else:
                    self.assertEqual([row["id"] for row in default.data], [expected_b1])
                    self.assertEqual([row["id"] for row in b2.data], [expected_b2])
                self.assertEqual(invalid.status_code, 400)

    def test_detail_respects_explicit_exam_scope(self):
        url = reverse("exam-prep-listening-exercises-detail", args=[self.ids["exam-prep-listening-exercises-list"]["B2"]])
        matching = self.client.get(url, {"exam_type": "TELC", "level": "B2"})
        conflicting = self.client.get(url, {"exam_type": "TELC", "level": "B1"})

        self.assertEqual(matching.status_code, 200)
        self.assertEqual(matching.data["id"], self.ids["exam-prep-listening-exercises-list"]["B2"])
        self.assertEqual(conflicting.status_code, 404)

    def test_free_trial_allowance_and_permission_are_independent_per_level(self):
        for level in ("B1", "B2"):
            for index in range(2, 5):
                base = ExerciseBase.objects.create(
                    exam_type="TELC",
                    level=level,
                    skill=ExerciseBase.Skill.LISTENING,
                    exercise_type=ExerciseBase.ExerciseType.LISTENING_TEIL1,
                    external_id=f"scope-{level}-{index}",
                    title=f"{level}-{index}",
                )
                ListeningExercise.objects.create(
                    exercise_base=base,
                    listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
                )

        url = reverse("exam-prep-listening-exercises-list")
        b1 = self.client.get(url, {"level": "B1"})
        b2 = self.client.get(url, {"level": "B2"})
        for response in (b1, b2):
            self.assertEqual([item["is_locked"] for item in response.data], [False, False, False, True])
            self.assertEqual([item["show_free_trial_badge"] for item in response.data], [True, True, True, False])

        locked_b2_id = b2.data[3]["id"]
        detail = reverse("exam-prep-listening-exercises-detail", args=[locked_b2_id])
        self.assertEqual(self.client.get(detail).status_code, 403)


class B2ReadingUnderstandingFreeTrialTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13800138002", password="test-password"
        )
        self.exercises = {}
        for external_id in ("1", "2", "3", "6"):
            base = ExerciseBase.objects.create(
                exam_type="TELC",
                level="B2",
                skill=ExerciseBase.Skill.READING,
                exercise_type=ExerciseBase.ExerciseType.READING_UNDERSTANDING,
                external_id=external_id,
                title=f"Reading {external_id}",
            )
            self.exercises[external_id] = ReadingUnderstandingExercise.objects.create(
                exercise_base=base, text_markdown="Text"
            )
        self.client.force_authenticate(self.user)

    def test_b2_reading_understanding_trial_uses_external_id_allowlist(self):
        url = reverse("exam-prep-reading-understanding-exercises-list")
        response = self.client.get(url, {"exam_type": "TELC", "level": "B2"})

        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        by_external_id = {item["exercise_base"]["external_id"]: item for item in results}
        for external_id in ("1", "2", "6"):
            self.assertFalse(by_external_id[external_id]["is_locked"])
            self.assertTrue(by_external_id[external_id]["show_free_trial_badge"])
        self.assertTrue(by_external_id["3"]["is_locked"])
        self.assertFalse(by_external_id["3"]["show_free_trial_badge"])

        free_detail = reverse(
            "exam-prep-reading-understanding-exercises-detail", args=[self.exercises["6"].pk]
        )
        locked_detail = reverse(
            "exam-prep-reading-understanding-exercises-detail", args=[self.exercises["3"].pk]
        )
        self.assertEqual(self.client.get(f"{free_detail}?exam_type=TELC&level=B2").status_code, 200)
        self.assertEqual(self.client.get(f"{locked_detail}?exam_type=TELC&level=B2").status_code, 403)

