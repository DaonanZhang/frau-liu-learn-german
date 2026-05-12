from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.maintenance import maintenance_message, maintenance_mode_enabled


class PublicStatusAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "maintenance_mode_enabled": maintenance_mode_enabled(),
                "maintenance_message": maintenance_message(),
            }
        )
