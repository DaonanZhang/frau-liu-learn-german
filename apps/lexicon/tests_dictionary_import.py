import gzip
import sqlite3
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.lexicon.management.commands.import_local_dictionary import pos_from_tag
from apps.lexicon.models import DictionaryEntry, DictionaryForm


class LocalDictionaryImportTests(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.wikdict = root / "wikdict.sqlite3"
        connection = sqlite3.connect(self.wikdict)
        connection.execute(
            "CREATE TABLE simple_translation "
            "(written_rep TEXT, trans_list TEXT, max_score REAL, rel_importance REAL)"
        )
        connection.executemany(
            "INSERT INTO simple_translation VALUES (?, ?, ?, ?)",
            [
                ("gehen", "走 | 去", 10, 2.5),
                ("Gehen", "竞走", 12, 2.8),
                ("Haus", "房子", 8, 1.2),
                ("", "空词", 1, 0.1),
                ("leer", "", 1, 0.1),
            ],
        )
        connection.commit()
        connection.close()
        self.morphology = root / "morphology.tsv.gz"
        with gzip.open(self.morphology, "wt", encoding="utf-8") as output:
            output.write("ging\tgehen\tVER:1:SIN:PRT:NON\n")
            output.write("Häusern\tHaus\tSUB:DAT:PLU:NEU\n")
            output.write("Häuslein\thAuS\tSUB:DIM:NEU\n")
            output.write("irrelevant\tnicht-vorhanden\tNN\n")

    def tearDown(self):
        self.temp_dir.cleanup()

    def import_data(self):
        call_command("import_local_dictionary", wikdict=self.wikdict, morphology=self.morphology, verbosity=0)

    def test_pos_from_real_german_pos_dict_tags(self):
        self.assertEqual(pos_from_tag("SUB:DAT:PLU:NEU"), "noun")
        self.assertEqual(pos_from_tag("VER:1:SIN:PRT:NON"), "verb")
        self.assertEqual(pos_from_tag("ADJ:POS"), "adjective")
        self.assertEqual(pos_from_tag("ADV"), "adverb")
        self.assertEqual(pos_from_tag("UNKNOWN:TAG"), "")

    def test_imports_distinct_senses_forms_and_parts_of_speech(self):
        self.import_data()

        self.assertEqual(DictionaryEntry.objects.filter(source="wikdict", headword="gehen").count(), 2)
        gehen = DictionaryEntry.objects.get(source="wikdict", headword="gehen", translation_zh="走")
        gehen_noun = DictionaryEntry.objects.get(source="wikdict", headword="Gehen", translation_zh="竞走")
        haus = DictionaryEntry.objects.get(source="wikdict", headword="Haus")
        self.assertTrue(DictionaryForm.objects.filter(entry=gehen, form="gehen", morphology_tag="").exists())
        self.assertTrue(DictionaryForm.objects.filter(entry=gehen, form="ging", morphology_tag="VER:1:SIN:PRT:NON").exists())
        self.assertFalse(DictionaryForm.objects.filter(entry=gehen_noun, form="ging").exists())
        self.assertEqual(gehen.part_of_speech, "verb")
        self.assertTrue(DictionaryForm.objects.filter(entry=haus, form="Häusern", morphology_tag="SUB:DAT:PLU:NEU").exists())
        self.assertTrue(DictionaryForm.objects.filter(entry=haus, form="Häuslein", morphology_tag="SUB:DIM:NEU").exists())
        self.assertEqual(haus.part_of_speech, "noun")
        self.assertFalse(DictionaryForm.objects.filter(form="irrelevant").exists())

    def test_import_is_idempotent(self):
        self.import_data()
        first = (DictionaryEntry.objects.count(), DictionaryForm.objects.count())
        self.import_data()
        self.assertEqual((DictionaryEntry.objects.count(), DictionaryForm.objects.count()), first)

    def test_missing_input_file_raises_command_error(self):
        with self.assertRaisesMessage(CommandError, "Morphology file not found"):
            call_command(
                "import_local_dictionary",
                wikdict=self.wikdict,
                morphology=Path(self.temp_dir.name) / "missing.tsv.gz",
                verbosity=0,
            )
