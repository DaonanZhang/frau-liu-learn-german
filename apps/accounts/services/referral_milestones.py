from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    ModuleSeason,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    ReferralNotice,
    ReferralParticipation,
    ReferralReward,
    UserCoupon,
)
from apps.accounts.services.promotion_codes import generate_promotion_code
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN


_MILESTONES = (
    (3, ReferralReward.Kind.SCIENCE_3, 1),
    (5, ReferralReward.Kind.VLOG_5, 4),
)
_INVALID_MILESTONE = "Referral milestone ledger or artifact is invalid"


def _identity(campaign_tag, referrer_id, kind, generation):
    stem = f"referral_milestone:{campaign_tag}:{referrer_id}:{kind}:{generation}"
    return stem, stem


def _covered_by_lifetime(*, referrer_id, module, season, now):
    for entitlement in Entitlement.objects.filter(
        user_id=referrer_id,
        status=Entitlement.Status.ACTIVE,
        plan=Entitlement.Plan.LIFETIME,
        starts_at__lte=now,
        expires_at__isnull=True,
    ).select_related("module", "season"):
        if entitlement.module_id is None and entitlement.season_id is None:
            return True
        if entitlement.module_id == module.pk and entitlement.season_id is None:
            return True
        if entitlement.module_id == module.pk and entitlement.season_id == season.pk:
            return True
    return False


def _validate_entitlement(entitlement, *, referrer_id, module, season, external_ref, status):
    return bool(
        entitlement
        and entitlement.user_id == referrer_id
        and entitlement.external_ref == external_ref
        and entitlement.module_id == module.pk
        and entitlement.season_id == season.pk
        and entitlement.plan == Entitlement.Plan.LIFETIME
        and entitlement.status == status
        and entitlement.starts_at is not None
        and entitlement.starts_at <= timezone.now()
        and entitlement.expires_at is None
    )


def _validate_coupon(coupon, *, referrer_id):
    if coupon is None or coupon.user_id != referrer_id:
        return False
    promotion = coupon.promotion_code
    return bool(
        coupon.discount_amount == Decimal("10.00")
        and coupon.minimum_order_amount == Decimal("0.00")
        and coupon.applicable_module_id is None
        and coupon.applicable_season_id is None
        and coupon.applicable_offer_id is None
        and coupon.expires_at is None
        and promotion.source_kind == PromotionCodeRecord.SourceKind.INTERNAL_REWARD
        and promotion.discount_amount == Decimal("10.00")
        and promotion.minimum_order_amount == Decimal("0.00")
        and promotion.applicable_module_id is None
        and promotion.applicable_season_id is None
        and promotion.applicable_offer_id is None
        and promotion.coupon_valid_days is None
        and promotion.expires_at is None
        and promotion.redemption_mode == PromotionCodeRecord.RedemptionMode.SINGLE_USE
        and promotion.stacking_policy == PromotionCodeRecord.StackingPolicy.STACK
        and promotion.status == PromotionCodeRecord.Status.ACTIVE
    )


def _validate_used_milestone_coupon(coupon, *, referrer_id):
    if (
        coupon.status != UserCoupon.Status.USED
        or coupon.used_at is None
        or coupon.used_payment_id is None
        or coupon.reserved_payment_id is not None
        or coupon.reserved_at is not None
        or coupon.revoked_at is not None
        or coupon.revocation_reason
    ):
        return False
    # Do not lock after the coupon: payment sync locks application before coupon.
    # Used payments only progress within the accepted paid/refund state set.
    application = PaymentDiscountApplication.objects.filter(
        payment_id=coupon.used_payment_id,
    ).select_related("payment").first()
    if application is None:
        return False
    payment = application.payment
    expected_application_status = (
        PaymentDiscountApplication.Status.REFUNDED
        if payment.status == AlipayWebsitePayment.Status.REFUNDED
        else PaymentDiscountApplication.Status.APPLIED
    )
    application_timestamps_valid = (
        application.status == PaymentDiscountApplication.Status.APPLIED
        and application.applied_at is not None
        and application.released_at is None
        and application.refunded_at is None
        or application.status == PaymentDiscountApplication.Status.REFUNDED
        and application.applied_at is not None
        and application.released_at is None
        and application.refunded_at is not None
    )
    return bool(
        payment.status in {
            AlipayWebsitePayment.Status.PAID,
            AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            AlipayWebsitePayment.Status.REFUNDED,
        }
        and application.status == expected_application_status
        and application_timestamps_valid
        and application.coupon_id == coupon.pk
        and application.promotion_code_id == coupon.promotion_code_id
        and application.user_id == referrer_id
        and application.promotion_discount_amount == Decimal("10.00")
    )


