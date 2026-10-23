from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    PaymentDiscountApplication,
    PaymentGrantTask,
    PromotionCodeRecord,
    ReferralCode,
    ReferralParticipation,
    ReferralNotice,
    ReferralReward,
    Entitlement,
    UserCoupon,
    PurchaseOffer,
)
from apps.accounts.services.referral_campaign import (
    FIRST_REFERRAL_CAMPAIGN,
    has_historical_exam_preparation_access,
)
from apps.accounts.services.entitlement_grant_service import grant_or_extend_entitlement
from apps.accounts.services.referral_milestones import reconcile_referral_milestones


INVALID_REFERRAL_PAYMENT = "Referral qualification is invalid"
INELIGIBLE_REFERRAL_PAYMENT = "Referral qualification is not eligible"
INVALID_REFERRAL_REWARD = "Referral reward qualification is invalid"
INVALID_REFERRAL_REWARD_ENTITLEMENT = "Referral reward entitlement is invalid"


def _reward_identity_matches(reward, *, key, campaign_tag, referrer_id, participation_id):
    return (
        reward.idempotency_key == key
        and reward.campaign_tag == campaign_tag
        and reward.referrer_id == referrer_id
        and reward.participation_id == participation_id
        and reward.kind == ReferralReward.Kind.REFERRAL_MONTH
        and reward.status == ReferralReward.Status.GRANTED
        and reward.amount_days == 30
        and reward.threshold is None
        and reward.generation == 1
        and reward.coupon_id is None
    )


def _reward_entitlement_matches(reward, *, referrer_id, external_ref):
    return _entitlement_matches(
        reward.entitlement, referrer_id=referrer_id, external_ref=external_ref
    )


def _entitlement_matches(entitlement, *, referrer_id, external_ref):
    if entitlement is None or entitlement.user_id != referrer_id or entitlement.season_id is not None:
        return False
    if entitlement.external_ref == external_ref:
        return (
            entitlement.plan == Entitlement.Plan.MONTH_1
            and entitlement.status == Entitlement.Status.ACTIVE
            and entitlement.starts_at is not None
            and entitlement.expires_at is not None
            and entitlement.expires_at - entitlement.starts_at == timedelta(days=30)
            and entitlement.module is not None
            and entitlement.module.key == FIRST_REFERRAL_CAMPAIGN.module_key
        )
    return (
        entitlement.plan == Entitlement.Plan.LIFETIME
        and entitlement.status == Entitlement.Status.ACTIVE
        and entitlement.starts_at <= timezone.now()
        and entitlement.expires_at is None
        and (entitlement.module is None or entitlement.module.key == FIRST_REFERRAL_CAMPAIGN.module_key)
    )


