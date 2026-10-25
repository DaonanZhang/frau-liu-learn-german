from __future__ import annotations

import secrets
import string
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, F, OuterRef, Q, Sum
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    UserCoupon,
)
from apps.accounts.services.activation_codes import activation_code_exists


def promotion_code_exists(code: str) -> bool:
    normalized = str(code or "").strip().upper()
    if not normalized:
        return False
    return PromotionCodeRecord.objects.filter(code=normalized).exists()


def list_promotion_campaign_names() -> list[str]:
    return list(
        PromotionCodeRecord.objects
        .exclude(campaign_name="")
        .order_by("campaign_name")
        .values_list("campaign_name", flat=True)
        .distinct()
    )


def generate_promotion_code(length: int = 10) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(100):
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        if not PromotionCodeRecord.objects.filter(
            code=code
        ).exists() and not activation_code_exists(code):
            return code
    raise RuntimeError("Failed to generate a unique promotion code")


def store_promotion_code(*, code: str, **values) -> PromotionCodeRecord:
    normalized = str(code or "").strip().upper()
    if not normalized:
        raise ValueError("Promotion code cannot be empty")
    if activation_code_exists(normalized):
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
    coupon_valid_days: int | None,
    expires_at,
    operator_name: str = "daonan",
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
    operator_name = str(operator_name or "").strip()
    if not operator_name:
        raise ValueError("operator_name cannot be empty")

    generation_batch_id = uuid.uuid4()
    codes = []
    for _ in range(count):
        code = generate_promotion_code(length=length)
        store_promotion_code(
            code=code,
            generation_batch_id=generation_batch_id,
            operator_name=operator_name,
            campaign_name=campaign_name,
            organization_name=str(organization_name or "").strip(),
            remark=str(remark or "").strip(),
            discount_amount=discount_amount,
            minimum_order_amount=minimum_order_amount,
            applicable_module=applicable_module,
            applicable_season=applicable_season,
            applicable_offer=applicable_offer,
            coupon_valid_days=coupon_valid_days,
            expires_at=expires_at,
        )
        codes.append(code)
    return codes


def get_promotion_campaign_report(
    *,
    campaign_name: str,
    month_text: str,
    organization: str = "",
    code: str = "",
) -> dict[str, object]:
    normalized_month = str(month_text or "").strip()
    month_start = None
    next_month = None
    if normalized_month != "all":
        try:
            month_start_date = datetime.strptime(normalized_month, "%Y-%m").date().replace(day=1)
        except ValueError as exc:
            raise ValueError("--month must use YYYY-MM or all") from exc
        if month_start_date.strftime("%Y-%m") != normalized_month:
            raise ValueError("--month must use YYYY-MM or all")
        if month_start_date.month == 12:
            next_month_date = month_start_date.replace(year=month_start_date.year + 1, month=1)
        else:
            next_month_date = month_start_date.replace(month=month_start_date.month + 1)
        current_tz = timezone.get_current_timezone()
        month_start = timezone.make_aware(
            datetime.combine(month_start_date, datetime.min.time()),
            current_tz,
        )
        next_month = timezone.make_aware(
            datetime.combine(next_month_date, datetime.min.time()),
            current_tz,
        )

    redeemed = PromotionCodeRecord.objects.filter(
        campaign_name__icontains=campaign_name,
        status=PromotionCodeRecord.Status.CONSUMED,
    )
    redemptions = UserCoupon.objects.filter(
        promotion_code__campaign_name__icontains=campaign_name,
    ).select_related("user", "promotion_code")
    paid = PaymentDiscountApplication.objects.filter(
        campaign_name_snapshot__icontains=campaign_name,
        status=PaymentDiscountApplication.Status.APPLIED,
    ).select_related("user", "offer", "payment", "promotion_code")
    if month_start is not None:
        redeemed = redeemed.filter(consumed_at__gte=month_start, consumed_at__lt=next_month)
        redemptions = redemptions.filter(issued_at__gte=month_start, issued_at__lt=next_month)
        paid = paid.filter(applied_at__gte=month_start, applied_at__lt=next_month)
    if organization:
        redeemed = redeemed.filter(organization_name=organization)
        redemptions = redemptions.filter(promotion_code__organization_name=organization)
        paid = paid.filter(campaign_organization_snapshot=organization)
    normalized_code = str(code or "").strip().upper()
    if normalized_code:
        redeemed = redeemed.filter(code=normalized_code)
        redemptions = redemptions.filter(promotion_code__code=normalized_code)
        paid = paid.filter(promotion_code__code=normalized_code)

    redemption_totals = redemptions.aggregate(
        coupon_redemptions=Count("id"),
        redeeming_users=Count("user_id", distinct=True),
    )
    totals = paid.aggregate(
        paid_orders=Count("id"),
        paying_users=Count("user_id", distinct=True),
        original_amount=Sum("original_amount"),
        promotion_discount=Sum("promotion_discount_amount"),
        final_amount=Sum("final_amount"),
    )

    return {
        "campaign_name": campaign_name,
        "organization": organization,
        "code": normalized_code,
        "month": normalized_month,
        "redeemed_codes": redeemed.count(),
        "coupon_redemptions": redemption_totals["coupon_redemptions"] or 0,
        "redeeming_users": redemption_totals["redeeming_users"] or 0,
        "paid_orders": totals["paid_orders"] or 0,
        "paying_users": totals["paying_users"] or 0,
        "original_amount": totals["original_amount"] or Decimal("0.00"),
        "promotion_discount": totals["promotion_discount"] or Decimal("0.00"),
        "final_amount": totals["final_amount"] or Decimal("0.00"),
        "redemptions": [
            {
                "promotion_code": coupon.promotion_code.code,
                "telephone": getattr(coupon.user, "telephone", "") or "",
                "issued_at": coupon.issued_at,
            }
            for coupon in redemptions.order_by("issued_at", "id")
        ],
        "purchases": [
            {
                "promotion_code": application.promotion_code.code,
                "telephone": application.user.telephone,
                "offer_code": application.offer.code,
                "offer_title": application.offer.title,
                "merchant_order_no": application.payment.merchant_order_no,
                "original_amount": application.original_amount,
                "promotion_discount": application.promotion_discount_amount,
                "final_amount": application.final_amount,
                "applied_at": application.applied_at,
            }
            for application in paid.order_by("applied_at", "id")
        ],
    }


