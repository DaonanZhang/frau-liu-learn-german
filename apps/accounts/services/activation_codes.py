from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import string
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Optional

from django.apps import apps
from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError
from django.utils import timezone
from redis.exceptions import RedisError


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
logger = logging.getLogger(__name__)


def _redis_key(code: str) -> str:
    return f"activation_code:{str(code or '').strip().upper()}"


def _redis_lock_key(code: str) -> str:
    return f"activation_code_lock:{str(code or '').strip().upper()}"


def activation_code_hash(code: str) -> str:
    """Return the keyed normalized lookup digest for an activation code.

    Args:
        code: Plaintext activation code supplied by an operator or user.

    Returns:
        Lowercase SHA-256 hexadecimal digest.
    """

    normalized_code = str(code or "").strip().upper()
    hash_key = str(settings.ACTIVATION_CODE_HASH_KEY).encode("utf-8")
    return hmac.new(
        hash_key,
        normalized_code.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


@contextmanager
def activation_code_lock(code: str):
    """Serialize redemption of one code across all application processes.

    Args:
        code: Plaintext activation code to lock.

    Yields:
        Whether this process acquired the lock.
    """

    lock_key = _redis_lock_key(code)
    try:
        lock = cache.lock(lock_key, timeout=60, blocking_timeout=0)
    except AttributeError:
        lock = None

    if lock is not None:
        acquired = lock.acquire(blocking=False)
        try:
            yield acquired
        finally:
            if acquired:
                try:
                    lock.release()
                except RedisError:
                    logger.warning("Activation code lock expired before release", exc_info=True)
        return

    token = secrets.token_urlsafe(16)
    acquired = cache.add(lock_key, token, timeout=60)
    try:
        yield acquired
    finally:
        if acquired and cache.get(lock_key) == token:
            cache.delete(lock_key)


def generate_activation_code(length: int = 8) -> str:
    """
    Generate an activation code like: A9F3KQ2M
    """
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


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
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        raise ValueError("Activation code cannot be empty")
    if ttl_seconds <= 0:
        raise ValueError("Activation code TTL must be positive")
    from apps.accounts.models import ActivationCodeRecord

    payload_data = payload.to_dict()
    try:
        record = ActivationCodeRecord.objects.create(
            code_hash=activation_code_hash(normalized_code),
            payload=payload_data,
            ttl_seconds=ttl_seconds,
            expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
        )
    except IntegrityError as exc:
        raise ValueError("Activation code already exists") from exc
    try:
        stored = cache.add(
            _redis_key(normalized_code),
            payload_data,
            timeout=ttl_seconds,
        )
    except RedisError:
        record.delete()
        raise
    if not stored:
        record.delete()
        raise ValueError("Activation code already exists")


def verify_activation_code(code: str) -> Optional[ActivationPayload]:
    """
    Verify activation code and return parsed payload if valid.
    """
    from apps.accounts.models import ActivationCodeRecord, Entitlement

    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return None
    code_hash = activation_code_hash(normalized_code)
    if Entitlement.objects.filter(
        external_ref__in=[
            f"activation_code:{code_hash}",
            f"activation_code:{code_hash[:16]}",
        ]
    ).exists():
        return None
    record = ActivationCodeRecord.objects.filter(code_hash=code_hash).first()
    if record is None:
        return None
    if record.status != ActivationCodeRecord.Status.ACTIVE:
        return None
    if record.expires_at <= timezone.now():
        ActivationCodeRecord.objects.filter(
            pk=record.pk,
            status=ActivationCodeRecord.Status.ACTIVE,
        ).update(status=ActivationCodeRecord.Status.EXPIRED)
        return None

    raw = cache.get(_redis_key(normalized_code))
    if not raw:
        return None

    if record.payload != raw:
        return None

    try:
        return ActivationPayload.from_dict(raw)
    except ValueError:
        return None


def consume_activation_code(code: str) -> None:
    """
    Delete activation code after successful registration.
    """
    try:
        cache.delete(_redis_key(code))
    except RedisError:
        logger.warning(
            "Redeemed activation code could not be removed from Redis; the database ledger still blocks reuse",
            exc_info=True,
        )
