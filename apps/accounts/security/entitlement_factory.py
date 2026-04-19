from __future__ import annotations

from datetime import timedelta
from django.apps import apps
from django.utils import timezone

from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPlan,
)


def calculate_expires_at_for_plan(plan: str):
    now = timezone.now()

    if plan == ActivationPlan.TRIAL_7D:
        return now + timedelta(days=7)
    if plan == ActivationPlan.M1:
        return now + timedelta(days=30)
    if plan == ActivationPlan.M3:
        return now + timedelta(days=90)
    if plan == ActivationPlan.M6:
        return now + timedelta(days=180)
    if plan == ActivationPlan.M12:
        return now + timedelta(days=365)
    if plan == ActivationPlan.LIFETIME:
        return None

    raise ValueError(f"Unknown plan: {plan}")


def create_entitlement_from_activation_item(
    *,
    user,
    item: ActivationEntitlementItem,
):
    """
    Create an Entitlement from activation item.
    """

    Entitlement = apps.get_model("accounts", "Entitlement")
    Module = apps.get_model("accounts", "Module")
    ModuleSeason = apps.get_model("accounts", "ModuleSeason")

    module = Module.objects.get(key=item.module_key)

    season = None
    if item.season_number is not None:
        season = ModuleSeason.objects.get(
            module=module,
            season_number=item.season_number,
        )

    expires_at = calculate_expires_at_for_plan(item.plan)

    return Entitlement.objects.create(
        user=user,
        module=module,
        season=season,
        plan=item.plan,
        status=Entitlement.Status.ACTIVE,
        starts_at=timezone.now(),
        expires_at=expires_at,
        external_ref="activation_code",
    )
