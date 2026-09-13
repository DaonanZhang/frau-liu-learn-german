from __future__ import annotations

from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.utils import timezone

from apps.accounts.maintenance import maintenance_message, user_allowed_during_maintenance
from apps.accounts.models import AccountLoginSession


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

        session_id = validated_token.get("sid")
        if not session_id or not AccountLoginSession.objects.filter(
            user=user,
            token_id=session_id,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).exists():
            raise AuthenticationFailed(
                detail={
                    "detail": "登录会话已失效，请重新登录。",
                    "code": "login_session_invalid",
                },
                code="login_session_invalid",
            )

        return user, validated_token
