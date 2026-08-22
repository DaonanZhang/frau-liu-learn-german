from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Entitlement
from apps.accounts.security.entitlement_factory import calculate_expires_at_for_plan


def get_entitlement_extension_start(*, user, module, season=None, at=None):
    at = at or timezone.now()
    latest = (
        Entitlement.objects.filter(
            user=user,
            module=module,
            season=season,
            status=Entitlement.Status.ACTIVE,
            expires_at__gt=at,
        )
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
        module=module,
        season=season,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
        expires_at__isnull=True,
    ).first()
    if lifetime is not None:
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