@transaction.atomic
def process_referral_reward_pending(*, participation_id: int) -> ReferralReward | None:
    locator = ReferralParticipation.objects.filter(pk=participation_id).values(
        "referred_user_id", "referral_code_id", "qualifying_payment_id"
    ).first()
    if locator is None:
        return None

    User = get_user_model()
    referrer_id = ReferralCode.objects.filter(pk=locator["referral_code_id"]).values_list(
        "user_id", flat=True
    ).first()
    if referrer_id is None:
        return None
    referrer = User.objects.select_for_update().filter(pk=referrer_id).first()
    if referrer is None:
        return None
    participation = ReferralParticipation.objects.select_for_update().filter(pk=participation_id).first()
    if participation is None:
        return None
    key = f"referral:{participation.campaign_tag}:participation:{participation.pk}:month"
    external_ref = f"referral_reward:{participation.campaign_tag}:{participation.pk}:month"
    reward = ReferralReward.objects.select_for_update().filter(idempotency_key=key).first()
    if participation.status == ReferralParticipation.Status.QUALIFIED:
        return reward if (
            reward is not None
            and _reward_identity_matches(
                reward, key=key, campaign_tag=participation.campaign_tag,
                referrer_id=referrer.pk, participation_id=participation.pk,
            )
            and _reward_entitlement_matches(reward, referrer_id=referrer.pk, external_ref=external_ref)
        ) else None
    if participation.status != ReferralParticipation.Status.REWARD_PENDING:
        return None

    payment = AlipayWebsitePayment.objects.select_for_update().filter(
        pk=participation.qualifying_payment_id
    ).first()
    task = PaymentGrantTask.objects.select_for_update().filter(
        payment_id=participation.qualifying_payment_id, user_id=participation.referred_user_id,
    ).first()
    application = PaymentDiscountApplication.objects.select_for_update().filter(
        payment_id=participation.qualifying_payment_id
    ).first()
    coupon = UserCoupon.objects.select_for_update().filter(pk=participation.current_coupon_id).first()
    referral = ReferralCode.objects.select_for_update().filter(pk=participation.referral_code_id).first()
    promotion = PromotionCodeRecord.objects.select_for_update().filter(
        pk=coupon.promotion_code_id if coupon else None
    ).first()

    if payment is None or payment.status not in {
        AlipayWebsitePayment.Status.PAID, AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
    }:
        return None
    if reward is not None and not _reward_identity_matches(
        reward, key=key, campaign_tag=participation.campaign_tag,
        referrer_id=referrer.pk, participation_id=participation.pk,
    ):
        now = timezone.now()
        participation.status = ReferralParticipation.Status.DISQUALIFIED
        participation.last_error = INVALID_REFERRAL_REWARD
        participation.status_changed_at = now
        participation.save(update_fields=["status", "last_error", "status_changed_at", "updated_at"])
        return None
    if reward is not None and reward.entitlement_id is not None and not _reward_entitlement_matches(
        reward, referrer_id=referrer.pk, external_ref=external_ref,
    ):
        now = timezone.now()
        participation.status = ReferralParticipation.Status.DISQUALIFIED
        participation.last_error = INVALID_REFERRAL_REWARD
        participation.status_changed_at = now
        participation.save(update_fields=["status", "last_error", "status_changed_at", "updated_at"])
        return None
    module_id = task.module_id if task else None
    valid_canceled_lifetime = bool(
        task
        and task.status == PaymentGrantTask.Status.CANCELED
        and Entitlement.objects.filter(
            user_id=participation.referred_user_id, season__isnull=True,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at__lte=timezone.now(), expires_at__isnull=True,
            created_at__gte=payment.created_at,
        ).filter(Q(module_id=module_id) | Q(module__isnull=True)).exists()
    )
    valid = (
        participation.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and participation.referral_code_id is not None
        and participation.current_coupon_id is not None
        and participation.qualifying_payment_id == payment.pk
        and participation.order_created_at == payment.created_at
        and task is not None and task.payment_id == payment.pk
        and task.user_id == participation.referred_user_id and task.module_id is not None
        and task.offer_id is not None and task.offer.module_id == task.module_id
        and task.offer.module.key == FIRST_REFERRAL_CAMPAIGN.module_key
        and task.season_id is None
        and task.status in {PaymentGrantTask.Status.SUCCEEDED, PaymentGrantTask.Status.CANCELED}
        and (task.status == PaymentGrantTask.Status.SUCCEEDED or valid_canceled_lifetime)
        and application is not None and application.status == PaymentDiscountApplication.Status.APPLIED
        and application.payment_id == payment.pk and application.user_id == participation.referred_user_id
        and application.offer_id == task.offer_id and application.coupon_id == (coupon.pk if coupon else None)
        and application.promotion_code_id == (promotion.pk if promotion else None)
        and application.promotion_discount_amount == Decimal("5.00")
        and coupon is not None and coupon.user_id == participation.referred_user_id
        and coupon.status == UserCoupon.Status.USED and coupon.used_payment_id == payment.pk
        and coupon.reserved_payment_id is None and coupon.discount_amount == Decimal("5.00")
        and coupon.minimum_order_amount == Decimal("0.00") and coupon.applicable_module_id == module_id
        and coupon.applicable_season_id is None and coupon.applicable_offer_id is None
        and coupon.expires_at is None
        and referral is not None and referral.user_id == referrer.pk
        and referral.user_id != participation.referred_user_id
        and referral.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and referral.code_prefix == FIRST_REFERRAL_CAMPAIGN.code_prefix
        and referral.promotion_code_id == (promotion.pk if promotion else None)
        and promotion is not None and promotion.source_kind == PromotionCodeRecord.SourceKind.REFERRAL
        and promotion.campaign_name == FIRST_REFERRAL_CAMPAIGN.campaign_name
        and promotion.discount_amount == Decimal("5.00")
        and promotion.minimum_order_amount == Decimal("0.00")
        and promotion.applicable_module_id == module_id and promotion.applicable_season_id is None
        and promotion.applicable_offer_id is None and promotion.coupon_valid_days is None
        and promotion.expires_at is None
        and promotion.redemption_mode == PromotionCodeRecord.RedemptionMode.REUSABLE
        and promotion.stacking_policy == PromotionCodeRecord.StackingPolicy.STACK
    )
    now = timezone.now()
    if not valid:
        participation.status = ReferralParticipation.Status.DISQUALIFIED
        participation.last_error = INVALID_REFERRAL_REWARD
        participation.status_changed_at = now
        participation.save(update_fields=["status", "last_error", "status_changed_at", "updated_at"])
        return None

    if reward is None:
        reward = ReferralReward.objects.create(
            campaign_tag=participation.campaign_tag, referrer=referrer,
            participation=participation, kind=ReferralReward.Kind.REFERRAL_MONTH,
            status=ReferralReward.Status.GRANTED, amount_days=30, threshold=None,
            generation=1, idempotency_key=key,
        )
    module = task.module
    if reward.entitlement_id is None:
        entitlement = grant_or_extend_entitlement(
            user=referrer, module=module, season=None, plan=Entitlement.Plan.MONTH_1,
            external_ref=external_ref, reject_if_lifetime=False,
        )
        if not _entitlement_matches(entitlement, referrer_id=referrer.pk, external_ref=external_ref):
            raise ValueError(INVALID_REFERRAL_REWARD_ENTITLEMENT)
        reward.entitlement = entitlement
        reward.save(update_fields=["entitlement", "updated_at"])
    effective_count = ReferralParticipation.objects.filter(
        referral_code_id=referral.pk, campaign_tag=participation.campaign_tag,
        status=ReferralParticipation.Status.QUALIFIED,
    ).count() + 1
    ReferralNotice.objects.create(
        user=referrer, campaign_tag=participation.campaign_tag,
        event_type="referral_qualified", payload={"days": 30, "effective_count": effective_count},
        is_global_notice=False,
    )
    participation.status = ReferralParticipation.Status.QUALIFIED
    participation.qualified_at = now
    participation.status_changed_at = now
    participation.last_error = ""
    participation.save(update_fields=["status", "qualified_at", "status_changed_at", "last_error", "updated_at"])
    reconcile_referral_milestones(referrer=referrer, campaign_tag=participation.campaign_tag)
    return reward


