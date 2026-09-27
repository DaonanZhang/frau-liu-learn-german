from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone

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
from apps.accounts.services import (
    AlipayConfigurationError,
    AlipayGatewayError,
    get_alipay_service,
)


def _close_open_payments(*, user, module, season) -> None:
    from apps.accounts.views.payment import _close_unpaid_payment

    open_payments = PaymentGrantTask.objects.select_related("payment").filter(
        user=user,
        module=module,
        payment__status__in=[
            AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
        ],
    )
    if season is not None:
        open_payments = open_payments.filter(season=season)

    alipay_service = None
    if open_payments.exists() and not getattr(
        settings, "ALIPAY_LOCAL_SIMULATE_SUCCESS", False
    ):
        try:
            alipay_service = get_alipay_service()
        except AlipayConfigurationError as exc:
            raise ValueError(
                "The unpaid order could not be canceled safely. Please retry shortly."
            ) from exc

    for payment in {task.payment_id: task.payment for task in open_payments}.values():
        try:
            _close_unpaid_payment(
                payment=payment,
                alipay_service=alipay_service,
            )
        except (AlipayConfigurationError, AlipayGatewayError) as exc:
            raise ValueError(
                "The unpaid order could not be canceled safely. Please retry shortly."
            ) from exc


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
            _close_open_payments(user=user, module=module, season=season)
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
