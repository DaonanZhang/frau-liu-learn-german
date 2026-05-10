from __future__ import annotations

from django.db import transaction
from django.db import models
from django.utils import timezone

from apps.accounts.models import Entitlement, PaymentGrantTask
from apps.accounts.security.entitlement_factory import calculate_expires_at_for_plan


def enqueue_payment_grant_task(*, payment_grant_task: PaymentGrantTask) -> str:
    """
    Enqueue a payment grant task for asynchronous processing.

    Args:
        payment_grant_task: Payment grant task record to be processed by Celery.
    """

    from apps.accounts.tasks import process_payment_grant_task

    async_result = process_payment_grant_task.delay(payment_grant_task.id)
    return str(async_result.id)


def enqueue_pending_payment_grant_tasks_for_payment(*, payment_id: int) -> list[str]:
    """
    Enqueue all pending payment grant tasks linked to one payment.

    Args:
        payment_id: Primary key of the confirmed payment record.
    """

    task_ids: list[str] = []
    pending_tasks = PaymentGrantTask.objects.filter(
        payment_id=payment_id,
        status=PaymentGrantTask.Status.PENDING,
    ).order_by("id")

    for payment_grant_task in pending_tasks:
        task_ids.append(
            enqueue_payment_grant_task(payment_grant_task=payment_grant_task)
        )

    return task_ids


def _find_existing_valid_entitlement_for_task(
    *,
    payment_grant_task: PaymentGrantTask,
) -> Entitlement | None:
    now = timezone.now()
    external_ref = f"alipay_payment:{payment_grant_task.payment.merchant_order_no}"

    entitlement = Entitlement.objects.filter(
        user=payment_grant_task.user,
        module=payment_grant_task.module,
        season=payment_grant_task.season,
        plan=payment_grant_task.plan,
        external_ref=external_ref,
    ).first()
    if entitlement is not None:
        return entitlement

    return Entitlement.objects.filter(
        user=payment_grant_task.user,
        module=payment_grant_task.module,
        season=payment_grant_task.season,
        plan=payment_grant_task.plan,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    ).order_by("-created_at").first()


def process_payment_grant_task_by_id(*, payment_grant_task_id: int) -> None:
    """
    Process one deferred payment grant task.

    Args:
        payment_grant_task_id: Primary key of the deferred payment grant task.
    """

    try:
        with transaction.atomic():
            payment_grant_task = (
                PaymentGrantTask.objects.select_for_update()
                .get(pk=payment_grant_task_id)
            )

            if payment_grant_task.status == PaymentGrantTask.Status.SUCCEEDED:
                return

            payment_grant_task.attempt_count += 1
            payment_grant_task.status = PaymentGrantTask.Status.PROCESSING
            payment_grant_task.last_error = ""
            payment_grant_task.save(
                update_fields=["attempt_count", "status", "last_error", "updated_at"]
            )

            if payment_grant_task.payment.status != payment_grant_task.payment.Status.PAID:
                raise ValueError("Payment is not confirmed as paid.")

            entitlement = _find_existing_valid_entitlement_for_task(
                payment_grant_task=payment_grant_task
            )

            if entitlement is None:
                Entitlement.objects.create(
                    user=payment_grant_task.user,
                    module=payment_grant_task.module,
                    season=payment_grant_task.season,
                    plan=payment_grant_task.plan,
                    status=Entitlement.Status.ACTIVE,
                    starts_at=timezone.now(),
                    expires_at=calculate_expires_at_for_plan(payment_grant_task.plan),
                    external_ref=f"alipay_payment:{payment_grant_task.payment.merchant_order_no}",
                )

            payment_grant_task.status = PaymentGrantTask.Status.SUCCEEDED
            payment_grant_task.processed_at = timezone.now()
            payment_grant_task.last_error = ""
            payment_grant_task.save(
                update_fields=["status", "processed_at", "last_error", "updated_at"]
            )
    except Exception as exc:
        PaymentGrantTask.objects.filter(pk=payment_grant_task_id).update(
            status=PaymentGrantTask.Status.FAILED,
            last_error=str(exc),
            updated_at=timezone.now(),
        )
        raise
