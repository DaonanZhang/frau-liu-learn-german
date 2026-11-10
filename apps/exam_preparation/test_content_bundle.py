from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.exam_preparation.models import (
    ExerciseBase,
    ListeningAnswerOption,
    ListeningExercise,
    ListeningQuestion,
)


class TelcC1ContentBundleTests(TestCase):
    def setUp(self):
        self.base = ExerciseBase.objects.create(
            exam_type="TELC",
            level="C1",
            skill=ExerciseBase.Skill.LISTENING,
            exercise_type=ExerciseBase.ExerciseType.LISTENING_TEIL1,
            external_id="009",
            title="C1 hören",
            creation_method=ExerciseBase.CreationMethod.XLSX_IMPORT,
        )
        listening = ListeningExercise.objects.create(
            exercise_base=self.base,
            audio_file_identifier="c1-009",
            audio_file_url="https://audio.example/c1-009.mp3",
            script="Moderator: Willkommen.",
            content={"speakers": ["Moderator"]},
        )
        question = ListeningQuestion.objects.create(
            listening_exercise=listening,
            question_number=1,
            question_key="q-1",
            question_type=ListeningQuestion.QuestionType.SINGLE_CHOICE,
            question_text="Welche Aussage stimmt?",
            explanation="Die erste Aussage ist richtig.",
        )
        ListeningAnswerOption.objects.create(
            question=question,
            option_key="a",
            option_text="Antwort A",
            is_correct=True,
            sort_order=1,
        )
        self.b1 = ExerciseBase.objects.create(
            exam_type="TELC",
            level="B1",
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL1,
            external_id="009",
            title="Keep B1",
        )

    def _export(self, directory: str) -> Path:
        path = Path(directory) / "telc_c1.json"
        call_command("export_telc_c1_content", output=str(path))
        return path

    def test_round_trip_restores_content_and_keeps_unlisted_records(self):
        with TemporaryDirectory() as directory:
            path = self._export(directory)
            bundle = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(bundle["counts"]["exercises"], 1)
            self.assertNotIn("id", bundle["exercises"][0]["base"])

            self.base.title = "changed"
            self.base.save(update_fields=["title"])
            extra = ExerciseBase.objects.create(
                exam_type="TELC",
                level="C1",
                skill=ExerciseBase.Skill.SPEAKING,
                exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL1,
                external_id="extra",
                title="Keep extra",
            )

            call_command("import_telc_c1_content", str(path), apply=True)

        self.base.refresh_from_db()
        self.assertEqual(self.base.title, "C1 hören")
        self.assertEqual(self.base.listening_exercise.questions.get().answer_options.get().option_text, "Antwort A")
        self.assertTrue(ExerciseBase.objects.filter(pk=extra.pk, title="Keep extra").exists())
        self.assertTrue(ExerciseBase.objects.filter(pk=self.b1.pk, title="Keep B1").exists())

    def test_dry_run_rolls_back_all_changes(self):
        with TemporaryDirectory() as directory:
            path = self._export(directory)
            self.base.delete()
            call_command("import_telc_c1_content", str(path))

        self.assertFalse(ExerciseBase.objects.filter(level="C1", external_id="009").exists())

    def test_rejects_non_c1_bundle(self):
        with TemporaryDirectory() as directory:
            path = self._export(directory)
            bundle = json.loads(path.read_text(encoding="utf-8"))
            bundle["scope"]["level"] = "B2"
            path.write_text(json.dumps(bundle), encoding="utf-8")
            with self.assertRaisesMessage(CommandError, "Bundle scope must be TELC/C1"):
                call_command("import_telc_c1_content", str(path), apply=True)
