from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Entitlement, Module

from apps.exam_preparation.models import (
    ClozeChoiceExercise,
    ClozeMatchingExercise,
    ExerciseBase,
    ListeningExercise,
    ListeningQuestion,
    MockExamPaper,
    MockExamShare,
    ReadingAdMatchingExercise,
    ReadingTitleMatchingExercise,
    ReadingUnderstandingExercise,
    SavedMockExam,
    WritingExampleText,
    WritingExercise,
    SpeakingTeilExercise,
    UserListeningQuestionState,
)
from apps.exam_preparation.serializers import (
    ClozeChoiceBlankDetailSerializer,
    ListeningQuestionDetailSerializer,
    ReadingUnderstandingQuestionDetailSerializer,
)


class QuestionLevelExplanationSerializerTests(SimpleTestCase):
    def test_detail_serializers_expose_explanation_scope(self):
        for serializer_class in (
            ListeningQuestionDetailSerializer,
            ReadingUnderstandingQuestionDetailSerializer,
            ClozeChoiceBlankDetailSerializer,
        ):
            fields = serializer_class().fields
            self.assertIn("explanation", fields)
            self.assertIn("explanation_scope", fields)


class WritingExampleTextFavoriteApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13800138001",
            password="test-password",
        )
        self.other_user = get_user_model().objects.create_user(
            telephone="13800138002",
            password="test-password",
        )
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            name="备考季",
            is_active=True,
        )
        for user in (self.user, self.other_user):
            Entitlement.objects.create(
                user=user,
                module=self.module,
                season=None,
                plan=Entitlement.Plan.MONTH_1,
                status=Entitlement.Status.ACTIVE,
            )
        self.exercise_base = ExerciseBase.objects.create(
            exam_type="telc B1",
            level=ExerciseBase.Level.B1,
            skill=ExerciseBase.Skill.WRITING,
            exercise_type=ExerciseBase.ExerciseType.WRITING_PROMPT,
            external_id="SCHREIBEN-TEIL-1-001",
            title="Eine Einladung absagen",
        )
        self.exercise = WritingExercise.objects.create(
            exercise_base=self.exercise_base,
            request_text="Schreiben Sie eine E-Mail.",
            task_text="Entschuldigen Sie sich und nennen Sie einen Grund.",
        )
        self.example_one = WritingExampleText.objects.create(
            writing_exercise=self.exercise,
            label="Beispieltext 1",
            note="Formell",
            example_text="Sehr geehrte Frau Müller, leider kann ich nicht kommen.",
            sort_order=0,
        )
        self.example_two = WritingExampleText.objects.create(
            writing_exercise=self.exercise,
            label="Beispieltext 2",
            example_text="Liebe Anna, vielen Dank für deine Einladung.",
            sort_order=1,
        )
        self.state_url = reverse("exam-prep-user-writing-example-text-states-list")
        self.favorite_questions_url = reverse("exam-prep-favorite-questions-list")

    def test_examples_can_be_favorited_independently_and_listed(self):
        self.client.force_authenticate(self.user)

        for example in (self.example_one, self.example_two):
            response = self.client.post(
                self.state_url,
                {"example_text": example.pk, "is_favorited": True},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.get(self.favorite_questions_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            {item["target_id"] for item in response.data["results"]},
            {self.example_one.pk, self.example_two.pk},
        )
        self.assertTrue(all(item["state_type"] == "writing_example_text" for item in response.data["results"]))
        self.assertTrue(all(item["skill"] == ExerciseBase.Skill.WRITING for item in response.data["results"]))

    def test_unfavorite_updates_one_example_without_affecting_the_other(self):
        self.client.force_authenticate(self.user)
        for example in (self.example_one, self.example_two):
            self.client.post(
                self.state_url,
                {"example_text": example.pk, "is_favorited": True},
                format="json",
            )

        response = self.client.post(
            self.state_url,
            {"example_text": self.example_one.pk, "is_favorited": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.get(self.favorite_questions_url)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["target_id"], self.example_two.pk)

    def test_state_list_is_scoped_to_the_current_user(self):
        self.client.force_authenticate(self.other_user)
        self.client.post(
            self.state_url,
            {"example_text": self.example_one.pk, "is_favorited": True},
            format="json",
        )

        self.client.force_authenticate(self.user)
        response = self.client.get(
            self.state_url,
            {"example_text__writing_exercise": self.exercise.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        states = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        self.assertEqual(states, [])

    def test_writing_state_persists_time_spent_seconds(self):
        self.client.force_authenticate(self.user)
        state_url = reverse("exam-prep-user-writing-exercise-states-list")

        response = self.client.post(
            state_url,
            {
                "exercise": self.exercise.pk,
                "answer_payload": {"text": "Meine Antwort", "is_checked": True},
                "time_spent_seconds": 325,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["time_spent_seconds"], 325)

        response = self.client.get(state_url, {"exercise": self.exercise.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        states = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        self.assertEqual(states[0]["time_spent_seconds"], 325)


class SpeakingTurnFavoriteApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(telephone="13800138009", password="test-password")
        module, _ = Module.objects.get_or_create(key="exam_preparation", defaults={"name": "备考季", "is_active": True})
        Entitlement.objects.create(user=self.user, module=module, plan=Entitlement.Plan.MONTH_1, status=Entitlement.Status.ACTIVE)
        base = ExerciseBase.objects.create(
            exam_type="telc",
            level=ExerciseBase.Level.B1,
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL2,
            external_id="SPEAKING-T2-001",
            title="Gespräch",
        )
        self.exercise = SpeakingTeilExercise.objects.create(
            exercise_base=base,
            content={"teil": "2", "dialogue": [{"sequence": 1, "role": "TN1", "text": "Hallo"}]},
        )
        self.client.force_authenticate(self.user)

    def test_turns_can_be_favorited_independently_and_listed(self):
        state_url = reverse("exam-prep-user-speaking-turn-states-list")
        response = self.client.post(
            state_url,
            {"exercise": self.exercise.pk, "turn_key": "turn:1", "is_favorited": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        favorites = self.client.get(reverse("exam-prep-favorite-questions-list"))
        self.assertEqual(favorites.status_code, status.HTTP_200_OK)
        self.assertEqual(favorites.data["results"][0]["state_type"], "speaking_turn")
        self.assertEqual(favorites.data["results"][0]["question_text"], "Hallo")
        self.assertEqual(favorites.data["results"][0]["turn_key"], "turn:1")

    def test_dialogue_order_result_is_persisted_and_updated(self):
        state_url = reverse("exam-prep-user-speaking-turn-states-list")
        payload = {
            "exercise": self.exercise.pk,
            "turn_key": "dialogue-order:all",
            "answer_payload": {
                "ordered_turn_keys": ["turn:1"],
                "is_checked": True,
            },
            "is_correct": True,
        }

        created = self.client.post(state_url, payload, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        payload["answer_payload"] = {
            "ordered_turn_keys": [],
            "is_checked": False,
        }
        payload["is_correct"] = None
        updated = self.client.post(state_url, payload, format="json")
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        response = self.client.get(state_url, {"exercise": self.exercise.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        states = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        order_state = next(item for item in states if item["turn_key"] == "dialogue-order:all")
        self.assertEqual(order_state["answer_payload"]["ordered_turn_keys"], [])
        self.assertFalse(order_state["answer_payload"]["is_checked"])
        self.assertIsNone(order_state["is_correct"])


class ExamPreparationPermissionTests(APITestCase):
    def setUp(self):
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            name="备考季",
            is_active=True,
        )
        self.user = get_user_model().objects.create_user(
            telephone="13800138004",
            password="test-password",
        )
        self.url = reverse("exam-prep-exercise-bases-list")

    def test_anonymous_and_unentitled_users_cannot_read_exam_content(self):
        anonymous = self.client.get(self.url)
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.user)
        unentitled = self.client.get(self.url)
        self.assertEqual(unentitled.status_code, status.HTTP_403_FORBIDDEN)

    def test_entitled_user_can_read_but_cannot_modify_exam_content(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.client.force_authenticate(self.user)

        read_response = self.client.get(self.url)
        self.assertEqual(read_response.status_code, status.HTTP_200_OK)

        write_response = self.client.post(
            self.url,
            {
                "exam_type": "telc B1",
                "level": ExerciseBase.Level.B1,
                "skill": ExerciseBase.Skill.READING,
                "exercise_type": ExerciseBase.ExerciseType.READING_UNDERSTANDING,
                "external_id": "FORBIDDEN-WRITE",
                "title": "Must not be created",
            },
            format="json",
        )
        self.assertEqual(write_response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(COMING_SOON=True)
    def test_mock_exam_coming_soon_does_not_block_existing_exam_content(self):
        existing_user = get_user_model().objects.create_user(
            telephone="11223344551",
            password="test-password",
        )
        Entitlement.objects.create(
            user=existing_user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.client.force_authenticate(existing_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @override_settings(COMING_SOON=True)
    def test_preview_user_can_also_read_existing_exam_content(self):
        preview_user = get_user_model().objects.create_user(
            telephone="110",
            password="test-password",
        )
        Entitlement.objects.create(
            user=preview_user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.client.force_authenticate(preview_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ExamPreparationFreeTrialTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13800138005",
            password="test-password",
        )
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            name="备考季",
            is_active=True,
        )
        self.exercises = []
        for index in range(1, 5):
            exercise_base = ExerciseBase.objects.create(
                exam_type="telc B1",
                level=ExerciseBase.Level.B1,
                skill=ExerciseBase.Skill.WRITING,
                exercise_type=ExerciseBase.ExerciseType.WRITING_PROMPT,
                external_id=f"TRIAL-WRITING-{index}",
                title=f"Writing {index}",
            )
            self.exercises.append(
                WritingExercise.objects.create(
                    exercise_base=exercise_base,
                    request_text=f"Request {index}",
                    task_text=f"Task {index}",
                )
            )
        self.list_url = reverse("exam-prep-writing-exercises-list")
        self.state_url = reverse("exam-prep-user-writing-exercise-states-list")
        self.client.force_authenticate(self.user)

    def test_unentitled_user_sees_three_unlocked_cards_and_masked_locked_cards(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        self.assertEqual(
            [item["is_locked"] for item in results],
            [False, False, False, True],
        )
        self.assertEqual(
            [item["show_free_trial_badge"] for item in results],
            [True, True, True, False],
        )
        self.assertEqual(results[3]["request_text"], "")
        self.assertEqual(results[3]["task_text"], "")

    def test_unentitled_user_cannot_bypass_locked_detail_or_state_api(self):
        free_detail_url = reverse(
            "exam-prep-writing-exercises-detail",
            args=[self.exercises[0].pk],
        )
        locked_detail_url = reverse(
            "exam-prep-writing-exercises-detail",
            args=[self.exercises[3].pk],
        )

        self.assertEqual(self.client.get(free_detail_url).status_code, status.HTTP_200_OK)
        locked_response = self.client.get(locked_detail_url)
        self.assertEqual(locked_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            locked_response.data["code"],
            "exam_preparation_purchase_required",
        )

        free_state = self.client.post(
            self.state_url,
            {"exercise": self.exercises[0].pk, "answer_payload": {"text": "Test"}},
            format="json",
        )
        locked_state = self.client.post(
            self.state_url,
            {"exercise": self.exercises[3].pk, "answer_payload": {"text": "Bypass"}},
            format="json",
        )
        self.assertEqual(free_state.status_code, status.HTTP_201_CREATED)
        self.assertEqual(locked_state.status_code, status.HTTP_403_FORBIDDEN)

    def test_entitlement_unlocks_every_exercise(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )

        response = self.client.get(self.list_url)
        results = response.data.get("results", []) if isinstance(response.data, dict) else response.data
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(all(not item["is_locked"] for item in results))
        self.assertTrue(all(not item["show_free_trial_badge"] for item in results))
        self.assertEqual(results[3]["request_text"], "Request 4")
        locked_detail_url = reverse(
            "exam-prep-writing-exercises-detail",
            args=[self.exercises[3].pk],
        )
        self.assertEqual(self.client.get(locked_detail_url).status_code, status.HTTP_200_OK)

    def test_expired_entitlement_has_same_access_as_unentitled_user(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now() - timedelta(days=31),
            expires_at=timezone.now() - timedelta(days=1),
        )

        response = self.client.get(self.list_url)
        results = response.data.get("results", []) if isinstance(response.data, dict) else response.data

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["is_locked"] for item in results], [False, False, False, True])
        self.assertEqual([item["show_free_trial_badge"] for item in results], [True, True, True, False])
        locked_detail_url = reverse(
            "exam-prep-writing-exercises-detail",
            args=[self.exercises[3].pk],
        )
        self.assertEqual(self.client.get(locked_detail_url).status_code, status.HTTP_403_FORBIDDEN)


class ListeningTranscriptVisibilityTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13800138006",
            password="test-password",
        )
        module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        Entitlement.objects.create(
            user=self.user,
            module=module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        exercise_base = ExerciseBase.objects.create(
            exam_type="telc",
            level=ExerciseBase.Level.B1,
            skill=ExerciseBase.Skill.LISTENING,
            exercise_type=ExerciseBase.ExerciseType.LISTENING_TEIL1,
            external_id="TRANSCRIPT-LISTENING-1",
        )
        self.exercise = ListeningExercise.objects.create(
            exercise_base=exercise_base,
            listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
            script="Das ist das Transkript.",
        )
        self.questions = [
            ListeningQuestion.objects.create(
                listening_exercise=self.exercise,
                question_number=number,
                question_type=ListeningQuestion.QuestionType.SINGLE_CHOICE,
                question_text=f"Frage {number}",
            )
            for number in (1, 2)
        ]
        self.detail_url = reverse("exam-prep-listening-exercises-detail", args=[self.exercise.pk])
        self.client.force_authenticate(self.user)

    def test_script_is_revealed_only_after_every_question_has_been_checked(self):
        self.assertEqual(self.client.get(self.detail_url).data["script"], "")

        UserListeningQuestionState.objects.create(
            user=self.user,
            question=self.questions[0],
            answer_payload={"selected_option_key": "a"},
            is_correct=True,
        )
        self.assertEqual(self.client.get(self.detail_url).data["script"], "")

        UserListeningQuestionState.objects.create(
            user=self.user,
            question=self.questions[1],
            answer_payload={"selected_option_key": "b"},
            is_correct=False,
        )
        self.assertEqual(
            self.client.get(self.detail_url).data["script"],
            "Das ist das Transkript.",
        )


@override_settings(COMING_SOON=False)
class MockExamApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13800138088",
            password="test-password",
        )
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        self.url = reverse("exam-prep-mock-exams-list")
        self.client.force_authenticate(self.user)

    @staticmethod
    def writing_assessment(**overrides):
        assessment = {
            "topic_relevant": True,
            "task_completion": "A",
            "communicative_design": "B",
            "formal_accuracy": "C",
        }
        assessment.update(overrides)
        return assessment

    def create_question_bank(self, *, exam_type="telc", level=ExerciseBase.Level.B1, id_prefix="MOCK"):
        def base(exercise_type, skill):
            return ExerciseBase.objects.create(
                exam_type=exam_type,
                level=level,
                skill=skill,
                exercise_type=exercise_type,
                external_id=f"{id_prefix}-{exercise_type}",
            )

        ReadingTitleMatchingExercise.objects.create(
            exercise_base=base(ExerciseBase.ExerciseType.READING_TITLE_MATCHING, ExerciseBase.Skill.READING)
        )
        ReadingUnderstandingExercise.objects.create(
            exercise_base=base(ExerciseBase.ExerciseType.READING_UNDERSTANDING, ExerciseBase.Skill.READING),
            text_markdown="Text",
        )
        ReadingAdMatchingExercise.objects.create(
            exercise_base=base(ExerciseBase.ExerciseType.READING_AD_MATCHING, ExerciseBase.Skill.READING)
        )
        ClozeChoiceExercise.objects.create(
            exercise_base=base(ExerciseBase.ExerciseType.CLOZE_CHOICE, ExerciseBase.Skill.SPRACHBAUSTEIN),
            content_with_placeholders="Text",
        )
        ClozeMatchingExercise.objects.create(
            exercise_base=base(ExerciseBase.ExerciseType.CLOZE_MATCHING, ExerciseBase.Skill.SPRACHBAUSTEIN),
            content_with_placeholders="Text",
        )
        for exercise_type, listening_type in (
            (ExerciseBase.ExerciseType.LISTENING_TEIL1, ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP),
            (ExerciseBase.ExerciseType.LISTENING_TEIL2, ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE),
            (ExerciseBase.ExerciseType.LISTENING_TEIL3, ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE),
        ):
            ListeningExercise.objects.create(
                exercise_base=base(exercise_type, ExerciseBase.Skill.LISTENING),
                listening_type=listening_type,
                audio_file_url="/resources/test.mp3",
                script=f"Transcript for {exercise_type}",
            )
        WritingExercise.objects.create(
            exercise_base=base(ExerciseBase.ExerciseType.WRITING_PROMPT, ExerciseBase.Skill.WRITING),
            request_text="Anleitung",
            task_text="Aufgabe",
        )

    def test_trial_user_cannot_generate_mock_exam(self):
        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(COMING_SOON=True)
    def test_coming_soon_blocks_mock_exam_for_regular_paid_user(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )

        response = self.client.post(self.url, {}, format="json")
        history_response = self.client.get(reverse("exam-prep-saved-mock-exams-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "mock_exam_coming_soon")
        self.assertEqual(response.data["message"], "模拟考试即将上线，敬请期待。")
        self.assertEqual(history_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(history_response.data["code"], "mock_exam_coming_soon")

    @override_settings(COMING_SOON=True)
    def test_coming_soon_only_allows_110_to_preview_mock_exams(self):
        self.create_question_bank()
        preview_user = get_user_model().objects.create_user(
            telephone="110",
            password="test-password",
        )
        blocked_user = get_user_model().objects.create_user(
            telephone="11223344551",
            password="test-password",
        )
        for user in (preview_user, blocked_user):
            Entitlement.objects.create(
                user=user,
                module=self.module,
                season=None,
                plan=Entitlement.Plan.MONTH_1,
                status=Entitlement.Status.ACTIVE,
            )

        self.client.force_authenticate(preview_user)
        preview_response = self.client.post(self.url, {}, format="json")
        preview_history = self.client.get(reverse("exam-prep-saved-mock-exams-list"))

        self.client.force_authenticate(blocked_user)
        blocked_response = self.client.post(self.url, {}, format="json")
        blocked_history = self.client.get(reverse("exam-prep-saved-mock-exams-list"))

        self.assertEqual(preview_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(preview_history.status_code, status.HTTP_200_OK)
        self.assertEqual(blocked_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked_response.data["code"], "mock_exam_coming_soon")
        self.assertEqual(blocked_history.status_code, status.HTTP_403_FORBIDDEN)

    def test_paid_user_gets_clear_error_when_question_bank_is_incomplete(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["message"], "题库尚不足以生成完整的模拟考试。")
        self.assertEqual(
            set(response.data["missing_parts"]),
            {
                "reading_title_matching",
                "reading_understanding",
                "reading_ad_matching",
                "cloze_choice",
                "cloze_matching",
                "listening_teil1",
                "listening_teil2",
                "listening_teil3",
                "writing",
            },
        )

    def test_paid_user_receives_one_exercise_for_every_written_exam_part(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )

        self.create_question_bank()

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            set(response.data["parts"]),
            {
                "reading_title_matching",
                "reading_understanding",
                "reading_ad_matching",
                "cloze_choice",
                "cloze_matching",
                "listening_teil1",
                "listening_teil2",
                "listening_teil3",
                "writing",
            },
        )
        self.assertEqual(response.data["durations"]["reading_and_cloze"], 90 * 60)
        self.assertEqual(response.data["exam_type"], "telc")
        self.assertEqual(response.data["level"], "B1")
        self.assertEqual(response.data["exam_label"], "telc B1")
        self.assertRegex(response.data["paper_code"], r"^ME-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$")
        attempt = SavedMockExam.objects.get(pk=response.data["attempt_id"])
        self.assertEqual(attempt.paper.code, response.data["paper_code"])
        self.assertEqual(attempt.paper.exercise_selection, response.data["selection"])
        self.assertEqual(attempt.paper.creation_method, MockExamPaper.CreationMethod.RANDOM)
        self.assertFalse(attempt.is_favorite)
        self.assertEqual(attempt.progress["phase"], "reading")
        self.assertEqual(attempt.progress["active_part"], "reading_title_matching")
        self.assertEqual(response.data["progress"], attempt.progress)
        self.assertTrue(
            all(response.data["parts"][key]["script"] == "" for key in (
                "listening_teil1",
                "listening_teil2",
                "listening_teil3",
            ))
        )

    def test_exam_family_and_level_select_an_independent_question_bank(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()
        self.create_question_bank(
            exam_type="TestDaF",
            level=ExerciseBase.Level.B2,
            id_prefix="TESTDAF",
        )

        response = self.client.post(
            self.url,
            {"exam_type": "TestDaF", "level": "B2"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["exam_type"], "TestDaF")
        self.assertEqual(response.data["level"], "B2")
        self.assertTrue(
            all(part["exercise_base"]["level"] == "B2" for part in response.data["parts"].values())
        )

    def test_repeated_create_request_is_idempotent(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()
        payload = {"request_id": "mock-start-12345678"}

        first = self.client.post(self.url, payload, format="json")
        second = self.client.post(self.url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["attempt_id"], second.data["attempt_id"])
        self.assertEqual(first.data["paper_code"], second.data["paper_code"])
        self.assertEqual(first.data["selection"], second.data["selection"])
        self.assertEqual(SavedMockExam.objects.count(), 1)
        self.assertEqual(MockExamPaper.objects.count(), 1)

    def test_separately_generated_papers_get_different_codes_even_with_the_same_questions(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()

        first = self.client.post(self.url, {}, format="json")
        second = self.client.post(self.url, {}, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["selection"], second.data["selection"])
        self.assertNotEqual(first.data["attempt_id"], second.data["attempt_id"])
        self.assertNotEqual(first.data["paper_code"], second.data["paper_code"])
        self.assertEqual(MockExamPaper.objects.count(), 2)

    def test_active_history_and_retake_keep_independent_attempt_records(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()
        generated = self.client.post(self.url, {}, format="json")
        attempt_id = generated.data["attempt_id"]
        list_url = reverse("exam-prep-saved-mock-exams-list")

        active = self.client.get(list_url, {"scope": "active"})
        self.assertEqual([item["id"] for item in active.data["results"]], [attempt_id])
        history_before_completion = self.client.get(list_url, {"scope": "history"})
        self.assertEqual([item["id"] for item in history_before_completion.data["results"]], [attempt_id])
        favorite_before_completion = self.client.patch(
            reverse("exam-prep-saved-mock-exams-detail", args=[attempt_id]),
            {"is_favorite": True},
            format="json",
        )
        self.assertEqual(favorite_before_completion.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.post(
            reverse("exam-prep-saved-mock-exams-submit", args=[attempt_id]),
            {
                "writing_assessment": self.writing_assessment(),
                "progress": {"phase": "results", "deadline": 0},
            },
            format="json",
        )
        history = self.client.get(list_url, {"scope": "history"})
        self.assertEqual([item["id"] for item in history.data["results"]], [attempt_id])

        retaken = self.client.post(
            reverse("exam-prep-saved-mock-exams-retake", args=[attempt_id]),
            {},
            format="json",
        )
        self.assertEqual(retaken.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(retaken.data["id"], attempt_id)
        self.assertEqual(retaken.data["paper_code"], generated.data["paper_code"])
        self.assertEqual(retaken.data["exercise_selection"], generated.data["selection"])
        self.assertEqual(retaken.data["answers"], {})
        self.assertFalse(retaken.data["is_completed"])
        self.assertEqual(retaken.data["progress"]["phase"], "reading")

    def test_saved_exam_stores_ids_and_answers_then_rebuilds_full_exam(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()
        generated = self.client.post(self.url, {}, format="json")
        saved_url = reverse("exam-prep-saved-mock-exams-list")

        created = self.client.post(
            saved_url,
            {
                "exercise_selection": generated.data["selection"],
                "answers": {"reading_understanding:1": "a"},
                "writing_text": "Meine Antwort",
            },
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        stored = SavedMockExam.objects.get(pk=created.data["id"])
        self.assertEqual(stored.exercise_selection, generated.data["selection"])
        self.assertEqual(stored.exam_type, "telc")
        self.assertEqual(stored.level, "B1")
        self.assertNotIn("parts", stored.exercise_selection)
        detail = self.client.get(reverse("exam-prep-saved-mock-exams-detail", args=[stored.pk]))
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(set(detail.data["exam"]["parts"]), set(generated.data["parts"]))
        self.assertEqual(detail.data["answers"], {"reading_understanding:1": "a"})

        updated = self.client.post(
            reverse("exam-prep-saved-mock-exams-submit", args=[stored.pk]),
            {
                "answers": {"reading_understanding:1": "b"},
                "writing_assessment": self.writing_assessment(),
                "is_favorite": True,
                "progress": {"phase": "results", "deadline": 0, "audio_step": 7},
            },
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        stored.refresh_from_db()
        self.assertEqual(stored.answers, {"reading_understanding:1": "b"})
        self.assertTrue(stored.is_completed)
        self.assertTrue(stored.is_favorite)
        self.assertEqual(stored.writing_assessment, self.writing_assessment())
        self.assertEqual(updated.data["writing_score"], 27)
        self.assertEqual(updated.data["total_score"], 27.0)
        self.assertEqual(updated.data["score_percentage"], 12.0)
        self.assertFalse(updated.data["is_passed"])
        self.assertEqual(stored.progress["audio_step"], 7)

        completed_detail = self.client.get(
            reverse("exam-prep-saved-mock-exams-detail", args=[stored.pk])
        )
        self.assertTrue(
            all(completed_detail.data["exam"]["parts"][key]["script"] for key in (
                "listening_teil1",
                "listening_teil2",
                "listening_teil3",
            ))
        )

        history = self.client.get(saved_url, {"scope": "history"})
        favorite = self.client.get(saved_url, {"scope": "favorites"})
        for result in (history.data["results"][0], favorite.data["results"][0]):
            self.assertEqual(result["total_score"], 27.0)
            self.assertEqual(result["score_percentage"], 12.0)
            self.assertFalse(result["is_passed"])

    def test_completed_exam_requires_a_complete_writing_assessment(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()
        generated = self.client.post(self.url, {}, format="json")
        submit_url = reverse("exam-prep-saved-mock-exams-submit", args=[generated.data["attempt_id"]])
        incomplete = self.client.post(
            submit_url,
            {
                "writing_assessment": self.writing_assessment(formal_accuracy=""),
            },
            format="json",
        )
        self.assertEqual(incomplete.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(incomplete.data["message"], "请完成写作自评。")

        off_topic = self.client.post(
            submit_url,
            {"writing_assessment": {"topic_relevant": False}},
            format="json",
        )
        self.assertEqual(off_topic.status_code, status.HTTP_200_OK)
        self.assertEqual(off_topic.data["writing_score"], 0)

    def test_shared_paper_can_start_an_independent_attempt_without_owner_answers(self):
        other_user = get_user_model().objects.create_user(
            telephone="13800138089",
            password="test-password",
        )
        for user in (self.user, other_user):
            Entitlement.objects.create(
                user=user,
                module=self.module,
                season=None,
                plan=Entitlement.Plan.MONTH_1,
                status=Entitlement.Status.ACTIVE,
            )
        self.create_question_bank()
        generated = self.client.post(self.url, {}, format="json")
        attempt_id = generated.data["attempt_id"]
        self.client.patch(
            reverse("exam-prep-saved-mock-exams-detail", args=[attempt_id]),
            {"answers": {"reading_understanding:1": "a"}},
            format="json",
        )

        shared = self.client.post(
            reverse("exam-prep-saved-mock-exams-share", args=[attempt_id]),
            {"share_mode": MockExamShare.ShareMode.PAPER},
            format="json",
        )

        self.assertEqual(shared.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(other_user)
        detail_url = reverse("exam-prep-mock-exam-shares-detail", args=[shared.data["share_code"]])
        detail = self.client.get(detail_url)
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertNotIn("shared_attempt", detail.data)
        started = self.client.post(
            reverse("exam-prep-mock-exam-shares-start", args=[shared.data["share_code"]]),
            {},
            format="json",
        )
        self.assertEqual(started.status_code, status.HTTP_201_CREATED)
        new_attempt = SavedMockExam.objects.get(pk=started.data["attempt_id"])
        self.assertEqual(new_attempt.user, other_user)
        self.assertEqual(new_attempt.paper_id, SavedMockExam.objects.get(pk=attempt_id).paper_id)
        self.assertEqual(new_attempt.answers, {})

    def test_completed_attempt_can_be_shared_with_answers(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()
        generated = self.client.post(self.url, {}, format="json")
        attempt_id = generated.data["attempt_id"]
        share_url = reverse("exam-prep-saved-mock-exams-share", args=[attempt_id])

        rejected = self.client.post(
            share_url,
            {"share_mode": MockExamShare.ShareMode.PAPER_WITH_ANSWERS},
            format="json",
        )
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)

        answers = {"reading_understanding:1": "a"}
        self.client.post(
            reverse("exam-prep-saved-mock-exams-submit", args=[attempt_id]),
            {
                "answers": answers,
                "writing_assessment": self.writing_assessment(),
            },
            format="json",
        )
        shared = self.client.post(
            share_url,
            {"share_mode": MockExamShare.ShareMode.PAPER_WITH_ANSWERS},
            format="json",
        )
        detail = self.client.get(
            reverse("exam-prep-mock-exam-shares-detail", args=[shared.data["share_code"]])
        )

        self.assertEqual(shared.status_code, status.HTTP_201_CREATED)
        self.assertEqual(detail.data["shared_attempt"]["answers"], answers)
        self.assertEqual(detail.data["shared_attempt"]["total_score"], 27.0)

    def test_submit_completes_attempt_and_rejects_later_exam_mutations(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.create_question_bank()
        generated = self.client.post(self.url, {}, format="json")
        detail_url = reverse("exam-prep-saved-mock-exams-detail", args=[generated.data["attempt_id"]])
        submit_url = reverse("exam-prep-saved-mock-exams-submit", args=[generated.data["attempt_id"]])

        direct_completion = self.client.patch(
            detail_url,
            {"writing_assessment": self.writing_assessment(), "is_completed": True},
            format="json",
        )
        self.assertEqual(direct_completion.status_code, status.HTTP_400_BAD_REQUEST)

        submitted = self.client.post(
            submit_url,
            {
                "answers": {"reading_understanding:1": "a"},
                "writing_text": "Meine Antwort",
                "writing_assessment": self.writing_assessment(),
                "progress": {"phase": "results", "deadline": 0},
            },
            format="json",
        )

        self.assertEqual(submitted.status_code, status.HTTP_200_OK)
        self.assertTrue(submitted.data["is_completed"])
        self.assertEqual(submitted.data["answers"], {"reading_understanding:1": "a"})
        self.assertEqual(self.client.post(submit_url, {}, format="json").status_code, status.HTTP_409_CONFLICT)
        stale_autosave = self.client.patch(
            detail_url,
            {"answers": {}, "is_completed": False, "progress": {"phase": "writing"}},
            format="json",
        )
        self.assertEqual(stale_autosave.status_code, status.HTTP_409_CONFLICT)
        stored = SavedMockExam.objects.get(pk=generated.data["attempt_id"])
        self.assertTrue(stored.is_completed)
        self.assertEqual(stored.answers, {"reading_understanding:1": "a"})

    def test_saved_exam_history_is_paginated(self):
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        paper = MockExamPaper.objects.create(
            created_by=self.user,
            exercise_selection={},
        )
        SavedMockExam.objects.bulk_create([
            SavedMockExam(
                user=self.user,
                paper=paper,
                fingerprint=f"history-{index}",
                exercise_selection={},
            )
            for index in range(12)
        ])
        list_url = reverse("exam-prep-saved-mock-exams-list")

        first_page = self.client.get(list_url, {"scope": "history", "page": 1})
        second_page = self.client.get(list_url, {"scope": "history", "page": 2})
        active_preview = self.client.get(list_url, {"scope": "active", "page_size": 3})

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 12)
        self.assertEqual(len(first_page.data["results"]), 10)
        self.assertIsNone(first_page.data["previous"])
        self.assertIsNotNone(first_page.data["next"])
        self.assertEqual(len(second_page.data["results"]), 2)
        self.assertIsNotNone(second_page.data["previous"])
        self.assertIsNone(second_page.data["next"])
        self.assertEqual(active_preview.data["count"], 12)
        self.assertEqual(len(active_preview.data["results"]), 3)
