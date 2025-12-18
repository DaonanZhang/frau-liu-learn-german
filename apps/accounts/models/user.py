from __future__ import annotations

from django.apps import apps
from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone


class CustomUserManager(UserManager):
    def create_user(self, username: str | None = None, email: str | None = None, password: str | None = None, **extra_fields):
        if not email:
            raise ValueError("The Email must be set")
        email = self.normalize_email(email)

        if not username:
            username = email

        return super().create_user(username=username, email=email, password=password, **extra_fields)

    def create_superuser(self, username: str | None = None, email: str | None = None, password: str | None = None, **extra_fields):
        if not email:
            raise ValueError("The Email must be set")
        email = self.normalize_email(email)

        if not username:
            username = email

        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        return super().create_superuser(username=username, email=email, password=password, **extra_fields)


class User(AbstractUser):
    username = models.CharField(max_length=150, blank=True, null=True)
    email = models.EmailField(unique=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    def __str__(self) -> str:
        return self.email

    @property
    def has_lifetime_access(self) -> bool:
        Entitlement = apps.get_model("accounts", "Entitlement")
        now = timezone.now()
        return self.entitlements.filter(
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        ).filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        ).exists()
