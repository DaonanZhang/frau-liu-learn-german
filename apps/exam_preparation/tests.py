from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Entitlement, Module

from apps.exam_preparation.models import (
    ExerciseBase,
    WritingExampleText,
    WritingExercise,
    SpeakingTeilExercise,
)


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
