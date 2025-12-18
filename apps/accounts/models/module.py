from __future__ import annotations

from django.db import models


class Module(models.Model):
    key = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["is_active", "key"], name="idx_module_active_key"),
        ]

    def __str__(self) -> str:
        return self.key
