from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.accounts.services.activation_codes import (
    verify_activation_code,
    consume_activation_code,
    activation_code_lock,
    activation_code_hash,
    ActivationPlan,
)
from apps.accounts.models import (
    ActivationCodeRecord,
    AlipayWebsitePayment,
    Module,
    ModuleSeason,
    PaymentGrantTask,
)
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

        code_ref = activation_code_hash(normalized_code)
        try:
            record = ActivationCodeRecord.objects.select_for_update().get(code_hash=code_ref)
        except ActivationCodeRecord.DoesNotExist as exc:
            raise ValueError("Invalid or expired activation code") from exc
        if (
            record.status != ActivationCodeRecord.Status.ACTIVE
            or record.expires_at <= timezone.now()
        ):
            raise ValueError("Invalid or expired activation code")
        if record.payload != payload.to_dict():
            raise ValueError("Activation code payload does not match its redemption record")

        created = []
        for item in payload.entitlements:
            module = Module.objects.get(key=item.module_key, is_active=True)
            season = None
            if item.season_number is not None:
                season = ModuleSeason.objects.get(
                    module=module,
                    season_number=item.season_number,
                )
            if item.plan == ActivationPlan.LIFETIME:
                open_payments = PaymentGrantTask.objects.filter(
                    user=user,
                    module=module,
                    payment__status__in=[
                        AlipayWebsitePayment.Status.CREATED,
                        AlipayWebsitePayment.Status.PENDING,
                    ],
                )
                if season is not None:
                    open_payments = open_payments.filter(season=season)
                if open_payments.exists():
                    raise ValueError(
                        "An unpaid order exists for this content. Complete or let it expire before redeeming lifetime access."
                    )
            created.append(
                grant_or_extend_entitlement(
                    user=user,
                    module=module,
                    season=season,
                    plan=item.plan,
                    external_ref=f"activation_code:{code_ref}",
                    reject_if_lifetime=True,
                )
            )

        record.status = ActivationCodeRecord.Status.CONSUMED
        record.consumed_by_user = user
        record.consumed_at = timezone.now()
        record.save(update_fields=["status", "consumed_by_user", "consumed_at", "updated_at"])
        transaction.on_commit(lambda: consume_activation_code(normalized_code))
        return created
