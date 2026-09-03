from __future__ import annotations

import secrets
import string
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.accounts.models import (
    ActivationCodeRecord,
    AlipayWebsitePayment,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    UserCoupon,
)
from apps.accounts.services.activation_codes import activation_code_hash


def promotion_code_exists(code: str) -> bool:
    normalized = str(code or "").strip().upper()
    if not normalized:
        return False
    return PromotionCodeRecord.objects.filter(code=normalized).exists()


def generate_promotion_code(length: int = 10) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(100):
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        code_hash = activation_code_hash(code)
        if not PromotionCodeRecord.objects.filter(code=code).exists() and not ActivationCodeRecord.objects.filter(code_hash=code_hash).exists():
            return code
    raise RuntimeError("Failed to generate a unique promotion code")


def store_promotion_code(*, code: str, **values) -> PromotionCodeRecord:
    normalized = str(code or "").strip().upper()
    if not normalized:
        raise ValueError("Promotion code cannot be empty")
    if ActivationCodeRecord.objects.filter(code_hash=activation_code_hash(normalized)).exists():
        raise ValueError("Code already exists as an activation code")
    try:
        record = PromotionCodeRecord(
            code=normalized,
            **values,
        )
        record.full_clean()
        record.save()
        return record
    except IntegrityError as exc:
        raise ValueError("Promotion code already exists") from exc


@transaction.atomic
def create_promotion_code_batch(
    *,
    campaign_name: str,
    organization_name: str,
    count: int,
    length: int,
    remark: str,
    discount_amount,
    minimum_order_amount,
    applicable_module,
    applicable_season,
    applicable_offer,
    is_stackable: bool,
    coupon_valid_days: int | None,
    expires_at,
) -> list[str]:
    """Create one atomic batch and return the plaintext codes to the operator."""

    if count < 1 or count > 10000:
        raise ValueError("count must be between 1 and 10000")
    if length < 1 or length > 32:
        raise ValueError("length must be between 1 and 32")
    if coupon_valid_days is not None and coupon_valid_days <= 0:
        raise ValueError("coupon_valid_days must be greater than zero")
    campaign_name = str(campaign_name or "").strip()
    if not campaign_name:
        raise ValueError("campaign_name cannot be empty")

    codes = []
    for _ in range(count):
        code = generate_promotion_code(length=length)
        store_promotion_code(
            code=code,
            campaign_name=campaign_name,
            organization_name=str(organization_name or "").strip(),
            remark=str(remark or "").strip(),
            discount_amount=discount_amount,
            minimum_order_amount=minimum_order_amount,
            applicable_module=applicable_module,
            applicable_season=applicable_season,
            applicable_offer=applicable_offer,
            is_stackable=is_stackable,
            coupon_valid_days=coupon_valid_days,
            expires_at=expires_at,
        )
        codes.append(code)
    return codes


@transaction.atomic
def redeem_promotion_code(*, user, code: str) -> UserCoupon:
    normalized = str(code or "").strip().upper()
    if not normalized:
        raise ValueError("推广码无效或已过期")
    try:
        record = (
            PromotionCodeRecord.objects
            .select_for_update()
            .get(code=normalized)
        )
    except PromotionCodeRecord.DoesNotExist as exc:
        raise ValueError("推广码无效或已过期") from exc

    now = timezone.now()
    if record.status != PromotionCodeRecord.Status.ACTIVE or record.expires_at <= now:
        if record.status == PromotionCodeRecord.Status.ACTIVE and record.expires_at <= now:
            record.status = PromotionCodeRecord.Status.EXPIRED
            record.save(update_fields=["status", "updated_at"])
        raise ValueError("推广码无效或已过期")
    coupon = UserCoupon.objects.create(
        user=user,
        promotion_code=record,
        discount_amount=record.discount_amount,
        minimum_order_amount=record.minimum_order_amount,
        applicable_module_id=record.applicable_module_id,
        applicable_season_id=record.applicable_season_id,
        applicable_offer_id=record.applicable_offer_id,
        is_stackable=record.is_stackable,
        expires_at=(
            now + timedelta(days=record.coupon_valid_days)
            if record.coupon_valid_days is not None
            else None
        ),
    )
    record.status = PromotionCodeRecord.Status.CONSUMED
    record.consumed_by_user = user
    record.consumed_at = now
    record.save(update_fields=["status", "consumed_by_user", "consumed_at", "updated_at"])
    return coupon


def eligible_coupon_queryset(*, user, offer, for_update: bool = False):
    now = timezone.now()
    UserCoupon.objects.filter(
        user=user,
        status=UserCoupon.Status.AVAILABLE,
        expires_at__isnull=False,
        expires_at__lte=now,
    ).update(status=UserCoupon.Status.EXPIRED)
    queryset = UserCoupon.objects.filter(
        user=user,
        status=UserCoupon.Status.AVAILABLE,
        minimum_order_amount__lte=offer.price_amount,
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now),
        Q(applicable_module__isnull=True) | Q(applicable_module=offer.module),
        Q(applicable_season__isnull=True) | Q(applicable_season=offer.season),
        Q(applicable_offer__isnull=True) | Q(applicable_offer=offer),
    ).select_related("promotion_code").order_by(
        "-discount_amount",
        F("expires_at").asc(nulls_last=True),
        "id",
    )
    if for_update:
        queryset = queryset.select_for_update()
    return queryset


