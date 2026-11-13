from pathlib import Path
import sys
import tempfile
import unittest

from openpyxl import Workbook, load_workbook

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import exam_preparation_importer


class SpeakingTeil3WorkbookTests(unittest.TestCase):
    def _write_workbook(self, path: Path, *, new_layout: bool) -> None:
        workbook = Workbook()
        meta = workbook.active
        meta.title = "meta"
        if new_layout:
            meta.append(["ID", "task"])
            meta.append(["003", "Gemeinsam eine Schiffsreise planen."])
            example = workbook.create_sheet("example")
            example.append(["ID", "标题", "内容", "句子类型", "考试类型", "是否真题"])
            for index in range(43):
                example.append([
                    "003", "Eine Schiffsreise planen", f"Turn {index + 1}",
                    "Vorschlag" if index < 20 else "Diskussion" if index < 40 else "Einigung",
                    "TELC B1", "是",
                ])
        else:
            meta.append(["ID", "标题", "内容", "句子类型", "考试类型", "是否真题"])
            for index in range(2):
                meta.append([
                    "003", "Eine Schiffsreise planen", f"Turn {index + 1}",
                    "Vorschlag", "TELC B1", "是",
                ])
        workbook.save(path)

    def test_new_meta_example_layout_parses_dialogue_and_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "B1_Sprechen_003.xlsx"
            self._write_workbook(path, new_layout=True)

            parsed = exam_preparation_importer.parse_speaking_gemeinsam_etwas_planen_workbook(path)

        dialogue = parsed["content"]["dialogue"]
        self.assertEqual(len(dialogue), 43)
        self.assertEqual([turn["role"] for turn in dialogue[:4]], ["TN1", "TN2", "TN1", "TN2"])
        self.assertEqual([section["type"] for section in parsed["content"]["sections"]], [
            "Vorschlag", "Diskussion", "Einigung",
        ])
        self.assertEqual(parsed["external_id"], "3")
        self.assertEqual(parsed["task"], "Gemeinsam eine Schiffsreise planen.")
        self.assertEqual(parsed["title"], "Eine Schiffsreise planen")
        self.assertEqual(parsed["exam_type"], "TELC B1")

    def test_legacy_meta_dialogue_layout_remains_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "B1_Sprechen_003.xlsx"
            self._write_workbook(path, new_layout=False)

            parsed = exam_preparation_importer.parse_speaking_gemeinsam_etwas_planen_workbook(path)

        self.assertEqual(len(parsed["content"]["dialogue"]), 2)
        self.assertEqual(parsed["content"]["dialogue"][0]["text"], "Turn 1")
        self.assertEqual(parsed["task"], "")

    def test_new_layout_rejects_mismatched_dialogue_id(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "B1_Sprechen_003.xlsx"
            self._write_workbook(path, new_layout=True)
            workbook = load_workbook(path)
            workbook["example"]["A2"] = "004"
            workbook.save(path)

            with self.assertRaisesRegex(
                exam_preparation_importer.ImportErrorWithContext, "inconsistent ID"
            ):
                exam_preparation_importer.parse_speaking_gemeinsam_etwas_planen_workbook(path)

    def test_new_layout_requires_one_meaningful_meta_row(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "B1_Sprechen_003.xlsx"
            self._write_workbook(path, new_layout=True)
            workbook = load_workbook(path)
            workbook["meta"].append(["003", "Second task"])
            workbook.save(path)

            with self.assertRaisesRegex(
                exam_preparation_importer.ImportErrorWithContext,
                "exactly one meaningful meta row",
            ):
                exam_preparation_importer.parse_speaking_gemeinsam_etwas_planen_workbook(path)


if __name__ == "__main__":
    unittest.main()
