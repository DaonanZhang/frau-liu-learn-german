from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import PaymentDiscountApplication, UserCoupon


class UserCouponReadSerializer(serializers.ModelSerializer):
    effective_status = serializers.SerializerMethodField()
    scope = serializers.SerializerMethodField()
    usage_history = serializers.SerializerMethodField()

    class Meta:
        model = UserCoupon
        fields = (
            "id",
            "discount_amount",
            "minimum_order_amount",
            "is_stackable",
            "status",
            "effective_status",
            "scope",
            "issued_at",
            "expires_at",
            "reserved_at",
            "used_at",
            "usage_history",
        )
        read_only_fields = fields

    def get_effective_status(self, obj: UserCoupon) -> str:
        if (
            obj.status == UserCoupon.Status.AVAILABLE
            and obj.expires_at is not None
            and obj.expires_at <= timezone.now()
        ):
            return UserCoupon.Status.EXPIRED
        return obj.status

    def get_scope(self, obj: UserCoupon) -> dict[str, object]:
        offer = obj.applicable_offer if obj.applicable_offer_id else None
        season = obj.applicable_season or (offer.season if offer else None)
        module = obj.applicable_module or (season.module if season else None) or (offer.module if offer else None)
        return {
            "module_key": module.key if module else "",
            "module_name": module.name if module else "",
            "season_number": season.season_number if season else None,
            "season_title": season.title if season else "",
            "offer_code": offer.code if offer else "",
            "offer_title": offer.title if offer else "",
        }

    def get_usage_history(self, obj: UserCoupon) -> list[dict[str, object]]:
        applications = getattr(obj, "prefetched_payment_applications", None)
        if applications is None:
            applications = obj.payment_applications.select_related(
                "payment",
                "offer",
                "offer__module",
            ).order_by("-created_at")
        return [self._serialize_application(application) for application in applications]

    @staticmethod
    def _serialize_application(
        application: PaymentDiscountApplication,
    ) -> dict[str, object]:
        return {
            "merchant_order_no": application.payment.merchant_order_no,
            "payment_status": application.payment.status,
            "offer_code": application.offer.code,
            "offer_title": application.offer.title,
            "module_key": application.offer.module.key,
            "module_name": application.offer.module.name,
            "original_amount": f"{application.original_amount:.2f}",
            "automatic_discount_amount": f"{application.automatic_discount_amount:.2f}",
            "promotion_discount_amount": f"{application.promotion_discount_amount:.2f}",
            "final_amount": f"{application.final_amount:.2f}",
            "selection_source": application.selection_source,
            "status": application.status,
            "created_at": application.created_at.isoformat(),
            "applied_at": application.applied_at.isoformat() if application.applied_at else None,
            "released_at": application.released_at.isoformat() if application.released_at else None,
            "refunded_at": application.refunded_at.isoformat() if application.refunded_at else None,
        }
