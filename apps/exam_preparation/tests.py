from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Entitlement, Module

from apps.exam_preparation.models import (
    ExerciseBase,
    WritingExampleText,
    WritingExercise,
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
