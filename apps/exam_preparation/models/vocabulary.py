from __future__ import annotations

from django.conf import settings
from django.db import models


class ExamVocabularyCard(models.Model):
    class Kind(models.TextChoices):
        WORD = "word", "Word"
        EXPRESSION = "expression", "Expression"
        SENTENCE = "sentence", "Sentence"

    exam_type = models.CharField(max_length=128, db_index=True)
    level = models.CharField(max_length=8, db_index=True)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.WORD, db_index=True)
    term = models.CharField(max_length=255)
    normalized_term = models.CharField(max_length=255)
    translation_zh = models.TextField()
    part_of_speech = models.CharField(max_length=64, blank=True, default="")
    article = models.CharField(max_length=16, blank=True, default="")
    plural = models.CharField(max_length=255, blank=True, default="")
    verb_forms = models.JSONField(default=dict, blank=True)
    note = models.TextField(blank=True, default="")
    example_de = models.TextField(blank=True, default="")
    example_zh = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=("exam_type", "level", "normalized_term", "translation_zh"),
            name="exam_vocab_card_identity_uq",
        )]
        ordering = ["term", "id"]


class ExamVocabularySource(models.Model):
    writing_exercise = models.ForeignKey(
        "exam_preparation.WritingExercise", on_delete=models.CASCADE, related_name="vocabulary_sources"
    )
    card = models.ForeignKey(ExamVocabularyCard, on_delete=models.CASCADE, related_name="sources")
    page_index = models.PositiveIntegerField()
    entry_index = models.PositiveIntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=("writing_exercise", "page_index", "entry_index"),
            name="exam_vocab_source_entry_uq",
        )]
        ordering = ["page_index", "entry_index"]


class UserExamVocabularyFavorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exam_vocabulary_favorites")
    card = models.ForeignKey(ExamVocabularyCard, on_delete=models.CASCADE, related_name="favorites")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("user", "card"), name="exam_vocab_fav_user_card_uq")]
