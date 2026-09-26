import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.exam_preparation.models import ExerciseBase, SpeakingTeilExercise
from apps.exam_preparation.management.commands import migrate_speaking_audio as migration_command


class SpeakingAudioMigrationTests(TestCase):
    def test_legacy_speaking_url_resolves_from_legacy_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "telc_b1_speaking"
            legacy_root = Path(directory) / "speaking"
            with patch.object(migration_command, "LEGACY_SPEAKING_AUDIO_ROOT", legacy_root):
                resolved = migration_command._path_from_url(
                    root,
                    "/resources/ExamPreparation/exam_preparation_audio/speaking/old.mp3",
                )
            self.assertEqual(resolved, legacy_root / "old.mp3")

    def test_converts_labeled_legacy_dialogue_text_to_turns(self):
        base = ExerciseBase.objects.create(
            exam_type="telc", level=ExerciseBase.Level.B1, skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL1, external_id="whole-9", title="Thema",
        )
        exercise = SpeakingTeilExercise.objects.create(
            exercise_base=base,
            content={"dialogue": "TN1: Hallo!\nTN2: Guten Tag!"},
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"turns": {}}), encoding="utf-8")

            def fake_generate(**kwargs):
                target = root / "teil1" / f"B1_whole-9_{kwargs['sequence']}.mp3"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"generated")
                return f"/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil1/{target.name}"

            with (
                patch.object(migration_command, "SPEAKING_AUDIO_ROOT", root),
                patch.object(migration_command, "MANIFEST_PATH", manifest),
                patch.object(migration_command, "ensure_speaking_turn_audio", side_effect=fake_generate),
                patch.dict("os.environ", {"AZURE_SPEECH_KEY": "key", "AZURE_SPEECH_REGION": "westeurope"}),
            ):
                call_command("migrate_speaking_audio", apply=True)

        exercise.refresh_from_db()
        self.assertEqual(
            exercise.content["dialogue"],
            [
                {"sequence": 1, "role": "TN1", "text": "Hallo!", "audio_url": "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil1/B1_whole-9_1.mp3"},
                {"sequence": 2, "role": "TN2", "text": "Guten Tag!", "audio_url": "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil1/B1_whole-9_2.mp3"},
            ],
        )

    def test_rejects_plain_undivided_dialogue_text_instead_of_guessing_turns(self):
        base = ExerciseBase.objects.create(
            exam_type="telc", level=ExerciseBase.Level.B1, skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL1, external_id="plain-9", title="Thema",
        )
        SpeakingTeilExercise.objects.create(
            exercise_base=base,
            content={"dialogue": "Hallo! Guten Tag!"},
        )
        with self.assertRaises(CommandError):
            call_command("migrate_speaking_audio")

    def test_migrates_legacy_manifest_audio_into_teil_folder_and_stores_urls(self):
        base = ExerciseBase.objects.create(
            exam_type="telc",
            level=ExerciseBase.Level.B1,
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL2,
            external_id="legacy-7",
            title="Thema",
        )
        exercise = SpeakingTeilExercise.objects.create(
            exercise_base=base,
            content={
                "teil": "2",
                "dialogue": [{"sequence": 1, "role": "TN1", "text": "Hallo!"}],
                "sections": [{"type": "Dialog", "turns": [
                    {"sequence": 1, "role": "TN1", "text": "Hallo!"},
                ]}],
            },
        )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy_file = root / "legacy-hash.mp3"
            legacy_file.write_bytes(b"legacy audio")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"turns": {
                "SPEAKING_TEIL2|B1|legacy-7|1": {
                    "text": "Hallo!",
                    "url": "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/legacy-hash.mp3",
                },
            }}), encoding="utf-8")
            with (
                patch.object(migration_command, "SPEAKING_AUDIO_ROOT", root),
                patch.object(migration_command, "MANIFEST_PATH", manifest),
            ):
                call_command("migrate_speaking_audio", apply=True)

            target = root / "teil2" / "B1_legacy-7_1.mp3"
            self.assertEqual(target.read_bytes(), b"legacy audio")
            exercise.refresh_from_db()
            self.assertEqual(
                exercise.content["dialogue"][0]["audio_url"],
                "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil2/B1_legacy-7_1.mp3",
            )
            self.assertEqual(
                exercise.content["sections"][0]["turns"][0]["audio_url"],
                exercise.content["dialogue"][0]["audio_url"],
            )
            migrated_manifest = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(
                migrated_manifest["turns"]["SPEAKING_TEIL2|B1|legacy-7|1"]["url"],
                exercise.content["dialogue"][0]["audio_url"],
            )

    def test_apply_generates_audio_when_legacy_file_is_missing(self):
        base = ExerciseBase.objects.create(
            exam_type="telc", level=ExerciseBase.Level.B1, skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL1, external_id="new-8", title="Thema",
        )
        exercise = SpeakingTeilExercise.objects.create(
            exercise_base=base,
            content={"dialogue": [{"sequence": 1, "role": "TN1", "text": "Guten Tag!"}]},
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"turns": {}}), encoding="utf-8")

            def fake_generate(**kwargs):
                target = root / "teil1" / "B1_new-8_1.mp3"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"generated")
                return "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil1/B1_new-8_1.mp3"

            with (
                patch.object(migration_command, "SPEAKING_AUDIO_ROOT", root),
                patch.object(migration_command, "MANIFEST_PATH", manifest),
                patch.object(migration_command, "ensure_speaking_turn_audio", side_effect=fake_generate),
                patch.dict("os.environ", {"AZURE_SPEECH_KEY": "key", "AZURE_SPEECH_REGION": "westeurope"}),
            ):
                call_command("migrate_speaking_audio", apply=True)

            exercise.refresh_from_db()
            self.assertEqual(exercise.content["dialogue"][0]["audio_url"].rsplit("/", 1)[-1], "B1_new-8_1.mp3")
