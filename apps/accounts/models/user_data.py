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

    # Total number of distinct active calendar days.
    active_days = models.PositiveIntegerField(default=0)

    # The last calendar date counted as active.
    last_active_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"UserData<{self.user_id}>"

    @transaction.atomic
    def mark_daily_active(self) -> bool:
        """
        Mark the user as active for today (counted once per calendar day).

        Returns:
            bool: True if today was newly counted, otherwise False.
        """
        today = timezone.localdate()

        created = UserActiveDay.objects.get_or_create(
            user_data=self,
            date=today,
        )[1]

        if not created:
            return False

        self.active_days = (self.active_days or 0) + 1
        self.last_active_date = today
        self.save(update_fields=["active_days", "last_active_date", "updated_at"])
        return True


class UserActiveDay(models.Model):
    """
    One row represents that a user was active on a given calendar day.
    """

    user_data = models.ForeignKey(
        "accounts.UserData",
        on_delete=models.CASCADE,
        related_name="active_day_entries",
    )

    date = models.DateField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user_data", "date"],
                name="uniq_user_active_day_user_date",
            )
        ]
        indexes = [
            models.Index(fields=["user_data", "date"]),
            models.Index(fields=["date"]),
        ]

    def __str__(self) -> str:
        return f"UserActiveDay<{self.user_data_id}:{self.date}>"
