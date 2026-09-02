from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import ActivationCodeRecord
from apps.accounts.security.activation import apply_activation_code_for_user
from apps.accounts.serializers.activation import ActivationCodeApplySerializer
from apps.accounts.serializers.entitlement import EntitlementReadSerializer
from apps.accounts.services.activation_codes import activation_code_hash
from apps.accounts.services.promotion_codes import redeem_promotion_code


class RedeemCodeAPIView(APIView):
    """Redeem either an access activation code or a promotion code."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "activation_code_redeem"

    def post(self, request: Request) -> Response:
        serializer = ActivationCodeApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        try:
            if ActivationCodeRecord.objects.filter(code_hash=activation_code_hash(code)).exists():
                entitlements = apply_activation_code_for_user(user=request.user, code=code)
                return Response(
                    {
                        "type": "activation",
                        "entitlements": EntitlementReadSerializer(
                            entitlements, many=True, context={"request": request}
                        ).data,
                    },
                    status=status.HTTP_200_OK,
                )

            coupon = redeem_promotion_code(user=request.user, code=code)
            return Response(
                {
                    "type": "promotion",
                    "coupon": {
                        "id": coupon.id,
                        "campaign": coupon.campaign.name,
                        "discount_amount": f"{coupon.discount_amount:.2f}",
                        "minimum_order_amount": f"{coupon.minimum_order_amount:.2f}",
                        "expires_at": coupon.expires_at.isoformat(),
                    },
                },
                status=status.HTTP_200_OK,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
