from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime
from typing import Optional

class User(AbstractUser):
    """
    Custom user model for future extension.

    Keep this model small:
    - Authentication/identity fields live here.
    - Business entitlements live in separate models.
    """

    # Optional: internal flags (feature gates, experiments) - keep minimal early.
    # If you don't need it now, remove it.
    is_beta_tester = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.get_username()

    @property
    def has_lifetime_access(self) -> bool:
        """
        Convenience property for API responses.
        This reads from Entitlement rows (no DB schema coupling in serializers).
        """
        now = timezone.now()
        return self.entitlements.filter(
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        ).filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        ).exists()


class UserData(models.Model):
    """
    Platform-level user profile / preferences.

    Keep this model stable and module-agnostic.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_data",
    )

    ui_language = models.CharField(max_length=8, default="de")
    learning_language = models.CharField(max_length=8, default="de")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"UserData<{self.user_id}>"

class Module(models.Model):
    """
    A purchasable/entitled module in your platform.
    Examples:
    - learning_by_video
    - reading
    - shadowing
    """
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

class Entitlement(models.Model):
    """
    User access rights to either:
    - a specific module (module != null), or
    - the whole platform (module == null)

    This structure is clean for serializers:
    - user.entitlements (related_name) is easy to expose
    - filtering by module/plan/status is straightforward
    """

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

    # module == NULL means "platform-wide" entitlement
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
    expires_at = models.DateTimeField(null=True, blank=True)  # null for lifetime / unlimited

    # Optional: for audit/debugging; can also store provider subscription id later
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
            # Ensure you don't accidentally create multiple active entitlements
            # for the same user+module+plan overlapping.
            # (This is a "soft" constraint; real overlap checks happen in business logic.)
            models.UniqueConstraint(
                fields=["user", "module", "plan", "starts_at"],
                name="uniq_ent_user_module_plan_start",
            )
        ]

    def __str__(self) -> str:
        scope = self.module.key if self.module_id else "platform"
        return f"Entitlement<user={self.user_id} scope={scope} plan={self.plan} status={self.status}>"

    def is_valid_now(self, at: Optional[datetime] = None) -> bool:
        """
        Check if entitlement is valid at a given time.
        """
        at = at or timezone.now()
        if self.status != self.Status.ACTIVE:
            return False
        if self.starts_at and self.starts_at > at:
            return False
        if self.expires_at and self.expires_at <= at:
            return False
        return True