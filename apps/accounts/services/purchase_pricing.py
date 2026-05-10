from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.utils import timezone

from apps.accounts.models import Entitlement, PurchaseOffer

UPGRADE_DISCOUNT_AMOUNT = Decimal("5.00")
UPGRADE_DISCOUNT_LABEL = "试用用户专享"
UPGRADE_DISCOUNT_OFFER_CODES = {
    "science-season-lifetime",
}
UPGRADE_DISCOUNT_SOURCE_SEASON_NUMBERS = {2}


@dataclass(frozen=True)
class PurchasePricing:
    original_amount: Decimal
    final_amount: Decimal
    discount_amount: Decimal
    discount_label: str
    is_discounted: bool


def _user_has_upgrade_discount(*, user, offer: PurchaseOffer) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if offer.code not in UPGRADE_DISCOUNT_OFFER_CODES:
        return False

    now = timezone.now()
    return Entitlement.objects.filter(
        user=user,
        module=offer.module,
        season__season_number__in=UPGRADE_DISCOUNT_SOURCE_SEASON_NUMBERS,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
    ).filter(
        expires_at__isnull=True,
    ).exists() or Entitlement.objects.filter(
        user=user,
        module=offer.module,
        season__season_number__in=UPGRADE_DISCOUNT_SOURCE_SEASON_NUMBERS,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
        expires_at__gt=now,
    ).exists()


def get_purchase_pricing(*, user, offer: PurchaseOffer) -> PurchasePricing:
    original_amount = offer.price_amount
    if not _user_has_upgrade_discount(user=user, offer=offer):
        return PurchasePricing(
            original_amount=original_amount,
            final_amount=original_amount,
            discount_amount=Decimal("0.00"),
            discount_label="",
            is_discounted=False,
        )

    max_discount = max(original_amount - Decimal("0.01"), Decimal("0.00"))
    discount_amount = min(UPGRADE_DISCOUNT_AMOUNT, max_discount)
    final_amount = original_amount - discount_amount
    return PurchasePricing(
        original_amount=original_amount,
        final_amount=final_amount,
        discount_amount=discount_amount,
        discount_label=UPGRADE_DISCOUNT_LABEL if discount_amount > 0 else "",
        is_discounted=discount_amount > 0,
    )
