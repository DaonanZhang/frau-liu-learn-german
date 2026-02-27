from __future__ import annotations

from django.db import transaction

from apps.accounts.services.activation_codes import (
    verify_activation_code,
    consume_activation_code,
)
from apps.accounts.security.entitlement_factory import (
    create_entitlement_from_activation_item,
)


@transaction.atomic
def apply_activation_code_for_user(*, user, code: str):
    """
    Apply an activation code to an existing user and grant entitlements.
    """
    payload = verify_activation_code(code)
    if not payload:
        raise ValueError("Invalid or expired activation code")

    created = []
    for item in payload.entitlements:
        created.append(
            create_entitlement_from_activation_item(
                user=user,
                item=item,
            )
        )

    consume_activation_code(code)
    return created
