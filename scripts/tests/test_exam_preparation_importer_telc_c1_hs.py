from pathlib import Path
import sys
import re
import tempfile
from contextlib import redirect_stdout
from io import StringIO
from unittest import TestCase
from unittest.mock import patch

import pandas as pd
from django.test import TestCase as DjangoTestCase

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import exam_preparation_importer_telc_c1_hs as importer  # noqa: E402
from apps.exam_preparation.models import ClozeChoiceExercise, ClozeMatchingExercise, ExerciseBase, ListeningExercise, ReadingAdMatchingExercise, WritingExercise, SpeakingTeilExercise


class C1ImporterUnitTests(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def workbook(self, name, meta):
        path = Path(self.temp_dir.name) / name
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([meta]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([]).to_excel(writer, sheet_name="exercise", index=False)
        return path

    def test_preflight_rejects_blank_exam_type(self):
        path = self.workbook("listening_teil2__mode_listening_teil2_001.xlsx", {
            "音频文件_ID": 1, "考试类型": "", "是否真题": True,
        })
        self.assertIn("missing required exam type", importer.preflight([path])[0])

    def test_invalid_exam_type_stops_normal_import_before_importer_call(self):
        path = self.workbook("listening_teil2__mode_listening_teil2_001.xlsx", {
            "音频文件_ID": 1, "考试类型": "", "是否真题": True,
        })
        with patch.object(sys, "argv", ["importer", "--file", str(path)]), \
             patch.object(importer, "import_workbook") as import_workbook, \
             redirect_stdout(StringIO()):
            self.assertEqual(importer.main(), 1)
        import_workbook.assert_not_called()

    def test_reading_teil2_preflight_rejects_empty_placeholder_and_accepts_five_paragraph_shape(self):
        empty = Path(self.temp_dir.name) / "reading_teil2__empty_006.xlsx"
        with pd.ExcelWriter(empty, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 6, "考试类型": "TELC"}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame(columns=["Fragen", "Absatz_ID", "Textabsatz", "Explaination"]).to_excel(writer, sheet_name="exercise", index=False)
        valid = Path(self.temp_dir.name) / "reading_teil2__valid_007.xlsx"
        with pd.ExcelWriter(valid, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 7, "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([
                {"Fragen": f"Frage {i}", "Absatz_ID": letter, "Textabsatz": f"Absatz {letter}", "Explaination": ""}
                for i, letter in enumerate("ABCDE", start=1)
            ]).to_excel(writer, sheet_name="exercise", index=False)
        self.assertIn("paragraphs A–E", importer.preflight([empty])[0])
        self.assertEqual(importer.preflight([valid]), [])

    def test_stage_routes_empty_reading_teil2_to_failed_and_keeps_valid_file_raw(self):
        source = Path(self.temp_dir.name) / "source"
        source.mkdir()
        empty = source / "reading_teil2__empty_006.xlsx"
        with pd.ExcelWriter(empty, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 6, "考试类型": "TELC"}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame(columns=["Fragen", "Absatz_ID", "Textabsatz", "Explaination"]).to_excel(writer, sheet_name="exercise", index=False)
        valid = source / "reading_teil2__valid_007.xlsx"
        with pd.ExcelWriter(valid, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 7, "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([
                {"Fragen": f"Frage {i}", "Absatz_ID": letter, "Textabsatz": f"Absatz {letter}", "Explaination": ""}
                for i, letter in enumerate("ABCDE", start=1)
            ]).to_excel(writer, sheet_name="exercise", index=False)
        with patch.object(importer, "RAW_ROOT", Path(self.temp_dir.name) / "imports"):
            staged = importer.stage(source)
        self.assertEqual(len(staged), 1)
        self.assertEqual(staged[0].name, valid.name)
        self.assertTrue((Path(self.temp_dir.name) / "imports/reading_ad_matching/failed" / empty.name).exists())
        self.assertEqual(staged[0].parent.name, "raw")

    def test_reading_teil1_preflight_rejects_an_answer_missing_from_the_option_bank(self):
        path = Path(self.temp_dir.name) / "reading_teil1__broken_001.xlsx"
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 1, "考试类型": "TELC"}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([{"option_key": f"option_{i}", "option_text": f"Option {i}"} for i in range(8)]).to_excel(writer, sheet_name="options", index=False)
            pd.DataFrame([{"blank_key": "blank_0", "correct_option_text": "Beispieltext"},
                          {"blank_key": "blank_1", "correct_option_text": "not in option bank"}]).to_excel(writer, sheet_name="answer", index=False)
        self.assertIn("missing from the regular options", importer.preflight([path])[0])

    def test_listening_external_id_uses_explicit_numeric_filename_suffix(self):
        path = self.workbook("listening_teil1__gentechnik_listening_teil1_001.xlsx", {
            "音频文件_ID": "", "考试类型": "TELC", "是否真题": True,
        })
        row, _ = importer.workbook_meta(path)
        self.assertEqual(importer.external_id(path, row), "1")

    def test_preflight_rejects_duplicate_scoped_keys(self):
        meta = {"ID": 3, "考试类型": "TELC"}
        one = self.workbook("reading_teil3__one_003.xlsx", meta)
        two = self.workbook("reading_teil3__two_003.xlsx", meta)
        self.assertIn("duplicate batch key", importer.preflight([one, two])[-1])


