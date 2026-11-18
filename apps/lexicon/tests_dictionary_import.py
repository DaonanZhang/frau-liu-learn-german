import gzip
import sqlite3
import tempfile
import unicodedata
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
                ("dürfen", "可以", 9, 1.5),
                ("Haus", "房子", 8, 1.2),
                ("", "空词", 1, 0.1),
                ("leer", "", 1, 0.1),
            ],
        )
        connection.commit()
        connection.close()
        self.handedict = root / "handedict.u8"
        self.handedict.write_text(
            "# historical line should not import\n"
            "\n"
            "直前 直前 [zhi2 qian2] /geradeaus (Adv)/\n"
            "猫 猫 [mao1] /Katze (S)/\n"
            "貓 貓 [mao1] /Katze (S)/\n"
            "猫 猫 [mao1] /Kater (S)/\n"
            "高速 高速 [gao1 su4] /schnell-gehend (Adj)/\n"
            "开车 开车 [kai1 che1] /Auto fahren (V)/\n"
            "道理 道理 [dao4 li3] /Prinzip, Erklärung (S)/\n"
            "例句 例句 [li4 ju4] /ein sehr langer Beispielsatz (S)/\n",
            encoding="utf-8",
        )
        self.morphology = root / "morphology.tsv.gz"
        with gzip.open(self.morphology, "wt", encoding="utf-8") as output:
            output.write("ging\tgehen\tVER:1:SIN:PRT:NON\n")
            output.write("Dürfen\tDürfen\tSUB:NOM:SIN:NEU\n")
            output.write("dürfen\tdürfen\tVER:INF:NON:NON\n")
            output.write("du\u0308rfst\tdu\u0308rfen\tVER:2:SIN:PRS:IND\n")
            output.write("Häusern\tHaus\tSUB:DAT:PLU:NEU\n")
            output.write("geradeaus\tgeradeaus\tADV\n")
            output.write("irrelevant\tnicht-vorhanden\tNN\n")

    def tearDown(self):
        self.temp_dir.cleanup()

    def import_data(self):
        call_command(
            "import_local_dictionary",
            wikdict=self.wikdict,
            morphology=self.morphology,
            handedict=self.handedict,
            verbosity=0,
        )

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
        duerfen = DictionaryEntry.objects.get(source="wikdict", headword="dürfen")
        haus = DictionaryEntry.objects.get(source="wikdict", headword="Haus")
        self.assertTrue(DictionaryForm.objects.filter(entry=gehen, form="gehen", morphology_tag="").exists())
        self.assertTrue(DictionaryForm.objects.filter(entry=gehen, form="ging", morphology_tag="VER:1:SIN:PRT:NON").exists())
        self.assertFalse(DictionaryForm.objects.filter(entry=gehen_noun, form="ging").exists())
        self.assertEqual(gehen.part_of_speech, "verb")
        nfc_key = unicodedata.normalize("NFC", "du\u0308rfen").strip().casefold()
        self.assertEqual(duerfen.normalized_headword, nfc_key)
        self.assertEqual(duerfen.part_of_speech, "verb")
        self.assertFalse(DictionaryForm.objects.filter(entry=duerfen, morphology_tag__startswith="SUB").exists())
        self.assertFalse(DictionaryForm.objects.filter(entry=duerfen, form="Dürfen").exists())
        self.assertTrue(
            DictionaryForm.objects.filter(
                entry=duerfen,
                form="du\u0308rfst",
                normalized_form=unicodedata.normalize("NFC", "du\u0308rfst").casefold(),
            ).exists()
        )
        self.assertTrue(DictionaryForm.objects.filter(entry=haus, form="Häusern", morphology_tag="SUB:DAT:PLU:NEU").exists())
        self.assertEqual(haus.part_of_speech, "noun")
        self.assertFalse(DictionaryForm.objects.filter(form="irrelevant").exists())

    def test_import_is_idempotent(self):
        self.import_data()
        first = (DictionaryEntry.objects.count(), DictionaryForm.objects.count())
        self.import_data()
        self.assertEqual((DictionaryEntry.objects.count(), DictionaryForm.objects.count()), first)

    def test_handedict_import_accepts_single_terms_and_chinese_homonyms(self):
        self.import_data()

        self.assertTrue(DictionaryEntry.objects.filter(source="handedict", headword="geradeaus", translation_zh="直前").exists())
        self.assertTrue(DictionaryEntry.objects.filter(source="handedict", headword="Katze", translation_zh="猫").exists())
        self.assertTrue(DictionaryEntry.objects.filter(source="handedict", headword="Katze", translation_zh="貓").exists())
        self.assertTrue(DictionaryEntry.objects.filter(source="handedict", headword="Kater", translation_zh="猫").exists())
        self.assertTrue(DictionaryEntry.objects.filter(source="handedict", headword="schnell-gehend", translation_zh="高速").exists())
        self.assertEqual(DictionaryEntry.objects.get(source="handedict", headword="geradeaus").part_of_speech, "adverb")
        self.assertEqual(DictionaryEntry.objects.get(source="handedict", headword="Katze", translation_zh="猫").part_of_speech, "noun")
        self.assertEqual(DictionaryEntry.objects.get(source="handedict", headword="schnell-gehend").part_of_speech, "adjective")

    def test_handedict_rejects_prose_and_expands_morphology(self):
        self.import_data()

        self.assertFalse(DictionaryEntry.objects.filter(source="handedict", translation_zh__in=["开车", "道理", "例句"]).exists())
        adverb = DictionaryEntry.objects.get(source="handedict", headword="geradeaus")
        self.assertTrue(DictionaryForm.objects.filter(entry=adverb, form="geradeaus", normalized_form="geradeaus").exists())
        self.assertTrue(DictionaryForm.objects.filter(entry=adverb, form="geradeaus", morphology_tag="ADV").exists())

        third_party = DictionaryEntry.objects.create(
            source="partner", headword="Pilot", normalized_headword="pilot", translation_zh="试航"
        )
        DictionaryForm.objects.create(entry=third_party, form="Piloten", normalized_form="piloten")
        self.import_data()
        self.assertTrue(DictionaryEntry.objects.filter(pk=third_party.pk).exists())
        self.assertTrue(DictionaryForm.objects.filter(entry=third_party, form="Piloten").exists())

    def test_missing_input_file_raises_command_error(self):
        with self.assertRaisesMessage(CommandError, "Morphology file not found"):
            call_command(
                "import_local_dictionary",
                wikdict=self.wikdict,
                morphology=Path(self.temp_dir.name) / "missing.tsv.gz",
                handedict=self.handedict,
                verbosity=0,
            )

    def test_missing_handedict_raises_command_error(self):
        with self.assertRaisesMessage(CommandError, "HanDeDict file not found"):
            call_command(
                "import_local_dictionary",
                wikdict=self.wikdict,
                morphology=self.morphology,
                handedict=Path(self.temp_dir.name) / "missing.u8",
                verbosity=0,
            )
