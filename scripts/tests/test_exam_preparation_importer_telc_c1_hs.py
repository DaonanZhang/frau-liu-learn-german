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
from apps.exam_preparation.models import ClozeChoiceExercise, ClozeMatchingExercise, ExerciseBase, ListeningExercise, ListeningQuestion, ListeningAnswerOption, ReadingAdMatchingExercise, WritingExercise, SpeakingTeilExercise
from apps.exam_preparation.serializers import ListeningQuestionDetailSerializer


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

    def reading_teil2_workbook(self, name, question_texts):
        path = Path(self.temp_dir.name) / name
        identifier = int(path.stem.rsplit("_", 1)[-1])
        rows = [{"Fragen": question, "Absatz_ID": "ABCDE"[index % 5],
                 "Textabsatz": f"Absatz {letter}", "Explaination": f"解释{index + 1}"}
                for index, (question, letter) in enumerate((q, "ABCDE"[i % 5]) for i, q in enumerate(question_texts))]
        rows.extend({"Fragen": "", "Absatz_ID": letter, "Textabsatz": f"Absatz {letter}", "Explaination": ""}
                    for letter in "ABCDE")
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": identifier, "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame(rows).to_excel(writer, sheet_name="exercise", index=False)
        return path

    def test_reading_teil2_version2_requires_seven_questions_and_one_prefix_marker(self):
        valid = self.reading_teil2_workbook("reading_teil2__version2_004.xlsx", [
            "Frage 1", "Frage 2", "( vErSiOn2 )   Frage 3", "Frage 4", "Frage 5", "Frage 6", "Frage 7",
        ])
        two_markers = self.reading_teil2_workbook("reading_teil2__two_version2_005.xlsx", [
            "(Version2) Frage 1", "(Version2) Frage 2", "Frage 3", "Frage 4", "Frage 5", "Frage 6", "Frage 7",
        ])
        wrong_count = self.reading_teil2_workbook("reading_teil2__wrong_count_006.xlsx", [
            "(Version2) Frage 1", "Frage 2", "Frage 3", "Frage 4", "Frage 5", "Frage 6", "Frage 7", "Frage 8",
        ])
        self.assertEqual(importer.preflight([valid]), [])
        two_marker_issues = importer.preflight([two_markers])
        count_issues = importer.preflight([wrong_count])
        self.assertTrue(two_marker_issues, "two Version2 questions should fail preflight")
        self.assertTrue(count_issues, "a Version2 set with other than seven questions should fail preflight")
        self.assertIn("exactly one", two_marker_issues[0])
        self.assertIn("exactly seven", count_issues[0])

    def test_version2_text_inside_question_does_not_activate_version_set(self):
        path = self.reading_teil2_workbook("reading_teil2__inline_version2_007.xlsx", [
            "Frage 1", "Frage 2", "Frage 3 enthält (Version2) im Satz", "Frage 4", "Frage 5", "Frage 6",
        ])
        self.assertEqual(importer.preflight([path]), [])

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
        self.assertTrue((Path(self.temp_dir.name) / "imports/reading_teil2/failed" / empty.name).exists())
        self.assertEqual(staged[0].parent.name, "raw")

    def test_raw_files_discovers_direct_reading_teil_folders(self):
        imports = Path(self.temp_dir.name) / "imports"
        expected = []
        for folder in ("reading_teil1", "reading_teil2", "reading_teil3"):
            raw = imports / folder / "raw"
            raw.mkdir(parents=True)
            path = raw / f"{folder}__example_001.xlsx"
            path.touch()
            expected.append(path)
        legacy = imports / "reading_ad_matching" / "raw"
        legacy.mkdir(parents=True)
        (legacy / "reading_teil2__legacy_001.xlsx").touch()

        with patch.object(importer, "RAW_ROOT", imports):
            self.assertEqual(importer.raw_files(), sorted(expected))

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

    def test_actual_c1_filename_suffixes_are_recognized(self):
        for name, kind in (("TELC_C1_Schreiben_046.xlsx", "writing"),
                           ("TELC_C1_Vortrag_046.xlsx", "speaking_teil1"),
                           ("TELC_C1_Zitat_047.xlsx", "speaking_teil2")):
            self.assertEqual(importer.kind_for(Path(name)), kind)

    def test_preflight_detects_duplicate_speaking_scoped_keys(self):
        first = self.vortrag_workbook("TELC_C1_Vortrag_046.xlsx", 46)
        second = self.vortrag_workbook("TELC_C1_copy_Vortrag_046.xlsx", 46)
        issues = importer.preflight([first, second])
        self.assertEqual(len(issues), 1)
        self.assertIn("duplicate batch key", issues[0])

    def test_stage_discovers_nested_workbooks_and_routes_writing(self):
        source = Path(self.temp_dir.name) / "source"
        nested = source / "incoming"
        nested.mkdir(parents=True)
        path = self.writing_workbook(nested / "TELC_C1_Schreiben_046.xlsx", 46)
        with patch.object(importer, "RAW_ROOT", Path(self.temp_dir.name) / "imports"):
            staged = importer.stage(source)
        self.assertEqual(len(staged), 1)
        self.assertEqual(staged[0].parent, Path(self.temp_dir.name) / "imports/writing/raw")

    def writing_workbook(self, path, identifier, *, child_id=None):
        child_id = identifier if child_id is None else child_id
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": identifier, "Title": "Schreiben", "task": "Schreiben Sie.",
                           "Zitat A": "Zitat A", "Zitat A_translate": "引语甲",
                           "Zitat B ": "Zitat B", "Zitat B_translate": "引语乙",
                           "考试类型": "TELC", "是否真题": True,
                           "time_limit": 70, "words_limit_min": 350}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([{"ID": child_id, "Example_Text": "Absatz eins", "Chinese_translation": "第一段"},
                          {"ID": child_id, "Example_Text": "Absatz zwei", "Chinese_translation": "第二段"}]).to_excel(writer, sheet_name="text", index=False)
            pd.DataFrame([{"ID": child_id, "word": f"Wort{i}", "meaning": f"词{i}"}
                          for i in range(1, 14)]).to_excel(writer, sheet_name="word", index=False)
        return path

    def vortrag_workbook(self, name, identifier, *, child_id=None, turn_count=3):
        path = Path(self.temp_dir.name) / name
        child_id = identifier if child_id is None else child_id
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": identifier, "标题": "Vortrag", "task": "Präsentieren Sie.",
                           "题目": "Thema", "提纲": "Punkt eins; Punkt zwei",
                           "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([{"exercise_id": child_id, "Role": f"TN{i % 2 + 1}",
                           "内容": f"Turn {i}", "translate": f"翻译{i}"}
                          for i in range(1, turn_count + 1)]).to_excel(writer, sheet_name="example", index=False)
        return path

    def test_speaking_import_splits_vortrag_and_forwards_audio_setting(self):
        path = self.vortrag_workbook("TELC_C1_Vortrag_046.xlsx", 46)
        with patch.object(importer.shared, "save_speaking_exercise", return_value=1) as save:
            self.assertEqual(importer.import_workbook(path, generate_speaking_audio=True), 2)
        self.assertEqual([call.args[2] for call in save.call_args_list], [
            "SPEAKING_TEIL1", "SPEAKING_TEIL2",
        ])
        first, second = [call.args[1] for call in save.call_args_list]
        self.assertEqual(first["content"]["dialogue"], [{"sequence": 1, "role": "TN2", "text": "Turn 1", "translation_zh": "翻译1"}])
        self.assertEqual(first["content"]["outline"], ["Punkt eins", "Punkt zwei"])
        self.assertEqual([turn["text"] for turn in second["content"]["dialogue"]], ["Turn 2", "Turn 3"])
        self.assertTrue(all(call.kwargs["generate_speaking_audio"] for call in save.call_args_list))

    def test_vortrag_ignores_only_exact_translation_header_sentinel(self):
        path = Path(self.temp_dir.name) / "Kostenloses Studium_Vortrag_002.xlsx"
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 2, "标题": "Vortrag", "task": "Präsentieren Sie.",
                           "题目": "Thema", "提纲": "Punkt eins; Punkt zwei",
                           "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([
                {"exercise_id": 2, "Role": "TN1", "内容": "Turn 1", "translate": "翻译1"},
                {"exercise_id": 2, "Role": "TN2", "内容": "Turn 2", "translate": "翻译2"},
                {"exercise_id": 2, "Role": "TN1", "内容": "Turn 3", "translate": "翻译3"},
                {"exercise_id": "角色", "Role": "环节", "内容": "德语文本", "translate": "中文翻译"},
                {"exercise_id": "", "Role": "", "内容": "", "translate": ""},
            ]).to_excel(writer, sheet_name="example", index=False)

        self.assertEqual(importer.preflight([path]), [])
        with patch.object(importer.shared, "save_speaking_exercise", return_value=1) as save:
            self.assertEqual(importer.import_workbook(path), 2)
        turns = [turn for call in save.call_args_list for turn in call.args[1]["content"]["dialogue"]]
        self.assertEqual([turn["text"] for turn in turns], ["Turn 1", "Turn 2", "Turn 3"])
        self.assertEqual([turn["role"] for turn in turns], ["TN1", "TN2", "TN1"])

    def test_vortrag_rejects_other_nonempty_turn_missing_exercise_id(self):
        path = self.vortrag_workbook("TELC_C1_Vortrag_048.xlsx", 48)
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 48, "标题": "Vortrag", "task": "Präsentieren Sie.",
                           "题目": "Thema", "提纲": "Punkt eins; Punkt zwei",
                           "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([
                {"exercise_id": 48, "Role": "TN1", "内容": "Turn 1", "translate": "翻译1"},
                {"exercise_id": 48, "Role": "TN2", "内容": "Turn 2", "translate": "翻译2"},
                {"exercise_id": "", "Role": "TN1", "内容": "真实文本", "translate": ""},
            ]).to_excel(writer, sheet_name="example", index=False)
        issues = importer.preflight([path])
        self.assertTrue(issues)
        self.assertIn("missing exercise_id", issues[0])

    def test_cross_sheet_id_mismatch_is_rejected(self):
        path = self.writing_workbook(Path(self.temp_dir.name) / "TELC_C1_Schreiben_046.xlsx", 46, child_id="047")
        self.assertTrue(any("ID mismatch" in issue for issue in importer.preflight([path])))


