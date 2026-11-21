from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers.password_reset import PasswordResetRequestSerializer
from apps.accounts.services.email_service import send_phone_recovery_email_async


class PhoneRecoveryRequestAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = (
            get_user_model()
            .objects.filter(
                email__iexact=serializer.validated_data["email"],
                is_active=True,
            )
            .only("email", "country_code", "telephone")
            .first()
        )
        if user:
            send_phone_recovery_email_async(
                to_email=user.email,
                country_code=user.country_code,
                telephone=user.telephone,
            )

        return Response(
            {"detail": "如果该邮箱已绑定账号，我们已经发送了注册手机号。"},
            status=status.HTTP_200_OK,
        )
