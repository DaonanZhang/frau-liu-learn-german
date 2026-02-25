from __future__ import annotations

from django.db import transaction
from django.apps import apps

from apps.accounts.services.activation_codes import (
    verify_activation_code,
    consume_activation_code,
)
from apps.accounts.security.entitlement_factory import (
    create_entitlement_from_activation_item,
)


def verify_registration_code(code: str):
    """
    Step 1: verify activation code only.
    """
    payload = verify_activation_code(code)
    if not payload:
        raise ValueError("验证码错误，请检查后再试。")

    return payload


@transaction.atomic
def register_user_with_activation_code(
    *,
    code: str,
    telephone: str,
    country_code: str,
    password: str,
):
    """
    Step 2: create user + entitlements, then consume code.
    """

    payload = verify_activation_code(code)
    if not payload:
        raise ValueError("Invalid or expired activation code")

    User = apps.get_model("accounts", "User")
    UserData = apps.get_model("accounts", "UserData")
    LearningVideoUserData = apps.get_model("learning_by_video", "LearningVideoUserData")

    if User.objects.filter(telephone=telephone).exists():
        raise ValueError("Telephone already registered")

    # 1. create user
    user = User.objects.create_user(
        telephone=telephone,
        country_code=country_code,
        password=password,
    )

    # 2. create base user data
    user_data = UserData.objects.create(user=user)

    # 3. create module-level user data eagerly (你说得对，这里最合适)
    LearningVideoUserData.objects.create(user_data=user_data)

    # 4. create entitlements
    for item in payload.entitlements:
        create_entitlement_from_activation_item(
            user=user,
            item=item,
        )

    # 5. consume activation code
    consume_activation_code(code)

    return user