class C1ImporterDatabaseTests(DjangoTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_all_listening_parts_import_as_stable_question_ids(self):
        teil1 = Path(self.temp_dir.name) / "listening_teil1__stable_101.xlsx"
        teil1_rows = [
            {"Aussage": f"Aussage {index}", "Sprecher/in": f"Sprecher/in {index if index < 5 else index - 1}" if index not in (5, 10) else "",
             "Explanation": f"Erklärung {index}"}
            for index in range(1, 11)
        ]
        teil2 = Path(self.temp_dir.name) / "listening_teil2__stable_102.xlsx"
        teil2_rows = [
            {"question_id": question, "question": f"Frage {question}", "answer": f"Option {option}",
             "is_correct": option == "A", "Explanation": f"Erklärung {question}-{option}"}
            for question in (1, 2) for option in ("A", "B")
        ]
        teil3 = Path(self.temp_dir.name) / "listening_teil3__stable_103.xlsx"
        teil3_rows = [
            {"Folie_ID": "1", "Folie": "Vortragstext", "blank_ID": "blank_01", "answer": "Antwort; Alternative"},
            {"Folie_ID": "1", "Folie": "Vortragstext", "blank_ID": "blank_02", "answer": "Begriff <or> Synonym"},
        ]
        for path, identifier, rows in ((teil1, 101, teil1_rows), (teil2, 102, teil2_rows), (teil3, 103, teil3_rows)):
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                pd.DataFrame([{"音频文件_ID": identifier, "原标题": "Hören", "copy": "Skript",
                               "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
                pd.DataFrame(rows).to_excel(writer, sheet_name="exercise", index=False)

        for path in (teil1, teil2, teil3):
            self.assertEqual(importer.import_workbook(path), 1)

        teil1_exercise = ListeningExercise.objects.get(exercise_base__external_id="101", exercise_base__level="C1")
        teil1_questions = list(teil1_exercise.questions.order_by("question_number"))
        self.assertEqual(len(teil1_questions), 8)
        self.assertEqual([question.question_key for question in teil1_questions], [f"statement_{index}" for index in range(1, 5)] + [f"statement_{index}" for index in range(6, 10)])
        self.assertEqual([question.question_text for question in teil1_questions], [f"Aussage {index}" for index in range(1, 5)] + [f"Aussage {index}" for index in range(6, 10)])
        self.assertTrue(all(question.answer_options.count() == 8 for question in teil1_questions))
        self.assertTrue(all(question.answer_options.filter(is_correct=True).count() == 1 for question in teil1_questions))
        self.assertEqual(teil1_questions[0].answer_options.get(option_key="A").option_text, "Sprecher/in 1")
        self.assertTrue(teil1_questions[0].answer_options.get(option_key="A").is_correct)
        self.assertFalse(teil1_questions[0].answer_options.exclude(option_key="A").filter(is_correct=True).exists())
        self.assertEqual(teil1_questions[0].explanation, "Erklärung 1")
        self.assertFalse(teil1_questions[0].answer_options.exclude(explanation="").exists())
        self.assertEqual(teil1_questions[0].question_number, 1)

        teil2_exercise = ListeningExercise.objects.get(exercise_base__external_id="102", exercise_base__level="C1")
        teil2_questions = list(teil2_exercise.questions.order_by("question_number"))
        self.assertEqual([question.question_key for question in teil2_questions], ["1", "2"])
        self.assertEqual(teil2_questions[0].answer_options.get(option_key="A").explanation, "Erklärung 1-A")

        teil3_exercise = ListeningExercise.objects.get(exercise_base__external_id="103", exercise_base__level="C1")
        teil3_questions = list(teil3_exercise.questions.order_by("question_number"))
        self.assertEqual([question.question_key for question in teil3_questions], ["blank_01", "blank_02"])
        self.assertEqual([question.correct_answer for question in teil3_questions], ["Antwort; Alternative", "Begriff <or> Synonym"])
        self.assertEqual(teil3_questions[0].question_type, ListeningQuestion.QuestionType.TEXT_INPUT)
        self.assertEqual(teil3_exercise.content["slides"][0]["text"], "Vortragstext")
        serialized_question = ListeningQuestionDetailSerializer(teil3_questions[0]).data
        self.assertEqual(serialized_question["question_key"], "blank_01")
        self.assertEqual(serialized_question["correct_answer"], "Antwort; Alternative")

        original_ids = {
            exercise_id: list(ListeningQuestion.objects.filter(listening_exercise_id=exercise_id).order_by("question_number").values_list("id", flat=True))
            for exercise_id in (teil1_exercise.pk, teil2_exercise.pk, teil3_exercise.pk)
        }
        for path in (teil1, teil2, teil3):
            self.assertEqual(importer.import_workbook(path), 1)
        reimported_ids = {
            exercise_id: list(ListeningQuestion.objects.filter(listening_exercise_id=exercise_id).order_by("question_number").values_list("id", flat=True))
            for exercise_id in original_ids
        }
        self.assertEqual(reimported_ids, original_ids)

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

    def test_reading_teil2_imports_all_seven_versioned_items_in_source_order(self):
        path = Path(self.temp_dir.name) / "reading_teil2__version2_004.xlsx"
        questions = ["Frage 1", "Frage 2", "(Version2) Frage 3", "Frage 4", "Frage 5", "Frage 6", "Frage 7"]
        rows = [{"Fragen": question, "Absatz_ID": "ABCDE"[index % 5], "Textabsatz": f"Absatz {'ABCDE'[index % 5]}",
                 "Explaination": f"解释{index + 1}"} for index, question in enumerate(questions)]
        rows.extend({"Fragen": "", "Absatz_ID": letter, "Textabsatz": f"Absatz {letter}", "Explaination": ""}
                    for letter in "ABCDE")
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 4, "考试类型": "TELC", "是否真题": True}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame(rows).to_excel(writer, sheet_name="exercise", index=False)
        self.assertEqual(importer.import_workbook(path), 1)
        exercise = ReadingAdMatchingExercise.objects.get(exercise_base__external_id="4", exercise_base__level="C1")
        items = list(exercise.items.order_by("item_number"))
        self.assertEqual([item.item_text for item in items], questions)
        self.assertEqual(items[2].item_text, "(Version2) Frage 3")
        self.assertEqual(items[2].explanation, "解释3")
        self.assertEqual(items[2].correct_ad.ad_key, "C")

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

    def test_listening_teil_imports_use_the_matching_listening_type(self):
        listening_types = {
            "1": ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
            "2": ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
            "3": ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE,
        }
        exercise_rows = {
            "1": [
                {"Aussage": f"Aussage {index}", "Sprecher/in": f"Sprecher {index}" if index <= 8 else "", "Explanation": ""}
                for index in range(1, 11)
            ],
            "2": [{"question_id": 1, "question": "Frage", "answer": "Antwort", "is_correct": True}],
            "3": [{"Folie_ID": "1", "Folie": "Folie", "blank_ID": "1", "answer": "Antwort"}],
        }
        for teil, listening_type in listening_types.items():
            identifier = f"10{teil}"
            path = Path(self.temp_dir.name) / f"listening_teil{teil}__sample_{identifier}.xlsx"
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                pd.DataFrame([{
                    "音频文件_ID": int(identifier), "原标题": f"Hören Teil {teil}", "copy": "Skript",
                    "考试类型": "TELC", "是否真题": True,
                }]).to_excel(writer, sheet_name="meta", index=False)
                pd.DataFrame(exercise_rows[teil]).to_excel(writer, sheet_name="exercise", index=False)

            with self.subTest(teil=teil):
                self.assertEqual(importer.import_workbook(path), 1)
                exercise = ListeningExercise.objects.get(
                    exercise_base__external_id=identifier, exercise_base__level="C1"
                )
                self.assertEqual(exercise.listening_type, listening_type)
                if teil == "1":
                    self.assertEqual(exercise.content["format"], "speaker_matching")
                    self.assertIn("telc_c1_hs_teil1/Teil1_101.mp3", exercise.audio_file_url)

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

    def test_writing_import_maps_quotes_sample_and_twelve_word_pages_idempotently(self):
        path = C1ImporterUnitTests().writing_workbook(Path(self.temp_dir.name) / "TELC_C1_Schreiben_046.xlsx", 46)
        self.assertEqual(importer.import_workbook(path), 1)
        self.assertEqual(importer.import_workbook(path), 1)
        exercise = WritingExercise.objects.get(exercise_base__external_id="46", exercise_base__level="C1")
        self.assertEqual(exercise.time_limit_minutes, 70)
        self.assertEqual(exercise.words_limit, 350)
        self.assertEqual(len(exercise.content["quotes"]), 2)
        self.assertEqual(exercise.content["quotes"][0]["translation_zh"], "引语甲")
        self.assertEqual(len(exercise.content["vocabulary_pages"][0]["entries"]), 12)
        self.assertEqual(len(exercise.content["vocabulary_pages"][-1]["entries"]), 1)
        self.assertEqual(exercise.example_texts.count(), 1)
        sample = exercise.example_texts.get()
        self.assertEqual(sample.example_text, "Absatz eins\n\nAbsatz zwei")
        self.assertEqual(sample.translation_zh, "第一段\n\n第二段")

    def test_zitat_import_keeps_translation_and_all_dialogue_turns(self):
        path = Path(self.temp_dir.name) / "TELC_C1_Zitat_047.xlsx"
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            pd.DataFrame([{"ID": 47, "标题": "Zitat", "Task": "Diskutieren.", "Zitat": "Zitattext",
                           "Zitat_translate": "引语翻译", "考试类型": "TELC", "是否真题": False}]).to_excel(writer, sheet_name="meta", index=False)
            pd.DataFrame([{"exercise_id": 47, "Role": f"TN{i % 2 + 1}", "内容": f"Beitrag {i}", "translate": f"译文{i}"}
                          for i in range(1, 4)]).to_excel(writer, sheet_name="example", index=False)
        self.assertEqual(importer.import_workbook(path), 1)
        exercise = SpeakingTeilExercise.objects.get(exercise_base__external_id="47", exercise_base__exercise_type="SPEAKING_TEIL3")
        self.assertEqual(exercise.content["quote"], "Zitattext")
        self.assertEqual(exercise.content["quote_translation_zh"], ["引语翻译"])
        self.assertEqual(exercise.content["quotes"][0]["translation_zh"], "引语翻译")
        self.assertEqual([turn["text"] for turn in exercise.content["dialogue"]], ["Beitrag 1", "Beitrag 2", "Beitrag 3"])