@transaction.atomic
def reserve_referral_participation_for_payment(*, user, offer, coupon, payment):
    if coupon is None or coupon is False:
        return None

    promotion_id = coupon.promotion_code_id
    promotion = PromotionCodeRecord.objects.filter(pk=promotion_id).first()
    if promotion is None or promotion.source_kind != PromotionCodeRecord.SourceKind.REFERRAL:
        return None

    locked_user = get_user_model().objects.select_for_update().get(pk=user.pk)
    participation = ReferralParticipation.objects.select_for_update().filter(
        campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        referred_user=locked_user,
    ).first()
    if participation is None:
        raise ValueError(INVALID_REFERRAL_PAYMENT)
    locked_coupon = UserCoupon.objects.select_for_update().filter(
        pk=participation.current_coupon_id,
    ).first()
    if locked_coupon is None:
        raise ValueError(INVALID_REFERRAL_PAYMENT)
    referral = ReferralCode.objects.select_for_update().filter(
        pk=participation.referral_code_id,
        campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
    ).first()
    locked_promotion = PromotionCodeRecord.objects.select_for_update().filter(
        pk=locked_coupon.promotion_code_id,
    ).first()
    if locked_promotion is None:
        raise ValueError(INVALID_REFERRAL_PAYMENT)
    locked_offer = PurchaseOffer.objects.select_related("module").get(pk=offer.pk)
    current_payment = AlipayWebsitePayment.objects.only("pk", "status", "created_at").get(pk=payment.pk)

    if (
        locked_offer.module.key != FIRST_REFERRAL_CAMPAIGN.module_key
        or locked_coupon.pk != getattr(coupon, "pk", None)
        or locked_coupon.user_id != locked_user.pk
        or participation.referral_code_id is None
        or referral is None
        or referral.pk != participation.referral_code_id
        or referral.promotion_code_id != locked_coupon.promotion_code_id
        or referral.campaign_tag != FIRST_REFERRAL_CAMPAIGN.campaign_tag
        or referral.code_prefix != FIRST_REFERRAL_CAMPAIGN.code_prefix
        or not referral.is_active
        or participation.campaign_tag != FIRST_REFERRAL_CAMPAIGN.campaign_tag
        or locked_coupon.promotion_code_id != promotion_id
        or locked_promotion.source_kind != PromotionCodeRecord.SourceKind.REFERRAL
        or locked_promotion.discount_amount != Decimal("5.00")
        or locked_promotion.minimum_order_amount != Decimal("0.00")
        or locked_promotion.applicable_module_id != locked_offer.module_id
        or locked_promotion.applicable_season_id is not None
        or locked_promotion.applicable_offer_id is not None
        or locked_promotion.coupon_valid_days is not None
        or locked_promotion.expires_at is not None
        or locked_promotion.redemption_mode != PromotionCodeRecord.RedemptionMode.REUSABLE
        or locked_promotion.stacking_policy != PromotionCodeRecord.StackingPolicy.STACK
        or locked_promotion.status != PromotionCodeRecord.Status.ACTIVE
        or locked_coupon.discount_amount != Decimal("5.00")
        or locked_coupon.minimum_order_amount != Decimal("0.00")
        or locked_coupon.applicable_module_id != locked_offer.module_id
        or locked_coupon.applicable_season_id is not None
        or locked_coupon.applicable_offer_id is not None
        or locked_coupon.expires_at is not None
        or locked_coupon.status != UserCoupon.Status.RESERVED
        or locked_coupon.reserved_payment_id != payment.pk
        or current_payment.status not in (
            AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
        )
    ):
        raise ValueError(INVALID_REFERRAL_PAYMENT)

    application = PaymentDiscountApplication.objects.filter(payment_id=payment.pk).first()
    if (
        application is None
        or application.payment_id != payment.pk
        or application.coupon_id != locked_coupon.pk
        or application.promotion_code_id != locked_promotion.pk
        or application.user_id != locked_user.pk
        or application.offer_id != locked_offer.pk
        or application.status != PaymentDiscountApplication.Status.RESERVED
    ):
        raise ValueError(INVALID_REFERRAL_PAYMENT)

    if participation.status == ReferralParticipation.Status.PAYMENT_RESERVED:
        if participation.qualifying_payment_id == payment.pk:
            return participation
        raise ValueError(INVALID_REFERRAL_PAYMENT)
    if participation.status != ReferralParticipation.Status.OPEN:
        raise ValueError(INVALID_REFERRAL_PAYMENT)
    if has_historical_exam_preparation_access(
        user=locked_user, before=current_payment.created_at
    ):
        raise ValueError(INELIGIBLE_REFERRAL_PAYMENT)

    participation.status = ReferralParticipation.Status.PAYMENT_RESERVED
    participation.qualifying_payment = payment
    participation.order_created_at = current_payment.created_at
    participation.status_changed_at = timezone.now()
    participation.save(
        update_fields=[
            "status",
            "qualifying_payment",
            "order_created_at",
            "status_changed_at",
            "updated_at",
        ]
    )
    return participation


