from __future__ import annotations

from datetime import timedelta
from django.utils import timezone

from apps.accounts.services.activation_codes import (
    ActivationPlan,
)


def get_plan_duration_days(plan: str) -> int | None:
    if plan == ActivationPlan.TRIAL_7D:
        return 7
    if plan == ActivationPlan.M1:
        return 30
    if plan == ActivationPlan.M2:
        return 60
    if plan == ActivationPlan.M3:
        return 90
    if plan == ActivationPlan.M6:
        return 180
    if plan == ActivationPlan.M12:
        return 365
    if plan == ActivationPlan.LIFETIME:
        return None

    raise ValueError(f"Unknown plan: {plan}")


def calculate_expires_at_for_plan(plan: str, *, starts_at=None):
    starts_at = starts_at or timezone.now()
    duration_days = get_plan_duration_days(plan)

    if duration_days is None:
        return None
    return starts_at + timedelta(days=duration_days)
