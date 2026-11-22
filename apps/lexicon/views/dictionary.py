import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.exam_preparation.models import ExamVocabularyCard, UserExamVocabularyFavorite
from apps.exam_preparation.vocabulary import normalize_vocabulary_term
from apps.learning_by_video.models import Video
from apps.lexicon.models import DictionaryEntry, DictionaryForm
from apps.lexicon.models.dictionary import normalize_dictionary_form


@lru_cache(maxsize=1)
def _traditional_to_simplified_characters():
    path = Path(settings.BASE_DIR) / "apps/lexicon/data/external/handedict/handedict.u8"
    candidates = {}
    pair_counts = {}
    with path.open(encoding="utf-8-sig") as source:
        for line in source:
            if line.startswith("#"):
                continue
            columns = line.split(maxsplit=2)
            if len(columns) < 3:
                continue
            traditional, simplified = columns[:2]
            if len(traditional) != len(simplified):
                continue
            for traditional_char, simplified_char in zip(traditional, simplified):
                if traditional_char != simplified_char:
                    candidates.setdefault(traditional_char, set()).add(simplified_char)
                    pair = (traditional_char, simplified_char)
                    pair_counts[pair] = pair_counts.get(pair, 0) + 1
    mapping = {}
    for traditional_char, simplified_chars in candidates.items():
        recurring_chars = {
            simplified_char
            for simplified_char in simplified_chars
            if pair_counts[(traditional_char, simplified_char)] > 1
        }
        if len(recurring_chars) != 1:
            continue
        simplified_char = next(iter(recurring_chars))
        # Ignore isolated malformed rows while retaining recurring character pairs.
        pair_count = pair_counts[(traditional_char, simplified_char)]
        reverse_count = pair_counts.get((simplified_char, traditional_char), 0)
        if pair_count > 1 and pair_count > reverse_count:
            mapping[traditional_char] = simplified_char
    return mapping


def _is_traditional_chinese(value):
    value = value.strip()
    converted = "".join(
        _traditional_to_simplified_characters().get(char, char)
        for char in value
    )
    return converted != value


def _parse_collection_key(value):
    if not isinstance(value, str) or not value:
        raise ValueError("A valid collection_key is required.")
    if value in {"exam:TELC:B1", "exam:TELC:B2", "exam:TELC:C1"}:
        _, exam_type, level = value.split(":")
        return value, exam_type, level
    match = re.fullmatch(r"video:([1-9][0-9]*)", value)
    if match and Video.objects.filter(pk=int(match.group(1))).exists():
        return value, "", ""
    raise ValueError("collection_key is invalid or unsupported.")


def _favorite_collection_key(request):
    payload = request.data
    value = payload.get("collection_key") if hasattr(payload, "get") else None
    return _parse_collection_key(value)


class DictionaryLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        word = (request.query_params.get("word") or "").strip()
        if not word:
            return Response({"detail": "word is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(word) > 128:
            return Response({"detail": "word must be at most 128 characters."}, status=status.HTTP_400_BAD_REQUEST)
        collection_key = request.query_params.get("collection_key")
        if collection_key is not None:
            try:
                collection_key, _, _ = _parse_collection_key(collection_key)
            except ValueError as error:
                return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        forms = DictionaryForm.objects.filter(
            normalized_form=normalize_dictionary_form(word)
        ).select_related("entry")
        candidates = sorted(
            forms,
            key=lambda form: (
                {"wikdict": 0, "handedict": 1}.get(form.entry.source, 2),
                unicodedata.normalize("NFC", form.form) != unicodedata.normalize("NFC", word),
                -(form.entry.importance if form.entry.importance is not None else float("-inf")),
                form.entry_id,
                form.form,
            ),
        )
        if any(not _is_traditional_chinese(form.entry.translation_zh) for form in candidates):
            candidates = [
                form for form in candidates
                if not _is_traditional_chinese(form.entry.translation_zh)
            ]
        matches = []
        seen = set()
        for form in candidates:
            identity = form.entry.translation_zh.strip()
            if identity not in seen:
                seen.add(identity)
                matches.append((form.entry, form.form))
                if len(matches) == 8:
                    break

        normalized_terms = {
            normalize_vocabulary_term(entry.headword) for entry, _ in matches
        }
        translations = {entry.translation_zh for entry, _ in matches}
        cards_by_identity = {}
        if collection_key:
            favorites = UserExamVocabularyFavorite.objects.filter(
                user=request.user, card_id=OuterRef("pk")
            )
            cards = ExamVocabularyCard.objects.filter(
                collection_key=collection_key,
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
    permission_classes = [IsAuthenticated]

    def post(self, request, entry_id):
        try:
            collection_key, exam_type, level = _favorite_collection_key(request)
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        entry = get_object_or_404(DictionaryEntry, pk=entry_id)
        identity = self._identity(entry, collection_key)
        with transaction.atomic():
            card, _ = ExamVocabularyCard.objects.get_or_create(
                **identity,
                defaults={
                    "exam_type": exam_type,
                    "level": level,
                    "kind": ExamVocabularyCard.Kind.WORD,
                    "term": entry.headword,
                    "part_of_speech": entry.part_of_speech,
                },
            )
            UserExamVocabularyFavorite.objects.get_or_create(user=request.user, card=card)
        return Response({"card": {"id": card.pk, "is_favorite": True}})

    def delete(self, request, entry_id):
        try:
            collection_key, _, _ = _favorite_collection_key(request)
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        entry = get_object_or_404(DictionaryEntry, pk=entry_id)
        card = ExamVocabularyCard.objects.filter(**self._identity(entry, collection_key)).first()
        if card:
            UserExamVocabularyFavorite.objects.filter(user=request.user, card=card).delete()
            result = {"id": card.pk, "is_favorite": False}
        else:
            result = None
        return Response({"card": result})

    @staticmethod
    def _identity(entry, collection_key):
        return {
            "collection_key": collection_key,
            "normalized_term": normalize_vocabulary_term(entry.headword),
            "translation_zh": entry.translation_zh,
        }
