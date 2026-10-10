from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import DatabaseError
from django.db.models import Q
from django.utils import timezone

from apps.accounts.services.payment_grant_service import (
    process_payment_grant_task_by_id,
)
from apps.accounts.services.entitlement_grant_service import (
    revoke_and_compact_payment_entitlement,
)
from apps.accounts.models import AlipayWebsitePayment, PaymentGrantTask


logger = logging.getLogger(__name__)


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


def reconcile_alipay_payments_now(*, limit: int = 100) -> dict[str, int]:
    """Reconcile gateway states and retry durable entitlement grants.

    Args:
        limit: Maximum payments and grant tasks to process in each category.

    Returns:
        Processing counters suitable for logs and operational checks.
    """

    from apps.accounts.views.payment import _query_and_sync_payment_status

    now = timezone.now()
    interval_seconds = int(getattr(settings, "ALIPAY_RECONCILE_INTERVAL_SECONDS", 900))
    cutoff = now - timedelta(seconds=interval_seconds)
    history_start = now - timedelta(
        days=int(getattr(settings, "ALIPAY_RECONCILE_HISTORY_DAYS", 400))
    )
    refund_reconcile_start = now - timedelta(
        days=int(getattr(settings, "ALIPAY_REFUND_RECONCILE_DAYS", 90))
    )
    reconciliation_due = Q(last_reconciled_at__lte=cutoff) | Q(
        last_reconciled_at__isnull=True
    )
    recent_paid = Q(paid_at__gte=refund_reconcile_start) | Q(
        paid_at__isnull=True,
        created_at__gte=refund_reconcile_start,
    )
    payments = list(
        AlipayWebsitePayment.objects.filter(created_at__gte=history_start)
        .filter(
            Q(status__in=[AlipayWebsitePayment.Status.CREATED, AlipayWebsitePayment.Status.PENDING])
            | (
                recent_paid
                & reconciliation_due
                & Q(
                    status__in=[
                        AlipayWebsitePayment.Status.PAID,
                        AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
                    ]
                )
            )
        )
        .order_by("last_reconciled_at", "created_at")[:limit]
    )
    stats = {
        "queried": 0,
        "query_failed": 0,
        "grant_retried": 0,
        "grant_canceled": 0,
        "grant_failed": 0,
        "refund_entitlements_reconciled": 0,
        "notify_payloads_purged": 0,
    }
    for payment in payments:
        try:
            _query_and_sync_payment_status(payment=payment)
            stats["queried"] += 1
        except (DatabaseError, ValueError) as exc:
            stats["query_failed"] += 1
            logger.error(
                "Scheduled Alipay reconciliation failed: %s",
                exc,
                extra={"payment_id": payment.id},
                exc_info=True,
            )

    failed_or_pending = PaymentGrantTask.objects.filter(
        payment__status=AlipayWebsitePayment.Status.PAID,
        status__in=[PaymentGrantTask.Status.PENDING, PaymentGrantTask.Status.FAILED],
    ).order_by("updated_at")[:limit]
    for grant_task in failed_or_pending:
        try:
            process_payment_grant_task_by_id(payment_grant_task_id=grant_task.id)
            grant_task.refresh_from_db(fields=["status"])
            if grant_task.status == PaymentGrantTask.Status.CANCELED:
                stats["grant_canceled"] += 1
            else:
                stats["grant_retried"] += 1
        except (DatabaseError, ValueError) as exc:
            stats["grant_failed"] += 1
            logger.exception(
                "Scheduled payment grant retry failed: %s",
                exc,
                extra={"grant_task_id": grant_task.id},
            )
    refunded_payments = AlipayWebsitePayment.objects.filter(
        status=AlipayWebsitePayment.Status.REFUNDED,
        refund_entitlement_reconciled_at__isnull=True,
    ).order_by("-refunded_at")[:limit]
    for refunded_payment in refunded_payments:
        try:
            revoke_and_compact_payment_entitlement(payment=refunded_payment)
            refunded_payment.refund_entitlement_reconciled_at = timezone.now()
            refunded_payment.save(
                update_fields=["refund_entitlement_reconciled_at", "updated_at"]
            )
            stats["refund_entitlements_reconciled"] += 1
        except DatabaseError:
            logger.exception(
                "Scheduled refund entitlement revocation failed",
                extra={"payment_id": refunded_payment.id},
            )
    retention_cutoff = now - timedelta(
        days=int(getattr(settings, "ALIPAY_NOTIFY_RETENTION_DAYS", 90))
    )
    stats["notify_payloads_purged"] = AlipayWebsitePayment.objects.filter(
        updated_at__lt=retention_cutoff,
        raw_notify_payload__isnull=False,
        status__in=[
            AlipayWebsitePayment.Status.CLOSED,
            AlipayWebsitePayment.Status.PAID,
            AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            AlipayWebsitePayment.Status.REFUNDED,
        ],
    ).update(raw_notify_payload=None)
    return stats


@shared_task
def reconcile_alipay_payments() -> dict[str, int]:
    return reconcile_alipay_payments_now()
