from __future__ import annotations

from typing import Any, Optional

from django.apps import apps
from django.db import models
from django.utils import timezone
from rest_framework.permissions import BasePermission, SAFE_METHODS
from rest_framework.request import Request
from rest_framework.views import APIView


class IsAdminOrReadOnly(BasePermission):
    """
    Read-only for everyone; write operations only for staff/admin users.
    """

    def has_permission(self, request: Request, view: APIView) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsSelfOrAdmin(BasePermission):
    """
    Object-level permission:
    - Admin/staff can access anything
    - Normal user can only access objects that belong to them
    """

    def has_object_permission(self, request: Request, view: APIView, obj: Any) -> bool:
        if bool(request.user and request.user.is_authenticated and request.user.is_staff):
            return True

        # Support common patterns:
        # - obj is User
        # - obj has .user
        # - obj has .user_data.user
        if hasattr(obj, "pk") and hasattr(request.user, "pk") and obj.__class__.__name__ == "User":
            return obj.pk == request.user.pk

        if hasattr(obj, "user_id"):
            return getattr(obj, "user_id") == request.user.pk

        if hasattr(obj, "user") and getattr(obj, "user", None) is not None:
            return getattr(obj.user, "pk", None) == request.user.pk

        if hasattr(obj, "user_data") and getattr(obj, "user_data", None) is not None:
            user = getattr(obj.user_data, "user", None)
            return getattr(user, "pk", None) == request.user.pk

        return False


class HasValidEntitlement(BasePermission):
    """
    Permission to guard module APIs by Entitlement.

    Usage:
    - Set view.required_module_key = "learning_by_video"
      OR pass module_key at init time.

    Valid if user has:
    - platform-wide entitlement (module is NULL), OR
    - module-specific entitlement, and it is valid now.
    """

    message = "You do not have a valid entitlement for this module."

    def __init__(self, module_key: Optional[str] = None) -> None:
        self._module_key = module_key

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False

        # Admin bypass (optional; keep if you want admin to always access)
        if bool(request.user.is_staff):
            return True

        module_key = self._module_key or getattr(view, "required_module_key", None)
        if not module_key:
            # If not configured, fail closed (safer).
            return False

        Entitlement = apps.get_model("accounts", "Entitlement")
        Module = apps.get_model("accounts", "Module")

        now = timezone.now()

        # platform-wide entitlement
        platform_ok = Entitlement.objects.filter(
            user=request.user,
            module__isnull=True,
            status=Entitlement.Status.ACTIVE,
            starts_at__lte=now,
        ).filter(models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)).exists()
        if platform_ok:
            return True

        # module entitlement
        module = Module.objects.filter(key=module_key, is_active=True).only("id").first()
        if not module:
            return False

        return Entitlement.objects.filter(
            user=request.user,
            module=module,
            status=Entitlement.Status.ACTIVE,
            starts_at__lte=now,
        ).filter(models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)).exists()
