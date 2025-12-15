from __future__ import annotations

from django.db import models


class BaseVideoOccurrence(models.Model):
    """
    Abstract base for occurrences inside a video timeline.

    Reuses:
    - video/subtitle linkage
    - time range fields
    - translation/note/created_at
    - timeline query index: (video, time_start) and (subtitle, time_start)
    """

    video = models.ForeignKey(
        "learning_by_video.Video",
        on_delete=models.CASCADE,
        related_name="%(class)s_set",
        db_index=True,
    )
    subtitle = models.ForeignKey(
        "learning_by_video.Subtitle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_set",
        db_index=True,
    )

    time_start = models.FloatField(help_text="Start time in seconds.", db_index=True)
    time_end = models.FloatField(null=True, blank=True, help_text="End time in seconds.")

    translation = models.TextField(blank=True, default="")
    note = models.TextField(blank=True, default="", null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
