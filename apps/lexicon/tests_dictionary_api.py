from importlib import import_module

from django.contrib.auth import get_user_model
from django.apps import apps as django_apps
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.exam_preparation.models import ExamVocabularyCard, UserExamVocabularyFavorite
from apps.exam_preparation.vocabulary import normalize_vocabulary_term
from apps.learning_by_video.models import Video
from apps.lexicon.models import DictionaryEntry, DictionaryForm
from apps.lexicon.models.dictionary import normalize_dictionary_form


class DictionaryApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13800139881", password="pw")
        self.other_user = User.objects.create_user(telephone="13800139882", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.lookup_url = reverse("lexicon-dictionary-lookup")
        self.exam_collection = "exam:TELC:C1"
        self.gehen = self.make_entry("gehen", "走", "verb", 20)
        self.haus = self.make_entry("Haus", "房子", "noun", 10)
        self.duerfen = self.make_entry("dürfen", "可以", "verb", 8)
        self.handedict_match = self.make_entry("gehen", "走", "verb", 100, source="handedict")
        self.add_form(self.gehen, "gehen", "")
        self.add_form(self.gehen, "ging", "VER:1:SIN:PRT:NON")
        self.add_form(self.gehen, "ging", "VER:3:SIN:PRT:NON")
        self.add_form(self.haus, "Haus", "")
        self.add_form(self.haus, "Häusern", "SUB:DAT:PLU:NEU")
        self.add_form(self.duerfen, "dürfen", "")

    def test_lookup_matches_precomposed_and_decomposed_unicode_forms(self):
        precomposed = self.client.get(self.lookup_url, {"word": "dürfen"})
        decomposed = self.client.get(self.lookup_url, {"word": "du\u0308rfen"})

        self.assertEqual(precomposed.status_code, status.HTTP_200_OK)
        self.assertEqual(decomposed.status_code, status.HTTP_200_OK)
        expected = [{"id": self.duerfen.pk, "lemma": "dürfen", "translation_zh": "可以"}]
        for response in (precomposed, decomposed):
            self.assertTrue(response.data["matched"])
            self.assertEqual(
                [
                    {key: match[key] for key in ("id", "lemma", "translation_zh")}
                    for match in response.data["matches"]
                ],
                expected,
            )

    def test_legacy_nfd_vocabulary_card_is_reused_after_normalization(self):
        legacy_term = "du\u0308rfen"
        card = ExamVocabularyCard.objects.create(
            collection_key=self.exam_collection,
            exam_type="TELC",
            level="C1",
            kind=ExamVocabularyCard.Kind.WORD,
            term=legacy_term,
            normalized_term=legacy_term.casefold(),
            translation_zh="可以",
        )
        UserExamVocabularyFavorite.objects.create(user=self.user, card=card)
        migration = import_module("apps.exam_preparation.migrations.0033_normalize_vocabulary_unicode")
        migration.normalize_existing_cards(django_apps, None)

        for word in ("dürfen", legacy_term):
            match = self.client.get(self.lookup_url, {"word": word, "collection_key": self.exam_collection}).data["matches"][0]
            self.assertEqual(match["card"], {"id": card.pk, "is_favorite": True})
        response = self.client.post(self.favorite_url(self.duerfen), {"collection_key": self.exam_collection}, format="json")
        self.assertEqual(response.data, {"card": {"id": card.pk, "is_favorite": True}})
        self.assertEqual(
            ExamVocabularyCard.objects.filter(
                normalized_term=normalize_vocabulary_term("dürfen"), translation_zh="可以"
            ).count(),
            1,
        )

    def test_lookup_keeps_distinct_simplified_translations_from_mixed_sources(self):
        handedict = self.make_entry("gehen", "前往", source="handedict")
        self.add_form(handedict, "ging", "VER:1:SIN:PRT:NON")
        response = self.client.get(self.lookup_url, {"word": "ging"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [match["translation_zh"] for match in response.data["matches"]],
            ["走", "前往"],
        )

    def test_lookup_hides_traditional_when_simplified_translation_exists(self):
        traditional = self.make_entry("gehen", "貓", source="handedict")
        simplified = self.make_entry("gehen", "猫", source="wikdict")
        for entry in (traditional, simplified):
            self.add_form(entry, "shared", "")

        matches = self.client.get(self.lookup_url, {"word": "shared"}).data["matches"]

        self.assertEqual([match["id"] for match in matches], [simplified.pk])

    def test_lookup_hides_traditional_contextual_translation_when_simplified_exists(self):
        traditional = self.make_entry("gehen", "受到表揚", source="handedict")
        simplified = self.make_entry("gehen", "受到表扬", source="wikdict")
        for entry in (traditional, simplified):
            self.add_form(entry, "contextual", "")

        matches = self.client.get(self.lookup_url, {"word": "contextual"}).data["matches"]

        self.assertEqual([match["id"] for match in matches], [simplified.pk])

    def test_lookup_keeps_simplified_advantage_translation_with_reverse_pairs(self):
        traditional = self.make_entry("gehen", "優點", source="handedict")
        simplified = self.make_entry("gehen", "优点", source="wikdict")
        other = self.make_entry("gehen", "好处", source="wikdict")
        for entry in (traditional, simplified, other):
            self.add_form(entry, "advantages", "")

        matches = self.client.get(self.lookup_url, {"word": "advantages"}).data["matches"]
        translations = [match["translation_zh"] for match in matches]

        self.assertIn("优点", translations)
        self.assertIn("好处", translations)
        self.assertNotIn("優點", translations)

    def test_lookup_keeps_distinct_simplified_aal_translations(self):
        first = self.make_entry("Aal", "鲡", source="handedict")
        second = self.make_entry("Aal", "鳝鱼", source="handedict")
        for entry in (first, second):
            self.add_form(entry, "aal", "")

        matches = self.client.get(self.lookup_url, {"word": "aal"}).data["matches"]

        self.assertEqual([match["translation_zh"] for match in matches], ["鲡", "鳝鱼"])

    def test_lookup_deduplicates_displayed_translations_after_stripping_whitespace(self):
        first = self.make_entry("gehen", "走路", source="wikdict")
        duplicate = self.make_entry("laufen", " 走路 ", source="handedict")
        for entry in (first, duplicate):
            self.add_form(entry, "shared", "")

        matches = self.client.get(self.lookup_url, {"word": "shared"}).data["matches"]

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["id"], first.pk)
        self.assertEqual(matches[0]["translation_zh"], "走路")

    def test_lookup_keeps_traditional_when_no_simplified_candidate_exists(self):
        traditional = self.make_entry("gehen", "貓", source="wikdict")
        self.add_form(traditional, "traditional-only", "")

        matches = self.client.get(self.lookup_url, {"word": "traditional-only"}).data["matches"]

        self.assertEqual([match["id"] for match in matches], [traditional.pk])

    @staticmethod
    def make_entry(headword, translation, pos="", importance=None, source="wikdict"):
        return DictionaryEntry.objects.create(
            source=source,
            headword=headword,
            normalized_headword=normalize_dictionary_form(headword),
            translation_zh=translation,
            part_of_speech=pos,
            importance=importance,
        )

    @staticmethod
    def add_form(entry, form, tag):
        return DictionaryForm.objects.create(
            entry=entry,
            form=form,
            normalized_form=normalize_dictionary_form(form),
            morphology_tag=tag,
        )

    def favorite_url(self, entry):
        return reverse("lexicon-dictionary-entry-favorite", args=[entry.pk])

    def make_card(self, entry):
        return ExamVocabularyCard.objects.create(
            collection_key=self.exam_collection,
            exam_type="TELC",
            level="C1",
            kind=ExamVocabularyCard.Kind.WORD,
            term=entry.headword,
            normalized_term=normalize_vocabulary_term(entry.headword),
            translation_zh=entry.translation_zh,
            part_of_speech=entry.part_of_speech,
        )

    def test_exact_and_morphology_lookup_deduplicates_forms_and_returns_favorite(self):
        card = self.make_card(self.gehen)
        UserExamVocabularyFavorite.objects.create(user=self.user, card=card)
        response = self.client.get(self.lookup_url, {"word": " ging ", "collection_key": self.exam_collection})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["query"], "ging")
        self.assertTrue(response.data["matched"])
        self.assertEqual(len(response.data["matches"]), 1)
        self.assertEqual(response.data["matches"][0]["matched_form"], "ging")
        self.assertEqual(response.data["matches"][0]["lemma"], "gehen")
        self.assertEqual(response.data["matches"][0]["card"], {"id": card.pk, "is_favorite": True})

        exact = self.make_entry("ging", "忽然")
        self.add_form(exact, "Ging", "")
        exact_response = self.client.get(self.lookup_url, {"word": "Ging"})
        self.assertEqual(exact_response.data["matches"][0]["lemma"], "ging")

    def test_lookup_returns_empty_for_no_match_and_validates_word(self):
        response = self.client.get(self.lookup_url, {"word": "unknown"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"query": "unknown", "matched": False, "matches": []})
        self.assertEqual(self.client.get(self.lookup_url).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.get(self.lookup_url, {"word": " "}).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.get(self.lookup_url, {"word": "a" * 129}).status_code, status.HTTP_400_BAD_REQUEST)

    def test_lookup_returns_headword_exact_form_and_caps_sorted_distinct_entries_at_eight(self):
        exact = self.client.get(self.lookup_url, {"word": "Haus"}).data["matches"]
        self.assertEqual(exact[0]["matched_form"], "Haus")
        self.assertEqual(self.client.get(self.lookup_url, {"word": "Häusern"}).data["matches"][0]["lemma"], "Haus")

        for index in range(10):
            entry = self.make_entry(f"word-{index}", f"译义{index}", importance=index)
            self.add_form(entry, "shared", f"TAG:{index}")
        results = self.client.get(self.lookup_url, {"word": "shared"}).data["matches"]
        self.assertEqual(len(results), 8)
        self.assertEqual(results[0]["lemma"], "word-9")
        self.assertEqual(len({result["id"] for result in results}), 8)

    def test_nfc_and_nfd_queries_return_same_first_eight_candidates_in_same_order(self):
        composed = "dürfen"
        decomposed = "du\u0308rfen"
        for index in range(10):
            entry = self.make_entry(f"lemma-{index}", f"译义{index}", importance=10 - index)
            form = composed if index % 2 == 0 else decomposed
            self.add_form(entry, form, f"TAG:{index}")

        nfc_results = self.client.get(self.lookup_url, {"word": composed}).data["matches"]
        nfd_results = self.client.get(self.lookup_url, {"word": decomposed}).data["matches"]

        self.assertEqual(len(nfc_results), 8)
        self.assertEqual([item["id"] for item in nfc_results], [item["id"] for item in nfd_results])
        self.assertEqual([item["matched_form"] for item in nfc_results], [item["matched_form"] for item in nfd_results])

    def test_post_delete_favorite_are_idempotent_and_isolated_by_user(self):
        post_url = self.favorite_url(self.gehen)
        first = self.client.post(post_url, {"collection_key": self.exam_collection}, format="json")
        second = self.client.post(post_url, {"collection_key": self.exam_collection}, format="json")
        card = ExamVocabularyCard.objects.get(
            collection_key=self.exam_collection,
            normalized_term="gehen",
            translation_zh="走",
        )
        self.assertEqual(first.data["card"], {"id": card.pk, "is_favorite": True})
        self.assertEqual(second.data, first.data)
        self.assertEqual(UserExamVocabularyFavorite.objects.filter(card=card).count(), 1)
        self.assertEqual(card.kind, ExamVocabularyCard.Kind.WORD)
        self.assertEqual(card.part_of_speech, "verb")

        UserExamVocabularyFavorite.objects.create(user=self.other_user, card=card)
        self.assertEqual(self.client.delete(post_url, {"collection_key": self.exam_collection}, format="json").data, {"card": {"id": card.pk, "is_favorite": False}})
        self.assertEqual(self.client.delete(post_url, {"collection_key": self.exam_collection}, format="json").data, {"card": {"id": card.pk, "is_favorite": False}})
        self.assertFalse(UserExamVocabularyFavorite.objects.filter(user=self.user, card=card).exists())
        self.assertTrue(UserExamVocabularyFavorite.objects.filter(user=self.other_user, card=card).exists())

    def test_delete_without_existing_card_and_unknown_entry(self):
        self.assertEqual(self.client.delete(self.favorite_url(self.haus), {"collection_key": self.exam_collection}, format="json").data, {"card": None})
        missing = reverse("lexicon-dictionary-entry-favorite", args=[999999])
        payload = {"collection_key": self.exam_collection}
        self.assertEqual(self.client.post(missing, payload, format="json").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.delete(missing, payload, format="json").status_code, status.HTTP_404_NOT_FOUND)

    def test_endpoints_require_authentication_but_not_exam_entitlement(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.lookup_url, {"word": "ging"}).status_code, status.HTTP_401_UNAUTHORIZED)
        payload = {"collection_key": self.exam_collection}
        self.assertEqual(self.client.post(self.favorite_url(self.gehen), payload, format="json").status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.delete(self.favorite_url(self.gehen), payload, format="json").status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(self.other_user)
        self.assertEqual(self.client.get(self.lookup_url, {"word": "ging"}).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(self.favorite_url(self.gehen), payload, format="json").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(self.favorite_url(self.gehen), payload, format="json").status_code, status.HTTP_200_OK)

    def test_lookup_only_attaches_card_from_requested_collection(self):
        card = self.make_card(self.gehen)
        UserExamVocabularyFavorite.objects.create(user=self.user, card=card)
        no_context = self.client.get(self.lookup_url, {"word": "gehen"}).data["matches"][0]
        self.assertIsNone(no_context["card"])
        video = Video.objects.create(title="Test video")
        other_card = ExamVocabularyCard.objects.create(
            collection_key=f"video:{video.pk}", exam_type="", level="", term="gehen",
            normalized_term="gehen", translation_zh="走",
        )
        context = self.client.get(self.lookup_url, {"word": "gehen", "collection_key": f"video:{video.pk}"})
        self.assertEqual(context.data["matches"][0]["card"], {"id": other_card.pk, "is_favorite": False})
        UserExamVocabularyFavorite.objects.create(user=self.user, card=other_card)
        context = self.client.get(self.lookup_url, {"word": "gehen", "collection_key": f"video:{video.pk}"})
        self.assertEqual(context.data["matches"][0]["card"], {"id": other_card.pk, "is_favorite": True})

    def test_collection_key_validation_for_lookup_and_favorite(self):
        for key in ("", "exam:TELC:B3", "exam:Goethe:C1", "video:0", "video:nope", "unknown:1"):
            self.assertEqual(self.client.get(self.lookup_url, {"word": "gehen", "collection_key": key}).status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(self.client.post(self.favorite_url(self.gehen), {"collection_key": key}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.post(self.favorite_url(self.gehen), {}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.delete(self.favorite_url(self.gehen), {}, format="json").status_code, status.HTTP_400_BAD_REQUEST)

    def test_video_collection_favorite_is_scoped_and_missing_video_is_rejected(self):
        video = Video.objects.create(title="A video")
        key = f"video:{video.pk}"
        post_url = self.favorite_url(self.gehen)
        response = self.client.post(post_url, {"collection_key": key}, format="json")
        card = ExamVocabularyCard.objects.get(collection_key=key, normalized_term="gehen", translation_zh="走")
        self.assertEqual(response.data, {"card": {"id": card.pk, "is_favorite": True}})
        self.assertEqual((card.exam_type, card.level), ("", ""))
        self.assertEqual(self.client.delete(post_url, {"collection_key": self.exam_collection}, format="json").data, {"card": None})
        self.assertTrue(UserExamVocabularyFavorite.objects.filter(card=card, user=self.user).exists())
        self.assertEqual(self.client.post(post_url, {"collection_key": "video:999999"}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
