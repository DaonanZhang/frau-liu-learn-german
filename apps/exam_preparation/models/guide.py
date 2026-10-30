from __future__ import annotations

from django.conf import settings
from django.db import models


class ExamPreparationGuide(models.Model):
    author = models.CharField(max_length=100, default="Frau Liu", verbose_name="author")
    cover_url = models.URLField(blank=True, default="", verbose_name="cover URL")
    badges = models.JSONField(
        default=list,
        blank=True,
        help_text="List of keyword strings shown as badges.",
        verbose_name="badges",
    )
    summary = models.CharField(max_length=500, blank=True, default="", verbose_name="summary")
    title = models.CharField(max_length=255, verbose_name="title")
    body_markdown = models.TextField(verbose_name="body markdown")
    published_at = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name="published at")
    view_count = models.PositiveIntegerField(default=0, verbose_name="view count")
    like_count = models.PositiveIntegerField(default=0, verbose_name="like count")
    is_published = models.BooleanField(default=False, db_index=True, verbose_name="is published")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "exam preparation guide"
        verbose_name_plural = "exam preparation guides"
        ordering = ["-published_at", "-id"]

    def __str__(self) -> str:
        return self.title


class ExamPreparationGuideLike(models.Model):
    guide = models.ForeignKey(
        ExamPreparationGuide,
        on_delete=models.CASCADE,
        related_name="user_likes",
        verbose_name="guide",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_guide_likes",
        verbose_name="user",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")

    class Meta:
        verbose_name = "exam preparation guide like"
        verbose_name_plural = "exam preparation guide likes"
        ordering = ["-created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["guide", "user"],
                name="exam_prep_guide_like_uq",
            ),
        ]

