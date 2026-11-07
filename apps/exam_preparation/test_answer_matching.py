from django.test import SimpleTestCase

from apps.exam_preparation.answer_matching import answer_matches


class AnswerMatchingTests(SimpleTestCase):
    def test_alternative_solutions_are_case_insensitive(self):
        self.assertTrue(answer_matches(
            "didaktische Spiele <or> therapeutische Spiele",
            "THERAPEUTISCHE SPIELE",
        ))
        self.assertFalse(answer_matches(
            "didaktische Spiele <or> therapeutische Spiele",
            "therapeutische",
        ))

    def test_optional_fragments_expand_as_literal_variants(self):
        expected = "Bücher werden weiter(hin) <or> (immer) noch <or> in Zukunft gelesen"
        for actual in (
            "Bücher werden weiter",
            "Bücher werden weiterhin",
            "noch",
            "immer noch",
            "in Zukunft gelesen",
        ):
            with self.subTest(actual=actual):
                self.assertTrue(answer_matches(expected, actual))
        self.assertFalse(answer_matches(expected, "Bücher werden weitergeht"))

    def test_semicolon_components_are_unordered_but_all_required(self):
        self.assertTrue(answer_matches("doppelsinnig;lustig", "lustig; doppelsinnig"))
        self.assertFalse(answer_matches("doppelsinnig;lustig", "doppelsinnig"))
        self.assertFalse(answer_matches("doppelsinnig;lustig", "doppelsinnig; lustig; extra"))

    def test_alternative_multi_component_solutions_and_optional_word_parts(self):
        expected = "Lieder; Theater(stücke) <or> Stücke <or> Interviews;Hörspiele"
        self.assertTrue(answer_matches(expected, "Theaterstücke; Lieder"))
        self.assertTrue(answer_matches(expected, "Interviews; Hörspiele"))
        self.assertTrue(answer_matches(expected, "Stücke"))
        self.assertFalse(answer_matches(expected, "Interviews"))

    def test_multiple_optional_groups_expand_independently(self):
        expected = "(Literatur-)Interpretation(en)"
        for actual in (
            "Interpretation", "Interpretationen", "Literatur-Interpretation",
            "Literatur-Interpretationen",
        ):
            with self.subTest(actual=actual):
                self.assertTrue(answer_matches(expected, actual))
        self.assertFalse(answer_matches(expected, "LiteraturInterpretation"))

    def test_normalized_exact_match_and_empty_values(self):
        self.assertTrue(answer_matches("Lernen", "  LERNEN!  "))
        self.assertTrue(answer_matches("Straße", "STRASSE"))
        self.assertTrue(answer_matches("für alle", "für   alle"))
        self.assertFalse(answer_matches("Lernen", "Lernender"))
        self.assertFalse(answer_matches("", ""))
        self.assertFalse(answer_matches("Lernen", ""))
        self.assertFalse(answer_matches("", "Lernen"))
