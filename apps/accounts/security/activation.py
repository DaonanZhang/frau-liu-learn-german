from __future__ import annotations

import hashlib

from django.db import transaction

from apps.accounts.services.activation_codes import (
    verify_activation_code,
    consume_activation_code,
    activation_code_lock,
)
from apps.accounts.models import Module, ModuleSeason
from apps.accounts.services.entitlement_grant_service import grant_or_extend_entitlement


@transaction.atomic
def apply_activation_code_for_user(*, user, code: str):
    """
    Apply an activation code to an existing user and grant entitlements.
    """
    normalized_code = str(code or "").strip().upper()
    with activation_code_lock(normalized_code) as acquired:
        if not acquired:
            raise ValueError("Activation code is currently being redeemed")

        payload = verify_activation_code(normalized_code)
        if not payload:
            raise ValueError("Invalid or expired activation code")

        code_ref = hashlib.sha256(normalized_code.encode("utf-8")).hexdigest()[:16]
        created = []
        for item in payload.entitlements:
            module = Module.objects.get(key=item.module_key, is_active=True)
            season = None
            if item.season_number is not None:
                season = ModuleSeason.objects.get(
                    module=module,
                    season_number=item.season_number,
                )
            created.append(
                grant_or_extend_entitlement(
                    user=user,
                    module=module,
                    season=season,
                    plan=item.plan,
                    external_ref=f"activation_code:{code_ref}",
                )
            )

        consume_activation_code(normalized_code)
        return created
