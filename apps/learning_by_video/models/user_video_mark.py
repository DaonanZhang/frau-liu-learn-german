from __future__ import annotations

from django.db import models
from django.utils import timezone


class LearningVideoUserVideoMark(models.Model):
    """
    Per-video mark state for a user in learning-by-video module.

    This model stores user-specific flags for a given video (e.g. favorite, completed).

    Attributes:
        learning_video_user_data:
            The module-level user data owner.
        video:
            The related learning video.
        is_favorite:
            Whether the user favorited the video.
        is_completed:
            Whether the user completed the video.
        favorited_at:
            Timestamp when the video was favorited (nullable).
        completed_at:
            Timestamp when the video was completed (nullable).
        updated_at:
            Auto-updated timestamp for the record.
        created_at:
            Creation timestamp.
    """

    learning_video_user_data = models.ForeignKey(
        "learning_by_video.LearningVideoUserData",
        on_delete=models.CASCADE,
        related_name="video_marks",
    )
    video = models.ForeignKey(
        "learning_by_video.Video",
        on_delete=models.CASCADE,
        related_name="user_marks",
    )

    is_favorite = models.BooleanField(default=False)
    is_completed = models.BooleanField(default=False)

    favorited_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["learning_video_user_data", "video"],
                name="uniq_lvu_video_mark",
            ),
        ]
        indexes = [
            models.Index(
                fields=["learning_video_user_data", "is_favorite"],
                name="idx_lvu_mark_fav",
            ),
            models.Index(
                fields=["learning_video_user_data", "is_completed"],
                name="idx_lvu_mark_comp",
            ),
            models.Index(
                fields=["video", "is_favorite"],
                name="idx_video_mark_fav",
            ),
        ]

    def __str__(self) -> str:
        return (
            "LearningVideoUserVideoMark<"
            f"user_data={self.learning_video_user_data_id}, "
            f"video={self.video_id}, "
            f"favorite={self.is_favorite}, "
            f"completed={self.is_completed}"
            ">"
        )

    def mark_favorite(self, *, value: bool) -> None:
        """
        Mark/unmark favorite and set timestamp accordingly.

        Args:
            value: True to favorite, False to unfavorite.

        Returns:
            None
        """
        self.is_favorite = value
        self.favorited_at = timezone.now() if value else None

    def mark_completed(self, *, value: bool) -> None:
        """
        Mark/unmark completed and set timestamp accordingly.

        Args:
            value: True to set completed, False to unset completed.

        Returns:
            None
        """
        self.is_completed = value
        self.completed_at = timezone.now() if value else None
