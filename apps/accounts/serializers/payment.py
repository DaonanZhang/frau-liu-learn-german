from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from apps.accounts.models.entitlement import Entitlement
from apps.accounts.models.purchase_offer import PurchaseOffer
from apps.accounts.models.payment_grant_task import PaymentGrantTask
from apps.accounts.services import get_purchase_pricing
from apps.accounts.services.promotion_codes import get_coupon_for_offer
from rest_framework import serializers


class CreateAlipayDebugPaymentSerializer(serializers.Serializer):
    """
    Serializer for creating a local debug Alipay website payment.
    """

    amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        default="0.01",
        min_value=Decimal("0.01"),
    )
    subject = serializers.CharField(
        max_length=256,
        required=False,
        default="Alipay Debug Payment",
    )


class CreateAlipayPurchaseSerializer(serializers.Serializer):
    """
    Serializer for creating a real Alipay purchase order with server-side pricing.
    """

    offer_code = serializers.SlugField(max_length=64)
    idempotency_key = serializers.UUIDField()
    coupon_id = serializers.IntegerField(required=False, min_value=1)
    use_coupon = serializers.BooleanField(required=False, default=True)

    @staticmethod
    def _has_nonexpiring_access(*, user, offer: PurchaseOffer) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False
        base = Entitlement.objects.filter(
            user=user,
            status=Entitlement.Status.ACTIVE,
            starts_at__lte=timezone.now(),
            expires_at__isnull=True,
        )
        return (
            base.filter(module__isnull=True, season__isnull=True).exists()
            or base.filter(module=offer.module, season__isnull=True).exists()
            or (
                offer.season_id is not None
                and base.filter(module=offer.module, season=offer.season).exists()
            )
        )

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        offer_code = str(attrs["offer_code"]).strip()
        offer = (
            PurchaseOffer.objects
            .filter(code=offer_code, is_active=True)
            .select_related("module", "season")
            .first()
        )
        if offer is None:
            raise serializers.ValidationError({"offer_code": "Invalid active purchase offer."})

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if self._has_nonexpiring_access(
            user=user,
            offer=offer,
        ):
            raise serializers.ValidationError(
                {"detail": "You already have lifetime access to this content."}
            )

        attrs["offer"] = offer
        attrs["module"] = offer.module
        attrs["season"] = offer.season
        attrs["plan"] = offer.plan
        existing_intent = (
            PaymentGrantTask.objects
            .select_related("payment")
            .filter(idempotency_key=str(attrs["idempotency_key"]))
            .first()
        )
        if existing_intent is not None:
            if existing_intent.user_id != getattr(user, "id", None) or existing_intent.offer_id != offer.id:
                raise serializers.ValidationError(
                    {"detail": "The idempotency key is already bound to another purchase intent."}
                )
            attrs["total_amount"] = existing_intent.payment.total_amount
            attrs["coupon"] = None
            attrs["pricing"] = None
            return attrs
        requested_coupon_id = attrs.get("coupon_id")
        use_coupon = attrs.get("use_coupon", True)
        if not use_coupon and requested_coupon_id is not None:
            raise serializers.ValidationError(
                {"coupon_id": "明确不使用优惠券时不能同时指定 coupon_id。"}
            )
        if not use_coupon:
            pricing = get_purchase_pricing(user=user, offer=offer, coupon=False)
            attrs["total_amount"] = pricing.final_amount
            attrs["pricing"] = pricing
            attrs["coupon"] = False
            attrs["coupon_selection_source"] = ""
            return attrs
        coupon = None
        if requested_coupon_id is not None:
            coupon = get_coupon_for_offer(
                user=user,
                offer=offer,
                coupon_id=requested_coupon_id,
            )
            if coupon is None:
                raise serializers.ValidationError({"coupon_id": "优惠券不可用或不适用于该商品。"})
        pricing = get_purchase_pricing(user=user, offer=offer, coupon=coupon)
        if requested_coupon_id is not None and pricing.coupon is None:
            raise serializers.ValidationError({"coupon_id": "该优惠券不会降低当前价格。"})
        attrs["total_amount"] = pricing.final_amount
        attrs["pricing"] = pricing
        attrs["coupon"] = pricing.coupon
        attrs["coupon_selection_source"] = (
            "manual" if requested_coupon_id is not None else "automatic"
        )
        return attrs
