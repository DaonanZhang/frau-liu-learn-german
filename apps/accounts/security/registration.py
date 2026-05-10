from __future__ import annotations

from django.apps import apps
from django.db import transaction

from apps.accounts.services.activation_codes import verify_activation_code


def verify_registration_code(code: str):
    """
    Keep the activation-code preview endpoint working for existing-account
    entitlement activation flows.
    """

    payload = verify_activation_code(code)
    if not payload:
        raise ValueError("激活码无效或已过期。")
    return payload


@transaction.atomic
def register_user(
    *,
    telephone: str,
    country_code: str,
    email: str,
    password: str,
):
    """
    Create a normal user account without requiring an activation code.
    """

    User = apps.get_model("accounts", "User")
    UserData = apps.get_model("accounts", "UserData")
    LearningVideoUserData = apps.get_model("learning_by_video", "LearningVideoUserData")

    normalized_email = str(email or "").strip().lower()
    if not normalized_email:
        raise ValueError("邮箱不能为空。")

    if User.objects.filter(telephone=telephone).exists():
        raise ValueError("该手机号已注册。")

    if User.objects.filter(email__iexact=normalized_email).exists():
        raise ValueError("该邮箱已注册。")

    user = User.objects.create_user(
        telephone=telephone,
        country_code=country_code,
        email=normalized_email,
        password=password,
    )

    user_data = UserData.objects.create(user=user)
    LearningVideoUserData.objects.create(user_data=user_data)
    return user
