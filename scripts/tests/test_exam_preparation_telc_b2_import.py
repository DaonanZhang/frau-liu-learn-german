from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

import pandas as pd
from django.test import TestCase


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import exam_preparation_importer as shared  # noqa: E402
import exam_preparation_importer_telc_b2 as telc_b2  # noqa: E402


class TelcB2ImporterTests(TestCase):
    def write_workbook(self, name, sheets):
        path = Path(self.temp_dir.name) / name
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            for sheet_name, rows in sheets.items():
                pd.DataFrame(rows).to_excel(writer, sheet_name=sheet_name, index=False)
        return path

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_sprachbausteine_true_field_maps_to_real_exam(self):
        path = self.write_workbook(
            "b2_cloze_question_001.xlsx",
            {
                "meta": [{"ID": "001", "标题": "Brief", "内容": "{{blank 1}}", "考试类型": "telc", "是否真题": True}],
                "exercise": [
                    {"exercise_id": "001", "blank_key": "blank_1", "blank_number": 1, "Option": "A", "is_correct": "richtig", "explanation": "ok"},
                    {"exercise_id": "001", "blank_key": "blank_1", "blank_number": 1, "Option": "B", "is_correct": "falsch", "explanation": ""},
                ],
            },
        )

        telc_b2.import_cloze_choice(path)

        base = shared.ExerciseBase.objects.get(exam_type="TELC", level="B2", external_id="1")
        self.assertTrue(base.is_real_exam)
        self.assertEqual(base.source_reference, "")
        exercise = shared.ClozeChoiceExercise.objects.get(exercise_base=base)
        self.assertEqual(exercise.content_with_placeholders, "{{blank_1}}")
        self.assertEqual(exercise.original_source_text, "")

    def test_writing_maps_anzeige_and_minimum_word_count(self):
        path = self.write_workbook(
            "b2_writing_002.xlsx",
            {
                "exercise": [{
                    "ID": "002", "Title": "Beschwerde", "Anzeige": "Anzeige", "考试类型": "TELC",
                    "是否真题": True, "time_limit": 30, "words_limit_min": 150,
                    "task": "Schreiben Sie.", "Example_Text": "Beispiel",
                }],
            },
        )

        telc_b2.import_writing(path)

        exercise = shared.WritingExercise.objects.get(exercise_base__level="B2", exercise_base__external_id="2")
        self.assertEqual(exercise.request_text, "Anzeige")
        self.assertEqual(exercise.words_limit, 150)

    def test_reading_teil3_uses_the_canonical_instruction(self):
        path = self.write_workbook(
            "b2_reading_ad_matching_003.xlsx",
            {
                "meta": [{"ID": "003", "原标题": "Info", "task": "broken OCR", "考试类型": "TELC", "是否真题": True}],
                "exercise": [{"exercise_id": "003", "situation": "Situation", "Ad": "Anzeige"}],
            },
        )

        telc_b2.import_reading_ad_matching(path)

        exercise = shared.ReadingAdMatchingExercise.objects.get(exercise_base__level="B2", exercise_base__external_id="3")
        self.assertEqual(exercise.instruction, telc_b2.READING_TEIL3_INSTRUCTION)
        self.assertNotIn("broken OCR", exercise.instruction)

    def test_reading_understanding_ignores_meta_rows_without_an_id(self):
        path = self.write_workbook(
            "b2_reading_understanding_016.xlsx",
            {
                "meta": [
                    {"ID": "016", "标题": "Text", "文本": "Inhalt", "考试类型": "TELC", "是否真题": True},
                    {"ID": None, "标题": "\n", "文本": None, "考试类型": None, "是否真题": None},
                ],
                "exercise": [
                    {"exercise_id": "016", "question_id": 1, "question": "Frage", "answer": "A", "is_correct": "richtig", "explanation": ""},
                    {"exercise_id": "016", "question_id": 1, "question": "Frage", "answer": "B", "is_correct": "falsch", "explanation": ""},
                ],
            },
        )

        telc_b2.import_reading_understanding(path)

        base = shared.ExerciseBase.objects.get(
            exam_type="TELC",
            level="B2",
            exercise_type=shared.ExerciseBase.ExerciseType.READING_UNDERSTANDING,
            external_id="16",
        )
        self.assertEqual(base.title, "Text")

    def test_praesentation_uses_fixed_telc_b2_scope_and_audio_path_inputs(self):
        path = self.write_workbook(
            "b2_speaking_praesentation_004.xlsx",
            {
                "meta": [{"ID": "004", "request": "Präsentieren Sie.", "titel": "Ein Buch"}],
                "example": [{"exercise_id": "004", "Role": "TN1", "内容": "Mein Vortrag"}],
            },
        )

        with patch.object(shared, "ensure_speaking_turn_audio", return_value="/audio.mp3") as audio:
            telc_b2.import_speaking_praesentation(path, generate_speaking_audio=True)

        base = shared.ExerciseBase.objects.get(exam_type="TELC", level="B2", external_id="4")
        self.assertTrue(base.is_real_exam)
        self.assertEqual(shared.SpeakingTeilExercise.objects.get(exercise_base=base).content["topics"], ["Ein Buch"])
        audio.assert_called_once()
        self.assertEqual(audio.call_args.kwargs["exam_type"], "TELC")
        self.assertEqual(audio.call_args.kwargs["level"], "B2")

    def test_b2_rejects_filename_and_workbook_id_mismatch(self):
        path = self.write_workbook(
            "b2_writing_099.xlsx",
            {
                "exercise": [{
                    "ID": "001", "Title": "X", "Anzeige": "A", "考试类型": "TELC",
                    "是否真题": True, "time_limit": 30, "words_limit_min": 150,
                    "task": "T", "Example_Text": "E",
                }],
            },
        )

        with self.assertRaisesRegex(shared.ImportErrorWithContext, "does not match"):
            telc_b2.import_writing(path)

    def test_b2_uses_filename_id_when_workbook_id_is_empty(self):
        path = self.write_workbook(
            "b2_writing_007.xlsx",
            {
                "exercise": [{
                    "ID": None, "Title": "X", "Anzeige": "A", "考试类型": "TELC",
                    "是否真题": True, "time_limit": 30, "words_limit_min": 150,
                    "task": "T", "Example_Text": "E",
                }],
            },
        )

        telc_b2.import_writing(path)

        self.assertTrue(
            shared.ExerciseBase.objects.filter(
                exam_type="TELC",
                level="B2",
                exercise_type=shared.ExerciseBase.ExerciseType.WRITING_PROMPT,
                external_id="7",
            ).exists()
        )
