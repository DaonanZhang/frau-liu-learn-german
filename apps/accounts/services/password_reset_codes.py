from __future__ import annotations

import random
import string

from django.core.cache import cache


PASSWORD_RESET_CODE_TTL_SECONDS = 15 * 60
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60


def _code_key(email: str) -> str:
    return f"password_reset_code:{email.lower().strip()}"


def _cooldown_key(email: str) -> str:
    return f"password_reset_cooldown:{email.lower().strip()}"


def generate_password_reset_code(length: int = 6) -> str:
    alphabet = string.digits
    return "".join(random.choices(alphabet, k=length))


def store_password_reset_code(*, email: str, code: str) -> None:
    normalized = email.lower().strip()
    cache.set(_code_key(normalized), code, timeout=PASSWORD_RESET_CODE_TTL_SECONDS)
    cache.set(
        _cooldown_key(normalized),
        "1",
        timeout=PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
    )


def verify_password_reset_code(*, email: str, code: str) -> bool:
    normalized = email.lower().strip()
    saved = cache.get(_code_key(normalized))
    if not saved:
        return False
    return str(saved) == str(code).strip()


def consume_password_reset_code(*, email: str) -> None:
    cache.delete(_code_key(email.lower().strip()))


def has_password_reset_cooldown(*, email: str) -> bool:
    return bool(cache.get(_cooldown_key(email.lower().strip())))
