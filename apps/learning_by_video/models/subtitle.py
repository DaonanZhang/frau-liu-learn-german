from __future__ import annotations

from django.db import models


class Subtitle(models.Model):
    """
    Subtitle line with time range.
    """
    video = models.ForeignKey(
        "learning_by_video.Video",
        on_delete=models.CASCADE,
        related_name="subtitles",
        db_index=True,
    )

    start = models.FloatField(help_text="Start time in seconds.", db_index=True)
    end = models.FloatField(help_text="End time in seconds.")

    content = models.TextField()
    translation = models.TextField(blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["video", "start"], name="idx_sub_video_start"),
        ]
        ordering = ["video_id", "start"]

    def __str__(self) -> str:
        return self.content[:60]
