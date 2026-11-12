import gzip
import sqlite3
from collections import defaultdict
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.lexicon.models import DictionaryEntry, DictionaryForm
from apps.lexicon.models.dictionary import normalize_dictionary_form


DEFAULT_WIKDICT = Path(settings.BASE_DIR) / "apps/lexicon/data/external/wikdict/de-zh.sqlite3"
MORPHOLOGY_DIR = Path(settings.BASE_DIR) / "apps/lexicon/data/external/morphology"
BATCH_SIZE = 1000


def pos_from_tag(tag):
    upper = tag.upper()
    parts = upper.replace("_", " ").replace("-", " ").replace(":", " ").split()
    if "SUB" in parts or any(part.startswith(("NN", "NE")) for part in parts):
        return "noun"
    if "VER" in parts or any(part.startswith(("VV", "VA", "VM")) for part in parts):
        return "verb"
    if "ADJ" in parts or any(part.startswith("ADJ") for part in parts):
        return "adjective"
    if "ADV" in parts or any(part.startswith("ADV") for part in parts):
        return "adverb"
    return ""


class Command(BaseCommand):
    help = "Import the local German-Chinese dictionary and German morphology data."

    def add_arguments(self, parser):
        parser.add_argument("--wikdict", type=Path, default=DEFAULT_WIKDICT)
        parser.add_argument("--morphology", type=Path)

    def handle(self, *args, **options):
        wikdict_path = options["wikdict"]
        morphology_path = options["morphology"]
        if morphology_path is None:
            matches = sorted(MORPHOLOGY_DIR.glob("*.tsv.gz"))
            if len(matches) != 1:
                raise CommandError(
                    f"Expected one morphology *.tsv.gz file in {MORPHOLOGY_DIR}; "
                    "pass --morphology to select a file."
                )
            morphology_path = matches[0]
        for path, label in ((wikdict_path, "WikDict"), (morphology_path, "Morphology")):
            if not path.is_file():
                raise CommandError(f"{label} file not found: {path}")

        try:
            entries = self._read_entries(wikdict_path)
            with transaction.atomic():
                DictionaryEntry.objects.filter(source="wikdict").delete()
                DictionaryEntry.objects.bulk_create(entries, batch_size=BATCH_SIZE)
                by_exact_lemma = defaultdict(list)
                by_normalized_lemma = defaultdict(list)
                for entry in entries:
                    by_exact_lemma[entry.headword].append(entry)
                    by_normalized_lemma[entry.normalized_headword].append(entry)
                forms = [
                    DictionaryForm(
                        entry=entry,
                        form=entry.headword,
                        normalized_form=entry.normalized_headword,
                    )
                    for entry in entries
                ]
                DictionaryForm.objects.bulk_create(forms, batch_size=BATCH_SIZE, ignore_conflicts=True)
                skipped = self._read_morphology(
                    morphology_path, by_exact_lemma, by_normalized_lemma
                )
                updates = [entry for entry in entries if entry.part_of_speech]
                if updates:
                    DictionaryEntry.objects.bulk_update(updates, ["part_of_speech"], batch_size=BATCH_SIZE)
                entry_count = len(entries)
                form_count = DictionaryForm.objects.filter(entry__source="wikdict").count()
        except (OSError, UnicodeError, sqlite3.Error, ValueError) as exc:
            raise CommandError(f"Dictionary import failed: {exc}") from exc

        self.stdout.write(
            f"Imported entries={entry_count} forms={form_count} skipped={skipped}"
        )

    def _read_entries(self, path):
        connection = sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)
        try:
            rows = connection.execute(
                "SELECT written_rep, trans_list, max_score, rel_importance FROM simple_translation"
            )
            entry_map = {}
            skipped = 0
            for headword, translations, max_score, importance in rows:
                headword = (headword or "").strip()
                glosses = [part.strip() for part in (translations or "").split("|") if part.strip()]
                if not headword or not glosses:
                    skipped += 1
                    continue
                normalized = normalize_dictionary_form(headword)
                for gloss in glosses:
                    key = (headword, gloss)
                    current = entry_map.get(key)
                    if current is None:
                        entry_map[key] = DictionaryEntry(
                            source="wikdict",
                            headword=headword,
                            normalized_headword=normalized,
                            translation_zh=gloss,
                            importance=importance if importance is not None else max_score,
                        )
                    elif current.importance is None and importance is not None:
                        current.importance = importance
            self.skipped_entries = skipped
            return list(entry_map.values())
        finally:
            connection.close()

    def _read_morphology(self, path, by_exact_lemma, by_normalized_lemma):
        forms = []
        skipped = 0
        with gzip.open(path, "rt", encoding="utf-8") as source:
            for line_number, raw_line in enumerate(source, 1):
                columns = raw_line.rstrip("\r\n").split("\t")
                if len(columns) != 3:
                    raise ValueError(f"Morphology line {line_number} must have exactly three TSV columns")
                surface, lemma, tag = (column.strip() for column in columns)
                matching = (
                    by_exact_lemma.get(lemma)
                    or by_normalized_lemma.get(normalize_dictionary_form(lemma), [])
                    if lemma
                    else []
                )
                if not surface or not matching:
                    skipped += 1
                    continue
                pos = pos_from_tag(tag)
                for entry in matching:
                    forms.append(
                        DictionaryForm(
                            entry=entry,
                            form=surface,
                            normalized_form=normalize_dictionary_form(surface),
                            morphology_tag=tag,
                        )
                    )
                    if not entry.part_of_speech and pos:
                        entry.part_of_speech = pos
                if len(forms) >= BATCH_SIZE:
                    DictionaryForm.objects.bulk_create(forms, batch_size=BATCH_SIZE, ignore_conflicts=True)
                    forms.clear()
        if forms:
            DictionaryForm.objects.bulk_create(forms, batch_size=BATCH_SIZE, ignore_conflicts=True)
        return skipped + self.skipped_entries
