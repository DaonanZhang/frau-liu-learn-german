from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models.purchase_offer import PurchaseOffer
from apps.accounts.services import get_purchase_pricing
from apps.accounts.security.entitlement_factory import get_plan_duration_days
from apps.accounts.services.entitlement_grant_service import estimate_entitlement_expiry


class PurchaseOfferReadSerializer(serializers.ModelSerializer):
    module_key = serializers.CharField(source="module.key", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    season_number = serializers.IntegerField(source="season.season_number", read_only=True)
    season_title = serializers.SerializerMethodField()
    plan_label = serializers.SerializerMethodField()
    final_price_amount = serializers.SerializerMethodField()
    original_price_amount = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    discount_label = serializers.SerializerMethodField()
    is_discounted_for_user = serializers.SerializerMethodField()
    access_duration_days = serializers.SerializerMethodField()
    estimated_expires_at = serializers.SerializerMethodField()
    promotion_coupon_id = serializers.SerializerMethodField()
    promotion_campaign = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOffer
        fields = (
            "code",
            "title",
            "description",
            "module_key",
            "module_name",
            "season_number",
            "season_title",
            "plan",
            "plan_label",
            "price_amount",
            "original_price_amount",
            "final_price_amount",
            "discount_amount",
            "discount_label",
            "is_discounted_for_user",
            "access_duration_days",
            "estimated_expires_at",
            "promotion_coupon_id",
            "promotion_campaign",
            "currency",
        )
        read_only_fields = fields

    def get_season_title(self, obj: PurchaseOffer) -> str:
        if not obj.season_id:
            return ""
        return obj.season.title or f"Season {obj.season.season_number}"

    def get_plan_label(self, obj: PurchaseOffer) -> str:
        return obj.get_plan_display()

    def _get_pricing(self, obj: PurchaseOffer):
        cache = getattr(self, "_pricing_cache", None)
        if cache is None:
            cache = self._pricing_cache = {}
        if obj.pk in cache:
            return cache[obj.pk]
        request = self.context.get("request")
        user = getattr(request, "user", None)
        cache[obj.pk] = get_purchase_pricing(user=user, offer=obj)
        return cache[obj.pk]

    def get_final_price_amount(self, obj: PurchaseOffer) -> str:
        return f"{self._get_pricing(obj).final_amount:.2f}"

    def get_original_price_amount(self, obj: PurchaseOffer) -> str:
        return f"{self._get_pricing(obj).original_amount:.2f}"

    def get_discount_amount(self, obj: PurchaseOffer) -> str:
        return f"{self._get_pricing(obj).discount_amount:.2f}"

    def get_discount_label(self, obj: PurchaseOffer) -> str:
        return self._get_pricing(obj).discount_label

    def get_is_discounted_for_user(self, obj: PurchaseOffer) -> bool:
        return self._get_pricing(obj).is_discounted

    def get_promotion_coupon_id(self, obj: PurchaseOffer) -> int | None:
        coupon = self._get_pricing(obj).coupon
        return coupon.id if coupon is not None else None

    def get_promotion_campaign(self, obj: PurchaseOffer) -> str:
        coupon = self._get_pricing(obj).coupon
        return coupon.campaign.name if coupon is not None else ""

    def get_access_duration_days(self, obj: PurchaseOffer) -> int | None:
        return get_plan_duration_days(obj.plan)

    def get_estimated_expires_at(self, obj: PurchaseOffer) -> str | None:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return None
        expires_at = estimate_entitlement_expiry(
            user=user,
            module=obj.module,
            season=obj.season,
            plan=obj.plan,
        )
        return expires_at.isoformat() if expires_at is not None else None
