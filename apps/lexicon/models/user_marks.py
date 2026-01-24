from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import models
from django.db.models import QuerySet


class OccurrenceKnowledgeState(models.TextChoices):
    """
    Tri-state for a single occurrence/card.
    """

    UNMARKED = "UNMARKED", "Unmarked"
    KNOWN = "KNOWN", "Known"
    UNKNOWN = "UNKNOWN", "Unknown"



def default_references() -> list[dict[str, Any]]:
    """
    Default value for legacy JSONField references.

    This function is kept for backwards-compatible migrations.
    Do not remove or rename it as long as historical migrations reference it.

    Returns:
        Empty list.
    """
    return []

class TextKnowledgeState(models.TextChoices):
    """
    Aggregated knowledge state for a text entity (WordText/SentenceText/ExpressionText).

    Aggregation rule:
    - known_count > 0 and unknown_count == 0 => KNOWN
    - unknown_count > 0 and known_count == 0 => UNKNOWN
    - known_count > 0 and unknown_count > 0 => MIXED
    - known_count == 0 and unknown_count == 0 => UNMARKED
    """

    UNMARKED = "UNMARKED", "Unmarked"
    KNOWN = "KNOWN", "Known"
    UNKNOWN = "UNKNOWN", "Unknown"
    MIXED = "MIXED", "Mixed"


def _compute_text_state(*, has_known: bool, has_unknown: bool) -> str:
    """
    Compute aggregated text knowledge state.

    Args:
        has_known: Whether there is any KNOWN occurrence mark.
        has_unknown: Whether there is any UNKNOWN occurrence mark.

    Returns:
        A TextKnowledgeState value.
    """
    if has_known and not has_unknown:
        return TextKnowledgeState.KNOWN

    if has_unknown and not has_known:
        return TextKnowledgeState.UNKNOWN

    if has_known and has_unknown:
        return TextKnowledgeState.MIXED

    return TextKnowledgeState.UNMARKED


class UserWordMark(models.Model):
    """
    User-specific mark for WordText.

    Card-level states are stored in UserWordOccurrenceMark.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="word_marks",
        db_index=True,
    )
    word = models.ForeignKey(
        "lexicon.WordText",
        on_delete=models.CASCADE,
        related_name="user_marks",
        db_index=True,
    )

    global_state = models.CharField(
        max_length=16,
        choices=TextKnowledgeState.choices,
        default=TextKnowledgeState.UNMARKED,
        db_index=True,
        help_text="Aggregated knowledge state for this word for the user.",
    )

    is_favorite = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether the user favorited the word.",
    )

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "word"], name="uniq_user_word_mark"),
        ]
        indexes = [
            models.Index(fields=["user", "global_state"], name="idx_uwm_u_gs"),
            models.Index(fields=["user", "is_favorite"], name="idx_uwm_u_f"),
        ]

    def __str__(self) -> str:
        return f"UserWordMark<user={self.user_id} word={self.word_id}>"

    def recompute_global_state(self) -> None:
        """
        Recompute global_state based on occurrence marks.

        Returns:
            None
        """
        known_exists = self.occurrence_marks.filter(
            knowledge=OccurrenceKnowledgeState.KNOWN
        ).exists()

        unknown_exists = self.occurrence_marks.filter(
            knowledge=OccurrenceKnowledgeState.UNKNOWN
        ).exists()

        self.global_state = _compute_text_state(has_known=known_exists, has_unknown=unknown_exists)


class UserSentenceMark(models.Model):
    """
    User-specific mark for SentenceText.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sentence_marks",
        db_index=True,
    )
    sentence = models.ForeignKey(
        "lexicon.SentenceText",
        on_delete=models.CASCADE,
        related_name="user_marks",
        db_index=True,
    )

    global_state = models.CharField(
        max_length=16,
        choices=TextKnowledgeState.choices,
        default=TextKnowledgeState.UNMARKED,
        db_index=True,
        help_text="Aggregated knowledge state for this sentence for the user.",
    )

    is_favorite = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether the user favorited the sentence.",
    )

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "sentence"], name="uniq_user_sentence_mark"),
        ]
        indexes = [
            models.Index(fields=["user", "global_state"], name="idx_usm_u_gs"),
            models.Index(fields=["user", "is_favorite"], name="idx_usm_u_f"),
        ]

    def __str__(self) -> str:
        return f"UserSentenceMark<user={self.user_id} sentence={self.sentence_id}>"

    def recompute_global_state(self) -> None:
        """
        Recompute global_state based on occurrence marks.

        Returns:
            None
        """
        known_exists = self.occurrence_marks.filter(
            knowledge=OccurrenceKnowledgeState.KNOWN
        ).exists()

        unknown_exists = self.occurrence_marks.filter(
            knowledge=OccurrenceKnowledgeState.UNKNOWN
        ).exists()

        self.global_state = _compute_text_state(has_known=known_exists, has_unknown=unknown_exists)


