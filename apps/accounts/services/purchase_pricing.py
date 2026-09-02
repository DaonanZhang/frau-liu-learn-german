from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.utils import timezone

from apps.accounts.models import Entitlement, PurchaseOffer

UPGRADE_DISCOUNT_AMOUNT = Decimal("5.00")
UPGRADE_DISCOUNT_LABEL = "品牌挚友专享"
EXAM_PREPARATION_VIDEO_DISCOUNT_AMOUNT = Decimal("10.00")
EXAM_PREPARATION_VIDEO_DISCOUNT_LABEL = "品牌挚友专享"
VIDEO_EXAM_PREPARATION_DISCOUNT_LABEL = "备考季专享"
UPGRADE_DISCOUNT_RULES = {
    "science-season-lifetime": {2},
    "vlog-season-lifetime": {1, 2},
}


@dataclass(frozen=True)
class PurchasePricing:
    original_amount: Decimal
    final_amount: Decimal
    discount_amount: Decimal
    discount_label: str
    is_discounted: bool
    automatic_discount_amount: Decimal = Decimal("0.00")
    promotion_discount_amount: Decimal = Decimal("0.00")
    coupon: object | None = None


def _user_has_upgrade_discount(*, user, offer: PurchaseOffer) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False

    source_season_numbers = UPGRADE_DISCOUNT_RULES.get(offer.code)
    if not source_season_numbers:
        return False

    now = timezone.now()
    return Entitlement.objects.filter(
        user=user,
        module=offer.module,
        season__season_number__in=source_season_numbers,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
    ).filter(
        expires_at__isnull=True,
    ).exists() or Entitlement.objects.filter(
        user=user,
        module=offer.module,
        season__season_number__in=source_season_numbers,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
        expires_at__gt=now,
    ).exists()


def _user_has_exam_preparation_video_discount(*, user, offer: PurchaseOffer) -> bool:
    if (
        not user
        or not getattr(user, "is_authenticated", False)
        or offer.module.key != "exam_preparation"
    ):
        return False

    now = timezone.now()
    return Entitlement.objects.filter(
        user=user,
        module__key="learning_by_video",
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    ).exists()


def _user_has_video_exam_preparation_discount(*, user, offer: PurchaseOffer) -> bool:
    if (
        not user
        or not getattr(user, "is_authenticated", False)
        or offer.module.key != "learning_by_video"
    ):
        return False

    now = timezone.now()
    return Entitlement.objects.filter(
        user=user,
        module__key="exam_preparation",
        season__isnull=True,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    ).exists()


def _get_automatic_pricing(*, user, offer: PurchaseOffer) -> PurchasePricing:
    original_amount = offer.price_amount

    if _user_has_video_exam_preparation_discount(user=user, offer=offer):
        final_amount = (original_amount * Decimal("0.50")).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        return PurchasePricing(
            original_amount=original_amount,
            final_amount=final_amount,
            discount_amount=original_amount - final_amount,
            discount_label=VIDEO_EXAM_PREPARATION_DISCOUNT_LABEL,
            is_discounted=True,
            automatic_discount_amount=original_amount - final_amount,
        )

    discount_amount = Decimal("0.00")
    discount_labels = []

    if _user_has_upgrade_discount(user=user, offer=offer):
        discount_amount += UPGRADE_DISCOUNT_AMOUNT
        discount_labels.append(UPGRADE_DISCOUNT_LABEL)
    if _user_has_exam_preparation_video_discount(user=user, offer=offer):
        discount_amount += EXAM_PREPARATION_VIDEO_DISCOUNT_AMOUNT
        discount_labels.append(EXAM_PREPARATION_VIDEO_DISCOUNT_LABEL)

    if discount_amount <= 0:
        return PurchasePricing(
            original_amount=original_amount,
            final_amount=original_amount,
            discount_amount=Decimal("0.00"),
            discount_label="",
            is_discounted=False,
        )

    max_discount = max(original_amount - Decimal("0.01"), Decimal("0.00"))
    discount_amount = min(discount_amount, max_discount)
    final_amount = original_amount - discount_amount
    return PurchasePricing(
        original_amount=original_amount,
        final_amount=final_amount,
        discount_amount=discount_amount,
        discount_label=" + ".join(discount_labels) if discount_amount > 0 else "",
        is_discounted=discount_amount > 0,
        automatic_discount_amount=discount_amount,
    )


def get_purchase_pricing(*, user, offer: PurchaseOffer, coupon=None) -> PurchasePricing:
    automatic = _get_automatic_pricing(user=user, offer=offer)
    if not user or not getattr(user, "is_authenticated", False):
        return automatic
    if coupon is False:
        return automatic

    if coupon is None:
        from apps.accounts.services.promotion_codes import eligible_coupon_queryset

        coupons = eligible_coupon_queryset(user=user, offer=offer)
    else:
        coupons = [coupon]

    best = automatic
    for candidate in coupons:
        if candidate.is_stackable:
            base_amount = automatic.final_amount
            automatic_discount = automatic.automatic_discount_amount
        else:
            base_amount = automatic.original_amount
            automatic_discount = Decimal("0.00")
        candidate_final = max(base_amount - candidate.discount_amount, Decimal("0.01"))
        if candidate_final >= best.final_amount:
            continue
        promotion_discount = base_amount - candidate_final
        best = PurchasePricing(
            original_amount=automatic.original_amount,
            final_amount=candidate_final,
            discount_amount=automatic.original_amount - candidate_final,
            discount_label=f"{candidate.campaign.name}专享",
            is_discounted=True,
            automatic_discount_amount=automatic_discount,
            promotion_discount_amount=promotion_discount,
            coupon=candidate,
        )
    return best
