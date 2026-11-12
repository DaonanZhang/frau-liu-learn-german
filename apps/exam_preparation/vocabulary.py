from __future__ import annotations

import re

from apps.exam_preparation.models import ExamVocabularyCard, ExamVocabularySource


def normalize_vocabulary_term(term: str) -> str:
    return re.sub(r"\s+", " ", term.strip()).casefold()


def classify_vocabulary_kind(term: str, part_of_speech: str = "") -> str:
    trimmed_term = term.strip()
    if trimmed_term.endswith((".", "!", "?", "。", "！", "？")):
        return ExamVocabularyCard.Kind.SENTENCE
    if any(character.isspace() for character in trimmed_term) or part_of_speech.strip().casefold() in {
        "redewendung", "wortverbindung"
    }:
        return ExamVocabularyCard.Kind.EXPRESSION
    return ExamVocabularyCard.Kind.WORD


def default_vocabulary_note(kind: str, translation_zh: str = "") -> str:
    translation = translation_zh.strip()
    if kind == ExamVocabularyCard.Kind.EXPRESSION:
        return f"表示“{translation}”的常用表达。" if translation else "C1 Hochschule 常用表达。"
    if kind == ExamVocabularyCard.Kind.SENTENCE:
        return f"用于表达“{translation}”的完整句型。" if translation else "C1 Hochschule 常用句型。"
    return ""


def sync_writing_vocabulary(writing_exercise):
    base = writing_exercise.exercise_base
    content = writing_exercise.content or {}
    pages = content.get("vocabulary_pages", []) if isinstance(content, dict) else []
    desired = {}
    if isinstance(pages, list):
        for page_index, page in enumerate(pages):
            if not isinstance(page, dict) or not isinstance(page.get("entries", []), list):
                continue
            for entry_index, entry in enumerate(page.get("entries", [])):
                if not isinstance(entry, dict):
                    continue
                term = next((entry.get(key) for key in ("term", "word", "de") if entry.get(key)), "")
                translation = next((entry.get(key) for key in ("translation_zh", "translation", "zh") if entry.get(key)), "")
                term = str(term).strip() if term is not None else ""
                translation = str(translation).strip() if translation is not None else ""
                if not term or not translation:
                    continue
                normalized = normalize_vocabulary_term(term)
                if not normalized:
                    continue
                values = {
                    "exam_type": base.exam_type,
                    "level": base.level,
                    "term": term,
                    "normalized_term": normalized,
                    "translation_zh": translation,
                }
                values.update({
                    key: entry[key].strip() if isinstance(entry[key], str) else entry[key]
                    for key in ("part_of_speech", "article", "plural", "verb_forms", "note", "example_de", "example_zh")
                    if entry.get(key) and (not isinstance(entry[key], str) or entry[key].strip())
                })
                identity = {
                    "exam_type": base.exam_type,
                    "level": base.level,
                    "normalized_term": normalized,
                    "translation_zh": translation,
                }
                existing = ExamVocabularyCard.objects.filter(**identity).first()
                effective_pos = values.get("part_of_speech") or (existing.part_of_speech if existing else "")
                kind = classify_vocabulary_kind(term, effective_pos)
                values["kind"] = kind
                if "note" not in values and not (existing and existing.note.strip()):
                    values["note"] = default_vocabulary_note(kind, translation)
                card, _ = ExamVocabularyCard.objects.update_or_create(
                    **identity,
                    defaults=values,
                )
                desired[(page_index, entry_index)] = card
    current = {
        (source.page_index, source.entry_index): source
        for source in ExamVocabularySource.objects.filter(writing_exercise=writing_exercise)
    }
    for position, source in current.items():
        card = desired.get(position)
        if card is None:
            source.delete()
        elif source.card_id != card.id:
            source.card = card
            source.save(update_fields=["card"])
    for (page_index, entry_index), card in desired.items():
        if (page_index, entry_index) not in current:
            ExamVocabularySource.objects.create(
                writing_exercise=writing_exercise,
                page_index=page_index,
                entry_index=entry_index,
                card=card,
            )
