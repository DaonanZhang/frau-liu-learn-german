from __future__ import annotations

from django.db import models


class LearningVideoUserSubtitleFavorite(models.Model):
    """
    Per-user subtitle favorite record for learning-by-video module.
    """

    learning_video_user_data = models.ForeignKey(
        "learning_by_video.LearningVideoUserData",
        on_delete=models.CASCADE,
        related_name="subtitle_favorites",
    )
    subtitle = models.ForeignKey(
        "learning_by_video.Subtitle",
        on_delete=models.CASCADE,
        related_name="user_favorites",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learning_video_user_data", "subtitle"],
                name="uniq_lvu_subtitle_fav",
            ),
        ]
        indexes = [
            models.Index(
                fields=["learning_video_user_data", "created_at"],
                name="idx_lvu_subfav_ct",
            ),
        ]

    def __str__(self) -> str:
        return (
            "LearningVideoUserSubtitleFavorite<"
            f"user_data={self.learning_video_user_data_id}, "
            f"subtitle={self.subtitle_id}"
            ">"
        )

