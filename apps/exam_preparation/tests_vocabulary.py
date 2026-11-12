from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Entitlement, Module
from apps.exam_preparation.models import (
    ExerciseBase,
    ExamVocabularyCard,
    ExamVocabularySource,
    UserExamVocabularyFavorite,
    WritingExercise,
)
from apps.exam_preparation.vocabulary import (
    classify_vocabulary_kind,
    default_vocabulary_note,
    sync_writing_vocabulary,
)


def make_writing(content, external_id="vocabulary-test"):
    base = ExerciseBase.objects.create(
        exam_type="TELC",
        level="C1",
        skill=ExerciseBase.Skill.WRITING,
        exercise_type=ExerciseBase.ExerciseType.WRITING_PROMPT,
        external_id=external_id,
    )
    return WritingExercise.objects.create(exercise_base=base, content=content)


class ExamVocabularyModelAndSyncTests(TestCase):
    def test_kind_classification_and_default_notes(self):
        self.assertEqual(classify_vocabulary_kind("Antrag"), ExamVocabularyCard.Kind.WORD)
        self.assertEqual(classify_vocabulary_kind("sich bemühen"), ExamVocabularyCard.Kind.EXPRESSION)
        self.assertEqual(classify_vocabulary_kind("Antrag", "ReDeWendung"), ExamVocabularyCard.Kind.EXPRESSION)
        self.assertEqual(classify_vocabulary_kind("Ein Antrag ist nötig!"), ExamVocabularyCard.Kind.SENTENCE)
        self.assertEqual(default_vocabulary_note(ExamVocabularyCard.Kind.EXPRESSION, "努力"), "表示“努力”的常用表达。")
        self.assertEqual(default_vocabulary_note(ExamVocabularyCard.Kind.SENTENCE, ""), "C1 Hochschule 常用句型。")
        self.assertEqual(default_vocabulary_note(ExamVocabularyCard.Kind.WORD, "申请"), "")

    def test_sync_sets_kind_default_note_and_preserves_existing_note(self):
        exercise = make_writing({"vocabulary_pages": [{"entries": [
            {"term": "Antrag", "translation_zh": "申请", "part_of_speech": "Redewendung"},
        ]}]})
        sync_writing_vocabulary(exercise)
        card = ExamVocabularyCard.objects.get(normalized_term="antrag")
        self.assertEqual(card.kind, ExamVocabularyCard.Kind.EXPRESSION)
        self.assertEqual(card.note, "表示“申请”的常用表达。")

        card.note = "编辑者备注"
        card.save(update_fields=["note"])
        exercise.content["vocabulary_pages"][0]["entries"][0]["part_of_speech"] = "Substantiv"
        exercise.save(update_fields=["content"])
        sync_writing_vocabulary(exercise)
        card.refresh_from_db()
        self.assertEqual(card.kind, ExamVocabularyCard.Kind.WORD)
        self.assertEqual(card.note, "编辑者备注")

    def test_sentence_sync_uses_complete_sentence_note(self):
        exercise = make_writing({"vocabulary_pages": [{"entries": [
            {"term": "Ich bin damit einverstanden.", "translation_zh": "我同意"},
        ]}]})
        sync_writing_vocabulary(exercise)
        card = ExamVocabularyCard.objects.get(normalized_term="ich bin damit einverstanden.")
        self.assertEqual(card.kind, ExamVocabularyCard.Kind.SENTENCE)
        self.assertEqual(card.note, "用于表达“我同意”的完整句型。")

    def test_card_identity_preserves_homonyms_with_different_meanings(self):
        first = ExamVocabularyCard.objects.create(
            exam_type="TELC", level="C1", term="Vermögen", normalized_term="vermögen", translation_zh="财产"
        )
        second = ExamVocabularyCard.objects.create(
            exam_type="TELC", level="C1", term="Vermögen", normalized_term="vermögen", translation_zh="能力"
        )
        self.assertNotEqual(first.pk, second.pk)

    def test_card_identity_rejects_duplicate_meaning(self):
        ExamVocabularyCard.objects.create(
            exam_type="TELC", level="C1", term="Vermögen", normalized_term="vermögen", translation_zh="财产"
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            ExamVocabularyCard.objects.create(
                exam_type="TELC", level="C1", term="vermögen", normalized_term="vermögen", translation_zh="财产"
            )

    def test_sync_keeps_order_removes_stale_source_and_preserves_enrichment(self):
        exercise = make_writing({"vocabulary_pages": [{"entries": [
            {"term": "  sich   bemühen ", "translation_zh": "努力", "part_of_speech": "verb"},
            {"word": "Vermögen", "zh": "财产"},
        ]}]})
        sync_writing_vocabulary(exercise)
        sources = list(ExamVocabularySource.objects.filter(writing_exercise=exercise))
        self.assertEqual([(item.page_index, item.entry_index) for item in sources], [(0, 0), (0, 1)])
        card = sources[0].card
        card.example_de = "Sie bemüht sich um eine Lösung."
        card.verb_forms = {"past": "bemühte"}
        card.save()

        exercise.content = {"vocabulary_pages": [{"entries": [
            {"term": "sich bemühen", "translation_zh": "努力"},
        ]}]}
        exercise.save(update_fields=["content"])
        sync_writing_vocabulary(exercise)

        card.refresh_from_db()
        self.assertEqual(card.example_de, "Sie bemüht sich um eine Lösung.")
        self.assertEqual(card.verb_forms, {"past": "bemühte"})
        self.assertEqual(ExamVocabularySource.objects.filter(writing_exercise=exercise).count(), 1)
        self.assertTrue(ExamVocabularyCard.objects.filter(pk=sources[1].card_id).exists())


class ExamVocabularyApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(telephone="13800139991", password="test-password")
        self.module, _ = Module.objects.get_or_create(key="exam_preparation", defaults={"name": "备考季"})
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
        )
        self.client.force_authenticate(self.user)
        self.exercise = make_writing({"vocabulary_pages": [{"title": "1", "entries": [
            {"term": "der Antrag", "translation_zh": "申请", "part_of_speech": "noun", "article": "der"},
            {"term": "beantragen", "translation_zh": "申请", "part_of_speech": "verb"},
        ]}]}, external_id="vocabulary-api")
        sync_writing_vocabulary(self.exercise)
        self.cards = list(ExamVocabularyCard.objects.order_by("id"))
        self.list_url = reverse("exam-prep-vocabulary-cards-list")
        self.detail_url = reverse("exam-prep-writing-exercises-detail", args=[self.exercise.pk])

    def test_writing_detail_adds_card_and_user_favorite_without_changing_other_content(self):
        UserExamVocabularyFavorite.objects.create(user=self.user, card=self.cards[0])
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entries = response.data["content"]["vocabulary_pages"][0]["entries"]
        self.assertEqual(entries[0]["card"]["id"], self.cards[0].id)
        self.assertIn(self.cards[0].kind, {"word", "expression", "sentence"})
        self.assertTrue(entries[0]["card"]["is_favorite"])
        self.assertFalse(entries[1]["card"]["is_favorite"])
        self.assertEqual(response.data["content"]["vocabulary_pages"][0]["title"], "1")

    def test_list_filters_search_and_favorites_and_favorite_action_is_idempotent(self):
        response = self.client.get(self.list_url, {"exam_type": "TELC", "level": "C1", "search": "申请"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertTrue(response.data["results"][0]["is_favorite"] is False)
        self.assertIn(response.data["results"][0]["kind"], {"word", "expression", "sentence"})

        favorite_url = reverse("exam-prep-vocabulary-cards-favorite", args=[self.cards[0].pk])
        self.assertTrue(self.client.post(favorite_url).data["is_favorite"])
        self.assertTrue(self.client.post(favorite_url).data["is_favorite"])
        self.assertEqual(UserExamVocabularyFavorite.objects.filter(user=self.user, card=self.cards[0]).count(), 1)
        filtered = self.client.get(self.list_url, {"favorites": "true"})
        self.assertEqual(filtered.data["count"], 1)
        self.assertFalse(self.client.delete(favorite_url).data["is_favorite"])
        self.assertFalse(self.client.delete(favorite_url).data["is_favorite"])

    def test_list_requires_authentication_and_entitlement(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(get_user_model().objects.create_user(telephone="13800139992", password="x"))
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
