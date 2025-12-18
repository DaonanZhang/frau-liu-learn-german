from __future__ import annotations

from django.conf import settings
from django.db import models


class LearningVideoUserData(models.Model):
    """
    Module-level user data for learning-by-video module.

    fields = basic user data + module specified user data
    """
    user_data = models.OneToOneField(
        "accounts.UserData",
        on_delete=models.CASCADE,
        related_name="learning_video_user_data",
    )

    completed_videos = models.PositiveIntegerField(default=0)

    last_watched_video = models.ForeignKey(
        "learning_by_video.Video",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    last_watched_time = models.FloatField(default=0.0)
    last_watched_at = models.DateTimeField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"LearningVideoUserData<{self.user_data_id}>"