@transaction.atomic
def release_referral_participation_for_payment(*, payment_id: int) -> ReferralParticipation | None:
    candidate = ReferralParticipation.objects.filter(
        qualifying_payment_id=payment_id,
    ).values("pk", "referred_user_id").first()
    if candidate is None:
        return None

    locked_user = get_user_model().objects.select_for_update().filter(
        pk=candidate["referred_user_id"],
    ).first()
    if locked_user is None:
        return None
    payment = AlipayWebsitePayment.objects.select_for_update().filter(pk=payment_id).first()
    if payment is None or payment.status not in {
        AlipayWebsitePayment.Status.FAILED,
        AlipayWebsitePayment.Status.CLOSED,
    }:
        return None
    participation = ReferralParticipation.objects.select_for_update().filter(
        pk=candidate["pk"], referred_user=locked_user,
    ).first()
    if (
        participation is None
        or participation.status != ReferralParticipation.Status.PAYMENT_RESERVED
        or participation.qualifying_payment_id != payment.pk
        or participation.campaign_tag != FIRST_REFERRAL_CAMPAIGN.campaign_tag
        or participation.referral_code_id is None
        or participation.current_coupon_id is None
    ):
        return None
    coupon = UserCoupon.objects.select_for_update().filter(
        pk=participation.current_coupon_id,
    ).first()
    if (
        coupon is None
        or coupon.user_id != locked_user.pk
        or coupon.status != UserCoupon.Status.AVAILABLE
        or coupon.reserved_payment_id is not None
    ):
        return None
    referral = ReferralCode.objects.filter(
        pk=participation.referral_code_id,
        campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
    ).first()
    application = PaymentDiscountApplication.objects.filter(
        payment_id=payment.pk,
        coupon_id=coupon.pk,
        status=PaymentDiscountApplication.Status.RELEASED,
    ).first()
    if (
        referral is None
        or referral.promotion_code_id != coupon.promotion_code_id
        or coupon.promotion_code.source_kind != PromotionCodeRecord.SourceKind.REFERRAL
        or application is None
        or application.user_id != locked_user.pk
        or application.promotion_code_id != coupon.promotion_code_id
    ):
        return None

    participation.status = ReferralParticipation.Status.OPEN
    participation.qualifying_payment = None
    participation.order_created_at = None
    participation.status_changed_at = timezone.now()
    participation.save(
        update_fields=[
            "status",
            "qualifying_payment",
            "order_created_at",
            "status_changed_at",
            "updated_at",
        ]
    )
    return participation


