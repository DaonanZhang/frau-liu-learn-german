from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Entitlement, Module
from apps.exam_preparation.models import ExamVocabularyCard, UserExamVocabularyFavorite
from apps.exam_preparation.vocabulary import normalize_vocabulary_term
from apps.lexicon.models import DictionaryEntry, DictionaryForm


class DictionaryApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13800139881", password="pw")
        self.other_user = User.objects.create_user(telephone="13800139882", password="pw")
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation", defaults={"name": "备考季"}
        )
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.lookup_url = reverse("lexicon-dictionary-lookup")
        self.gehen = self.make_entry("gehen", "走", "verb", 20)
        self.haus = self.make_entry("Haus", "房子", "noun", 10)
        self.add_form(self.gehen, "gehen", "")
        self.add_form(self.gehen, "ging", "VER:1:SIN:PRT:NON")
        self.add_form(self.gehen, "ging", "VER:3:SIN:PRT:NON")
        self.add_form(self.haus, "Haus", "")
        self.add_form(self.haus, "Häusern", "SUB:DAT:PLU:NEU")

    @staticmethod
    def make_entry(headword, translation, pos="", importance=None):
        return DictionaryEntry.objects.create(
            source="wikdict",
            headword=headword,
            normalized_headword=headword.strip().casefold(),
            translation_zh=translation,
            part_of_speech=pos,
            importance=importance,
        )

    @staticmethod
    def add_form(entry, form, tag):
        return DictionaryForm.objects.create(
            entry=entry,
            form=form,
            normalized_form=form.strip().casefold(),
            morphology_tag=tag,
        )

    def favorite_url(self, entry):
        return reverse("lexicon-dictionary-entry-favorite", args=[entry.pk])

    def make_card(self, entry):
        return ExamVocabularyCard.objects.create(
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
        response = self.client.get(self.lookup_url, {"word": " ging "})

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

    def test_post_delete_favorite_are_idempotent_and_isolated_by_user(self):
        post_url = self.favorite_url(self.gehen)
        first = self.client.post(post_url)
        second = self.client.post(post_url)
        card = ExamVocabularyCard.objects.get(
            exam_type="TELC",
            level="C1",
            normalized_term="gehen",
            translation_zh="走",
        )
        self.assertEqual(first.data["card"], {"id": card.pk, "is_favorite": True})
        self.assertEqual(second.data, first.data)
        self.assertEqual(UserExamVocabularyFavorite.objects.filter(card=card).count(), 1)
        self.assertEqual(card.kind, ExamVocabularyCard.Kind.WORD)
        self.assertEqual(card.part_of_speech, "verb")

        UserExamVocabularyFavorite.objects.create(user=self.other_user, card=card)
        self.assertEqual(self.client.delete(post_url).data, {"card": {"id": card.pk, "is_favorite": False}})
        self.assertEqual(self.client.delete(post_url).data, {"card": {"id": card.pk, "is_favorite": False}})
        self.assertFalse(UserExamVocabularyFavorite.objects.filter(user=self.user, card=card).exists())
        self.assertTrue(UserExamVocabularyFavorite.objects.filter(user=self.other_user, card=card).exists())

    def test_delete_without_existing_card_and_unknown_entry(self):
        self.assertEqual(self.client.delete(self.favorite_url(self.haus)).data, {"card": None})
        missing = reverse("lexicon-dictionary-entry-favorite", args=[999999])
        self.assertEqual(self.client.post(missing).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.delete(missing).status_code, status.HTTP_404_NOT_FOUND)

    def test_endpoints_require_authentication_and_module_entitlement(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.lookup_url, {"word": "ging"}).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.post(self.favorite_url(self.gehen)).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.delete(self.favorite_url(self.gehen)).status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(self.other_user)
        self.assertEqual(self.client.get(self.lookup_url, {"word": "ging"}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(self.favorite_url(self.gehen)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(self.favorite_url(self.gehen)).status_code, status.HTTP_403_FORBIDDEN)