def get_coupon_unavailable_reason(*, coupon: UserCoupon, offer, now=None) -> str:
    now = now or timezone.now()
    if coupon.status == UserCoupon.Status.RESERVED:
        return "该优惠券正被另一笔待支付订单占用。"
    if coupon.status == UserCoupon.Status.USED:
        return "该优惠券已经使用。"
    if coupon.status == UserCoupon.Status.REVOKED:
        return "该优惠券已失效。"
    if coupon.status == UserCoupon.Status.EXPIRED or (
        coupon.expires_at is not None and coupon.expires_at <= now
    ):
        return "该优惠券已经过期。"
    if coupon.minimum_order_amount > offer.price_amount:
        return f"订单原价满 ¥{coupon.minimum_order_amount:.2f} 可用。"
    if coupon.applicable_module_id and coupon.applicable_module_id != offer.module_id:
        return "该优惠券不适用于当前模块。"
    if coupon.applicable_season_id and coupon.applicable_season_id != offer.season_id:
        return "该优惠券不适用于当前季度。"
    if coupon.applicable_offer_id and coupon.applicable_offer_id != offer.id:
        return "该优惠券不适用于当前商品。"
    return ""


def get_coupon_for_offer(*, user, offer, coupon_id=None, for_update: bool = False):
    queryset = eligible_coupon_queryset(user=user, offer=offer, for_update=for_update)
    if coupon_id is not None:
        return queryset.filter(pk=coupon_id).first()
    return queryset.order_by(
        "-discount_amount",
        F("expires_at").asc(nulls_last=True),
        "id",
    ).first()


@transaction.atomic
def sync_payment_discount_status(*, payment_id: int) -> None:
    application = (
        PaymentDiscountApplication.objects
        .select_for_update()
        .select_related("coupon", "payment")
        .filter(payment_id=payment_id)
        .first()
    )
    if application is None:
        return
    payment = application.payment
    coupon = UserCoupon.objects.select_for_update().get(pk=application.coupon_id)
    now = timezone.now()

    if payment.status in {
        AlipayWebsitePayment.Status.PAID,
        AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
    }:
        if application.status == PaymentDiscountApplication.Status.RESERVED:
            application.status = PaymentDiscountApplication.Status.APPLIED
            application.applied_at = payment.paid_at or now
            application.save(update_fields=["status", "applied_at", "updated_at"])
        if coupon.status == UserCoupon.Status.RESERVED and coupon.reserved_payment_id == payment.id:
            coupon.status = UserCoupon.Status.USED
            coupon.used_payment = payment
            coupon.used_at = payment.paid_at or now
            coupon.save(update_fields=["status", "used_payment", "used_at", "updated_at"])
        return

    if payment.status == AlipayWebsitePayment.Status.REFUNDED:
        if application.status in {
            PaymentDiscountApplication.Status.RESERVED,
            PaymentDiscountApplication.Status.APPLIED,
        }:
            application.status = PaymentDiscountApplication.Status.REFUNDED
            application.refunded_at = payment.refunded_at or now
            application.save(update_fields=["status", "refunded_at", "updated_at"])
        if coupon.status == UserCoupon.Status.RESERVED and coupon.reserved_payment_id == payment.id:
            coupon.status = UserCoupon.Status.USED
            coupon.used_payment = payment
            coupon.used_at = payment.paid_at or now
            coupon.save(update_fields=["status", "used_payment", "used_at", "updated_at"])
        return

    if payment.status in {
        AlipayWebsitePayment.Status.CLOSED,
        AlipayWebsitePayment.Status.FAILED,
    } and application.status == PaymentDiscountApplication.Status.RESERVED:
        application.status = PaymentDiscountApplication.Status.RELEASED
        application.released_at = now
        application.save(update_fields=["status", "released_at", "updated_at"])
        if coupon.status == UserCoupon.Status.RESERVED and coupon.reserved_payment_id == payment.id:
            coupon.status = (
                UserCoupon.Status.AVAILABLE
                if coupon.expires_at is None or coupon.expires_at > now
                else UserCoupon.Status.EXPIRED
            )
            coupon.reserved_payment = None
            coupon.reserved_at = None
            coupon.save(update_fields=["status", "reserved_payment", "reserved_at", "updated_at"])


__all__ = [
    "create_promotion_code_batch",
    "eligible_coupon_queryset",
    "generate_promotion_code",
    "get_coupon_for_offer",
    "get_coupon_unavailable_reason",
    "promotion_code_exists",
    "redeem_promotion_code",
    "store_promotion_code",
    "sync_payment_discount_status",
]