def _validate_reserved_milestone_coupon(coupon, *, referrer_id):
    if not (
        coupon.status == UserCoupon.Status.RESERVED
        and coupon.reserved_payment_id is not None and coupon.reserved_at is not None
        and coupon.used_payment_id is None and coupon.used_at is None
        and coupon.revoked_at is None and not coupon.revocation_reason
    ):
        return False
    application = PaymentDiscountApplication.objects.filter(
        payment_id=coupon.reserved_payment_id,
    ).select_related("payment").first()
    return bool(
        application
        and application.payment.status in {
            AlipayWebsitePayment.Status.CREATED, AlipayWebsitePayment.Status.PENDING,
        }
        and application.status == PaymentDiscountApplication.Status.RESERVED
        and application.applied_at is None and application.released_at is None
        and application.refunded_at is None
        and application.coupon_id == coupon.pk
        and application.promotion_code_id == coupon.promotion_code_id
        and application.user_id == referrer_id
        and application.promotion_discount_amount == Decimal("10.00")
    )


def _validate_released_milestone_coupon(coupon, *, referrer_id):
    if not (
        coupon.status == UserCoupon.Status.AVAILABLE
        and coupon.reserved_payment_id is None and coupon.reserved_at is None
        and coupon.used_payment_id is None and coupon.used_at is None
        and coupon.revoked_at is None and not coupon.revocation_reason
    ):
        return False
    return PaymentDiscountApplication.objects.filter(
        coupon_id=coupon.pk,
        promotion_code_id=coupon.promotion_code_id,
        user_id=referrer_id,
        promotion_discount_amount=Decimal("10.00"),
        status=PaymentDiscountApplication.Status.RELEASED,
        applied_at__isnull=True,
        released_at__isnull=False,
        refunded_at__isnull=True,
        payment__status__in=[AlipayWebsitePayment.Status.FAILED,
                             AlipayWebsitePayment.Status.CLOSED],
    ).exists()


def _validate_revoked_milestone_coupon(coupon):
    return bool(
        coupon.status == UserCoupon.Status.REVOKED
        and coupon.revoked_at is not None
        and coupon.revocation_reason == "referral_milestone_count_below_threshold"
        and coupon.reserved_payment_id is None and coupon.reserved_at is None
        and coupon.used_payment_id is None and coupon.used_at is None
    )


def _validate_reward_artifact_unshared(reward):
    if reward.coupon_id is not None and ReferralReward.objects.filter(
        coupon_id=reward.coupon_id,
    ).exclude(pk=reward.pk).exists():
        raise ValueError(_INVALID_MILESTONE)
    if reward.entitlement_id is not None and ReferralReward.objects.filter(
        entitlement_id=reward.entitlement_id,
    ).exclude(pk=reward.pk).exists():
        raise ValueError(_INVALID_MILESTONE)


