from __future__ import annotations

from io import StringIO
import json
from urllib.error import HTTPError
from unittest.mock import patch

from django.core.management import call_command, CommandError
from django.test import TestCase

from apps.exam_preparation.management.commands.enrich_exam_vocabulary import (
    fetch_wiktionary_pages,
    parse_german_vocabulary,
)
from apps.exam_preparation.models import ExamVocabularyCard


def make_card(term, **kwargs):
    defaults = {
        "exam_type": "TELC",
        "level": "C1",
        "term": term,
        "normalized_term": term.casefold(),
        "translation_zh": "中文",
    }
    defaults.update(kwargs)
    return ExamVocabularyCard.objects.create(**defaults)


class WiktionaryVocabularyParserTests(TestCase):
    def test_noun_feminine_without_plural(self):
        parsed = parse_german_vocabulary("""== Nomen ({{Sprache|Deutsch}}) ==
=== {{Wortart|Substantiv|Deutsch}} ===
{{Deutsch Substantiv Übersicht
|Genus=f
|Nominativ Singular=[[Antrag]]
|Nominativ Plural=—
}}
== {{Sprache|Englisch}} ==
{{Deutsch Substantiv Übersicht|Genus=m|Nominativ Plural=Anträge}}
""")
        self.assertEqual(parsed, {"part_of_speech": "Substantiv", "article": "die"})

    def test_noun_plural_and_numbered_fallback(self):
        parsed = parse_german_vocabulary("""== Antrag ({{Sprache|Deutsch}}) ==
=== {{Wortart|Substantiv|Deutsch}} ===
{{Deutsch Substantiv Übersicht
|Genus=m
|Nominativ Plural 1=—
|Nominativ Plural 2=[[Anträge]]
}}
""")
        self.assertEqual(parsed["article"], "der")
        self.assertEqual(parsed["plural"], "Anträge")

    def test_inline_overview_parameters_are_supported(self):
        parsed = parse_german_vocabulary("""== Antrag ({{Sprache|Deutsch}}) ==
=== {{Wortart|Substantiv|Deutsch}} ===
{{Deutsch Substantiv Übersicht|Genus=n|Nominativ Plural=Anträge}}
""")
        self.assertEqual(parsed["article"], "das")
        self.assertEqual(parsed["plural"], "Anträge")

    def test_verb_forms_are_extracted_without_example_sentences(self):
        parsed = parse_german_vocabulary("""== beantragen ({{Sprache|Deutsch}}) ==
=== {{Wortart|Verb|Deutsch}} ===
{{Deutsch Verb Übersicht
|Präsens_ich=beantrage
|Präteritum_ich=beantragte
|Partizip II=beantragt
|Beispiele={{Beispiel|Ich beantrage etwas.}}
}}
""")
        self.assertEqual(parsed["verb_forms"], {
            "Präsens ich": "beantrage",
            "Präteritum ich": "beantragte",
            "Partizip II": "beantragt",
        })
        self.assertNotIn("Beispiel", str(parsed))

    def test_missing_or_non_german_page_has_no_result(self):
        self.assertEqual(parse_german_vocabulary("== Wort ({{Sprache|Englisch}}) ==\n{{Wortart|Nomen|Deutsch}}"), {})
        self.assertEqual(parse_german_vocabulary("no language section"), {})

    def test_wortart_fehltemplate_is_not_mistaken_for_wortart(self):
        parsed = parse_german_vocabulary("""== Akademisierung ({{Sprache|Deutsch}}) ==
{{Wortart fehlt|Deutsch}}
{{Deutsch Substantiv Übersicht|Genus=f}}
""")
        self.assertNotIn("part_of_speech", parsed)

        regular = parse_german_vocabulary("""== Antrag ({{Sprache|Deutsch}}) ==
{{Wortart|Substantiv|Deutsch}}
""")
        self.assertEqual(regular["part_of_speech"], "Substantiv")

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.urlopen")
    def test_api_normalized_and_redirect_titles_map_back_to_requested_title(self, urlopen):
        payload = {
            "query": {
                "normalized": [{"from": "beantragen", "to": "Beantragen"}],
                "redirects": [{"from": "Beantragen", "to": "beantragen (Verb)"}],
                "pages": [{
                    "title": "beantragen (Verb)",
                    "revisions": [{"slots": {"main": {"content": "wiki"}}}],
                }],
            }
        }

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def read(self):
                return json.dumps(payload).encode("utf-8")

        urlopen.return_value = Response()
        self.assertEqual(fetch_wiktionary_pages(["beantragen"]), {"beantragen": "wiki"})

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.sleep")
    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.urlopen")
    def test_http_429_retries_and_honors_retry_after(self, urlopen, sleep):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def read(self):
                return b'{"query":{"pages":[]}}'

        urlopen.side_effect = [
            HTTPError("https://de.wiktionary.org/w/api.php", 429, "Too Many Requests", {"Retry-After": "0.5"}, None),
            Response(),
        ]
        self.assertEqual(fetch_wiktionary_pages(["Wort"]), {})
        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(0.5)

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.sleep")
    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.urlopen")
    def test_http_429_stops_after_three_total_attempts_and_keeps_batch_context(self, urlopen, sleep):
        error = HTTPError("https://de.wiktionary.org/w/api.php", 429, "Too Many Requests", {"Retry-After": "99"}, None)
        urlopen.side_effect = [error, error, error]
        make_card("Wort")
        with self.assertRaisesRegex(CommandError, r"batch 1/1 .*429"):
            call_command("enrich_exam_vocabulary")
        self.assertEqual(urlopen.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [30.0, 30.0])


