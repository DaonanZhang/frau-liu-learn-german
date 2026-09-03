from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q


class PromotionCodeRecord(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CONSUMED = "consumed", "Consumed"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    code = models.CharField(max_length=32, unique=True)
    campaign_name = models.CharField(max_length=128)
    organization_name = models.CharField(max_length=128, blank=True, default="")
    remark = models.CharField(max_length=255, blank=True, default="")
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2)
    minimum_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    applicable_module = models.ForeignKey(
        "accounts.Module",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="promotion_codes",
    )
    applicable_season = models.ForeignKey(
        "accounts.ModuleSeason",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="promotion_codes",
    )
    applicable_offer = models.ForeignKey(
        "accounts.PurchaseOffer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="promotion_codes",
    )
    is_stackable = models.BooleanField(default=False)
    coupon_valid_days = models.PositiveIntegerField(null=True, blank=True, default=None)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    expires_at = models.DateTimeField(db_index=True)
    consumed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consumed_promotion_codes",
    )
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign_name", "status", "consumed_at"], name="idx_promo_name_use"),
            models.Index(fields=["consumed_by_user", "status"], name="idx_promo_user_status"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(discount_amount__gt=0), name="promo_discount_positive"),
            models.CheckConstraint(condition=Q(minimum_order_amount__gte=0), name="promo_minimum_nonnegative"),
            models.CheckConstraint(
                condition=Q(coupon_valid_days__isnull=True) | Q(coupon_valid_days__gt=0),
                name="promo_valid_days_positive",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        if self.applicable_season_id and self.applicable_module_id:
            if self.applicable_season.module_id != self.applicable_module_id:
                raise ValidationError("Applicable season does not belong to the selected module.")
        if self.applicable_offer_id:
            if self.applicable_module_id and self.applicable_offer.module_id != self.applicable_module_id:
                raise ValidationError("Applicable offer does not belong to the selected module.")
            if self.applicable_season_id and self.applicable_offer.season_id != self.applicable_season_id:
                raise ValidationError("Applicable offer does not belong to the selected season.")

    def __str__(self) -> str:
        return f"PromotionCodeRecord<code={self.code} status={self.status}>"


class UserCoupon(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        RESERVED = "reserved", "Reserved"
        USED = "used", "Used"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="promotion_coupons",
    )
    promotion_code = models.OneToOneField(
        PromotionCodeRecord,
        on_delete=models.PROTECT,
        related_name="coupon",
    )
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2)
    minimum_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    applicable_module = models.ForeignKey(
        "accounts.Module", null=True, blank=True, on_delete=models.PROTECT, related_name="promotion_coupons"
    )
    applicable_season = models.ForeignKey(
        "accounts.ModuleSeason", null=True, blank=True, on_delete=models.PROTECT, related_name="promotion_coupons"
    )
    applicable_offer = models.ForeignKey(
        "accounts.PurchaseOffer", null=True, blank=True, on_delete=models.PROTECT, related_name="promotion_coupons"
    )
    is_stackable = models.BooleanField(default=False)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.AVAILABLE,
        db_index=True,
    )
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    reserved_payment = models.OneToOneField(
        "accounts.AlipayWebsitePayment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reserved_coupon",
    )
    used_payment = models.OneToOneField(
        "accounts.AlipayWebsitePayment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="used_coupon",
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    reserved_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status", "expires_at"], name="idx_coupon_user_available"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(discount_amount__gt=0), name="coupon_discount_positive"),
            models.CheckConstraint(condition=Q(minimum_order_amount__gte=0), name="coupon_minimum_nonnegative"),
        ]

    def __str__(self) -> str:
        return f"UserCoupon<user={self.user_id} promotion_code={self.promotion_code_id} status={self.status}>"


class PaymentDiscountApplication(models.Model):
    class Status(models.TextChoices):
        RESERVED = "reserved", "Reserved"
        APPLIED = "applied", "Applied"
        RELEASED = "released", "Released"
        REFUNDED = "refunded", "Refunded"

    class SelectionSource(models.TextChoices):
        AUTOMATIC = "automatic", "Automatically selected"
        MANUAL = "manual", "Selected by user"

    payment = models.OneToOneField(
        "accounts.AlipayWebsitePayment",
        on_delete=models.PROTECT,
        related_name="discount_application",
    )
    coupon = models.ForeignKey(UserCoupon, on_delete=models.PROTECT, related_name="payment_applications")
    promotion_code = models.ForeignKey(
        PromotionCodeRecord, on_delete=models.PROTECT, related_name="payment_applications"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="promotion_purchases"
    )
    offer = models.ForeignKey(
        "accounts.PurchaseOffer", on_delete=models.PROTECT, related_name="promotion_discount_applications"
    )
    original_amount = models.DecimalField(max_digits=10, decimal_places=2)
    automatic_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    promotion_discount_amount = models.DecimalField(max_digits=10, decimal_places=2)
    final_amount = models.DecimalField(max_digits=10, decimal_places=2)
    selection_source = models.CharField(
        max_length=16,
        choices=SelectionSource.choices,
        default=SelectionSource.AUTOMATIC,
    )
    campaign_name_snapshot = models.CharField(max_length=128, blank=True, default="")
    campaign_organization_snapshot = models.CharField(max_length=128, blank=True, default="")
    promotion_code_remark_snapshot = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.RESERVED,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign_name_snapshot", "status", "applied_at"], name="idx_discount_name_paid"),
            models.Index(fields=["user", "status"], name="idx_discount_user_status"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(original_amount__gt=0), name="discount_original_positive"),
            models.CheckConstraint(condition=Q(automatic_discount_amount__gte=0), name="discount_auto_nonnegative"),
            models.CheckConstraint(condition=Q(promotion_discount_amount__gt=0), name="discount_promo_positive"),
            models.CheckConstraint(condition=Q(final_amount__gt=0), name="discount_final_positive"),
            models.CheckConstraint(condition=Q(final_amount__lte=F("original_amount")), name="discount_final_lte_original"),
        ]

    def __str__(self) -> str:
        return f"PaymentDiscountApplication<payment={self.payment_id} status={self.status}>"