def _validate_reward_timestamps(reward):
    valid = {
        ReferralReward.Status.GRANTED: (
            reward.revocation_pending_at is None and reward.revoked_at is None
            and reward.settled_at is None
        ),
        ReferralReward.Status.REVOCATION_PENDING: (
            reward.revocation_pending_at is not None and reward.revoked_at is None
            and reward.settled_at is None
        ),
        ReferralReward.Status.REVOKED: (
            reward.revocation_pending_at is None and reward.revoked_at is not None
            and reward.settled_at is None
        ),
        ReferralReward.Status.NON_REVERSIBLE: (
            reward.revocation_pending_at is None and reward.revoked_at is None
            and reward.settled_at is not None
        ),
    }
    if not valid.get(reward.status, False):
        raise ValueError(_INVALID_MILESTONE)


def _validate_reward(reward, *, campaign_tag, referrer_id, threshold, kind, generation, key,
                     external_ref, module, season, lock_artifacts=True):
    _validate_reward_timestamps(reward)
    _validate_reward_artifact_unshared(reward)
    if not (
        reward.campaign_tag == campaign_tag
        and reward.referrer_id == referrer_id
        and reward.participation_id is None
        and reward.kind == kind
        and reward.amount_days == 0
        and reward.threshold == threshold
        and reward.generation == generation
        and reward.idempotency_key == key
    ):
        raise ValueError(_INVALID_MILESTONE)
    if reward.status == ReferralReward.Status.GRANTED:
        entitlement_status = Entitlement.Status.ACTIVE
        coupon_status = None
    elif reward.status == ReferralReward.Status.REVOCATION_PENDING:
        entitlement_status = None
        coupon_status = UserCoupon.Status.RESERVED
        if reward.revocation_pending_at is None:
            raise ValueError(_INVALID_MILESTONE)
    elif reward.status == ReferralReward.Status.REVOKED:
        entitlement_status = Entitlement.Status.CANCELED
        coupon_status = UserCoupon.Status.REVOKED
        if reward.revoked_at is None:
            raise ValueError(_INVALID_MILESTONE)
    elif reward.status == ReferralReward.Status.NON_REVERSIBLE:
        entitlement_status = None
        coupon_status = UserCoupon.Status.USED
        if reward.settled_at is None:
            raise ValueError(_INVALID_MILESTONE)
    else:
        raise ValueError(_INVALID_MILESTONE)

    if reward.entitlement_id is not None:
        entitlement_query = Entitlement.objects
        if lock_artifacts:
            entitlement_query = entitlement_query.select_for_update()
        reward.entitlement = entitlement_query.get(pk=reward.entitlement_id)
        if entitlement_status is None or reward.coupon_id is not None or not _validate_entitlement(
            reward.entitlement, referrer_id=referrer_id, module=module, season=season,
            external_ref=external_ref, status=entitlement_status,
        ):
            raise ValueError(_INVALID_MILESTONE)
    elif reward.coupon_id is not None:
        coupon_query = UserCoupon.objects
        if lock_artifacts:
            coupon_query = coupon_query.select_for_update()
        reward.coupon = coupon_query.select_related("promotion_code").get(pk=reward.coupon_id)
        if not _validate_coupon(
            reward.coupon, referrer_id=referrer_id,
        ):
            raise ValueError(_INVALID_MILESTONE)
        coupon = reward.coupon
        if reward.status == ReferralReward.Status.REVOCATION_PENDING:
            if coupon.status not in {UserCoupon.Status.RESERVED, UserCoupon.Status.AVAILABLE}:
                raise ValueError(_INVALID_MILESTONE)
        elif coupon_status is not None and coupon.status != coupon_status:
            raise ValueError(_INVALID_MILESTONE)
        if reward.status == ReferralReward.Status.GRANTED and not (
            coupon.status == UserCoupon.Status.AVAILABLE
            and coupon.reserved_payment_id is None and coupon.used_payment_id is None
            and coupon.reserved_at is None and coupon.used_at is None
            and coupon.revoked_at is None and not coupon.revocation_reason
            or _validate_reserved_milestone_coupon(coupon, referrer_id=referrer_id)
            or _validate_used_milestone_coupon(coupon, referrer_id=referrer_id)
        ):
            raise ValueError(_INVALID_MILESTONE)
        if reward.status == ReferralReward.Status.REVOCATION_PENDING and not (
            _validate_reserved_milestone_coupon(coupon, referrer_id=referrer_id)
            or _validate_released_milestone_coupon(coupon, referrer_id=referrer_id)
        ):
            raise ValueError(_INVALID_MILESTONE)
        if reward.status == ReferralReward.Status.REVOKED and not _validate_revoked_milestone_coupon(coupon):
            raise ValueError(_INVALID_MILESTONE)
        if reward.status == ReferralReward.Status.NON_REVERSIBLE and not (
            _validate_used_milestone_coupon(coupon, referrer_id=referrer_id)
        ):
            raise ValueError(_INVALID_MILESTONE)
    else:
        raise ValueError(_INVALID_MILESTONE)


