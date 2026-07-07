from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class ActivationCodeRecord(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CONSUMED = "consumed", "Consumed"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    code = models.CharField(max_length=32, unique=True, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    payload = models.JSONField(default=dict)
    ttl_seconds = models.PositiveIntegerField()
    expires_at = models.DateTimeField(db_index=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    consumed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consumed_activation_codes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "expires_at"], name="idx_acr_status_exp"),
            models.Index(fields=["consumed_by_user", "status"], name="idx_acr_user_status"),
        ]

    def __str__(self) -> str:
        return f"ActivationCodeRecord<code={self.code} status={self.status}>"

    def is_expired_now(self, *, at=None) -> bool:
        at = at or timezone.now()
        return self.expires_at <= at
