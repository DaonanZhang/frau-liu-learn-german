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
    external_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    start = models.FloatField(help_text="Start time in seconds.", db_index=True)
    end = models.FloatField(help_text="End time in seconds.")

    content = models.TextField()
    translation = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["video", "start", "end"], name="sub_v_se"),
            models.UniqueConstraint(fields=["video", "external_id"], name="sub_v_extid"),
        ]
        indexes = [
            models.Index(fields=["video", "start"], name="sub_v_s"),
        ]
        ordering = ["video_id", "start"]

    def __str__(self) -> str:
        return self.content[:60]
