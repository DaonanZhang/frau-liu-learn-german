from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

from django.test import SimpleTestCase


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import exam_preparation_importer  # noqa: E402
from exam_preparation_importer import normalize_listening_script, resolve_listening_audio  # noqa: E402
from apps.exam_preparation.models import ListeningExercise  # noqa: E402


class ListeningScriptNormalizationTests(SimpleTestCase):
    def test_b2_audio_lookup_uses_only_the_b2_scope_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "telc_b1_teil1").mkdir()
            (root / "telc_b2_teil1").mkdir()
            (root / "telc_b1_teil1" / "Teil1_12.mp3").write_bytes(b"b1")
            (root / "telc_b2_teil1" / "Teil1_12.mp3").write_bytes(b"b2")
            with patch("exam_preparation_importer.LISTENING_AUDIO_ROOT", root):
                url, path = resolve_listening_audio(
                    xlsx_path=Path("b2_listening_teil1_12.xlsx"),
                    listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
                    audio_file_id="12",
                    exam_type="TELC",
                    level="B2",
                )
        self.assertEqual(path.parent.name, "telc_b2_teil1")
        self.assertEqual(url, "/resources/ExamPreparation/exam_preparation_audio/telc_b2_teil1/Teil1_12.mp3")

    def test_b2_audio_lookup_reports_missing_b2_file_when_only_b1_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "telc_b1_teil1").mkdir()
            (root / "telc_b1_teil1" / "Teil1_12.mp3").write_bytes(b"b1")
            with patch("exam_preparation_importer.LISTENING_AUDIO_ROOT", root):
                with self.assertRaisesRegex(
                    exam_preparation_importer.ImportErrorWithContext,
                    r"telc_b2_teil1/Teil1_12\.\*",
                ):
                    resolve_listening_audio(
                        xlsx_path=Path("b2_listening_teil1_12.xlsx"),
                        listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
                        audio_file_id="12",
                        exam_type="TELC",
                        level="B2",
                    )

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


class ImportDirectorySetupTests(SimpleTestCase):
    def test_import_kind_creates_missing_work_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = {
                "raw_dir": root / "raw",
                "processed_dir": root / "processed",
                "failed_dir": root / "failed",
                "importer": lambda path: 0,
            }

            with patch.dict(
                exam_preparation_importer.TYPE_CONFIG,
                {"writing": config},
                clear=True,
            ):
                result = exam_preparation_importer.import_kind("writing")

            self.assertEqual(result, 0)
            self.assertTrue(config["raw_dir"].is_dir())
            self.assertTrue(config["processed_dir"].is_dir())
            self.assertTrue(config["failed_dir"].is_dir())

    def test_b2_import_uses_a_separate_scoped_directory_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = {
                "raw_dir": root / "legacy" / "raw",
                "processed_dir": root / "legacy" / "processed",
                "failed_dir": root / "legacy" / "failed",
                "importer": lambda path: 0,
            }

            with (
                patch.dict(exam_preparation_importer.TYPE_CONFIG, {"writing": config}, clear=True),
                patch.object(exam_preparation_importer, "IMPORTS_ROOT", root),
            ):
                result = exam_preparation_importer.import_kind(
                    "writing",
                    exam_type="TELC",
                    level="B2",
                )

            self.assertEqual(result, 0)
            scoped_root = root / "telc" / "b2" / "writing"
            self.assertTrue((scoped_root / "raw").is_dir())
            self.assertTrue((scoped_root / "processed").is_dir())
            self.assertTrue((scoped_root / "failed").is_dir())
            self.assertFalse((root / "legacy").exists())
