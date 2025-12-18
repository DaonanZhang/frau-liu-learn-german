from __future__ import annotations

from datetime import datetime
from typing import Optional

from django.conf import settings
from django.db import models
from django.utils import timezone


class Entitlement(models.Model):
    class Plan(models.TextChoices):
        ONE_TIME = "one_time", "One-time"
        SUBSCRIPTION = "subscription", "Subscription"
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
    )

    plan = models.CharField(max_length=16, choices=Plan.choices, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE, db_index=True)

    starts_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)

    external_ref = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "module"], name="idx_ent_user_module"),
            models.Index(fields=["user", "status"], name="idx_ent_user_status"),
            models.Index(fields=["module", "status"], name="idx_ent_module_status"),
            models.Index(fields=["user", "expires_at"], name="idx_ent_user_expires"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "module", "plan", "starts_at"],
                name="uniq_ent_user_module_plan_start",
            )
        ]

    def __str__(self) -> str:
        scope = self.module.key if self.module_id else "platform"
        return f"Entitlement<user={self.user_id} scope={scope} plan={self.plan} status={self.status}>"

    def is_valid_now(self, at: Optional[datetime] = None) -> bool:
        at = at or timezone.now()
        if self.status != self.Status.ACTIVE:
            return False
        if self.starts_at and self.starts_at > at:
            return False
        if self.expires_at and self.expires_at <= at:
            return False
        return True
