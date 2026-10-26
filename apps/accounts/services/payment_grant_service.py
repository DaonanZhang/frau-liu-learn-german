from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import DatabaseError, transaction
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    PaymentGrantTask,
    ReferralParticipation,
)
from apps.accounts.services.entitlement_grant_service import (
    ExistingLifetimeAccessError,
    grant_or_extend_entitlement,
)
from apps.accounts.services.referral_campaign import CAMPAIGN_TAG, ensure_referral_code
from apps.accounts.services.referral_qualification import mark_referral_reward_pending


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
        status__in=[PaymentGrantTask.Status.PENDING, PaymentGrantTask.Status.FAILED],
    ).order_by("id")

    for payment_grant_task in pending_tasks:
        task_ids.append(
            enqueue_payment_grant_task(payment_grant_task=payment_grant_task)
        )

    return task_ids


def process_pending_payment_grant_tasks_for_payment(*, payment_id: int) -> list[int]:
    """
    Process all pending payment grant tasks linked to one confirmed payment synchronously.

    Args:
        payment_id: Primary key of the confirmed payment record.
    """

    processed_task_ids: list[int] = []
    pending_task_ids = list(
        PaymentGrantTask.objects.filter(
            payment_id=payment_id,
            status__in=[PaymentGrantTask.Status.PENDING, PaymentGrantTask.Status.FAILED],
        ).order_by("id").values_list("id", flat=True)
    )

    for payment_grant_task_id in pending_task_ids:
        process_payment_grant_task_by_id(
            payment_grant_task_id=payment_grant_task_id,
        )
        processed_task_ids.append(payment_grant_task_id)

    return processed_task_ids


def process_payment_grant_task_by_id(*, payment_grant_task_id: int) -> None:
    """
    Process one deferred payment grant task.

    Args:
        payment_grant_task_id: Primary key of the deferred payment grant task.
    """

    try:
        with transaction.atomic():
            locator = PaymentGrantTask.objects.filter(pk=payment_grant_task_id).values(
                "user_id", "payment_id"
            ).first()
            if locator is None:
                raise PaymentGrantTask.DoesNotExist
            buyer = get_user_model().objects.select_for_update().get(
                pk=locator["user_id"]
            )
            payment_grant_task = (
                PaymentGrantTask.objects.select_for_update()
                .get(pk=payment_grant_task_id)
            )
            if (
                payment_grant_task.user_id != buyer.pk
                or payment_grant_task.payment_id != locator["payment_id"]
            ):
                raise ValueError("Payment grant task relationships changed during processing.")
            payment = AlipayWebsitePayment.objects.select_for_update().get(
                pk=locator["payment_id"]
            )
            if payment_grant_task.payment_id != payment.pk:
                raise ValueError("Payment grant task payment changed during processing.")
            payment_grant_task.payment = payment

            if payment_grant_task.status in {
                PaymentGrantTask.Status.SUCCEEDED,
                PaymentGrantTask.Status.CANCELED,
            }:
                return

            payment_grant_task.attempt_count += 1
            payment_grant_task.status = PaymentGrantTask.Status.PROCESSING
            payment_grant_task.last_error = ""
            payment_grant_task.save(
                update_fields=["attempt_count", "status", "last_error", "updated_at"]
            )

            if payment.status not in {
                payment.Status.PAID,
                payment.Status.PARTIALLY_REFUNDED,
            }:
                raise ValueError("Payment is not confirmed as paid.")

            try:
                entitlement = grant_or_extend_entitlement(
                    user=payment_grant_task.user,
                    module=payment_grant_task.module,
                    season=payment_grant_task.season,
                    plan=payment_grant_task.plan,
                    external_ref=f"alipay_payment:{payment_grant_task.payment.merchant_order_no}",
                    reject_if_lifetime=True,
                )
            except ExistingLifetimeAccessError as exc:
                participation = mark_referral_reward_pending(payment_grant_task=payment_grant_task)
                payment_grant_task.status = PaymentGrantTask.Status.CANCELED
                payment_grant_task.processed_at = timezone.now()
                payment_grant_task.last_error = str(exc)
                payment_grant_task.save(
                    update_fields=["status", "processed_at", "last_error", "updated_at"]
                )
                _schedule_referral_reward(participation)
                return

            participation = mark_referral_reward_pending(payment_grant_task=payment_grant_task)
            payment_grant_task.status = PaymentGrantTask.Status.SUCCEEDED
            payment_grant_task.processed_at = timezone.now()
            payment_grant_task.last_error = ""
            payment_grant_task.save(
                update_fields=["status", "processed_at", "last_error", "updated_at"]
            )
            _schedule_referral_reward(participation)
            if (
                entitlement.module_id is None
                and entitlement.season_id is None
            ) or (
                entitlement.module is not None
                and entitlement.module.key == "exam_preparation"
            ):
                transaction.on_commit(
                    lambda: ensure_referral_code(
                        user=payment_grant_task.user,
                        campaign_tag=CAMPAIGN_TAG,
                    ),
                    robust=True,
                )
    except (DatabaseError, ValueError) as exc:
        PaymentGrantTask.objects.filter(pk=payment_grant_task_id).update(
            status=PaymentGrantTask.Status.FAILED,
            last_error=str(exc),
            updated_at=timezone.now(),
        )
        raise


def _schedule_referral_reward(participation: ReferralParticipation | None) -> None:
    if participation is None or participation.status != ReferralParticipation.Status.REWARD_PENDING:
        return

    participation_id = participation.pk

    def enqueue(participation_id=participation_id):
        from apps.accounts.tasks import process_referral_reward_pending_task

        process_referral_reward_pending_task.delay(participation_id)

    transaction.on_commit(enqueue, robust=True)
