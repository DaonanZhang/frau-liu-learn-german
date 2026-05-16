from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.utils import timezone

from apps.accounts.models import Entitlement, PurchaseOffer

UPGRADE_DISCOUNT_AMOUNT = Decimal("5.00")
UPGRADE_DISCOUNT_LABEL = "品牌挚友专享"
UPGRADE_DISCOUNT_RULES = {
    "science-season-lifetime": {2},
    "vlog-season-lifetime": {1},
}


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
