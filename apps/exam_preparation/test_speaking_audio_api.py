import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Entitlement, Module
from apps.exam_preparation.models import ExerciseBase, SpeakingTeilExercise
from apps.exam_preparation import speaking_audio


class SpeakingAudioApiTests(APITestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(telephone="13800138999", password="test-password")
        module, _ = Module.objects.get_or_create(
            key="exam_preparation", defaults={"name": "备考季", "is_active": True}
        )
        Entitlement.objects.create(
            user=user, module=module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        base = ExerciseBase.objects.create(
            exam_type="telc", level=ExerciseBase.Level.B1,
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL3,
            external_id="TTS-001", title="Planen",
        )
        self.exercise = SpeakingTeilExercise.objects.create(
            exercise_base=base,
            content={
                "teil": "3",
                "dialogue": [{"sequence": 1, "role": "TN1", "text": "Hallo!"}],
                "sections": [{"type": "Begrüßung", "turns": [
                    {"sequence": 1, "role": "TN1", "text": "Hallo!"}
                ]}],
            },
        )
        self.client.force_authenticate(user)

    def test_detail_requires_audio_url_stored_in_database(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "manifest.json"
            url = "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/sample.mp3"
            manifest_path.write_text(json.dumps({"turns": {
                "SPEAKING_TEIL3|B1|TTS-001|1": {"text": "Hallo!", "url": url}
            }}), encoding="utf-8")
            with patch.object(speaking_audio, "MANIFEST_PATH", manifest_path):
                detail_url = reverse(
                    "exam-prep-speaking-teil-exercises-detail", kwargs={"pk": self.exercise.pk}
                )
                detail = self.client.get(detail_url)
                self.assertEqual(detail.status_code, status.HTTP_200_OK)
                self.assertEqual(detail.data["content"]["dialogue"][0]["audio_url"], "")
                self.assertEqual(detail.data["content"]["sections"][0]["turns"][0]["audio_url"], "")

                turn_url = reverse(
                    "exam-prep-speaking-teil-exercises-turn-audio",
                    kwargs={"pk": self.exercise.pk, "sequence": 1},
                )
                response = self.client.get(turn_url)
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
                missing = self.client.get(reverse(
                    "exam-prep-speaking-teil-exercises-turn-audio",
                    kwargs={"pk": self.exercise.pk, "sequence": 2},
                ))
                self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

                self.exercise.content["dialogue"][0]["text"] = "Neuer Text"
                self.exercise.save(update_fields=["content"])
                stale = self.client.get(turn_url)
                self.assertEqual(stale.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_prefers_turn_audio_url_stored_in_database(self):
        url = "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil3/B1_TTS-001_1.mp3"
        self.exercise.content["dialogue"][0]["audio_url"] = url
        self.exercise.content["sections"][0]["turns"][0]["audio_url"] = url
        self.exercise.save(update_fields=["content"])
        with patch.object(speaking_audio, "MANIFEST_PATH", Path("/missing/manifest.json")):
            detail = self.client.get(
                reverse("exam-prep-speaking-teil-exercises-detail", kwargs={"pk": self.exercise.pk})
            )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["content"]["dialogue"][0]["audio_url"], url)
