from __future__ import annotations

import random
import string
from datetime import timedelta
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from django.apps import apps
from django.core.cache import cache
from django.db import IntegrityError
from django.utils import timezone


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


def _get_record_model():
    return apps.get_model("accounts", "ActivationCodeRecord")


def _mark_record_expired_if_needed(code: str) -> None:
    ActivationCodeRecord = _get_record_model()
    now = timezone.now()
    ActivationCodeRecord.objects.filter(
        code=code,
        status=ActivationCodeRecord.Status.ACTIVE,
        expires_at__lte=now,
    ).update(status=ActivationCodeRecord.Status.EXPIRED)


def activation_code_exists(code: str) -> bool:
    ActivationCodeRecord = _get_record_model()
    return ActivationCodeRecord.objects.filter(code=code).exists()


def generate_activation_code(length: int = 8) -> str:
    """
    Generate an activation code like: A9F3KQ2M
    """
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(100):
        code = "".join(random.choices(alphabet, k=length))
        if not activation_code_exists(code):
            return code
    raise RuntimeError("Failed to generate a unique activation code")


def store_activation_code(
    *,
    code: str,
    payload: ActivationPayload,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> None:
    """
    Validate and store activation payload into Redis and persistence table.
    """
    ActivationCodeRecord = _get_record_model()
    payload.validate()
    expires_at = timezone.now() + timedelta(seconds=ttl_seconds)
    try:
        ActivationCodeRecord.objects.create(
            code=code,
            status=ActivationCodeRecord.Status.ACTIVE,
            payload=payload.to_dict(),
            ttl_seconds=ttl_seconds,
            expires_at=expires_at,
        )
    except IntegrityError as exc:
        raise ValueError(f"Activation code already exists: {code}") from exc
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
        _mark_record_expired_if_needed(code)
        return None

    try:
        return ActivationPayload.from_dict(raw)
    except ValueError:
        return None


def consume_activation_code(code: str, *, user=None) -> None:
    """
    Delete activation code after successful activation and persist usage metadata.
    """
    ActivationCodeRecord = _get_record_model()
    cache.delete(_redis_key(code))
    ActivationCodeRecord.objects.filter(code=code).update(
        status=ActivationCodeRecord.Status.CONSUMED,
        consumed_at=timezone.now(),
        consumed_by_user_id=getattr(user, "id", None),
    )


def revoke_activation_code(code: str) -> bool:
    """
    Revoke an activation code and remove its Redis entry.
    Returns True when a persisted row was updated.
    """
    ActivationCodeRecord = _get_record_model()
    cache.delete(_redis_key(code))
    updated = ActivationCodeRecord.objects.filter(code=code).exclude(
        status=ActivationCodeRecord.Status.CONSUMED,
    ).update(status=ActivationCodeRecord.Status.REVOKED)
    return bool(updated)
