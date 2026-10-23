from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, PaymentDiscountApplication,
    PromotionCodeRecord, ReferralCode, ReferralNotice, ReferralParticipation,
    ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_milestones import reconcile_referral_milestones


_INVALID_REWARD = "Referral reward ledger or artifact is invalid"


@dataclass(frozen=True)
class ReferralRefundResult:
    participation_id: int | None
    changed: bool
    progress_removed: bool
    access_expires_at: datetime | None


@transaction.atomic
def reconcile_referral_refund(*, payment_id: int, at=None) -> ReferralRefundResult:
    payment_locator = AlipayWebsitePayment.objects.filter(pk=payment_id).values(
        "status", "refunded_at", "refunded_amount", "total_amount",
    ).first()
    if payment_locator is None:
        return ReferralRefundResult(None, False, False, None)
    participation_locator = ReferralParticipation.objects.filter(
        qualifying_payment_id=payment_id,
    ).values("pk", "campaign_tag", "referral_code__user_id").first()
    if participation_locator is None or participation_locator["campaign_tag"] != FIRST_REFERRAL_CAMPAIGN.campaign_tag:
        return ReferralRefundResult(None, False, False, None)
    participation_id = participation_locator["pk"]
    if payment_locator["status"] != AlipayWebsitePayment.Status.REFUNDED:
        return ReferralRefundResult(participation_id, False, False, None)

    User = get_user_model()
    referrer = User.objects.select_for_update().filter(
        pk=participation_locator["referral_code__user_id"],
    ).first()
    if referrer is None:
        raise ValueError(_INVALID_REWARD)
    payment = AlipayWebsitePayment.objects.select_for_update().filter(pk=payment_id).first()
    if payment is None or payment.status != AlipayWebsitePayment.Status.REFUNDED:
        return ReferralRefundResult(participation_id, False, False, None)
    participation = ReferralParticipation.objects.select_for_update().filter(
        pk=participation_id,
    ).first()
    if participation is None:
        raise ValueError(_INVALID_REWARD)
    application = PaymentDiscountApplication.objects.select_for_update().filter(
        payment_id=payment_id,
    ).first()
    coupon = UserCoupon.objects.select_for_update().filter(pk=participation.current_coupon_id).first()
    referral = ReferralCode.objects.select_for_update().filter(pk=participation.referral_code_id).first()
    promotion = PromotionCodeRecord.objects.select_for_update().filter(
        pk=referral.promotion_code_id if referral else None,
    ).first()
    module = Module.objects.filter(key=FIRST_REFERRAL_CAMPAIGN.module_key).first()
    qualified = participation.status == ReferralParticipation.Status.QUALIFIED
    month_rewards = list(ReferralReward.objects.select_for_update().filter(
        participation_id=participation.pk,
        kind=ReferralReward.Kind.REFERRAL_MONTH,
    ).order_by("pk"))

    if participation.status == ReferralParticipation.Status.REFUNDED:
        if participation.refund_reconciled_at is None or participation.refunded_at is None:
            raise ValueError(_INVALID_REWARD)
        if not _valid_referral_refund_chain(
            payment=payment, participation=participation, application=application,
            coupon=coupon, referral=referral, promotion=promotion, module=module,
            referrer_id=referrer.pk,
        ):
            raise ValueError(_INVALID_REWARD)
        return ReferralRefundResult(participation.pk, False, False, None)

    if participation.status not in {
        ReferralParticipation.Status.PAYMENT_RESERVED,
        ReferralParticipation.Status.REWARD_PENDING,
        ReferralParticipation.Status.DISQUALIFIED,
        ReferralParticipation.Status.QUALIFIED,
    }:
        raise ValueError(_INVALID_REWARD)
    if (
        payment.refunded_at is None or payment.refunded_amount != payment.total_amount
        or not _valid_referral_refund_chain(
            payment=payment, participation=participation, application=application,
            coupon=coupon, referral=referral, promotion=promotion, module=module,
            referrer_id=referrer.pk,
        )
    ):
        raise ValueError(_INVALID_REWARD)
    if qualified and (
        len(month_rewards) != 1
        or month_rewards[0].referrer_id != referrer.pk
        or month_rewards[0].campaign_tag != FIRST_REFERRAL_CAMPAIGN.campaign_tag
    ):
        raise ValueError(_INVALID_REWARD)
    if not qualified and month_rewards:
        raise ValueError(_INVALID_REWARD)

    effective_at = at or payment.refunded_at or timezone.now()
    participation.status = ReferralParticipation.Status.REFUNDED
    participation.refunded_at = payment.refunded_at or effective_at
    participation.refund_reconciled_at = effective_at
    participation.status_changed_at = effective_at
    participation.last_error = ""
    participation.save(update_fields=[
        "status", "refunded_at", "refund_reconciled_at", "status_changed_at",
        "last_error", "updated_at",
    ])

    if qualified:
        access_expires_at = debit_exam_preparation_reward(reward=month_rewards[0], at=effective_at)
        reconcile_referral_milestones(
            referrer=referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        ReferralNotice.objects.create(
            user=referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_refunded",
            payload={
                "progress_removed": True,
                "days_removed": access_expires_at is not None,
                "access_expires_at": access_expires_at.isoformat() if access_expires_at else None,
            },
            is_global_notice=True, acknowledged_at=None,
        )
        return ReferralRefundResult(participation.pk, True, True, access_expires_at)
    return ReferralRefundResult(participation.pk, True, False, None)


def _valid_referral_refund_chain(*, payment, participation, application, coupon,
                                 referral, promotion, module, referrer_id) -> bool:
    return bool(
        module is not None
        and payment.status == AlipayWebsitePayment.Status.REFUNDED
        and payment.refunded_at is not None
        and payment.refunded_amount == payment.total_amount
        and participation.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and participation.qualifying_payment_id == payment.pk
        and participation.order_created_at == payment.created_at
        and participation.referred_user_id != referrer_id
        and participation.current_coupon_id is not None
        and participation.referral_code_id is not None
        and referral is not None and referral.user_id == referrer_id
        and referral.user_id != participation.referred_user_id
        and referral.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and referral.code_prefix == FIRST_REFERRAL_CAMPAIGN.code_prefix
        and referral.promotion_code_id == (promotion.pk if promotion else None)
        and application is not None
        and application.payment_id == payment.pk
        and application.status == PaymentDiscountApplication.Status.REFUNDED
        and application.applied_at is not None and application.refunded_at is not None
        and application.released_at is None
        and application.user_id == participation.referred_user_id
        and application.coupon_id == (coupon.pk if coupon else None)
        and application.promotion_code_id == (promotion.pk if promotion else None)
        and application.offer.module_id == module.pk
        and application.promotion_discount_amount == Decimal("5.00")
        and coupon is not None and coupon.user_id == participation.referred_user_id
        and coupon.promotion_code_id == (promotion.pk if promotion else None)
        and coupon.status == UserCoupon.Status.USED
        and coupon.used_payment_id == payment.pk and coupon.used_at is not None
        and coupon.reserved_payment_id is None and coupon.reserved_at is None
        and coupon.discount_amount == Decimal("5.00")
        and coupon.minimum_order_amount == Decimal("0.00")
        and coupon.applicable_module_id == module.pk
        and coupon.applicable_season_id is None and coupon.applicable_offer_id is None
        and coupon.expires_at is None
        and promotion is not None
        and promotion.source_kind == PromotionCodeRecord.SourceKind.REFERRAL
        and promotion.campaign_name == FIRST_REFERRAL_CAMPAIGN.campaign_name
        and promotion.discount_amount == Decimal("5.00")
        and promotion.minimum_order_amount == Decimal("0.00")
        and promotion.applicable_module_id == module.pk
        and promotion.applicable_season_id is None and promotion.applicable_offer_id is None
        and promotion.coupon_valid_days is None and promotion.expires_at is None
        and promotion.redemption_mode == PromotionCodeRecord.RedemptionMode.REUSABLE
        and promotion.stacking_policy == PromotionCodeRecord.StackingPolicy.STACK
        and promotion.status == PromotionCodeRecord.Status.ACTIVE
    )


@transaction.atomic
def debit_exam_preparation_reward(*, reward: ReferralReward, at=None) -> datetime | None:
    at = at or timezone.now()
    locator = ReferralReward.objects.filter(pk=reward.pk).values(
        "referrer_id", "participation_id",
    ).first()
    if locator is None or locator["participation_id"] is None:
        raise ValueError(_INVALID_REWARD)
    User = get_user_model()
    if User.objects.filter(pk=locator["referrer_id"]).select_for_update().first() is None:
        raise ValueError(_INVALID_REWARD)
    reward = ReferralReward.objects.select_for_update().filter(pk=reward.pk).first()
    if reward is None or reward.referrer_id != locator["referrer_id"]:
        raise ValueError(_INVALID_REWARD)
    participation = ReferralParticipation.objects.select_for_update().filter(
        pk=locator["participation_id"],
    ).first()
    if participation is None or reward.participation_id != participation.pk:
        raise ValueError(_INVALID_REWARD)
    external_ref = f"referral_reward:{participation.campaign_tag}:{participation.pk}:month"
    idempotency_key = f"referral:{participation.campaign_tag}:participation:{participation.pk}:month"

    valid_timestamps = (
        reward.status == ReferralReward.Status.GRANTED
        and reward.revocation_pending_at is None and reward.revoked_at is None and reward.settled_at is None
        or reward.status == ReferralReward.Status.REVOKED
        and reward.revocation_pending_at is None and reward.revoked_at is not None and reward.settled_at is None
    )
    if not (
        valid_timestamps
        and reward.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and participation.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and participation.referral_code.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and participation.referral_code.user_id == reward.referrer_id
        and reward.participation_id == participation.pk
        and reward.kind == ReferralReward.Kind.REFERRAL_MONTH
        and reward.amount_days == 30 and reward.threshold is None and reward.generation == 1
        and reward.coupon_id is None and reward.idempotency_key == idempotency_key
    ):
        raise ValueError(_INVALID_REWARD)

    expected_entitlement_ref = external_ref
    linked = Entitlement.objects.select_for_update().filter(pk=reward.entitlement_id).first()
    if linked is None or linked.user_id != reward.referrer_id or linked.season_id is not None:
        raise ValueError(_INVALID_REWARD)
    module = Module.objects.filter(key=FIRST_REFERRAL_CAMPAIGN.module_key).first()
    if module is None:
        raise ValueError(_INVALID_REWARD)
    is_replay = reward.status == ReferralReward.Status.REVOKED
    linked_timed = (
        linked.module_id == module.pk and linked.external_ref == expected_entitlement_ref
        and linked.plan == Entitlement.Plan.MONTH_1
        and linked.status in ({Entitlement.Status.ACTIVE, Entitlement.Status.CANCELED}
                              if is_replay
                              else {Entitlement.Status.ACTIVE})
        and linked.starts_at is not None and linked.expires_at is not None
        and (linked.expires_at - linked.starts_at == timedelta(days=30)
             if not is_replay or linked.status == Entitlement.Status.CANCELED
             else timedelta(0) < linked.expires_at - linked.starts_at <= timedelta(days=30))
    )
    linked_lifetime = (
        linked.external_ref != expected_entitlement_ref
        and linked.plan == Entitlement.Plan.LIFETIME and linked.status == Entitlement.Status.ACTIVE
        and linked.starts_at is not None and linked.starts_at <= at and linked.expires_at is None
        and (linked.module_id is None or linked.module_id == module.pk)
    )
    if not (linked_timed or linked_lifetime):
        raise ValueError(_INVALID_REWARD)
    shared_rewards = list(ReferralReward.objects.filter(entitlement_id=linked.pk).exclude(pk=reward.pk))
    if linked_timed and shared_rewards:
        raise ValueError(_INVALID_REWARD)
    if linked_lifetime:
        for shared in shared_rewards:
            shared_participation = ReferralParticipation.objects.select_related("referral_code").filter(
                pk=shared.participation_id,
            ).first()
            if not (
                shared_participation is not None
                and shared.referrer_id == reward.referrer_id
                and shared.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
                and shared_participation.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
                and shared_participation.referral_code.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
                and shared_participation.referral_code.user_id == reward.referrer_id
                and shared.kind == ReferralReward.Kind.REFERRAL_MONTH
                and shared.amount_days == 30 and shared.threshold is None and shared.generation == 1
                and shared.coupon_id is None
                and shared.idempotency_key == (
                    f"referral:{shared_participation.campaign_tag}:participation:{shared_participation.pk}:month"
                )
                and (shared.status == ReferralReward.Status.GRANTED
                     and shared.revocation_pending_at is None and shared.revoked_at is None
                     and shared.settled_at is None
                     or shared.status == ReferralReward.Status.REVOKED
                     and shared.revocation_pending_at is None and shared.revoked_at is not None
                     and shared.settled_at is None)
            ):
                raise ValueError(_INVALID_REWARD)
    if is_replay:
        return None

    # Lock all relevant entitlements only after the referrer and reward rows.
    relevant = list(Entitlement.objects.select_for_update().filter(
        user_id=reward.referrer_id,
    ).filter(Q(module__isnull=True, season__isnull=True) | Q(module=module, season__isnull=True)).order_by("pk"))
    covering_lifetime = any(
        item.status == Entitlement.Status.ACTIVE and item.plan == Entitlement.Plan.LIFETIME
        and item.starts_at is not None and item.starts_at <= at and item.expires_at is None
        and (item.module_id is None and item.season_id is None
             or item.module_id == module.pk and item.season_id is None)
        for item in relevant
    )
    target = None
    if not covering_lifetime:
        timed = [item for item in relevant if item.status == Entitlement.Status.ACTIVE
                 and item.module_id == module.pk and item.season_id is None
                 and item.plan != Entitlement.Plan.LIFETIME and item.expires_at is not None]
        current_expiry = max((item.expires_at for item in timed), default=None)
        if current_expiry is not None and current_expiry > at:
            zone = ZoneInfo(getattr(settings, "ALIPAY_TIME_ZONE", "Asia/Shanghai"))
            local_at = timezone.localtime(at, zone)
            floor = datetime.combine(local_at.date(), time.max, tzinfo=zone)
            target = min(current_expiry, max(floor, current_expiry - timedelta(days=30)))
            if target < current_expiry:
                for item in timed:
                    if item.expires_at <= target:
                        continue
                    if item.starts_at >= target:
                        item.status = Entitlement.Status.CANCELED
                        item.save(update_fields=["status"])
                    else:
                        item.expires_at = target
                        item.save(update_fields=["expires_at"])
                materialized_expiry = Entitlement.objects.filter(
                    user_id=reward.referrer_id, module=module, season__isnull=True,
                    status=Entitlement.Status.ACTIVE, expires_at__isnull=False,
                ).exclude(plan=Entitlement.Plan.LIFETIME).order_by("-expires_at").values_list(
                    "expires_at", flat=True,
                ).first()
                if materialized_expiry != target:
                    raise ValueError(_INVALID_REWARD)
            else:
                target = None

    reward.status = ReferralReward.Status.REVOKED
    reward.revoked_at = at
    reward.save(update_fields=["status", "revoked_at", "updated_at"])
    return target
