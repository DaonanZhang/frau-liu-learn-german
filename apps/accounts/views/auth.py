from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.serializers.auth import (
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
