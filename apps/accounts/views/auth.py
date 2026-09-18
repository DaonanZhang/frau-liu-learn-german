from __future__ import annotations

from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_204_NO_CONTENT
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
        try:
            refresh = RefreshToken(request.data.get("refresh"))
        except (TokenError, TypeError):
            return Response(status=HTTP_204_NO_CONTENT)

        AccountLoginSession.objects.filter(
            user_id=refresh.get("user_id"),
            token_id=refresh.get("sid"),
            revoked_at__isnull=True,
        ).update(active_until=timezone.now())
        return Response(status=HTTP_204_NO_CONTENT)


class DeviceHeartbeatAPIView(APIView):
    """Keep the current browser counted as an active device."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(status=HTTP_204_NO_CONTENT)
