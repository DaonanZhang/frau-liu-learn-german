from __future__ import annotations

from django.conf import settings
from django.db import models


class VideoProgress(models.Model):
    """
    Per-user per-video progress tracking.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="video_progresses",
        db_index=True,
    )
    video = models.ForeignKey(
        "learning_by_video.Video",
        on_delete=models.CASCADE,
        related_name="progresses",
        db_index=True,
    )

    # current playback position in seconds
    current_time = models.FloatField(default=0.0)
    completed = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "video"], name="uniq_user_video_progress")
        ]
        indexes = [
            models.Index(fields=["user", "updated_at"], name="idx_progress_user_updated"),
        ]

    def __str__(self) -> str:
        return f"Progress u={self.user_id} v={self.video_id} t={self.current_time:.2f}"
