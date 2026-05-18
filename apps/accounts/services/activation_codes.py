from __future__ import annotations

import random
import string
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from django.apps import apps
from django.core.cache import cache
from django.db import models


# ============================
# Constants / Enums
# ============================

class ActivationPlan:
    """
    Allowed plans for activation codes.
    Must be a subset/superset that can map to Entitlement.Plan.
    """

    TRIAL_7D = "trial_7d"
    M1 = "m1"
    M3 = "m3"
    M6 = "m6"
    M12 = "m12"
    LIFETIME = "lifetime"

    ALL = {
        TRIAL_7D,
        M1,
        M3,
        M6,
        M12,
        LIFETIME,
    }


# ============================
# Payload Classes
# ============================

@dataclass(frozen=True)
class ActivationEntitlementItem:
    """
    One entitlement item to be granted after registration.
    """

    module_key: str
    plan: str
    season_number: Optional[int] = None

    def validate(self) -> None:
        Module = apps.get_model("accounts", "Module")

        # validate module
        if not Module.objects.filter(key=self.module_key, is_active=True).exists():
            raise ValueError(f"Invalid module_key: {self.module_key}")

        # validate plan
        if self.plan not in ActivationPlan.ALL:
            raise ValueError(f"Invalid plan: {self.plan}")

        # validate season_number
        if self.season_number is not None:
            if self.season_number <= 0:
                raise ValueError("season_number must be positive integer")


@dataclass(frozen=True)
class ActivationPayload:
    """
    Full payload stored in Redis for an activation code.
    """

    entitlements: list[ActivationEntitlementItem]

    def validate(self) -> None:
        if not self.entitlements:
            raise ValueError("ActivationPayload.entitlements cannot be empty")

        for item in self.entitlements:
            item.validate()

    # -------- serialization --------

    def to_dict(self) -> dict[str, Any]:
        return {
            "entitlements": [
                {
                    "module": e.module_key,
                    "plan": e.plan,
                    "season_number": e.season_number,
                }
                for e in self.entitlements
            ]
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ActivationPayload":
        raw_items = data.get("entitlements")
        if not isinstance(raw_items, list):
            raise ValueError("Invalid activation payload format")

        items: list[ActivationEntitlementItem] = []
        for raw in raw_items:
            items.append(
                ActivationEntitlementItem(
                    module_key=raw.get("module"),
                    plan=raw.get("plan"),
                    season_number=raw.get("season_number"),
                )
            )

        payload = cls(entitlements=items)
        payload.validate()
        return payload


# ============================
# Redis helpers
# ============================

DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 720  # 720 days


def _redis_key(code: str) -> str:
    return f"activation_code:{code}"


def generate_activation_code(length: int = 8) -> str:
    """
    Generate an activation code like: A9F3KQ2M
    """
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=length))


def store_activation_code(
    *,
    code: str,
    payload: ActivationPayload,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> None:
    """
    Validate and store activation payload into Redis.
    """
    payload.validate()
    cache.set(
        _redis_key(code),
        payload.to_dict(),
        timeout=ttl_seconds,
    )


def verify_activation_code(code: str) -> Optional[ActivationPayload]:
    """
    Verify activation code and return parsed payload if valid.
    """
    raw = cache.get(_redis_key(code))
    if not raw:
        return None

    try:
        return ActivationPayload.from_dict(raw)
    except ValueError:
        return None


def consume_activation_code(code: str) -> None:
    """
    Delete activation code after successful registration.
    """
    cache.delete(_redis_key(code))
