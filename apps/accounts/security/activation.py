from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.accounts.feature_flags import user_allowed_exam_preparation_preview
from apps.accounts.services.activation_codes import (
    ActivationPlan,
    delete_redis_code_on_commit,
    persist_legacy_redis_activation_code,
    verify_activation_code,
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
    record = ActivationCodeRecord.objects.select_for_update().filter(
        code=normalized_code
    ).first()
    if record is None:
        record = persist_legacy_redis_activation_code(normalized_code)
        if record is None:
            raise ValueError("Invalid or expired activation code")
        record = ActivationCodeRecord.objects.select_for_update().get(pk=record.pk)
    if (
        record.status != ActivationCodeRecord.Status.ACTIVE
        or record.expires_at <= timezone.now()
    ):
        raise ValueError("Invalid or expired activation code")
    payload = verify_activation_code(normalized_code)
    if not payload or record.payload != payload.to_dict():
        raise ValueError("Invalid or expired activation code")
    if (
        any(item.module_key == "exam_preparation" for item in payload.entitlements)
        and not user_allowed_exam_preparation_preview(user)
    ):
        raise ValueError("备考季即将上线，敬请期待。")

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
                external_ref=f"activation_code:{normalized_code}",
                reject_if_lifetime=True,
            )
        )

    record.status = ActivationCodeRecord.Status.CONSUMED
    record.consumed_by_user = user
    record.consumed_at = timezone.now()
    record.save(update_fields=["status", "consumed_by_user", "consumed_at", "updated_at"])
    delete_redis_code_on_commit(normalized_code)
    return created
