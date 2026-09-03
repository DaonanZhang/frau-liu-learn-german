from __future__ import annotations

from django.db.models import Prefetch
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.accounts.models import PaymentDiscountApplication, PurchaseOffer, UserCoupon
from apps.accounts.serializers.coupon import UserCouponReadSerializer
from apps.accounts.services import get_purchase_pricing
from apps.accounts.services.promotion_codes import get_coupon_unavailable_reason


def _pricing_payload(pricing) -> dict[str, str]:
    return {
        "original_amount": f"{pricing.original_amount:.2f}",
        "final_amount": f"{pricing.final_amount:.2f}",
        "total_discount_amount": f"{pricing.discount_amount:.2f}",
        "automatic_discount_amount": f"{pricing.automatic_discount_amount:.2f}",
        "promotion_discount_amount": f"{pricing.promotion_discount_amount:.2f}",
        "discount_label": pricing.discount_label,
    }


class UserCouponViewSet(ReadOnlyModelViewSet):
    serializer_class = UserCouponReadSerializer
    permission_classes = [IsAuthenticated]
    ordering = ["-issued_at", "-id"]

    def get_queryset(self):
        application_queryset = PaymentDiscountApplication.objects.select_related(
            "payment",
            "offer",
            "offer__module",
        ).order_by("-created_at")
        return (
            UserCoupon.objects.filter(user=self.request.user)
            .select_related(
                "promotion_code",
                "applicable_module",
                "applicable_season",
                "applicable_season__module",
                "applicable_offer",
                "applicable_offer__module",
                "applicable_offer__season",
                "reserved_payment",
                "used_payment",
            )
            .prefetch_related(
                Prefetch(
                    "payment_applications",
                    queryset=application_queryset,
                    to_attr="prefetched_payment_applications",
                )
            )
            .order_by(*self.ordering)
        )

    @action(detail=False, methods=["get"], url_path="choices")
    def choices(self, request):
        offer_code = str(request.query_params.get("offer_code") or "").strip()
        if not offer_code:
            return Response(
                {"detail": "offer_code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        offer = (
            PurchaseOffer.objects.filter(code=offer_code, is_active=True)
            .select_related("module", "season")
            .first()
        )
        if offer is None:
            return Response(
                {"detail": "Active purchase offer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        no_coupon_pricing = get_purchase_pricing(
            user=request.user,
            offer=offer,
            coupon=False,
        )
        default_pricing = get_purchase_pricing(user=request.user, offer=offer)
        choices = []
        available_count = 0
        for coupon in self.get_queryset():
            unavailable_reason = get_coupon_unavailable_reason(coupon=coupon, offer=offer)
            pricing = None
            if not unavailable_reason:
                candidate_pricing = get_purchase_pricing(
                    user=request.user,
                    offer=offer,
                    coupon=coupon,
                )
                if candidate_pricing.coupon is None:
                    unavailable_reason = "该优惠券不会比当前会员优惠更省。"
                else:
                    pricing = _pricing_payload(candidate_pricing)
                    available_count += 1
            choices.append(
                {
                    "coupon": UserCouponReadSerializer(coupon).data,
                    "is_applicable": not unavailable_reason,
                    "unavailable_reason": unavailable_reason,
                    "pricing": pricing,
                }
            )

        choices.sort(
            key=lambda item: (
                not item["is_applicable"],
                -float(item["pricing"]["promotion_discount_amount"])
                if item["pricing"]
                else 0,
                item["coupon"]["expires_at"] or "9999-12-31T23:59:59Z",
            )
        )
        return Response(
            {
                "offer_code": offer.code,
                "default_coupon_id": (
                    default_pricing.coupon.id if default_pricing.coupon is not None else None
                ),
                "available_count": available_count,
                "no_coupon_pricing": _pricing_payload(no_coupon_pricing),
                "choices": choices,
            }
        )
