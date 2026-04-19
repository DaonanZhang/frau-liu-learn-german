from __future__ import annotations

from decimal import Decimal

from apps.accounts.models import Module, ModuleSeason
from apps.accounts.models.entitlement import Entitlement
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
    Serializer for creating a real Alipay purchase order with deferred entitlement grant.
    """

    module_key = serializers.SlugField(max_length=64)
    season_number = serializers.IntegerField(required=False, min_value=1)
    plan = serializers.ChoiceField(choices=Entitlement.Plan.choices)
    total_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    subject = serializers.CharField(
        max_length=256,
        required=False,
        allow_blank=True,
    )

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        module_key = str(attrs["module_key"])
        season_number = attrs.get("season_number")
        module = Module.objects.filter(key=module_key, is_active=True).first()
        if module is None:
            raise serializers.ValidationError({"module_key": "Invalid active module."})

        season = None
        if season_number is not None:
            season = ModuleSeason.objects.filter(
                module=module,
                season_number=season_number,
            ).first()
            if season is None:
                raise serializers.ValidationError(
                    {"season_number": "Season does not exist for the selected module."}
                )

        attrs["module"] = module
        attrs["season"] = season
        return attrs
