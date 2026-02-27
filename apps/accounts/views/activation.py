from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.security.activation import apply_activation_code_for_user
from apps.accounts.serializers.activation import ActivationCodeApplySerializer
from apps.accounts.serializers.entitlement import EntitlementReadSerializer


class ActivationCodeApplyAPIView(APIView):
    """
    Apply an activation code for an existing user.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = ActivationCodeApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data["code"]

        try:
            entitlements = apply_activation_code_for_user(
                user=request.user,
                code=code,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = EntitlementReadSerializer(
            instance=entitlements,
            many=True,
            context={"request": request},
        ).data

        return Response(
            {"entitlements": data},
            status=status.HTTP_200_OK,
        )
