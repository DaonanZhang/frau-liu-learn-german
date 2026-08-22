from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import Entitlement
from apps.accounts.security.entitlement_factory import calculate_expires_at_for_plan


class ExistingLifetimeAccessError(ValueError):
    """Raised when a new paid/code grant would add no value to lifetime access."""


def _covering_scope_query(*, module, season):
    query = Q(module__isnull=True, season__isnull=True) | Q(module=module, season__isnull=True)
    if season is not None:
        query |= Q(module=module, season=season)
    return query


def get_entitlement_extension_start(*, user, module, season=None, at=None):
    at = at or timezone.now()
    latest = (
        Entitlement.objects.filter(
            user=user,
            status=Entitlement.Status.ACTIVE,
            expires_at__gt=at,
        )
        .filter(_covering_scope_query(module=module, season=season))
        .order_by("-expires_at")
        .first()
    )
    return latest.expires_at if latest is not None else at


def estimate_entitlement_expiry(*, user, module, season, plan, at=None):
    starts_at = get_entitlement_extension_start(
        user=user,
        module=module,
        season=season,
        at=at,
    )
    return calculate_expires_at_for_plan(plan, starts_at=starts_at)


@transaction.atomic
def grant_or_extend_entitlement(
    *,
    user,
    module,
    season,
    plan: str,
    external_ref: str,
    reject_if_lifetime: bool = False,
) -> Entitlement:
    """Grant one purchase/code exactly once and stack it after current access."""

    locked_user = get_user_model().objects.select_for_update().get(pk=user.pk)

    existing = Entitlement.objects.filter(
        user=locked_user,
        module=module,
        season=season,
        external_ref=external_ref,
    ).first()
    if existing is not None:
        return existing

    now = timezone.now()
    lifetime = Entitlement.objects.filter(
        user=locked_user,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
        expires_at__isnull=True,
    ).filter(_covering_scope_query(module=module, season=season)).first()
    if lifetime is not None:
        if reject_if_lifetime:
            raise ExistingLifetimeAccessError(
                "The user received covering lifetime access before this grant was finalized."
            )
        return lifetime

    starts_at = get_entitlement_extension_start(
        user=locked_user,
        module=module,
        season=season,
        at=now,
    )
    return Entitlement.objects.create(
        user=locked_user,
        module=module,
        season=season,
        plan=plan,
        status=Entitlement.Status.ACTIVE,
        starts_at=starts_at,
        expires_at=calculate_expires_at_for_plan(plan, starts_at=starts_at),
        external_ref=external_ref,
    )


@transaction.atomic
def revoke_and_compact_payment_entitlement(*, payment, at=None) -> bool:
    """Cancel a refunded entitlement and remove gaps from later extensions.

    Args:
        payment: Fully refunded Alipay payment record.
        at: Optional deterministic revocation timestamp.

    Returns:
        Whether an active entitlement belonging to the payment was canceled.
    """

    at = at or timezone.now()
    external_ref = f"alipay_payment:{payment.merchant_order_no}"
    target = Entitlement.objects.filter(
        external_ref=external_ref,
        status=Entitlement.Status.ACTIVE,
    ).first()
    if target is None:
        return False

    get_user_model().objects.select_for_update().get(pk=target.user_id)
    target = Entitlement.objects.select_for_update().get(pk=target.pk)
    if target.status != Entitlement.Status.ACTIVE:
        return False
    original_start = target.starts_at
    original_expiry = target.expires_at
    target.status = Entitlement.Status.CANCELED
    target.save(update_fields=["status"])

    if original_expiry is None or original_expiry <= at:
        return True

    previous_expiry = (
        Entitlement.objects.filter(
            user_id=target.user_id,
            status=Entitlement.Status.ACTIVE,
            expires_at__gt=at,
            starts_at__lt=original_start,
        )
        .filter(_covering_scope_query(module=target.module, season=target.season))
        .order_by("-expires_at")
        .values_list("expires_at", flat=True)
        .first()
    )
    cursor = max(at, previous_expiry) if previous_expiry is not None else at
    later = list(
        Entitlement.objects.select_for_update()
        .filter(
            user_id=target.user_id,
            module=target.module,
            season=target.season,
            status=Entitlement.Status.ACTIVE,
            starts_at__gte=original_start,
            expires_at__isnull=False,
        )
        .order_by("starts_at", "id")
    )
    for entitlement in later:
        duration = entitlement.expires_at - entitlement.starts_at
        entitlement.starts_at = cursor
        entitlement.expires_at = cursor + duration
        entitlement.save(update_fields=["starts_at", "expires_at"])
        cursor = entitlement.expires_at
    return True
