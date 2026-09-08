from __future__ import annotations

import secrets
import string
import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Optional

from django.apps import apps
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone


logger = logging.getLogger(__name__)


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
    M2 = "m2"
    M3 = "m3"
    M6 = "m6"
    M12 = "m12"
    LIFETIME = "lifetime"

    ALL = {
        TRIAL_7D,
        M1,
        M2,
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
    Full payload persisted for an activation code.
    """

    entitlements: list[ActivationEntitlementItem]
    remark: str = ""

    def validate(self) -> None:
        if not self.entitlements:
            raise ValueError("ActivationPayload.entitlements cannot be empty")
        if len(self.remark) > 255:
            raise ValueError("ActivationPayload.remark cannot exceed 255 characters")

        for item in self.entitlements:
            item.validate()

    # -------- serialization --------

    def to_dict(self) -> dict[str, Any]:
        data = {
            "entitlements": [
                {
                    "module": e.module_key,
                    "plan": e.plan,
                    "season_number": e.season_number,
                }
                for e in self.entitlements
            ]
        }
        if self.remark:
            data["remark"] = self.remark
        return data

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

        payload = cls(entitlements=items, remark=str(data.get("remark") or "").strip())
        payload.validate()
        return payload


# ============================
# Persistence helpers
# ============================

DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 720  # 720 days


def _redis_key(code: str) -> str:
    return f"activation_code:{code}"


def _read_redis_payload(code: str) -> Optional[ActivationPayload]:
    try:
        raw = cache.get(_redis_key(code))
    except Exception:
        logger.warning("Could not read legacy activation code from Redis", exc_info=True)
        return None
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None
    try:
        return ActivationPayload.from_dict(raw)
    except ValueError:
        return None


def _redis_ttl_seconds(code: str) -> Optional[int]:
    ttl_getter = getattr(cache, "ttl", None)
    if not callable(ttl_getter):
        return DEFAULT_TTL_SECONDS
    try:
        ttl = ttl_getter(_redis_key(code))
    except Exception:
        logger.warning("Could not read legacy activation-code TTL from Redis", exc_info=True)
        return DEFAULT_TTL_SECONDS
    if ttl is None:
        return None
    return ttl if isinstance(ttl, int) and ttl > 0 else DEFAULT_TTL_SECONDS


def _write_redis_payload(code: str, payload: dict[str, Any], ttl_seconds: int) -> None:
    try:
        cache.set(_redis_key(code), payload, timeout=ttl_seconds)
    except Exception:
        logger.warning("Could not mirror activation code to Redis", exc_info=True)


def _delete_redis_code(code: str) -> bool:
    try:
        return bool(cache.delete(_redis_key(code)))
    except Exception:
        logger.warning("Could not delete activation code from Redis", exc_info=True)
        return False


def delete_redis_code_on_commit(code: str) -> None:
    transaction.on_commit(lambda: _delete_redis_code(code))


def activation_code_exists(code: str) -> bool:
    """Return whether a code exists in the database or legacy Redis storage."""
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return False
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    if ActivationCodeRecord.objects.filter(code=normalized_code).exists():
        return True
    return _read_redis_payload(normalized_code) is not None


def generate_activation_code(length: int = 8) -> str:
    """
    Generate an activation code like: A9F3KQ2M
    """
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(100):
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        PromotionCodeRecord = apps.get_model("accounts", "PromotionCodeRecord")
        if not activation_code_exists(code) and not PromotionCodeRecord.objects.filter(
            code=code
        ).exists():
            return code
    raise RuntimeError("Failed to generate a unique activation code")


def store_activation_code(
    *,
    code: str,
    payload: ActivationPayload,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> None:
    """
    Validate and persist an activation code in the database.
    """
    payload.validate()
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        raise ValueError("Activation code cannot be empty")
    if ttl_seconds <= 0:
        raise ValueError("Activation code TTL must be positive")
    from apps.accounts.models import ActivationCodeRecord
    PromotionCodeRecord = apps.get_model("accounts", "PromotionCodeRecord")

    payload_data = payload.to_dict()
    if PromotionCodeRecord.objects.filter(code=normalized_code).exists():
        raise ValueError("Code already exists as a promotion code")
    try:
        ActivationCodeRecord.objects.create(
            code=normalized_code,
            remark=payload.remark,
            payload=payload_data,
            ttl_seconds=ttl_seconds,
            expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
        )
    except IntegrityError as exc:
        raise ValueError("Activation code already exists") from exc
    transaction.on_commit(
        lambda: _write_redis_payload(normalized_code, payload_data, ttl_seconds)
    )


def verify_activation_code(code: str) -> Optional[ActivationPayload]:
    """
    Verify activation code and return parsed payload if valid.
    """
    from apps.accounts.models import ActivationCodeRecord

    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return None
    record = ActivationCodeRecord.objects.filter(code=normalized_code).first()
    if record is not None:
        if record.status != ActivationCodeRecord.Status.ACTIVE:
            return None
        if record.expires_at <= timezone.now():
            ActivationCodeRecord.objects.filter(
                pk=record.pk,
                status=ActivationCodeRecord.Status.ACTIVE,
            ).update(status=ActivationCodeRecord.Status.EXPIRED)
            return None

        try:
            return ActivationPayload.from_dict(record.payload)
        except ValueError:
            return None

    return _read_redis_payload(normalized_code)


def persist_legacy_redis_activation_code(code: str):
    """Copy one Redis-only legacy code into the durable plaintext ledger."""
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return None
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    existing = ActivationCodeRecord.objects.filter(code=normalized_code).first()
    if existing is not None:
        return existing

    payload = _read_redis_payload(normalized_code)
    if payload is None:
        return None
    ttl_seconds = _redis_ttl_seconds(normalized_code)
    if ttl_seconds is None:
        return None
    try:
        with transaction.atomic():
            return ActivationCodeRecord.objects.create(
                code=normalized_code,
                remark=payload.remark,
                payload=payload.to_dict(),
                ttl_seconds=ttl_seconds,
                expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
            )
    except IntegrityError:
        return ActivationCodeRecord.objects.filter(code=normalized_code).first()


def consume_activation_code(code: str, *, user=None) -> None:
    """
    Persist consumption for compatible callers.
    """
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    ActivationCodeRecord.objects.filter(
        code=normalized_code,
        status=ActivationCodeRecord.Status.ACTIVE,
    ).update(
        status=ActivationCodeRecord.Status.CONSUMED,
        consumed_at=timezone.now(),
        consumed_by_user_id=getattr(user, "id", None),
    )
    delete_redis_code_on_commit(normalized_code)


def revoke_activation_code(code: str) -> bool:
    """Revoke a persisted activation code."""
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return False
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    updated = ActivationCodeRecord.objects.filter(
        code=normalized_code,
    ).exclude(
        status=ActivationCodeRecord.Status.CONSUMED,
    ).update(status=ActivationCodeRecord.Status.REVOKED)
    deleted_from_redis = _delete_redis_code(normalized_code)
    return bool(updated or deleted_from_redis)