class EnrichExamVocabularyCommandTests(TestCase):
    def setUp(self):
        self.noun = make_card("der Antrag")
        self.verb = make_card("sich beantragen", normalized_term="sich beantragen")
        self.pages = {
            "Antrag": """== Antrag ({{Sprache|Deutsch}}) ==
{{Wortart|Substantiv|Deutsch}}
{{Deutsch Substantiv Übersicht
|Genus=m
|Nominativ Plural=Anträge
}}
""",
            "beantragen": """== beantragen ({{Sprache|Deutsch}}) ==
{{Wortart|Verb|Deutsch}}
{{Deutsch Verb Übersicht
|Präsens_ich=beantrage
|Präteritum_ich=beantragte
|Partizip II=beantragt
}}
""",
        }

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.fetch_wiktionary_pages")
    def test_command_maps_query_titles_and_fills_fields(self, fetch):
        fetch.return_value = self.pages
        output = StringIO()
        call_command("enrich_exam_vocabulary", stdout=output)
        fetch.assert_called_once_with(["Antrag", "beantragen"])
        self.noun.refresh_from_db()
        self.verb.refresh_from_db()
        self.assertEqual((self.noun.part_of_speech, self.noun.article, self.noun.plural), ("Substantiv", "der", "Anträge"))
        self.assertEqual(self.verb.verb_forms["Präteritum ich"], "beantragte")
        self.assertIn("updated=2", output.getvalue())

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.fetch_wiktionary_pages")
    def test_existing_values_are_preserved_unless_overwrite_is_explicit(self, fetch):
        self.noun.part_of_speech = "Nomen"
        self.noun.article = "das"
        self.noun.plural = "Formen"
        self.noun.save()
        self.verb.verb_forms = {"custom": "preserve me"}
        self.verb.save()
        fetch.return_value = self.pages
        call_command("enrich_exam_vocabulary")
        self.noun.refresh_from_db()
        self.verb.refresh_from_db()
        self.assertEqual((self.noun.part_of_speech, self.noun.article, self.noun.plural), ("Nomen", "das", "Formen"))
        self.assertEqual(self.verb.verb_forms, {"custom": "preserve me"})

        call_command("enrich_exam_vocabulary", overwrite=True)
        self.noun.refresh_from_db()
        self.verb.refresh_from_db()
        self.assertEqual((self.noun.part_of_speech, self.noun.article, self.noun.plural), ("Substantiv", "der", "Anträge"))
        self.assertEqual(self.verb.verb_forms["Präsens ich"], "beantrage")

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.fetch_wiktionary_pages")
    def test_dry_run_counts_changes_without_writing(self, fetch):
        fetch.return_value = self.pages
        output = StringIO()
        call_command("enrich_exam_vocabulary", dry_run=True, stdout=output)
        self.noun.refresh_from_db()
        self.assertEqual(self.noun.article, "")
        self.assertIn("updated=2", output.getvalue())
        self.assertIn("dry_run=true", output.getvalue())

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.fetch_wiktionary_pages")
    def test_batches_contain_at_most_fifty_titles(self, fetch):
        for number in range(49):
            make_card(f"Wort{number}")
        fetch.return_value = {}
        call_command("enrich_exam_vocabulary")
        self.assertEqual([len(call.args[0]) for call in fetch.call_args_list], [50, 1])

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.sleep")
    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.fetch_wiktionary_pages")
    def test_command_sleeps_between_batches_but_not_after_last(self, fetch, sleep):
        for number in range(49):
            make_card(f"Weiter{number}")
        fetch.return_value = {}
        call_command("enrich_exam_vocabulary")
        sleep.assert_called_once_with(0.75)

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.fetch_wiktionary_pages")
    def test_missing_page_is_counted_and_skipped(self, fetch):
        fetch.return_value = {"Antrag": self.pages["Antrag"]}
        output = StringIO()
        call_command("enrich_exam_vocabulary", stdout=output)
        self.assertIn("missing=1", output.getvalue())

    @patch("apps.exam_preparation.management.commands.enrich_exam_vocabulary.fetch_wiktionary_pages")
    def test_api_error_reports_batch_context(self, fetch):
        fetch.side_effect = ValueError("bad response")
        with self.assertRaisesRegex(CommandError, r"batch 1/1 .*bad response"):
            call_command("enrich_exam_vocabulary")
