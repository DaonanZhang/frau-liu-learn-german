from __future__ import annotations

from typing import Optional

from django.apps import apps
from django.db import models
from django.utils import timezone
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class HasValidEntitlement(BasePermission):
    """
    Permission to guard module or module-season APIs by Entitlement.

    Usage on views:
    - required_module_key = "learning_by_video"
    - optional: required_season_number = 1

    Access is granted if user has:
    1) platform-wide entitlement, OR
    2) module-level entitlement (season is NULL), OR
    3) season-level entitlement for the required season.
    """

    message = "You do not have a valid entitlement for this content."

    def __init__(
        self,
        module_key: Optional[str] = None,
        season_number: Optional[int] = None,
    ) -> None:
        self._module_key = module_key
        self._season_number = season_number

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False

        # Admin bypass
        if user.is_staff:
            return True

        module_key = self._module_key or getattr(view, "required_module_key", None)
        season_number = self._season_number or getattr(view, "required_season_number", None)

        if not module_key:
            return False  # fail closed

        Entitlement = apps.get_model("accounts", "Entitlement")
        Module = apps.get_model("accounts", "Module")
        ModuleSeason = apps.get_model("accounts", "ModuleSeason")

        now = timezone.now()

        base_qs = Entitlement.objects.filter(
            user=user,
            status=Entitlement.Status.ACTIVE,
            starts_at__lte=now,
        ).filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        )

        # 1️⃣ platform-wide entitlement
        if base_qs.filter(module__isnull=True, season__isnull=True).exists():
            return True

        module = Module.objects.filter(key=module_key, is_active=True).only("id").first()
        if not module:
            return False

        # 2️⃣ module-level entitlement (covers all seasons)
        if base_qs.filter(module=module, season__isnull=True).exists():
            return True

        # 3️⃣ season-level entitlement (only if season is required)
        if season_number is not None:
            season = ModuleSeason.objects.filter(
                module=module,
                season_number=season_number,
            ).only("id").first()

            if not season:
                return False

            return base_qs.filter(module=module, season=season).exists()

        return False