@transaction.atomic
def redeem_promotion_code(*, user, code: str) -> UserCoupon:
    normalized = str(code or "").strip().upper()
    if not normalized:
        raise ValueError("推广码无效")
    try:
        record = (
            PromotionCodeRecord.objects
            .select_for_update()
            .get(code=normalized)
        )
    except PromotionCodeRecord.DoesNotExist as exc:
        raise ValueError("推广码无效") from exc

    now = timezone.now()
    has_expired = record.expires_at is not None and record.expires_at <= now
    if record.status == PromotionCodeRecord.Status.EXPIRED or has_expired:
        if record.status == PromotionCodeRecord.Status.ACTIVE and has_expired:
            record.status = PromotionCodeRecord.Status.EXPIRED
            record.save(update_fields=["status", "updated_at"])
        raise ValueError("推广码已过期")
    if record.status != PromotionCodeRecord.Status.ACTIVE:
        raise ValueError("推广码无效或已使用")
    coupon = UserCoupon.objects.create(
        user=user,
        promotion_code=record,
        discount_amount=record.discount_amount,
        minimum_order_amount=record.minimum_order_amount,
        applicable_module_id=record.applicable_module_id,
        applicable_season_id=record.applicable_season_id,
        applicable_offer_id=record.applicable_offer_id,
        expires_at=(
            now + timedelta(days=record.coupon_valid_days)
            if record.coupon_valid_days is not None
            else None
        ),
    )
    if record.redemption_mode == PromotionCodeRecord.RedemptionMode.SINGLE_USE:
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
    open_payment_reservations = PaymentDiscountApplication.objects.filter(
        coupon_id=OuterRef("pk"),
        status=PaymentDiscountApplication.Status.RESERVED,
        payment__status__in={
            AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
        },
    )
    queryset = UserCoupon.objects.filter(
        user=user,
        status=UserCoupon.Status.AVAILABLE,
        minimum_order_amount__lte=offer.price_amount,
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now),
        Q(applicable_module__isnull=True) | Q(applicable_module=offer.module),
        Q(applicable_season__isnull=True) | Q(applicable_season=offer.season),
        Q(applicable_offer__isnull=True) | Q(applicable_offer=offer),
    ).alias(
        has_open_payment_reservation=Exists(open_payment_reservations),
    ).filter(
        has_open_payment_reservation=False,
    ).select_related("promotion_code").order_by(
        "-discount_amount",
        F("expires_at").asc(nulls_last=True),
        "id",
    )
    if for_update:
        queryset = queryset.select_for_update(of=("self",))
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
        if coupon.status in {
            UserCoupon.Status.AVAILABLE,
            UserCoupon.Status.RESERVED,
        }:
            coupon.status = UserCoupon.Status.USED
            coupon.reserved_payment = None
            coupon.reserved_at = None
            coupon.used_payment = payment
            coupon.used_at = payment.paid_at or now
            coupon.save(
                update_fields=[
                    "status",
                    "reserved_payment",
                    "reserved_at",
                    "used_payment",
                    "used_at",
                    "updated_at",
                ]
            )
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
    }:
        if application.status == PaymentDiscountApplication.Status.RESERVED:
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
    "get_promotion_campaign_report",
    "get_coupon_for_offer",
    "get_coupon_unavailable_reason",
    "list_promotion_campaign_names",
    "promotion_code_exists",
    "redeem_promotion_code",
    "store_promotion_code",
    "sync_payment_discount_status",
]
