from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.utils import timezone
from apps.accounts.models.entitlement import Entitlement
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

    @staticmethod
    def _user_already_has_access(*, user, offer: PurchaseOffer) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False

        now = timezone.now()
        active_entitlements = Entitlement.objects.filter(
            user=user,
            status=Entitlement.Status.ACTIVE,
            starts_at__lte=now,
        ).filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        )

        if active_entitlements.filter(module__isnull=True, season__isnull=True).exists():
            return True

        if active_entitlements.filter(module=offer.module, season__isnull=True).exists():
            return True

        if offer.season_id and active_entitlements.filter(module=offer.module, season=offer.season).exists():
            return True

        return False

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
        if self._user_already_has_access(user=user, offer=offer):
            raise serializers.ValidationError(
                {"detail": "You already have active access to this content."}
            )

        attrs["offer"] = offer
        attrs["module"] = offer.module
        attrs["season"] = offer.season
        attrs["plan"] = offer.plan
        pricing = get_purchase_pricing(
            user=user,
            offer=offer,
        )
        attrs["total_amount"] = pricing.final_amount
        return attrs
