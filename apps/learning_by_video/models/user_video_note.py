from __future__ import annotations

from django.db import models


class LearningVideoUserVideoNote(models.Model):
    """
    Per-video markdown note for a user in learning-by-video module.
    """

    learning_video_user_data = models.ForeignKey(
        "learning_by_video.LearningVideoUserData",
        on_delete=models.CASCADE,
        related_name="video_notes",
    )
    video = models.ForeignKey(
        "learning_by_video.Video",
        on_delete=models.CASCADE,
        related_name="user_notes",
    )

    note_markdown = models.TextField(blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learning_video_user_data", "video"],
                name="uniq_lvu_video_note",
            ),
        ]
        indexes = [
            models.Index(
                fields=["learning_video_user_data", "updated_at"],
                name="idx_lvu_note_updated",
            ),
            models.Index(
                fields=["video", "updated_at"],
                name="idx_video_note_updated",
            ),
        ]

    def __str__(self) -> str:
        return (
            "LearningVideoUserVideoNote<"
            f"user_data={self.learning_video_user_data_id}, "
            f"video={self.video_id}"
            ">"
        )
