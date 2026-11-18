import re
import unicodedata

from django.db import migrations


def _normalize(term):
    normalized = unicodedata.normalize("NFC", term).strip()
    return re.sub(r"\s+", " ", normalized).casefold()


def normalize_existing_cards(apps, schema_editor):
    Card = apps.get_model("exam_preparation", "ExamVocabularyCard")
    Source = apps.get_model("exam_preparation", "ExamVocabularySource")
    Favorite = apps.get_model("exam_preparation", "UserExamVocabularyFavorite")
    merge_fields = (
        "part_of_speech",
        "article",
        "plural",
        "verb_forms",
        "note",
        "example_de",
        "example_zh",
    )
    groups = {}
    for card in Card.objects.all().order_by("pk").iterator():
        normalized = _normalize(card.term)
        key = (card.exam_type, card.level, normalized, card.translation_zh)
        groups.setdefault(key, []).append(card)

    for (exam_type, level, normalized, translation), cards in groups.items():
        canonical = cards[0]
        for duplicate in cards[1:]:
            for name in merge_fields:
                if not getattr(canonical, name) and getattr(duplicate, name):
                    setattr(canonical, name, getattr(duplicate, name))
            Source.objects.filter(card_id=duplicate.pk).update(card_id=canonical.pk)
            for favorite in Favorite.objects.filter(card_id=duplicate.pk):
                existing = Favorite.objects.filter(user_id=favorite.user_id, card_id=canonical.pk).first()
                if existing:
                    if favorite.created_at < existing.created_at:
                        Favorite.objects.filter(pk=existing.pk).update(created_at=favorite.created_at)
                    favorite.delete()
                else:
                    Favorite.objects.filter(pk=favorite.pk).update(card_id=canonical.pk)
            duplicate.delete()

        Card.objects.filter(pk=canonical.pk).update(
            normalized_term=normalized,
            **{name: getattr(canonical, name) for name in merge_fields},
        )


class Migration(migrations.Migration):
    dependencies = [("exam_preparation", "0032_examvocabularycard_kind")]

    operations = [migrations.RunPython(normalize_existing_cards, migrations.RunPython.noop)]
