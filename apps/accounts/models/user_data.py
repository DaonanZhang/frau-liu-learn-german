from __future__ import annotations

from django.conf import settings
from django.db import models


class UserData(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_data",
    )

    ui_language = models.CharField(max_length=8, default="de")
    learning_language = models.CharField(max_length=8, default="de")
    learning_days = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"UserData<{self.user_id}>"
