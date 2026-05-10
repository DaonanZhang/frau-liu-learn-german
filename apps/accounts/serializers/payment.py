from __future__ import annotations

from decimal import Decimal

from apps.accounts.models.purchase_offer import PurchaseOffer
from apps.accounts.services import get_purchase_pricing
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
    subject = serializers.CharField(
        max_length=256,
        required=False,
        allow_blank=True,
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

        attrs["offer"] = offer
        attrs["module"] = offer.module
        attrs["season"] = offer.season
        attrs["plan"] = offer.plan
        request = self.context.get("request")
        pricing = get_purchase_pricing(
            user=getattr(request, "user", None),
            offer=offer,
        )
        attrs["total_amount"] = pricing.final_amount
        return attrs
