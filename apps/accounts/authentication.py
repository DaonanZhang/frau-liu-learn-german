from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
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
        now = timezone.now()
        session = AccountLoginSession.objects.filter(
            user=user,
            token_id=session_id,
            revoked_at__isnull=True,
            expires_at__gt=now,
        ).first()
        if not session_id or session is None:
            raise AuthenticationFailed(
                detail={
                    "detail": "登录会话已失效，请重新登录。",
                    "code": "login_session_invalid",
                },
                code="login_session_invalid",
            )

        lease_until = now + timedelta(seconds=settings.DEVICE_SESSION_LEASE_SECONDS)
        if session.active_until is None or session.active_until <= now:
            with transaction.atomic():
                get_user_model().objects.select_for_update().get(pk=user.pk)
                session = AccountLoginSession.objects.select_for_update().get(
                    pk=session.pk
                )
                if session.active_until is None or session.active_until <= now:
                    active_other_sessions = AccountLoginSession.objects.filter(
                        user=user,
                        revoked_at__isnull=True,
                        expires_at__gt=now,
                        active_until__gt=now,
                    ).exclude(pk=session.pk)
                    if (
                        active_other_sessions.count()
                        >= settings.MAX_CONCURRENT_LOGIN_SESSIONS
                    ):
                        raise PermissionDenied(
                            detail={
                                "detail": "当前活跃设备已达上限，请关闭其他设备上的页面后重试。",
                                "code": "concurrent_session_limit",
                            },
                            code="concurrent_session_limit",
                        )
                    session.active_until = lease_until
                    session.save(update_fields=("active_until",))
        elif session.active_until <= now + timedelta(
            seconds=settings.DEVICE_SESSION_LEASE_SECONDS // 2
        ):
            AccountLoginSession.objects.filter(pk=session.pk).update(
                active_until=lease_until
            )

        return user, validated_token
