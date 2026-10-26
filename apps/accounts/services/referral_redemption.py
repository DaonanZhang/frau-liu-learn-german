from dataclasses import dataclass, field
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.accounts import feature_flags
from apps.accounts.models import (
    PromotionCodeRecord,
    ReferralCode,
    ReferralParticipation,
    UserCoupon,
)
from apps.accounts.services import referral_campaign
from apps.accounts.services.referral_campaign import (
    ReferralCampaignConfig,
    has_historical_exam_preparation_access,
)


ISSUED = "issued"
ALREADY_ISSUED = "already_issued"
REPLACEMENT_REQUIRED = "replacement_required"
INVALID_CODE = "invalid_code"
CAMPAIGN_DISABLED = "campaign_disabled"
SELF_REFERRAL = "self_referral"
EXISTING_EXAM_PREPARATION_ACCESS = "existing_exam_preparation_access"
ALREADY_PARTICIPATED = "already_participated"
COUPON_RESERVED = "coupon_reserved"


@dataclass(frozen=True)
class ReferralRedemptionResult:
    outcome: str
    code: str
    message: str
    coupon: object | None = None
    replacement: object | None = None
    type: str = field(default="referral", init=False)


class ReferralRedemptionError(ValueError):
    def __init__(self, outcome: str, code: str, message: str):
        self.outcome = outcome
        self.code = str(code or "").strip().upper()
        super().__init__(message)


def _resolve_referral_code(code, *, at=None) -> tuple[ReferralCampaignConfig, ReferralCode]:
    normalized = str(code or "").strip().upper()
    invalid = lambda: ReferralRedemptionError(INVALID_CODE, normalized, "推广码无效。")
    if not normalized or not referral_campaign.is_reserved_referral_code(normalized):
        raise invalid()

    referral = (
        ReferralCode.objects.select_related("promotion_code", "user")
        .filter(promotion_code__code=normalized)
        .first()
    )
    if referral is None:
        raise invalid()

    config = referral_campaign._REGISTERED_REFERRAL_CAMPAIGNS.get(referral.campaign_tag)
    promotion = referral.promotion_code
    if (
        config is None
        or not referral.is_active
        or promotion.source_kind != PromotionCodeRecord.SourceKind.REFERRAL
        or promotion.status != PromotionCodeRecord.Status.ACTIVE
        or (promotion.expires_at is not None and promotion.expires_at <= (at or timezone.now()))
    ):
        raise invalid()
    return config, referral


def _assert_referral_campaign_enabled(config: ReferralCampaignConfig, *, code: str) -> None:
    normalized = str(code or "").strip().upper()
    if (
        config.campaign_tag == referral_campaign.FIRST_REFERRAL_CAMPAIGN.campaign_tag
        and not feature_flags.exam_preparation_referral_enabled()
    ):
        raise ReferralRedemptionError(
            CAMPAIGN_DISABLED, normalized, "备考季推广活动暂未开放。"
        )


