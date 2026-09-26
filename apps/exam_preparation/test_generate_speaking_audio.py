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
    def test_creates_one_turn_file_inside_each_teil_directory(self):
        first = SimpleNamespace(
            exercise_base=SimpleNamespace(
                exercise_type="SPEAKING_TEIL1", level="B1", external_id="1"
            ),
            content={"dialogue": [
                {"sequence": 1, "text": "Guten Tag!"},
                {"sequence": 2, "text": "Wie geht es dir?"},
            ]},
        )
        second = SimpleNamespace(
            exercise_base=SimpleNamespace(
                exercise_type="SPEAKING_TEIL3", level="B1", external_id="1"
            ),
            content={"dialogue": [{"sequence": 1, "text": "Guten Tag!"}]},
        )
        fake_queryset = SimpleNamespace(iterator=lambda: iter([first, second]))
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
                self.assertEqual(len(turns), 3)
                self.assertEqual(
                    turns["SPEAKING_TEIL1|B1|1|1"]["url"],
                    "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil1/B1_1_1.mp3",
                )
                self.assertEqual(
                    turns["SPEAKING_TEIL3|B1|1|1"]["url"],
                    "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil3/B1_1_1.mp3",
                )
                self.assertTrue((Path(directory) / "teil1" / "B1_1_1.mp3").is_file())
                self.assertTrue((Path(directory) / "teil3" / "B1_1_1.mp3").is_file())
                self.assertEqual(synth.call_count, 3)
                call_command("generate_speaking_audio", apply=True)
                self.assertEqual(synth.call_count, 3)