@transaction.atomic
def mark_referral_reward_pending(*, payment_grant_task: PaymentGrantTask) -> ReferralParticipation | None:
    task_locator = PaymentGrantTask.objects.filter(pk=payment_grant_task.pk).values(
        "user_id", "payment_id"
    ).first()
    if task_locator is None:
        return None
    participation_locator = ReferralParticipation.objects.filter(
        qualifying_payment_id=task_locator["payment_id"],
    ).values("pk", "referred_user_id").first()
    if participation_locator is None:
        return None

    locked_user = get_user_model().objects.select_for_update().filter(
        pk=participation_locator["referred_user_id"]
    ).first()
    if locked_user is None:
        return None
    task = PaymentGrantTask.objects.select_for_update().filter(
        pk=payment_grant_task.pk
    ).first()
    if task is None:
        return None
    payment = AlipayWebsitePayment.objects.select_for_update().filter(
        pk=task_locator["payment_id"]
    ).first()
    if payment is None:
        return None
    participation = ReferralParticipation.objects.select_for_update().filter(
        pk=participation_locator["pk"], referred_user=locked_user,
    ).first()
    if participation is None:
        return None
    application = PaymentDiscountApplication.objects.select_for_update().filter(
        payment=payment
    ).first()
    coupon = UserCoupon.objects.select_for_update().filter(
        pk=participation.current_coupon_id
    ).first() if participation.current_coupon_id is not None else None
    referral = ReferralCode.objects.select_for_update().filter(
        pk=participation.referral_code_id
    ).first() if participation.referral_code_id is not None else None
    promotion = PromotionCodeRecord.objects.select_for_update().filter(
        pk=coupon.promotion_code_id
    ).first() if coupon is not None else None

    valid_payment_status = payment.status in {
        AlipayWebsitePayment.Status.PAID,
        AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
    }
    if not valid_payment_status:
        return None
    if participation.status not in {
        ReferralParticipation.Status.PAYMENT_RESERVED,
        ReferralParticipation.Status.REWARD_PENDING,
    }:
        return None

    offer_module_key = None
    if task.offer_id is not None and task.module_id is not None:
        offer = PurchaseOffer.objects.filter(pk=task.offer_id).values(
            "module_id", "module__key"
        ).first()
        if offer is not None and offer["module_id"] == task.module_id:
            offer_module_key = offer["module__key"]

    valid = (
        task.payment_id == payment.pk
        and task.user_id == locked_user.pk
        and task.status in {PaymentGrantTask.Status.PROCESSING, PaymentGrantTask.Status.SUCCEEDED}
        and task.module_id is not None
        and offer_module_key == FIRST_REFERRAL_CAMPAIGN.module_key
        and task.module.key == FIRST_REFERRAL_CAMPAIGN.module_key
        and participation.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and participation.qualifying_payment_id == payment.pk
        and participation.order_created_at == payment.created_at
        and participation.current_coupon_id is not None
        and participation.referral_code_id is not None
        and application is not None
        and application.status == PaymentDiscountApplication.Status.APPLIED
        and application.payment_id == payment.pk
        and application.user_id == locked_user.pk
        and application.offer_id == task.offer_id
        and application.coupon_id == (coupon.pk if coupon else None)
        and application.promotion_code_id == (promotion.pk if promotion else None)
        and application.promotion_discount_amount == Decimal("5.00")
        and coupon is not None
        and coupon.user_id == locked_user.pk
        and coupon.status == UserCoupon.Status.USED
        and coupon.used_payment_id == payment.pk
        and coupon.reserved_payment_id is None
        and coupon.promotion_code_id == (promotion.pk if promotion else None)
        and coupon.discount_amount == Decimal("5.00")
        and coupon.minimum_order_amount == Decimal("0.00")
        and coupon.applicable_module_id == task.module_id
        and coupon.applicable_season_id is None
        and coupon.applicable_offer_id is None
        and coupon.expires_at is None
        and referral is not None
        and referral.user_id != locked_user.pk
        and referral.campaign_tag == FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and referral.code_prefix == FIRST_REFERRAL_CAMPAIGN.code_prefix
        and referral.promotion_code_id == (promotion.pk if promotion else None)
        and promotion is not None
        and promotion.source_kind == PromotionCodeRecord.SourceKind.REFERRAL
        and promotion.campaign_name == FIRST_REFERRAL_CAMPAIGN.campaign_name
        and promotion.discount_amount == Decimal("5.00")
        and promotion.minimum_order_amount == Decimal("0.00")
        and promotion.applicable_module_id == task.module_id
        and promotion.applicable_season_id is None
        and promotion.applicable_offer_id is None
        and promotion.coupon_valid_days is None
        and promotion.expires_at is None
        and promotion.redemption_mode == PromotionCodeRecord.RedemptionMode.REUSABLE
        and promotion.stacking_policy == PromotionCodeRecord.StackingPolicy.STACK
        and not has_historical_exam_preparation_access(
            user=locked_user,
            before=payment.created_at,
            exclude_external_ref=f"alipay_payment:{payment.merchant_order_no}",
        )
    )
    if not valid:
        if participation.status == ReferralParticipation.Status.REWARD_PENDING:
            return None
        participation.status = ReferralParticipation.Status.DISQUALIFIED
        participation.last_error = INVALID_REFERRAL_REWARD
    elif participation.status == ReferralParticipation.Status.REWARD_PENDING:
        return participation
    else:
        participation.status = ReferralParticipation.Status.REWARD_PENDING
        participation.last_error = ""

    participation.status_changed_at = timezone.now()
    participation.save(update_fields=["status", "last_error", "status_changed_at", "updated_at"])
    return participation
