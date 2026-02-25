from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.security.registration import (
    verify_registration_code,
    register_user_with_activation_code,
)
from apps.accounts.serializers.registration import (
    RegisterVerifyCodeSerializer,
    RegisterSerializer,
)


class RegisterVerifyCodeAPIView(APIView):
    """
    Step 1: verify activation code only.
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = RegisterVerifyCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data["code"]

        try:
            payload = verify_registration_code(code)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(payload.to_dict(), status=status.HTTP_200_OK)


class RegisterAPIView(APIView):
    """
    Step 2: create user + entitlements.
    """

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            user = register_user_with_activation_code(
                code=data["code"],
                telephone=data["telephone"],
                country_code=data["country_code"],
                password=data["password"],
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "id": user.id,
                "telephone": user.telephone,
                "country_code": user.country_code,
            },
            status=status.HTTP_201_CREATED,
        )
