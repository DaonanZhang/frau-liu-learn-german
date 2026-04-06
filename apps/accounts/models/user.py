from __future__ import annotations

from django.apps import apps
from django.contrib.auth.models import AbstractUser, UserManager
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone


class CustomUserManager(UserManager):
    def create_user(
        self,
        telephone: str,
        password: str | None = None,
        **extra_fields,
    ):
        if not telephone:
            raise ValueError("The telephone must be set")

        user = self.model(
            telephone=telephone,
            username=telephone,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        telephone: str,
        password: str | None = None,
        **extra_fields,
    ):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        return self.create_user(
            telephone=telephone,
            password=password,
            **extra_fields,
        )


class User(AbstractUser):
    """
    Custom user using telephone as login identifier.
    """

    username_validator = UnicodeUsernameValidator()
    username = models.CharField(
        _("username"),
        max_length=150,
        unique=True,
        blank=True,
        null=True,
        help_text=_(
            "Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only."
        ),
        validators=[username_validator],
        error_messages={
            "unique": _("该用户名已被使用。"),
        },
    )

    email = models.EmailField(blank=True, null=True)

    telephone = models.CharField(
        max_length=15,
        unique=True,
        db_index=True,
    )

    country_code = models.CharField(
        max_length=8,
        default="+86",
    )

    objects = CustomUserManager()

    USERNAME_FIELD = "telephone"
    REQUIRED_FIELDS: list[str] = []

    def __str__(self) -> str:
        return self.telephone

    @property
    def has_lifetime_access(self) -> bool:
        Entitlement = apps.get_model("accounts", "Entitlement")
        now = timezone.now()
        return self.entitlements.filter(
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        ).filter(
            models.Q(expires_at__isnull=True)
            | models.Q(expires_at__gt=now)
        ).exists()