@transaction.atomic
def redeem_referral_code(
    *, user, code: str, confirm_replace: bool = False
) -> ReferralRedemptionResult:
    normalized = str(code or "").strip().upper()
    locked_user = get_user_model().objects.select_for_update().get(pk=user.pk)
    now = timezone.now()
    _, resolved_referral = _resolve_referral_code(normalized, at=now)
    referral = ReferralCode.objects.select_for_update().get(pk=resolved_referral.pk)
    promotion = PromotionCodeRecord.objects.select_for_update().get(
        pk=referral.promotion_code_id
    )
    config = referral_campaign._REGISTERED_REFERRAL_CAMPAIGNS.get(
        referral.campaign_tag
    )
    if (
        config is None
        or not referral.is_active
        or referral.code_prefix != config.code_prefix
        or promotion.code != normalized
        or promotion.source_kind != PromotionCodeRecord.SourceKind.REFERRAL
        or promotion.status != PromotionCodeRecord.Status.ACTIVE
        or (promotion.expires_at is not None and promotion.expires_at <= now)
    ):
        raise ReferralRedemptionError(INVALID_CODE, normalized, "推广码无效。")
    _assert_referral_campaign_enabled(config, code=normalized)

    if referral.user_id == locked_user.pk:
        raise ReferralRedemptionError(SELF_REFERRAL, normalized, "不能兑换自己的推广码。")

    module = apps.get_model("accounts", "Module").objects.filter(
        key=config.module_key
    ).first()
    if (
        module is None
        or promotion.discount_amount != Decimal("5.00")
        or promotion.minimum_order_amount != Decimal("0.00")
        or promotion.applicable_module_id != module.pk
        or promotion.applicable_season_id is not None
        or promotion.applicable_offer_id is not None
        or promotion.coupon_valid_days is not None
        or promotion.redemption_mode != PromotionCodeRecord.RedemptionMode.REUSABLE
        or promotion.stacking_policy != PromotionCodeRecord.StackingPolicy.STACK
        or promotion.expires_at is not None
    ):
        raise ReferralRedemptionError(INVALID_CODE, normalized, "推广码无效。")

    existing = ReferralParticipation.objects.select_for_update().filter(
        campaign_tag=config.campaign_tag,
        referred_user=locked_user,
    ).first()
    if existing is not None:
        current_coupon = None
        if existing.current_coupon_id is not None:
            current_coupon = UserCoupon.objects.select_for_update().get(
                pk=existing.current_coupon_id
            )

        if existing.status != ReferralParticipation.Status.OPEN:
            raise ReferralRedemptionError(
                ALREADY_PARTICIPATED, normalized, "你已经参加过本次推广活动。"
            )

        if existing.referral_code_id != referral.pk and has_historical_exam_preparation_access(
            user=locked_user
        ):
            raise ReferralRedemptionError(
                EXISTING_EXAM_PREPARATION_ACCESS,
                normalized,
                "本次推广活动仅针对第一次购买备考季的用户哦！",
            )

        if current_coupon is None or current_coupon.status not in (
            UserCoupon.Status.AVAILABLE,
            UserCoupon.Status.RESERVED,
        ):
            raise ReferralRedemptionError(
                ALREADY_PARTICIPATED, normalized, "你已经参加过本次推广活动。"
            )
        if existing.referral_code_id == referral.pk:
            return ReferralRedemptionResult(
                outcome=ALREADY_ISSUED,
                code=normalized,
                message="你已领取过本次活动优惠券。",
                coupon=current_coupon,
            )
        if current_coupon.status == UserCoupon.Status.RESERVED:
            raise ReferralRedemptionError(
                COUPON_RESERVED,
                normalized,
                "当前活动优惠券正被待支付订单占用，请先完成或关闭该订单。",
            )
        old_code = ReferralCode.objects.filter(pk=existing.referral_code_id).values_list(
            "promotion_code__code", flat=True
        ).get()
        if confirm_replace:
            current_coupon.status = UserCoupon.Status.REVOKED
            current_coupon.revoked_at = now
            current_coupon.revocation_reason = "referral_code_replaced"
            current_coupon.save(
                update_fields=("status", "revoked_at", "revocation_reason", "updated_at")
            )
            new_coupon = UserCoupon.objects.create(
                user=locked_user,
                promotion_code=promotion,
                discount_amount=Decimal("5.00"),
                minimum_order_amount=Decimal("0.00"),
                applicable_module=module,
                applicable_season=None,
                applicable_offer=None,
                status=UserCoupon.Status.AVAILABLE,
                expires_at=None,
            )
            existing.referral_code = referral
            existing.current_coupon = new_coupon
            existing.eligibility_checked_at = now
            existing.status_changed_at = now
            existing.save(
                update_fields=(
                    "referral_code",
                    "current_coupon",
                    "eligibility_checked_at",
                    "status_changed_at",
                    "updated_at",
                )
            )
            return ReferralRedemptionResult(
                outcome=ISSUED,
                code=normalized,
                message="已更换并领取新的 ¥5 备考季专用优惠券。",
                coupon=new_coupon,
                replacement={
                    "old_code": old_code,
                    "new_code": normalized,
                    "old_coupon_id": current_coupon.pk,
                    "new_coupon_id": new_coupon.pk,
                },
            )
        return ReferralRedemptionResult(
            outcome=REPLACEMENT_REQUIRED,
            code=normalized,
            message="兑换后，当前活动优惠券将失效。是否继续？",
            coupon=current_coupon,
            replacement={
                "old_code": old_code,
                "new_code": normalized,
                "old_coupon_id": current_coupon.pk,
            },
        )

    if has_historical_exam_preparation_access(user=locked_user):
        raise ReferralRedemptionError(
            EXISTING_EXAM_PREPARATION_ACCESS,
            normalized,
            "本次推广活动仅针对第一次购买备考季的用户哦！",
        )

    coupon = UserCoupon.objects.create(
        user=locked_user,
        promotion_code=promotion,
        discount_amount=Decimal("5.00"),
        minimum_order_amount=Decimal("0.00"),
        applicable_module=module,
        applicable_season=None,
        applicable_offer=None,
        status=UserCoupon.Status.AVAILABLE,
        expires_at=None,
    )
    ReferralParticipation.objects.create(
        campaign_tag=config.campaign_tag,
        referred_user=locked_user,
        referral_code=referral,
        current_coupon=coupon,
        status=ReferralParticipation.Status.OPEN,
        eligibility_checked_at=now,
        status_changed_at=now,
    )
    return ReferralRedemptionResult(
        outcome=ISSUED,
        code=normalized,
        message="已领取 ¥5 备考季专用优惠券。",
        coupon=coupon,
    )