class UserExpressionMark(models.Model):
    """
    User-specific mark for ExpressionText.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="expression_marks",
        db_index=True,
    )

    expression = models.ForeignKey(
        "lexicon.ExpressionText",
        on_delete=models.CASCADE,
        related_name="user_marks",
        db_index=True,
    )

    global_state = models.CharField(
        max_length=16,
        choices=TextKnowledgeState.choices,
        default=TextKnowledgeState.UNMARKED,
        db_index=True,
        help_text="Aggregated knowledge state for this expression for the user.",
    )

    is_favorite = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether the user favorited the expression.",
    )

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "expression"], name="uniq_user_expression_mark"),
        ]
        indexes = [
            models.Index(fields=["user", "global_state"], name="idx_uem_u_gs"),
            models.Index(fields=["user", "is_favorite"], name="idx_uem_u_f"),
        ]

    def __str__(self) -> str:
        return f"UserExpressionMark<user={self.user_id} expr={self.expression_id}>"

    def recompute_global_state(self) -> None:
        """
        Recompute global_state based on occurrence marks.

        Returns:
            None
        """
        known_exists = self.occurrence_marks.filter(
            knowledge=OccurrenceKnowledgeState.KNOWN
        ).exists()

        unknown_exists = self.occurrence_marks.filter(
            knowledge=OccurrenceKnowledgeState.UNKNOWN
        ).exists()

        self.global_state = _compute_text_state(has_known=known_exists, has_unknown=unknown_exists)


class UserWordOccurrenceMark(models.Model):
    """
    User mark state for a specific VideoWordOccurrence card.

    UNMARKED is represented by deleting this row.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="word_occurrence_marks",
        db_index=True,
    )

    user_word_mark = models.ForeignKey(
        "lexicon.UserWordMark",
        on_delete=models.CASCADE,
        related_name="occurrence_marks",
        db_index=True,
    )

    occurrence = models.ForeignKey(
        "learning_by_video.VideoWordOccurrence",
        on_delete=models.CASCADE,
        related_name="user_marks",
        db_index=True,
    )

    knowledge = models.CharField(
        max_length=16,
        choices=OccurrenceKnowledgeState.choices,
        db_index=True,
        help_text="Knowledge state for this specific occurrence.",
    )

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "occurrence"],
                name="uniq_user_word_occurrence_mark",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "knowledge"], name="idx_uwom_u_k"),
            models.Index(fields=["user_word_mark", "knowledge"], name="idx_uwom_uwm_k"),
        ]

    def __str__(self) -> str:
        return f"UserWordOccurrenceMark<user={self.user_id} occ={self.occurrence_id} k={self.knowledge}>"


class UserSentenceOccurrenceMark(models.Model):
    """
    User mark state for a specific VideoSentenceOccurrence card.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sentence_occurrence_marks",
        db_index=True,
    )

    user_sentence_mark = models.ForeignKey(
        "lexicon.UserSentenceMark",
        on_delete=models.CASCADE,
        related_name="occurrence_marks",
        db_index=True,
    )

    occurrence = models.ForeignKey(
        "learning_by_video.VideoSentenceOccurrence",
        on_delete=models.CASCADE,
        related_name="user_marks",
        db_index=True,
    )

    knowledge = models.CharField(
        max_length=16,
        choices=OccurrenceKnowledgeState.choices,
        db_index=True,
        help_text="Knowledge state for this specific occurrence.",
    )

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "occurrence"],
                name="uniq_user_sentence_occurrence_mark",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "knowledge"], name="idx_usom_u_k"),
            models.Index(fields=["user_sentence_mark", "knowledge"], name="idx_usom_usm_k"),
        ]

    def __str__(self) -> str:
        return f"UserSentenceOccurrenceMark<user={self.user_id} occ={self.occurrence_id} k={self.knowledge}>"


class UserExpressionOccurrenceMark(models.Model):
    """
    User mark state for a specific VideoExpressionOccurrence card.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="expression_occurrence_marks",
        db_index=True,
    )

    user_expression_mark = models.ForeignKey(
        "lexicon.UserExpressionMark",
        on_delete=models.CASCADE,
        related_name="occurrence_marks",
        db_index=True,
    )

    occurrence = models.ForeignKey(
        "learning_by_video.VideoExpressionOccurrence",
        on_delete=models.CASCADE,
        related_name="user_marks",
        db_index=True,
    )

    knowledge = models.CharField(
        max_length=16,
        choices=OccurrenceKnowledgeState.choices,
        db_index=True,
        help_text="Knowledge state for this specific occurrence.",
    )

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "occurrence"],
                name="uniq_user_expression_occurrence_mark",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "knowledge"], name="idx_ueom_u_k"),
            models.Index(fields=["user_expression_mark", "knowledge"], name="idx_ueom_uem_k"),
        ]

    def __str__(self) -> str:
        return f"UserExpressionOccurrenceMark<user={self.user_id} occ={self.occurrence_id} k={self.knowledge}>"
