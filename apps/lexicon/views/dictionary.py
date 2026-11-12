from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasValidEntitlement
from apps.exam_preparation.models import ExamVocabularyCard, UserExamVocabularyFavorite
from apps.exam_preparation.vocabulary import normalize_vocabulary_term
from apps.lexicon.models import DictionaryEntry, DictionaryForm
from apps.lexicon.models.dictionary import normalize_dictionary_form


class DictionaryLookupView(APIView):
    permission_classes = [IsAuthenticated, HasValidEntitlement]
    required_module_key = "exam_preparation"

    def get(self, request):
        word = (request.query_params.get("word") or "").strip()
        if not word:
            return Response({"detail": "word is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(word) > 128:
            return Response({"detail": "word must be at most 128 characters."}, status=status.HTTP_400_BAD_REQUEST)

        forms = DictionaryForm.objects.filter(
            normalized_form=normalize_dictionary_form(word)
        ).select_related("entry")
        candidates = sorted(
            forms,
            key=lambda form: (
                form.form != word,
                -(form.entry.importance if form.entry.importance is not None else float("-inf")),
                form.entry_id,
                form.form,
            ),
        )
        matches = []
        seen = set()
        for form in candidates:
            if form.entry_id not in seen:
                seen.add(form.entry_id)
                matches.append((form.entry, form.form))
                if len(matches) == 8:
                    break

        normalized_terms = {
            normalize_vocabulary_term(entry.headword) for entry, _ in matches
        }
        translations = {entry.translation_zh for entry, _ in matches}
        favorites = UserExamVocabularyFavorite.objects.filter(
            user=request.user, card_id=OuterRef("pk")
        )
        cards = ExamVocabularyCard.objects.filter(
            exam_type="TELC",
            level="C1",
            normalized_term__in=normalized_terms,
            translation_zh__in=translations,
        ).annotate(is_favorite=Exists(favorites))
        cards_by_identity = {
            (card.normalized_term, card.translation_zh): card for card in cards
        }

        results = []
        for entry, matched_form in matches:
            card = cards_by_identity.get(
                (normalize_vocabulary_term(entry.headword), entry.translation_zh)
            )
            results.append(
                {
                    "id": entry.pk,
                    "matched_form": matched_form,
                    "lemma": entry.headword,
                    "translation_zh": entry.translation_zh,
                    "part_of_speech": entry.part_of_speech,
                    "card": (
                        {"id": card.pk, "is_favorite": card.is_favorite}
                        if card
                        else None
                    ),
                }
            )
        return Response({"query": word, "matched": bool(results), "matches": results})


class DictionaryEntryFavoriteView(APIView):
    permission_classes = [IsAuthenticated, HasValidEntitlement]
    required_module_key = "exam_preparation"

    def post(self, request, entry_id):
        entry = get_object_or_404(DictionaryEntry, pk=entry_id)
        identity = self._identity(entry)
        with transaction.atomic():
            card, _ = ExamVocabularyCard.objects.get_or_create(
                **identity,
                defaults={
                    "kind": ExamVocabularyCard.Kind.WORD,
                    "term": entry.headword,
                    "part_of_speech": entry.part_of_speech,
                },
            )
            UserExamVocabularyFavorite.objects.get_or_create(user=request.user, card=card)
        return Response({"card": {"id": card.pk, "is_favorite": True}})

    def delete(self, request, entry_id):
        entry = get_object_or_404(DictionaryEntry, pk=entry_id)
        card = ExamVocabularyCard.objects.filter(**self._identity(entry)).first()
        if card:
            UserExamVocabularyFavorite.objects.filter(user=request.user, card=card).delete()
            result = {"id": card.pk, "is_favorite": False}
        else:
            result = None
        return Response({"card": result})

    @staticmethod
    def _identity(entry):
        return {
            "exam_type": "TELC",
            "level": "C1",
            "normalized_term": normalize_vocabulary_term(entry.headword),
            "translation_zh": entry.translation_zh,
        }
