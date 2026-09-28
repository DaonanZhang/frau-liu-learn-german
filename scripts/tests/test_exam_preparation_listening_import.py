from pathlib import Path
import sys

from django.test import SimpleTestCase


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from exam_preparation_importer import normalize_listening_script  # noqa: E402
from apps.exam_preparation.models import ListeningExercise  # noqa: E402


class ListeningScriptNormalizationTests(SimpleTestCase):
    def test_teil3_import_rewrites_the_legacy_two_play_instruction(self):
        script = (
            "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. "
            "Sie hören jeden Text zweimal.\n1\nErste Ansage"
        )

        result = normalize_listening_script(
            ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE,
            script,
        )

        self.assertIn("Sie hören jeden Text nur einmal.", result)
        self.assertNotIn("zweimal", result)
        self.assertTrue(result.endswith("1\nErste Ansage"))

    def test_teil2_import_keeps_its_interview_transcript_unchanged(self):
        script = "Kino Freie Filmbühne\nModerator: Guten Tag."

        result = normalize_listening_script(
            ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
            script,
        )

        self.assertEqual(result, script)
