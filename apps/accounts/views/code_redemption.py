from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.security.activation import apply_activation_code_for_user
from apps.accounts.serializers.code_redemption import CodeRedemptionSerializer
from apps.accounts.serializers.coupon import UserCouponReadSerializer
from apps.accounts.serializers.entitlement import EntitlementReadSerializer
from apps.accounts.services.activation_codes import activation_code_exists
from apps.accounts.services.promotion_codes import redeem_promotion_code
from apps.accounts.services.referral_campaign import is_reserved_referral_code
from apps.accounts.services.referral_redemption import (
    ReferralRedemptionError,
    redeem_referral_code,
)


class RedeemCodeAPIView(APIView):
    """Redeem either an access activation code or a promotion code."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "activation_code_redeem"

    def post(self, request: Request) -> Response:
        serializer = CodeRedemptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        confirm_replace = serializer.validated_data["confirm_replace"]

        try:
            if activation_code_exists(code):
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

            if is_reserved_referral_code(code):
                result = redeem_referral_code(
                    user=request.user,
                    code=code,
                    confirm_replace=confirm_replace,
                )
                payload = {
                    "type": result.type,
                    "outcome": result.outcome,
                    "code": result.code,
                    "message": result.message,
                }
                if result.coupon is not None:
                    coupon = dict(
                        UserCouponReadSerializer(
                            result.coupon, context={"request": request}
                        ).data
                    )
                    coupon["profile_path"] = "/profile#coupons"
                    payload["coupon"] = coupon
                if result.replacement is not None:
                    payload["replacement"] = result.replacement
                return Response(payload, status=status.HTTP_200_OK)

            coupon = redeem_promotion_code(user=request.user, code=code)
            return Response(
                {
                    "type": "promotion",
                    "coupon": {
                        "id": coupon.id,
                        "display_name": coupon.display_name,
                        "discount_amount": f"{coupon.discount_amount:.2f}",
                        "minimum_order_amount": f"{coupon.minimum_order_amount:.2f}",
                        "expires_at": coupon.expires_at.isoformat() if coupon.expires_at else None,
                        "profile_path": "/profile#coupons",
                    },
                },
                status=status.HTTP_200_OK,
            )
        except ReferralRedemptionError as exc:
            return Response(
                {
                    "type": "referral",
                    "outcome": exc.outcome,
                    "code": exc.code,
                    "message": str(exc),
                    "detail": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
