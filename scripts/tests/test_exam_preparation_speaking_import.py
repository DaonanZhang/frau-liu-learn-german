from pathlib import Path
import sys
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from apps.exam_preparation.models import ExerciseBase
SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
import exam_preparation_importer
from exam_preparation_importer import save_speaking_exercise


class SpeakingImportAudioTests(TestCase):
    def test_import_writes_audio_url_to_dialogue_and_section_turns(self):
        parsed = {
            "level": ExerciseBase.Level.B1,
            "external_id": "7",
            "title": "Thema",
            "exam_type": "telc",
            "is_real_exam": False,
            "instruction": "Sprechen",
            "content": {
                "dialogue": [{"sequence": 1, "text": "Hallo!"}],
                "sections": [{"type": "Dialog", "turns": [
                    {"sequence": 1, "text": "Hallo!"},
                ]}],
            },
        }
        base = SimpleNamespace()
        with (
            patch("exam_preparation_importer.upsert_base", return_value=base),
            patch.object(
                exam_preparation_importer.SpeakingTeilExercise.objects,
                "update_or_create",
            ) as update,
            patch(
                "exam_preparation_importer.ensure_speaking_turn_audio",
                return_value="/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil2/B1_7_1.mp3",
            ),
        ):
            save_speaking_exercise(
                Path("B1_speaking_7.xlsx"),
                parsed,
                ExerciseBase.ExerciseType.SPEAKING_TEIL2,
                generate_speaking_audio=True,
            )
        content = update.call_args.kwargs["defaults"]["content"]
        self.assertEqual(content["dialogue"][0]["audio_url"], content["sections"][0]["turns"][0]["audio_url"])
