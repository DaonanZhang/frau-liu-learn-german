from __future__ import annotations

from django.db import models


class Video(models.Model):
    """
    Video content entity for the learning-by-video module.
    """
    title = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True, default="")
    difficulty = models.CharField(max_length=32, blank=True, default="", db_index=True)

    # store media path/url; you can later move to a dedicated storage model
    video_url = models.URLField(blank=True, default="")
    cover_letter_url = models.URLField(blank=True, default="")

    duration_seconds = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.title
