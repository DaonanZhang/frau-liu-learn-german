from __future__ import annotations

from django.db import models


class Announcement(models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField()
    priority = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
