from __future__ import annotations

from django.db import models

from .lexicon_base import BaseVideoOccurrence


class VideoWordOccurrence(BaseVideoOccurrence):
    word = models.ForeignKey(
        "lexicon.WordText",
        on_delete=models.CASCADE,
        related_name="video_occurrences",
        db_index=True,
    )

    class Meta(BaseVideoOccurrence.Meta):
        indexes = [
            models.Index(fields=["video", "word"], name="idx_vwo_video_word"),
            models.Index(fields=["subtitle", "word"], name="idx_vwo_sub_word"),
        ]

    def __str__(self) -> str:
        return f"{self.word_id} @ video={self.video_id} t={self.time_start:.2f}s"


class VideoSentenceOccurrence(BaseVideoOccurrence):
    sentence = models.ForeignKey(
        "lexicon.SentenceText",
        on_delete=models.CASCADE,
        related_name="video_occurrences",
        db_index=True,
    )

    class Meta(BaseVideoOccurrence.Meta):
        indexes = [
            models.Index(fields=["video", "sentence"], name="idx_vso_video_sentence"),
            models.Index(fields=["subtitle", "sentence"], name="idx_vso_sub_sentence"),
        ]

    def __str__(self) -> str:
        return f"Sentence @ video={self.video_id} t={self.time_start:.2f}s"


class VideoExpressionOccurrence(BaseVideoOccurrence):
    expression = models.ForeignKey(
        "lexicon.ExpressionText",
        on_delete=models.CASCADE,
        related_name="video_occurrences",
        db_index=True,
    )

    # Explaining
    meaning = models.TextField(blank=True, default="")

    # When could this expression be used
    example = models.TextField(blank=True, default="")

    class Meta(BaseVideoOccurrence.Meta):
        indexes = [
            models.Index(fields=["video", "expression"], name="idx_veo_video_expr"),
            models.Index(fields=["subtitle", "expression"], name="idx_veo_sub_expr"),
        ]

    def __str__(self) -> str:
        return f"{self.expression_id} @ video={self.video_id} t={self.time_start:.2f}s"
