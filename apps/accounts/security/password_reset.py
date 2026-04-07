from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction

from apps.accounts.services.email_service import send_password_reset_email_async
from apps.accounts.services.password_reset_codes import (
    consume_password_reset_code,
    generate_password_reset_code,
    has_password_reset_cooldown,
    store_password_reset_code,
    verify_password_reset_code,
)


User = get_user_model()


def request_password_reset_code(*, email: str) -> None:
    normalized = email.lower().strip()
    user = (
        User.objects.filter(email__iexact=normalized, is_active=True)
        .only("id", "email", "username")
        .first()
    )
    if not user:
        return

    if has_password_reset_cooldown(email=normalized):
        raise ValueError("请求过于频繁，请稍后再试。")

    code = generate_password_reset_code()
    store_password_reset_code(email=normalized, code=code)
    send_password_reset_email_async(
        to_email=user.email,
        code=code,
        username=user.username or user.telephone,
    )


@transaction.atomic
def confirm_password_reset(*, email: str, code: str, new_password: str) -> None:
    normalized = email.lower().strip()
    user = User.objects.filter(email__iexact=normalized, is_active=True).first()
    if not user:
        raise ValueError("验证码错误或已过期。")

    if not verify_password_reset_code(email=normalized, code=code):
        raise ValueError("验证码错误或已过期。")

    user.set_password(new_password)
    user.save(update_fields=["password"])
    consume_password_reset_code(email=normalized)
