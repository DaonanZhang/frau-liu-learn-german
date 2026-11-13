import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import call_command
from django.test import SimpleTestCase

from apps.exam_preparation.management.commands import generate_speaking_audio as audio_command
from apps.exam_preparation import speaking_audio


class GenerateSpeakingAudioTests(SimpleTestCase):
    def test_exact_filters_overwrite_only_selected_exercise_and_keep_full_manifest(self):
        selected = SimpleNamespace(
            exercise_base=SimpleNamespace(
                exam_type="TELC", exercise_type="SPEAKING_TEIL3", level="B1", external_id="3"
            ),
            content={"dialogue": [{"sequence": 1, "text": "Selected turn"}]},
        )
        unrelated = SimpleNamespace(
            exercise_base=SimpleNamespace(
                exam_type="TELC", exercise_type="SPEAKING_TEIL3", level="B1", external_id="4"
            ),
            content={"dialogue": [{"sequence": 1, "text": "Unrelated turn"}]},
        )
        fake_queryset = SimpleNamespace(iterator=lambda: iter([selected, unrelated]))
        fake_manager = SimpleNamespace(
            select_related=lambda *_: SimpleNamespace(order_by=lambda *_: fake_queryset)
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.object(audio_command, "OUTPUT_DIR", root),
                patch.object(speaking_audio, "SPEAKING_AUDIO_ROOT", root),
                patch.object(audio_command.SpeakingTeilExercise, "objects", fake_manager),
                patch.object(audio_command, "synthesize", return_value=b"new audio") as synth,
                patch.dict("os.environ", {
                    "AZURE_SPEECH_KEY": "test-key", "AZURE_SPEECH_REGION": "westeurope"
                }),
            ):
                selected_path = speaking_audio.speaking_turn_audio_path(
                    exercise_type="SPEAKING_TEIL3", exam_type="TELC", level="B1", external_id="3", sequence=1
                )
                unrelated_path = speaking_audio.speaking_turn_audio_path(
                    exercise_type="SPEAKING_TEIL3", exam_type="TELC", level="B1", external_id="4", sequence=1
                )
                selected_path.parent.mkdir(parents=True, exist_ok=True)
                unrelated_path.parent.mkdir(parents=True, exist_ok=True)
                selected_path.write_bytes(b"old selected audio")
                unrelated_path.write_bytes(b"keep unrelated audio")

                call_command(
                    "generate_speaking_audio", apply=True, overwrite=True,
                    exam_type="TELC", level="B1", exercise_type="SPEAKING_TEIL3", external_id="3",
                )

                self.assertEqual(synth.call_count, 1)
                self.assertEqual(selected_path.read_bytes(), b"new audio")
                self.assertEqual(unrelated_path.read_bytes(), b"keep unrelated audio")
                turns = json.loads((root / "manifest.json").read_text())["turns"]
                self.assertIn("TELC|B1|SPEAKING_TEIL3|3|1", turns)
                self.assertIn("TELC|B1|SPEAKING_TEIL3|4|1", turns)

    def test_creates_one_turn_file_inside_each_teil_directory(self):
        first = SimpleNamespace(
            exercise_base=SimpleNamespace(
                exam_type="TELC", exercise_type="SPEAKING_TEIL1", level="B1", external_id="1"
            ),
            content={"dialogue": [
                {"sequence": 1, "text": "Guten Tag!"},
                {"sequence": 2, "text": "Wie geht es dir?"},
            ]},
        )
        second = SimpleNamespace(
            exercise_base=SimpleNamespace(
                exam_type="TELC", exercise_type="SPEAKING_TEIL3", level="B1", external_id="1"
            ),
            content={"dialogue": [{"sequence": 1, "text": "Guten Tag!"}]},
        )
        third = SimpleNamespace(
            exercise_base=SimpleNamespace(
                exam_type="TELC", exercise_type="SPEAKING_TEIL1", level="B2", external_id="1"
            ),
            content={"dialogue": [{"sequence": 1, "text": "Guten Morgen!"}]},
        )
        fake_queryset = SimpleNamespace(iterator=lambda: iter([first, second, third]))
        fake_manager = SimpleNamespace(
            select_related=lambda *_: SimpleNamespace(order_by=lambda *_: fake_queryset)
        )
        with tempfile.TemporaryDirectory() as directory:
            with (
                patch.object(audio_command, "OUTPUT_DIR", Path(directory)),
                patch.object(speaking_audio, "SPEAKING_AUDIO_ROOT", Path(directory)),
                patch.object(audio_command.SpeakingTeilExercise, "objects", fake_manager),
                patch.object(audio_command, "synthesize", return_value=b"audio") as synth,
                patch.dict("os.environ", {
                    "AZURE_SPEECH_KEY": "test-key", "AZURE_SPEECH_REGION": "westeurope"
                }),
            ):
                call_command("generate_speaking_audio", apply=True)
                manifest = json.loads((Path(directory) / "manifest.json").read_text())
                turns = manifest["turns"]
                self.assertEqual(len(turns), 4)
                self.assertEqual(
                    turns["TELC|B1|SPEAKING_TEIL1|1|1"]["url"],
                    "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil1/B1_1_1.mp3",
                )
                self.assertEqual(
                    turns["TELC|B1|SPEAKING_TEIL3|1|1"]["url"],
                    "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil3/B1_1_1.mp3",
                )
                self.assertEqual(
                    turns["TELC|B2|SPEAKING_TEIL1|1|1"]["url"],
                    "/resources/ExamPreparation/exam_preparation_audio/telc_b2_speaking/teil1/B2_1_1.mp3",
                )
                self.assertTrue((Path(directory) / "telc_b1_speaking" / "teil1" / "B1_1_1.mp3").is_file())
                self.assertTrue((Path(directory) / "telc_b1_speaking" / "teil3" / "B1_1_1.mp3").is_file())
                self.assertTrue((Path(directory) / "telc_b2_speaking" / "teil1" / "B2_1_1.mp3").is_file())
                self.assertEqual(synth.call_count, 4)
                call_command("generate_speaking_audio", apply=True)
                self.assertEqual(synth.call_count, 4)
