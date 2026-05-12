from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.views import TokenObtainPairView

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
