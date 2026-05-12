from __future__ import annotations

from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.maintenance import maintenance_message, user_allowed_during_maintenance


class MaintenanceAwareJWTAuthentication(JWTAuthentication):
    """
    Reject authenticated API access for non-maintenance accounts while maintenance is on.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, validated_token = result
        if not user_allowed_during_maintenance(user):
            raise PermissionDenied(detail=maintenance_message(), code="maintenance_mode")

        return user, validated_token
