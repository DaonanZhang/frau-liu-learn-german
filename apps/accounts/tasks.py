from __future__ import annotations

from celery import shared_task

from apps.accounts.services.payment_grant_service import (
    process_payment_grant_task_by_id,
)


@shared_task
def process_payment_grant_task(payment_grant_task_id: int) -> None:
    """
    Process one payment grant task asynchronously.

    Args:
        payment_grant_task_id: Primary key of the deferred payment grant task.
    """

    process_payment_grant_task_by_id(
        payment_grant_task_id=payment_grant_task_id,
    )
