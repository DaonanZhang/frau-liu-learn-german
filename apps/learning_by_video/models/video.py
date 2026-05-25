from __future__ import annotations

from django.db import models


class Video(models.Model):
    """
    Video content entity for the learning-by-video module.
    """
    title = models.CharField(max_length=512, db_index=True)
    creator = models.CharField(max_length=255, blank=True, default="", db_index=True)

    description = models.TextField(blank=True, default="")
    difficulty = models.CharField(max_length=32, blank=True, default="", db_index=True)
    source = models.URLField(blank=True, default="")

    video_url = models.URLField(blank=True, default="")
    cover_letter_url = models.URLField(blank=True, default="")
    full_subtitle_de = models.TextField(blank=True, default="")
    full_subtitle_zh = models.TextField(blank=True, default="")

    duration_seconds = models.PositiveIntegerField(default=0)

    tags = models.JSONField(
        default=list,
        blank=True,
        help_text="List of tag strings associated with the video",
    )

    season = models.ForeignKey(
        "accounts.ModuleSeason",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="videos",
        db_index=True,
        help_text="Content season for access control.",
    )
    access_seasons = models.ManyToManyField(
        "accounts.ModuleSeason",
        blank=True,
        related_name="access_videos",
        help_text="Additional seasons that grant access to this video.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    is_published = models.BooleanField(default=False, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)

    def __str__(self) -> str:
        return self.title
