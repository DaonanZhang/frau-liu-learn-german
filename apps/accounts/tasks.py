from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import DatabaseError
from django.db.models import F, Q
from django.utils import timezone

from apps.accounts.services.payment_grant_service import (
    process_payment_grant_task_by_id,
)
from apps.accounts.services.entitlement_grant_service import (
    revoke_and_compact_payment_entitlement,
)
from apps.accounts.models import (
    AlipayWebsitePayment,
    PaymentDiscountApplication,
    PaymentGrantTask,
    ReferralParticipation,
    ReferralReward,
)


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


@shared_task
def process_referral_reward_pending_task(participation_id: int) -> None:
    from apps.accounts.services.referral_qualification import process_referral_reward_pending

    process_referral_reward_pending(participation_id=participation_id)


def reconcile_pending_referrals_now(*, limit: int = 100) -> dict[str, int]:
    stats = {
        "referral_processed": 0,
        "referral_disqualified": 0,
        "referral_deferred": 0,
        "referral_failed": 0,
    }
    participation_ids = (
        ReferralParticipation.objects.filter(
            status=ReferralParticipation.Status.REWARD_PENDING
        )
        .order_by("updated_at", "id")
        .values_list("id", flat=True)[:limit]
    )
    from apps.accounts.services.referral_qualification import process_referral_reward_pending

    for participation_id in participation_ids:
        try:
            ReferralParticipation.objects.filter(
                pk=participation_id,
                status=ReferralParticipation.Status.REWARD_PENDING,
            ).update(updated_at=timezone.now())
            process_referral_reward_pending(participation_id=participation_id)
            participation = ReferralParticipation.objects.get(pk=participation_id)
            if participation.status == ReferralParticipation.Status.QUALIFIED:
                stats["referral_processed"] += 1
            elif participation.status == ReferralParticipation.Status.DISQUALIFIED:
                stats["referral_disqualified"] += 1
            elif participation.status == ReferralParticipation.Status.REWARD_PENDING:
                stats["referral_deferred"] += 1
        except Exception:
            stats["referral_failed"] += 1
            logger.exception(
                "Scheduled referral reward reconciliation failed",
                extra={"participation_id": participation_id},
            )
    return stats


def reconcile_referral_refunds_now(*, limit: int = 100) -> dict[str, int]:
    stats = {
        "referral_refunds_reconciled": 0,
        "referral_refunds_deferred": 0,
        "referral_refunds_failed": 0,
    }
    from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
    from apps.accounts.services.referral_refunds import reconcile_referral_refund

    candidates = list(
        ReferralParticipation.objects.filter(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referral_code__campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            qualifying_payment__status=AlipayWebsitePayment.Status.REFUNDED,
            qualifying_payment__refunded_at__isnull=False,
            qualifying_payment__refunded_amount=F("qualifying_payment__total_amount"),
            refund_reconciled_at__isnull=True,
        )
        .order_by("updated_at", "id")
        .values_list("id", "qualifying_payment_id")[:limit]
    )
    for participation_id, payment_id in candidates:
        try:
            ReferralParticipation.objects.filter(pk=participation_id).update(
                updated_at=timezone.now()
            )
            result = reconcile_referral_refund(payment_id=payment_id)
            key = (
                "referral_refunds_reconciled"
                if result.changed
                else "referral_refunds_deferred"
            )
            stats[key] += 1
        except Exception:
            stats["referral_refunds_failed"] += 1
            logger.exception(
                "Scheduled referral refund reconciliation failed",
                extra={
                    "participation_id": participation_id,
                    "payment_id": payment_id,
                },
            )
    return stats


def reconcile_referral_terminal_states_now(*, limit: int = 100) -> dict[str, int]:
    """Repair referral state when a payment on_commit callback was lost."""
    stats = {
        "referral_terminal_processed": 0,
        "referral_terminal_failed": 0,
    }
    terminal_statuses = (
        AlipayWebsitePayment.Status.PAID,
        AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
        AlipayWebsitePayment.Status.REFUNDED,
        AlipayWebsitePayment.Status.FAILED,
        AlipayWebsitePayment.Status.CLOSED,
    )
    from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
    release_ids = list(
        ReferralParticipation.objects.filter(
            status=ReferralParticipation.Status.PAYMENT_RESERVED,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referral_code__campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            qualifying_payment__status__in=(
                AlipayWebsitePayment.Status.FAILED,
                AlipayWebsitePayment.Status.CLOSED,
            ),
        ).order_by("updated_at", "id").values_list("qualifying_payment_id", flat=True)[:limit]
    )
    from apps.accounts.services.promotion_codes import (
        _reconcile_terminal_discount,
        _release_referral_payment,
    )
    for payment_id in release_ids:
        try:
            has_milestone = PaymentDiscountApplication.objects.filter(
                payment_id=payment_id,
                coupon__referral_rewards__campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                coupon__referral_rewards__kind__in=(
                    ReferralReward.Kind.SCIENCE_3,
                    ReferralReward.Kind.VLOG_5,
                ),
            ).exists()
            if has_milestone:
                _reconcile_terminal_discount(payment_id=payment_id, release_referral=True)
            else:
                _release_referral_payment(payment_id=payment_id)
            stats["referral_terminal_processed"] += 1
        except Exception:
            stats["referral_terminal_failed"] += 1
            logger.exception("Scheduled terminal referral release failed", extra={"payment_id": payment_id})

    milestone_payment_ids = list(
        PaymentDiscountApplication.objects.filter(
            payment__status__in=terminal_statuses,
            coupon__referral_rewards__campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            coupon__referral_rewards__kind__in=(
                ReferralReward.Kind.SCIENCE_3,
                ReferralReward.Kind.VLOG_5,
            ),
            coupon__referral_rewards__status=ReferralReward.Status.REVOCATION_PENDING,
        ).order_by("payment_id").values_list("payment_id", flat=True).distinct()[:limit]
    )
    for payment_id in milestone_payment_ids:
        try:
            _reconcile_terminal_discount(payment_id=payment_id)
            stats["referral_terminal_processed"] += 1
        except Exception:
            stats["referral_terminal_failed"] += 1
            logger.exception("Scheduled terminal milestone resolution failed", extra={"payment_id": payment_id})
    return stats


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
        payment__status__in=[
            AlipayWebsitePayment.Status.PAID,
            AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
        ],
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
    stats.update(reconcile_pending_referrals_now(limit=limit))
    stats.update(reconcile_referral_refunds_now(limit=limit))
    stats.update(reconcile_referral_terminal_states_now(limit=limit))
    return stats


@shared_task
def reconcile_alipay_payments() -> dict[str, int]:
    return reconcile_alipay_payments_now()
