from __future__ import annotations

from uuid import uuid4

from django.conf import settings
from django.db import models


class AccountLoginSession(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="login_sessions",
    )
    device_id = models.CharField(max_length=64)
    token_id = models.UUIDField(default=uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    active_until = models.DateTimeField(blank=True, null=True)
    activity_id = models.CharField(blank=True, max_length=64, null=True)
    closed_activity_ids = models.JSONField(default=list)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "device_id"),
                name="accounts_unique_login_device",
            ),
        ]
        indexes = [
            models.Index(
                fields=("user", "revoked_at", "expires_at"),
                name="accounts_login_active_idx",
            ),
        ]
