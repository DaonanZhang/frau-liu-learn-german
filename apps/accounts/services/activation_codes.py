from __future__ import annotations

import hashlib
import hmac
import base64
import secrets
import string
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Optional

from django.apps import apps
from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone
from cryptography.fernet import Fernet, InvalidToken


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


def _activation_code_fernet() -> Fernet:
    digest = hashlib.sha256(str(settings.ACTIVATION_CODE_HASH_KEY).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_activation_code(code: str) -> str:
    normalized_code = str(code or "").strip().upper()
    return _activation_code_fernet().encrypt(normalized_code.encode("utf-8")).decode("ascii")


def decrypt_activation_code(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _activation_code_fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""


def activation_code_exists(code: str) -> bool:
    """Return whether a normalized activation code has a persisted ledger record."""
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return False
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    return ActivationCodeRecord.objects.filter(
        code_hash=activation_code_hash(normalized_code)
    ).exists()


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
            code_hash=activation_code_hash(normalized_code),
            code_ciphertext=encrypt_activation_code(normalized_code),
            remark=payload.remark,
            payload=payload_data,
            ttl_seconds=ttl_seconds,
            expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
        )
    except IntegrityError as exc:
        raise ValueError("Activation code already exists") from exc


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

    try:
        return ActivationPayload.from_dict(record.payload)
    except ValueError:
        return None


def consume_activation_code(code: str, *, user=None) -> None:
    """
    Persist consumption for compatible callers.
    """
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    ActivationCodeRecord.objects.filter(
        code_hash=activation_code_hash(normalized_code),
        status=ActivationCodeRecord.Status.ACTIVE,
    ).update(
        status=ActivationCodeRecord.Status.CONSUMED,
        consumed_at=timezone.now(),
        consumed_by_user_id=getattr(user, "id", None),
    )


def revoke_activation_code(code: str) -> bool:
    """Revoke a persisted activation code."""
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return False
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    updated = ActivationCodeRecord.objects.filter(
        code_hash=activation_code_hash(normalized_code),
    ).exclude(
        status=ActivationCodeRecord.Status.CONSUMED,
    ).update(status=ActivationCodeRecord.Status.REVOKED)
    return bool(updated)
