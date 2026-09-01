from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class ActivationCodeRecord(models.Model):
    """Durable one-time redemption ledger for Redis-backed activation codes."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CONSUMED = "consumed", "Consumed"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    code_hash = models.CharField(max_length=64, unique=True)
    code_ciphertext = models.TextField(blank=True, default="")
    remark = models.CharField(max_length=255, blank=True, default="")
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    ttl_seconds = models.PositiveIntegerField()
    expires_at = models.DateTimeField(db_index=True)
    consumed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consumed_activation_codes",
    )
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "expires_at"], name="idx_acr_status_exp"),
            models.Index(fields=["consumed_by_user", "status"], name="idx_acr_user_status"),
        ]

    def __str__(self) -> str:
        return f"ActivationCodeRecord<hash={self.code_hash[:12]} status={self.status}>"

    def is_expired_now(self, *, at=None) -> bool:
        at = at or timezone.now()
        return self.expires_at <= at