def _issue_coupon(*, referrer, campaign_tag):
    for _ in range(10):
        code = generate_promotion_code()
        try:
            with transaction.atomic():
                promotion = PromotionCodeRecord.objects.create(
                    code=code,
                    source_kind=PromotionCodeRecord.SourceKind.INTERNAL_REWARD,
                    campaign_name=f"{campaign_tag} referral milestone",
                    discount_amount=Decimal("10.00"),
                    minimum_order_amount=Decimal("0.00"),
                    applicable_module=None,
                    applicable_season=None,
                    applicable_offer=None,
                    coupon_valid_days=None,
                    redemption_mode=PromotionCodeRecord.RedemptionMode.SINGLE_USE,
                    stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
                    status=PromotionCodeRecord.Status.ACTIVE,
                    expires_at=None,
                )
        except IntegrityError:
            continue
        coupon = UserCoupon.objects.create(
            user=referrer,
            promotion_code=promotion,
            discount_amount=Decimal("10.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=None,
            applicable_season=None,
            applicable_offer=None,
            status=UserCoupon.Status.AVAILABLE,
            expires_at=None,
        )
        return coupon
    raise RuntimeError("Failed to create a unique internal reward promotion code")


def _issue(*, referrer, campaign_tag, threshold, kind, generation, module, season, now):
    key, external_ref = _identity(campaign_tag, referrer.pk, kind, generation)
    if ReferralReward.objects.filter(idempotency_key=key).exists():
        raise ValueError(_INVALID_MILESTONE)
    if Entitlement.objects.filter(external_ref=external_ref).exists():
        raise ValueError(_INVALID_MILESTONE)

    reward = ReferralReward.objects.create(
        campaign_tag=campaign_tag,
        referrer=referrer,
        participation=None,
        kind=kind,
        status=ReferralReward.Status.GRANTED,
        amount_days=0,
        threshold=threshold,
        generation=generation,
        idempotency_key=key,
    )
    if _covered_by_lifetime(referrer_id=referrer.pk, module=module, season=season, now=now):
        coupon = _issue_coupon(referrer=referrer, campaign_tag=campaign_tag)
        reward.coupon = coupon
        reward.save(update_fields=["coupon", "updated_at"])
        reward_type = "coupon"
    else:
        entitlement = Entitlement.objects.create(
            user=referrer,
            module=module,
            season=season,
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
            starts_at=now,
            expires_at=None,
            external_ref=external_ref,
        )
        reward.entitlement = entitlement
        reward.save(update_fields=["entitlement", "updated_at"])
        reward_type = "entitlement"
    ReferralNotice.objects.create(
        user=referrer,
        campaign_tag=campaign_tag,
        event_type="referral_milestone_granted",
        payload={"threshold": threshold, "kind": kind, "reward_type": reward_type},
        is_global_notice=False,
    )
    return reward


@transaction.atomic
def reconcile_referral_milestones(*, referrer, campaign_tag: str) -> list[ReferralReward]:
    if campaign_tag != FIRST_REFERRAL_CAMPAIGN.campaign_tag:
        raise ValueError("Unsupported referral milestone campaign")

    locked_referrer = get_user_model().objects.select_for_update().get(pk=referrer.pk)
    rewards = list(
        ReferralReward.objects.select_for_update().filter(
            campaign_tag=campaign_tag, referrer_id=locked_referrer.pk,
            kind__in=[kind for _, kind, _ in _MILESTONES],
        ).order_by("kind", "generation")
    )
    entitlement_ids = [reward.entitlement_id for reward in rewards if reward.entitlement_id]
    coupon_ids = [reward.coupon_id for reward in rewards if reward.coupon_id]
    if (
        len(entitlement_ids) != len(set(entitlement_ids))
        or len(coupon_ids) != len(set(coupon_ids))
    ):
        raise ValueError(_INVALID_MILESTONE)
    count = ReferralParticipation.objects.filter(
        campaign_tag=campaign_tag,
        status=ReferralParticipation.Status.QUALIFIED,
        referral_code__user_id=locked_referrer.pk,
        referral_code__campaign_tag=campaign_tag,
    ).count()
    if count < 3 and not rewards:
        return []

    module = Module.objects.filter(key="learning_by_video").first()
    if module is None:
        raise Module.DoesNotExist("learning_by_video module is missing")
    seasons = {
        number: ModuleSeason.objects.filter(module=module, season_number=number).first()
        for number in (1, 4)
    }
    if any(season is None for season in seasons.values()):
        raise ModuleSeason.DoesNotExist("learning_by_video milestone season is missing")

    now = timezone.now()
    created = []
    for threshold, kind, season_number in _MILESTONES:
        kind_rewards = [reward for reward in rewards if reward.kind == kind]
        generations = [reward.generation for reward in kind_rewards]
        if generations != list(range(1, len(generations) + 1)):
            raise ValueError(_INVALID_MILESTONE)
        for generation, reward in enumerate(kind_rewards, start=1):
            key, external_ref = _identity(campaign_tag, locked_referrer.pk, kind, generation)
            _validate_reward(
                reward, campaign_tag=campaign_tag, referrer_id=locked_referrer.pk,
                threshold=threshold, kind=kind, generation=generation, key=key,
                external_ref=external_ref, module=module, season=seasons[season_number],
            )
        latest = kind_rewards[-1] if kind_rewards else None
        if count < threshold:
            if latest is None or latest.status != ReferralReward.Status.GRANTED:
                continue
            if latest.entitlement_id is not None:
                latest.entitlement.status = Entitlement.Status.CANCELED
                latest.entitlement.save(update_fields=["status"])
                latest.status = ReferralReward.Status.REVOKED
                latest.revoked_at = now
                latest.save(update_fields=["status", "revoked_at", "updated_at"])
            elif latest.coupon.status == UserCoupon.Status.AVAILABLE:
                latest.coupon.status = UserCoupon.Status.REVOKED
                latest.coupon.revoked_at = now
                latest.coupon.revocation_reason = "referral_milestone_count_below_threshold"
                latest.coupon.save(update_fields=[
                    "status", "revoked_at", "revocation_reason", "updated_at",
                ])
                latest.status = ReferralReward.Status.REVOKED
                latest.revoked_at = now
                latest.save(update_fields=["status", "revoked_at", "updated_at"])
            elif latest.coupon.status == UserCoupon.Status.RESERVED:
                latest.status = ReferralReward.Status.REVOCATION_PENDING
                latest.revocation_pending_at = now
                latest.save(update_fields=["status", "revocation_pending_at", "updated_at"])
            elif latest.coupon.status == UserCoupon.Status.USED:
                latest.status = ReferralReward.Status.NON_REVERSIBLE
                latest.settled_at = now
                latest.save(update_fields=["status", "settled_at", "updated_at"])
            continue
        if latest is not None:
            if latest.status == ReferralReward.Status.GRANTED:
                continue
            if latest.status == ReferralReward.Status.NON_REVERSIBLE:
                continue
            if latest.status == ReferralReward.Status.REVOCATION_PENDING:
                latest.status = ReferralReward.Status.GRANTED
                latest.revocation_pending_at = None
                latest.save(update_fields=["status", "revocation_pending_at", "updated_at"])
                continue
            if latest.status != ReferralReward.Status.REVOKED:
                raise ValueError(_INVALID_MILESTONE)
        generation = (latest.generation + 1) if latest else 1
        created.append(_issue(
            referrer=locked_referrer, campaign_tag=campaign_tag,
            threshold=threshold, kind=kind,
            generation=generation, module=module, season=seasons[season_number], now=now,
        ))
    return created


@transaction.atomic
def resolve_pending_milestone_revocation(*, payment_id: int) -> None:
    locator = PaymentDiscountApplication.objects.filter(payment_id=payment_id).values(
        "coupon_id", "user_id"
    ).first()
    if locator is None:
        return
    reward_locator = ReferralReward.objects.filter(
        coupon_id=locator["coupon_id"], campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        kind__in=[kind for _, kind, _ in _MILESTONES],
    ).values("pk", "referrer_id", "kind", "generation").first()
    if reward_locator is None:
        reward_locator = ReferralReward.objects.filter(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            kind__in=[kind for _, kind, _ in _MILESTONES],
            coupon__in=UserCoupon.objects.filter(
                Q(used_payment_id=payment_id) | Q(reserved_payment_id=payment_id)
            ),
        ).values("pk", "referrer_id", "kind", "generation").first()
    if reward_locator is None:
        return
    if reward_locator["referrer_id"] != locator["user_id"]:
        raise ValueError(_INVALID_MILESTONE)

    get_user_model().objects.select_for_update().get(pk=reward_locator["referrer_id"])
    payment = AlipayWebsitePayment.objects.select_for_update().filter(pk=payment_id).first()
    if payment is None:
        return
    application = PaymentDiscountApplication.objects.select_for_update().filter(
        payment_id=payment_id
    ).first()
    if application is None:
        return
    reward_snapshots = list(ReferralReward.objects.filter(
        campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        referrer_id=reward_locator["referrer_id"],
        kind__in=[kind for _, kind, _ in _MILESTONES],
    ).order_by("kind", "generation"))
    coupon_ids = {item.coupon_id for item in reward_snapshots if item.coupon_id}
    coupon_ids.add(locator["coupon_id"])
    locked_coupons = list(UserCoupon.objects.select_for_update().select_related(
        "promotion_code"
    ).filter(pk__in=coupon_ids).order_by("pk"))
    coupons_by_id = {item.pk: item for item in locked_coupons}
    entitlement_ids = {item.entitlement_id for item in reward_snapshots if item.entitlement_id}
    if entitlement_ids:
        list(Entitlement.objects.select_for_update().filter(pk__in=entitlement_ids).order_by("pk"))
    rewards = list(ReferralReward.objects.select_for_update().filter(
        campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        referrer_id=reward_locator["referrer_id"],
        kind__in=[kind for _, kind, _ in _MILESTONES],
    ).order_by("kind", "generation"))
    reward = next((item for item in rewards if item.pk == reward_locator["pk"]), None)
    coupon = coupons_by_id.get(locator["coupon_id"])
    if coupon is None or reward is None:
        raise ValueError(_INVALID_MILESTONE)

    milestone = next((item for item in _MILESTONES if item[1] == reward.kind), None)
    same_kind = [item for item in rewards if item.kind == reward.kind]
    if (milestone is None or not same_kind
            or [item.generation for item in same_kind] != list(range(1, len(same_kind) + 1))
            or same_kind[-1].pk != reward.pk):
        raise ValueError(_INVALID_MILESTONE)
    _validate_reward_timestamps(reward)
    _validate_reward_artifact_unshared(reward)

    coupon_ids = [item.coupon_id for item in rewards if item.coupon_id]
    entitlement_ids = [item.entitlement_id for item in rewards if item.entitlement_id]
    if len(coupon_ids) != len(set(coupon_ids)) or len(entitlement_ids) != len(set(entitlement_ids)):
        raise ValueError(_INVALID_MILESTONE)

    threshold, kind, _season = milestone
    module = Module.objects.filter(key="learning_by_video").first()
    season_number = next(number for _threshold, candidate_kind, number in _MILESTONES
                         if candidate_kind == kind)
    season = ModuleSeason.objects.filter(module=module, season_number=season_number).first()
    if module is None or season is None:
        raise ValueError(_INVALID_MILESTONE)
    for older in same_kind[:-1]:
        older_key, older_external_ref = _identity(
            FIRST_REFERRAL_CAMPAIGN.campaign_tag, reward.referrer_id, kind, older.generation
        )
        _validate_reward(
            older, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referrer_id=reward.referrer_id, threshold=threshold, kind=kind,
            generation=older.generation, key=older_key, external_ref=older_external_ref,
            module=module, season=season, lock_artifacts=False,
        )

    key, _external_ref = _identity(
        FIRST_REFERRAL_CAMPAIGN.campaign_tag, reward.referrer_id, kind, reward.generation
    )
    if not (
        reward.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and reward.participation_id is None and reward.threshold == threshold
        and reward.amount_days == 0 and reward.idempotency_key == key
        and reward.coupon_id == coupon.pk and reward.entitlement_id is None
        and coupon.user_id == reward.referrer_id
        and not ReferralReward.objects.filter(coupon_id=coupon.pk).exclude(pk=reward.pk).exists()
        and _validate_coupon(coupon, referrer_id=reward.referrer_id)
        and application.coupon_id == coupon.pk
        and application.promotion_code_id == coupon.promotion_code_id
        and application.user_id == reward.referrer_id
        and application.promotion_discount_amount == Decimal("10.00")
    ):
        raise ValueError(_INVALID_MILESTONE)

    application_timestamps_valid = (
        application.status == PaymentDiscountApplication.Status.RESERVED
        and application.applied_at is None and application.released_at is None
        and application.refunded_at is None
        or application.status == PaymentDiscountApplication.Status.APPLIED
        and application.applied_at is not None and application.released_at is None
        and application.refunded_at is None
        or application.status == PaymentDiscountApplication.Status.REFUNDED
        and application.applied_at is not None and application.released_at is None
        and application.refunded_at is not None
        or application.status == PaymentDiscountApplication.Status.RELEASED
        and application.applied_at is None and application.released_at is not None
        and application.refunded_at is None
    )
    if not application_timestamps_valid:
        raise ValueError(_INVALID_MILESTONE)

    now = timezone.now()
    if payment.status in {AlipayWebsitePayment.Status.PAID,
                          AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
                          AlipayWebsitePayment.Status.REFUNDED}:
        expected = (PaymentDiscountApplication.Status.REFUNDED
                    if payment.status == AlipayWebsitePayment.Status.REFUNDED
                    else PaymentDiscountApplication.Status.APPLIED)
        if not (application.status == expected and coupon.status == UserCoupon.Status.USED
                and coupon.used_payment_id == payment.pk and coupon.used_at is not None
                and coupon.reserved_payment_id is None and coupon.reserved_at is None
                and coupon.revoked_at is None and not coupon.revocation_reason
                and (reward.revocation_pending_at is not None
                     if reward.status == ReferralReward.Status.REVOCATION_PENDING
                     else reward.revocation_pending_at is None)):
            raise ValueError(_INVALID_MILESTONE)
        if reward.status == ReferralReward.Status.NON_REVERSIBLE:
            if (reward.settled_at is None or reward.revocation_pending_at is not None
                    or reward.revoked_at is not None):
                raise ValueError(_INVALID_MILESTONE)
            return
        if reward.status not in {ReferralReward.Status.REVOCATION_PENDING, ReferralReward.Status.GRANTED}:
            raise ValueError(_INVALID_MILESTONE)
        reward.status = ReferralReward.Status.NON_REVERSIBLE
        reward.settled_at = reward.settled_at or now
        reward.revocation_pending_at = None
        reward.save(update_fields=["status", "settled_at", "revocation_pending_at", "updated_at"])
        return

    if payment.status in {AlipayWebsitePayment.Status.CREATED, AlipayWebsitePayment.Status.PENDING}:
        if not (application.status == PaymentDiscountApplication.Status.RESERVED
                and coupon.status == UserCoupon.Status.RESERVED
                and coupon.reserved_payment_id == payment.pk and coupon.used_payment_id is None
                and coupon.reserved_at is not None and coupon.used_at is None
                and coupon.revoked_at is None and not coupon.revocation_reason
                and (reward.revocation_pending_at is not None
                     if reward.status == ReferralReward.Status.REVOCATION_PENDING
                     else reward.revocation_pending_at is None)
                and reward.status in {ReferralReward.Status.REVOCATION_PENDING,
                                      ReferralReward.Status.GRANTED}):
            raise ValueError(_INVALID_MILESTONE)
        return

    if payment.status not in {AlipayWebsitePayment.Status.FAILED, AlipayWebsitePayment.Status.CLOSED}:
        raise ValueError(_INVALID_MILESTONE)
    if reward.status == ReferralReward.Status.REVOKED:
        if not (application.status == PaymentDiscountApplication.Status.RELEASED
                and coupon.status == UserCoupon.Status.REVOKED
                and coupon.reserved_payment_id is None and coupon.used_payment_id is None
                and coupon.reserved_at is None and coupon.used_at is None
                and coupon.revoked_at is not None
                and coupon.revocation_reason == "referral_milestone_count_below_threshold"
                and reward.revoked_at is not None and reward.revocation_pending_at is None):
            raise ValueError(_INVALID_MILESTONE)
        return
    if not (application.status == PaymentDiscountApplication.Status.RELEASED
            and coupon.status == UserCoupon.Status.AVAILABLE
            and coupon.reserved_payment_id is None and coupon.used_payment_id is None
            and coupon.reserved_at is None and coupon.used_at is None and coupon.revoked_at is None
            and not coupon.revocation_reason
            and (reward.revocation_pending_at is not None
                 if reward.status == ReferralReward.Status.REVOCATION_PENDING
                 else reward.revocation_pending_at is None)
            and reward.status in {ReferralReward.Status.REVOCATION_PENDING,
                                  ReferralReward.Status.GRANTED}):
        raise ValueError(_INVALID_MILESTONE)
    count = ReferralParticipation.objects.filter(
        campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        status=ReferralParticipation.Status.QUALIFIED,
        referral_code__user_id=reward.referrer_id,
        referral_code__campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
    ).count()
    if count >= threshold:
        if reward.status != ReferralReward.Status.GRANTED or reward.revocation_pending_at is not None:
            reward.status = ReferralReward.Status.GRANTED
            reward.revocation_pending_at = None
            reward.save(update_fields=["status", "revocation_pending_at", "updated_at"])
        return
    if coupon.revoked_at is None:
        coupon.status = UserCoupon.Status.REVOKED
        coupon.revoked_at = now
        coupon.revocation_reason = "referral_milestone_count_below_threshold"
        coupon.save(update_fields=["status", "revoked_at", "revocation_reason", "updated_at"])
    elif coupon.status != UserCoupon.Status.REVOKED:
        raise ValueError(_INVALID_MILESTONE)
    if reward.revoked_at is None:
        reward.status = ReferralReward.Status.REVOKED
        reward.revoked_at = now
        reward.revocation_pending_at = None
        reward.save(update_fields=["status", "revoked_at", "revocation_pending_at", "updated_at"])
    elif reward.status != ReferralReward.Status.REVOKED or reward.revocation_pending_at is not None:
        raise ValueError(_INVALID_MILESTONE)