class C1ImporterDatabaseTests(DjangoTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_reading_teil2_imports_paragraphs_and_allows_reused_answers(self):
        path = Path(self.temp_dir.name) / "reading_teil2__valid_007.xlsx"
        rows = [{"Fragen": "Frage eins", "Absatz_ID": "A", "Textabsatz": "Absatz A", "Explaination": ""},
                {"Fragen": "Frage zwei", "Absatz_ID": "A", "Textabsatz": "Absatz A", "Explaination": ""}]
        rows.extend({"Fragen": "", "Absatz_ID": letter, "Textabsatz": f"Absatz {letter}", "Explaination": ""}
                    for letter in "BCDE")
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 7, "原标题": "Lesen", "task": "Finden Sie die Antworten.",
                           "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame(rows).to_excel(writer, sheet_name="exercise", index=False)
        self.assertEqual(importer.import_workbook(path), 1)
        exercise = ReadingAdMatchingExercise.objects.get(exercise_base__external_id="7", exercise_base__level="C1")
        self.assertEqual(exercise.ads.count(), 5)
        self.assertEqual(exercise.items.count(), 2)
        self.assertEqual(exercise.items.first().correct_ad_id, exercise.items.last().correct_ad_id)

    def test_cloze_choice_accepts_german_correctness_values_from_drive_exports(self):
        path = Path(self.temp_dir.name) / "cloze_choice__sprachbausteine_022.xlsx"
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{
                "ID": 22, "标题": "Sprachbausteine", "内容": "Text {{blank_1}}",
                "考试类型": "TELC", "是否真题": True,
            }]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([
                {"exercise_id": 22, "blank_key": "blank_1", "blank_number": 1,
                 "Option": "A", "is_correct": "richtig", "explanation": ""},
                {"exercise_id": 22, "blank_key": "blank_1", "blank_number": 1,
                 "Option": "B", "is_correct": "falsch", "explanation": ""},
            ]).to_excel(writer, sheet_name="exercise", index=False)

        self.assertEqual(importer.import_workbook(path), 1)

        exercise = ClozeChoiceExercise.objects.get(
            exercise_base__external_id="22", exercise_base__level="C1"
        )
        self.assertEqual(exercise.blanks.get().options.filter(is_correct=True).count(), 1)

    def test_listening_teil_number_is_derived_from_the_c1_kind(self):
        path = Path(self.temp_dir.name) / "listening_teil1__sample_001.xlsx"
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{
                "音频文件_ID": 1, "原标题": "Hören Teil 1", "copy": "Skript",
                "考试类型": "TELC", "是否真题": True,
            }]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([{
                "Aussage": "Aussage A", "Sprecher/in": "Sprecher 1", "Explanation": "",
            }]).to_excel(writer, sheet_name="exercise", index=False)

        self.assertEqual(importer.import_workbook(path), 1)

        exercise = ListeningExercise.objects.get(
            exercise_base__external_id="1", exercise_base__level="C1"
        )
        self.assertEqual(exercise.content["format"], "speaker_matching")
        self.assertIn("telc_c1_hs_teil1/Teil1_1.mp3", exercise.audio_file_url)

    def test_reading_teil1_imports_example_as_the_dedicated_beispiel_option(self):
        path = Path(self.temp_dir.name) / "reading_teil1__example_001.xlsx"
        options = [{"exercise_id": 1, "option_key": f"option_{i}", "option_text": f"Regulärer Satz {i}"} for i in range(1, 9)]
        answers = [{"exercise_id": 1, "blank_key": "blank_0", "blank_number": 0,
                    "correct_option_text": "Beispielsatz gehört nur zur Beispiel-Lücke.", "explanation": "Beispiel"}]
        answers.extend({"exercise_id": 1, "blank_key": f"blank_{i}", "blank_number": i,
                        "correct_option_text": f"Regulärer Satz {i}", "explanation": ""} for i in range(1, 7))
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 1, "标题": "Lesen", "内容": "Text {{blank 0}}", "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame(options).to_excel(writer, sheet_name="options", index=False)
            pd.DataFrame(answers).to_excel(writer, sheet_name="answer", index=False)
        self.assertEqual(importer.import_workbook(path), 1)
        exercise = ClozeMatchingExercise.objects.get(exercise_base__external_id="1", exercise_base__level="C1")
        self.assertEqual(exercise.options.count(), 9)
        self.assertEqual(exercise.blank_answers.count(), 7)
        example = exercise.blank_answers.get(blank_key="blank_0").correct_option
        self.assertEqual(example.option_key, "beispiel")
        self.assertIn("Beispiel", example.option_text)
        self.assertNotEqual(exercise.blank_answers.get(blank_key="blank_1").correct_option_id, example.id)

    def test_listening_formats_and_seed_records_import_idempotently(self):
        count = importer.import_seed_data()
        importer.import_seed_data()
        self.assertEqual(count, 5)
        writing = WritingExercise.objects.get(exercise_base__external_id="seed-writing-literatur")
        self.assertEqual(writing.content["time_limit_minutes"], 70)
        self.assertEqual(len(writing.content["quotes"]), 2)
        speaking = SpeakingTeilExercise.objects.get(exercise_base__external_id="seed-speaking-teil2")
        turn = speaking.content["dialogue"][0]
        self.assertEqual(turn["sequence"], 1)
        self.assertTrue(turn["audio_url"].startswith("/resources/ExamPreparation/"))
        for identifier in ("seed-speaking-teil1a", "seed-speaking-teil1b", "seed-speaking-teil2"):
            exercise = SpeakingTeilExercise.objects.get(exercise_base__external_id=identifier)
            self.assertTrue(exercise.content["dialogue"])
            self.assertTrue(exercise.content["dialogue"][0]["audio_url"].startswith("/resources/ExamPreparation/"))
        self.assertEqual(len(speaking.content["quote_translation_zh"]), 3)
        for exercise in WritingExercise.objects.filter(exercise_base__level="C1"):
            text = exercise.example_texts.get().example_text
            self.assertGreaterEqual(len(re.findall(r"\b[\wÄÖÜäöüß-]+\b", text)), 350)
            pages = exercise.content["vocabulary_pages"]
            self.assertGreaterEqual(len(pages), 2)
            self.assertTrue(all(page["entries"] for page in pages))
            self.assertTrue(all({"term", "translation_zh"} <= set(entry) for page in pages for entry in page["entries"]))
        expected_words = {
            "seed-speaking-teil1a": (250, 350),
            "seed-speaking-teil1b": (120, 200),
        }
        for identifier, (minimum, maximum) in expected_words.items():
            exercise = SpeakingTeilExercise.objects.get(exercise_base__external_id=identifier)
            self.assertTrue(minimum <= len(re.findall(r"\b[\wÄÖÜäöüß-]+\b", exercise.content["sample_de"])) <= maximum)
        discussion = SpeakingTeilExercise.objects.get(exercise_base__external_id="seed-speaking-teil2")
        self.assertGreaterEqual(len(discussion.content["dialogue"]), 7)
        self.assertGreaterEqual(sum(len(re.findall(r"\b[\wÄÖÜäöüß-]+\b", turn["text"])) for turn in discussion.content["dialogue"]), 250)
        self.assertEqual(ExerciseBase.objects.filter(level="C1", exam_type="TELC").count(), 5)
