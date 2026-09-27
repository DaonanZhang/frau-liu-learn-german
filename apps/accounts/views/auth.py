from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_204_NO_CONTENT,
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_403_FORBIDDEN,
    HTTP_409_CONFLICT,
)
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.models import AccountLoginSession
from apps.accounts.serializers.auth import (
    MaintenanceAwareTokenRefreshSerializer,
    TelephoneTokenObtainPairSerializer,
)


class LoginAPIView(TokenObtainPairView):
    """
    POST /auth/login/

    Body:
    {
      "country_code": "+86",
      "telephone": "...",
      "password": "..."
    }

    Response:
    {
      "access": "...",
      "refresh": "..."
    }
    """

    permission_classes = [AllowAny]
    serializer_class = TelephoneTokenObtainPairSerializer


class RefreshAPIView(TokenRefreshView):
    permission_classes = [AllowAny]
    serializer_class = MaintenanceAwareTokenRefreshSerializer


class LogoutAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            refresh = RefreshToken(request.data.get("refresh"))
        except (TokenError, TypeError):
            return Response(status=HTTP_204_NO_CONTENT)

        AccountLoginSession.objects.filter(
            user_id=refresh.get("user_id"),
            token_id=refresh.get("sid"),
            revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())
        return Response(status=HTTP_204_NO_CONTENT)


class DeviceReleaseAPIView(APIView):
    """Release a device-limit slot without revoking its refresh token."""

    permission_classes = [AllowAny]

    def post(self, request):
        activity_id = str(request.data.get("activity_id") or "").strip()
        if not activity_id:
            return Response(status=HTTP_400_BAD_REQUEST)
        try:
            refresh = RefreshToken(request.data.get("refresh"))
        except (TokenError, TypeError):
            return Response(status=HTTP_204_NO_CONTENT)

        with transaction.atomic():
            session = AccountLoginSession.objects.select_for_update().filter(
                user_id=refresh.get("user_id"),
                token_id=refresh.get("sid"),
                revoked_at__isnull=True,
            ).first()
            if session and session.activity_id in (None, activity_id):
                closed_activity_ids = list(session.closed_activity_ids or [])
                if activity_id not in closed_activity_ids:
                    closed_activity_ids.append(activity_id)
                session.active_until = timezone.now()
                session.closed_activity_ids = closed_activity_ids[-50:]
                session.save(
                    update_fields=("active_until", "closed_activity_ids")
                )
        return Response(status=HTTP_204_NO_CONTENT)


class DeviceHeartbeatAPIView(APIView):
    """Keep the current browser counted as an active device."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        activity_id = str(request.data.get("activity_id") or "").strip()
        if not activity_id:
            return Response(status=HTTP_400_BAD_REQUEST)
        try:
            refresh = RefreshToken(request.data.get("refresh"))
        except (TokenError, TypeError):
            return Response(
                {"detail": "登录会话已失效。", "code": "login_session_invalid"},
                status=HTTP_401_UNAUTHORIZED,
            )

        now = timezone.now()
        device_limit_reached = False
        with transaction.atomic():
            user = get_user_model().objects.select_for_update().filter(
                pk=refresh.get("user_id")
            ).first()
            session = AccountLoginSession.objects.select_for_update().filter(
                user=user,
                token_id=refresh.get("sid"),
                revoked_at__isnull=True,
                expires_at__gt=now,
            ).first()
            if user is None or session is None:
                return Response(
                    {"detail": "登录会话已失效。", "code": "login_session_invalid"},
                    status=HTTP_401_UNAUTHORIZED,
                )
            if activity_id in (session.closed_activity_ids or []):
                return Response(
                    {
                        "detail": "该页面活动周期已经关闭。",
                        "code": "device_activity_closed",
                    },
                    status=HTTP_409_CONFLICT,
                )

            if session.active_until is None or session.active_until <= now:
                active_other_sessions = AccountLoginSession.objects.filter(
                    user=user,
                    revoked_at__isnull=True,
                    expires_at__gt=now,
                    active_until__gt=now,
                ).exclude(pk=session.pk)
                if (
                    settings.DEVICE_LIMIT_ENABLED
                    and active_other_sessions.count()
                    >= settings.MAX_CONCURRENT_LOGIN_SESSIONS
                ):
                    session.active_until = now
                    session.revoked_at = now
                    session.save(update_fields=("active_until", "revoked_at"))
                    device_limit_reached = True
                else:
                    session.active_until = now + timedelta(
                        seconds=settings.DEVICE_SESSION_LEASE_SECONDS
                    )
                    session.activity_id = activity_id
                    session.save(
                        update_fields=(
                            "active_until",
                            "activity_id",
                        )
                    )
            else:
                session.active_until = now + timedelta(
                    seconds=settings.DEVICE_SESSION_LEASE_SECONDS
                )
                session.activity_id = activity_id
                session.save(
                    update_fields=(
                        "active_until",
                        "activity_id",
                    )
                )

        if device_limit_reached:
            return Response(
                {
                    "detail": "当前活跃设备已达上限，此设备的登录已失效。",
                    "code": "concurrent_session_limit",
                },
                status=HTTP_403_FORBIDDEN,
            )
        return Response(status=HTTP_204_NO_CONTENT)
