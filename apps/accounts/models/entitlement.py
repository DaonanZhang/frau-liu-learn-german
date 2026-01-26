from __future__ import annotations

from datetime import datetime
from typing import Optional

from django.conf import settings
from django.db import models
from django.utils import timezone


class Entitlement(models.Model):
    """
    Access entitlement for a user.

    Scope:
    - module-only: module != null AND season is null
    - module-season: module != null AND season != null
    - platform-wide: module is null AND season is null (optional)

    Plan is billing/access duration, NOT content season.
    """

    class Plan(models.TextChoices):
        TRIAL_7D = "trial_7d", "Trial (7 days)"
        MONTH_1 = "m1", "1 month"
        MONTH_3 = "m3", "3 months"
        MONTH_6 = "m6", "6 months"
        MONTH_12 = "m12", "12 months"
        LIFETIME = "lifetime", "Lifetime"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELED = "canceled", "Canceled"
        EXPIRED = "expired", "Expired"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="entitlements",
        db_index=True,
    )

    module = models.ForeignKey(
        "accounts.Module",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="entitlements",
        db_index=True,
        help_text="If null, this entitlement is platform-wide.",
    )

    season = models.ForeignKey(
        "accounts.ModuleSeason",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="entitlements",
        db_index=True,
        help_text="If set, entitlement only applies to that content season.",
    )

    plan = models.CharField(max_length=16, choices=Plan.choices, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )

    starts_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)

    external_ref = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "module"], name="idx_ent_user_module"),
            models.Index(fields=["user", "season"], name="idx_ent_user_season"),
            models.Index(fields=["user", "status"], name="idx_ent_user_status"),
            models.Index(fields=["module", "status"], name="idx_ent_module_status"),
            models.Index(fields=["user", "expires_at"], name="idx_ent_user_expires"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "module", "season", "plan", "starts_at"],
                name="uniq_ent_user_scope_plan_start",
            )
        ]

    def __str__(self) -> str:
        if self.module_id is None:
            scope = "platform"
        else:
            if self.season_id is None:
                scope = f"module={self.module.key}"
            else:
                scope = f"module={self.module.key} season={self.season.season_number}"
        return f"Entitlement<user={self.user_id} {scope} plan={self.plan} status={self.status}>"

    def is_valid_now(self, at: Optional[datetime] = None) -> bool:
        """
        Check if this entitlement is valid at given time.
        """
        at = at or timezone.now()
        if self.status != self.Status.ACTIVE:
            return False
        if self.starts_at and self.starts_at > at:
            return False
        if self.expires_at and self.expires_at <= at:
            return False
        return True
