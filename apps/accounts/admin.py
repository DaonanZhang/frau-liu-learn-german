
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.db.models import Q

from apps.accounts.models.entitlement import Entitlement
from apps.accounts.models.module import Module
from apps.accounts.models.module_season import ModuleSeason
from apps.accounts.models.purchase_offer import PurchaseOffer
from apps.accounts.models import (
    ActivationCodeRecord,
    AlipayWebsitePayment,
    PaymentDiscountApplication,
    PaymentGrantTask,
    PromotionCampaign,
    PromotionCodeRecord,
    UserCoupon,
)
from apps.accounts.models.user_data import UserData, UserActiveDay

User = get_user_model()


def _all_user_fields():
    fields = [f.name for f in User._meta.fields if f.name != "id"]
    # include many-to-many permissions
    fields.extend(["groups", "user_permissions"])
    return fields


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Admin configuration for the custom user model."""

    list_display = (
        "id",
        "telephone",
        "country_code",
        "email",
        "is_staff",
        "is_superuser",
        "is_active",
        "date_joined",
    )
    # Restrict admin search to phone numbers only.
    search_fields = ("telephone",)
    search_help_text = "按手机号搜索（telephone）"
    ordering = ("-date_joined",)

    def get_search_results(self, request, queryset, search_term):
        """
        Force user search to telephone-field matching only.
        """
        term = str(search_term or "").strip()
        if not term:
            return queryset, False

        compact = term.replace(" ", "").replace("-", "")
        digits = "".join(ch for ch in compact if ch.isdigit())

        candidates = {compact}
        if digits:
            candidates.add(digits)
            # If input includes country code (e.g. +86...), still match by local phone.
            if len(digits) > 11:
                candidates.add(digits[-11:])

        conditions = Q()
        for candidate in candidates:
            if candidate:
                conditions |= Q(telephone__icontains=candidate)

        return queryset.filter(conditions), False

    fieldsets = (
        (None, {"fields": _all_user_fields()}),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("telephone", "country_code", "password1", "password2", "is_staff", "is_superuser"),
        }),
    )

    filter_horizontal = ("groups", "user_permissions")


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("id", "key", "name", "is_active", "created_at")
    search_fields = ("key", "name")
    list_filter = ("is_active",)


@admin.register(ModuleSeason)
class ModuleSeasonAdmin(admin.ModelAdmin):
    list_display = ("id", "module", "season_number", "title", "created_at")
    list_filter = ("module", "season_number")
    search_fields = ("module__key", "title")


@admin.register(Entitlement)
class EntitlementAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "module", "season", "plan", "status", "starts_at", "expires_at")
    list_filter = ("module", "season", "plan", "status")
    search_fields = ("user__telephone", "module__key", "external_ref")


@admin.register(PurchaseOffer)
class PurchaseOfferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "code",
        "title",
        "module",
        "season",
        "plan",
        "price_amount",
        "currency",
        "is_active",
        "sort_order",
    )
    list_filter = ("module", "season", "plan", "currency", "is_active")
    search_fields = ("code", "title", "module__key", "season__title")


@admin.register(ActivationCodeRecord)
class ActivationCodeRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "code_preview", "remark", "status", "consumed_by_user", "consumed_at", "created_at")
    list_filter = ("status", "created_at", "consumed_at")
    search_fields = ("code_hash", "remark", "consumed_by_user__telephone")
    readonly_fields = ("code_hash", "code_ciphertext", "status", "payload", "ttl_seconds", "expires_at", "consumed_by_user", "consumed_at", "created_at", "updated_at")

    @admin.display(description="Code")
    def code_preview(self, obj):
        from apps.accounts.services.activation_codes import decrypt_activation_code
        return decrypt_activation_code(obj.code_ciphertext) or f"legacy:{obj.code_hash[:12]}"

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AlipayWebsitePayment)
class AlipayWebsitePaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "merchant_order_no",
        "status",
        "total_amount",
        "refunded_amount",
        "paid_at",
        "expires_at",
        "last_reconciled_at",
    )
    list_filter = ("status",)
    search_fields = ("merchant_order_no", "alipay_trade_no")
    readonly_fields = (
        "merchant_order_no",
        "subject",
        "total_amount",
        "status",
        "alipay_trade_no",
        "raw_notify_payload",
        "created_at",
        "updated_at",
        "paid_at",
        "expires_at",
        "last_reconciled_at",
        "refunded_amount",
        "refunded_at",
    )

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentGrantTask)
class PaymentGrantTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "payment", "user", "module", "season", "plan", "status", "attempt_count")
    list_filter = ("status", "module", "season", "plan")
    search_fields = ("payment__merchant_order_no", "user__telephone", "idempotency_key")
    readonly_fields = (
        "payment",
        "offer",
        "user",
        "module",
        "season",
        "plan",
        "status",
        "attempt_count",
        "last_error",
        "processed_at",
        "idempotency_key",
        "created_at",
        "updated_at",
    )

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PromotionCampaign)
class PromotionCampaignAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name", "organization_name", "is_active", "created_at")
    list_filter = ("is_active", "created_at")
    search_fields = ("code", "name", "organization_name", "remark")


@admin.register(PromotionCodeRecord)
class PromotionCodeRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id", "code_preview", "campaign", "discount_amount", "status",
        "consumed_by_user", "consumed_at", "expires_at",
    )
    list_filter = ("campaign", "status", "is_stackable", "consumed_at", "created_at")
    search_fields = ("code_hash", "remark", "campaign__code", "consumed_by_user__telephone")
    readonly_fields = (
        "code_hash", "code_ciphertext", "status", "consumed_by_user", "consumed_at",
        "created_at", "updated_at",
    )

    @admin.display(description="Code")
    def code_preview(self, obj):
        from apps.accounts.services.activation_codes import decrypt_activation_code
        return decrypt_activation_code(obj.code_ciphertext) or f"legacy:{obj.code_hash[:12]}"

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(UserCoupon)
class UserCouponAdmin(admin.ModelAdmin):
    list_display = (
        "id", "user", "campaign", "discount_amount", "status", "expires_at",
        "reserved_payment", "used_payment", "used_at",
    )
    list_filter = ("campaign", "status", "is_stackable", "issued_at", "used_at")
    search_fields = (
        "user__telephone", "campaign__code", "promotion_code__code_hash",
        "reserved_payment__merchant_order_no", "used_payment__merchant_order_no",
    )
    readonly_fields = [field.name for field in UserCoupon._meta.fields]

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentDiscountApplication)
class PaymentDiscountApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "id", "campaign", "user", "offer", "original_amount",
        "promotion_discount_amount", "final_amount", "status", "applied_at",
    )
    list_filter = ("campaign", "status", "offer__module", "applied_at", "created_at")
    search_fields = (
        "user__telephone", "campaign__code", "payment__merchant_order_no",
        "promotion_code__code_hash", "offer__code",
    )
    readonly_fields = [field.name for field in PaymentDiscountApplication._meta.fields]

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(UserData)
class UserDataAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "ui_language", "learning_language", "active_days", "last_active_date")
    search_fields = ("user__telephone",)


@admin.register(UserActiveDay)
class UserActiveDayAdmin(admin.ModelAdmin):
    list_display = ("id", "user_data", "date", "created_at")
    list_filter = ("date",)
