from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase

from apps.exam_preparation.models import ExerciseBase
SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
import exam_preparation_importer
from exam_preparation_importer import save_speaking_exercise


class SpeakingTeil1ParsingTests(SimpleTestCase):
    def test_legacy_kennenlernen_filename_defaults_to_telc_b1(self):
        with (
            patch.object(exam_preparation_importer.pd, "ExcelFile") as excel_file,
            patch.object(exam_preparation_importer, "get_sheet") as get_sheet,
        ):
            excel_file.return_value.sheet_names = ["Sheet1"]
            get_sheet.return_value = exam_preparation_importer.pd.DataFrame([
                {"ID": "7", "Role": "TN1", "内容": "Hallo"}
            ])
            parsed = exam_preparation_importer.parse_speaking_einander_kennenlernen_workbook(
                Path("Kennenlernen_001.xlsx")
            )
        self.assertEqual(parsed["level"], "B1")
        self.assertEqual(parsed["exam_type"], "TELC")

    def test_part_one_infers_b2_and_accepts_uppercase_exam_family(self):
        with (
            patch.object(exam_preparation_importer.pd, "ExcelFile") as excel_file,
            patch.object(exam_preparation_importer, "get_sheet") as get_sheet,
        ):
            excel_file.return_value.sheet_names = ["Sheet1"]
            get_sheet.return_value = exam_preparation_importer.pd.DataFrame([
                {"ID": "7", "Role": "TN1", "内容": "Hallo", "考试类型": "telc"}
            ])
            parsed = exam_preparation_importer.parse_speaking_einander_kennenlernen_workbook(
                Path("b2_speaking_7.xlsx")
            )
        self.assertEqual(parsed["level"], "B2")
        self.assertEqual(parsed["exam_type"], "TELC")

    def test_unknown_prefix_does_not_default_to_b1(self):
        with (
            patch.object(exam_preparation_importer.pd, "ExcelFile") as excel_file,
            patch.object(exam_preparation_importer, "get_sheet") as get_sheet,
        ):
            excel_file.return_value.sheet_names = ["Sheet1"]
            get_sheet.return_value = exam_preparation_importer.pd.DataFrame([
                {"ID": "7", "Role": "TN1", "内容": "Hallo"}
            ])
            with self.assertRaisesRegex(exam_preparation_importer.ImportErrorWithContext, "Unsupported level"):
                exam_preparation_importer.parse_speaking_einander_kennenlernen_workbook(
                    Path("legacy_kennenlernen_001.xlsx")
                )

    def test_part_one_rejects_blank_family_when_new_column_is_present(self):
        with (
            patch.object(exam_preparation_importer.pd, "ExcelFile") as excel_file,
            patch.object(exam_preparation_importer, "get_sheet") as get_sheet,
        ):
            excel_file.return_value.sheet_names = ["Sheet1"]
            get_sheet.return_value = exam_preparation_importer.pd.DataFrame([
                {"ID": "7", "Role": "TN1", "内容": "Hallo", "考试类型": ""}
            ])
            with self.assertRaisesRegex(exam_preparation_importer.ImportErrorWithContext, "考试类型"):
                exam_preparation_importer.parse_speaking_einander_kennenlernen_workbook(
                    Path("b2_speaking_7.xlsx")
                )

class SpeakingImportAudioTests(TestCase):
    def test_upsert_keeps_same_numeric_id_for_each_exam_scope(self):
        for family, level in (("telc", "B1"), ("telc", "B2"), ("goethe", "B1")):
            exam_preparation_importer.upsert_base(
                level=level, skill="SPEAKING", exercise_type="SPEAKING_TEIL1",
                external_id="007", title="Thema", exam_type=family, is_real_exam=False,
                imported_from_file=f"{family}_{level}_7.xlsx",
            )
        records = ExerciseBase.objects.filter(external_id="7", exercise_type="SPEAKING_TEIL1")
        self.assertEqual(records.count(), 3)
        self.assertSetEqual(
            set(records.values_list("exam_type", "level")),
            {("TELC", "B1"), ("TELC", "B2"), ("GOETHE", "B1")},
        )

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
