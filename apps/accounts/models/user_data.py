from __future__ import annotations

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

class UserData(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_data",
    )

    ui_language = models.CharField(max_length=8, default="de")
    learning_language = models.CharField(max_length=8, default="de")

    active_days = models.PositiveIntegerField(default=0)

    last_active_date = models.DateField(null=True, blank=True)


    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"UserData<{self.user_id}>"

    @transaction.atomic
    def mark_daily_active(self) -> bool:
        """
        Increment active_days if this is the first activity of the current calendar day.

        Returns:
            bool: True if active_days was incremented, otherwise False.
        """
        today = timezone.localdate()

        if self.last_active_date == today:
            return False

        self.active_days = (self.active_days or 0) + 1
        self.last_active_date = today
        self.save(update_fields=["active_days", "last_active_date", "updated_at"])
        return True
