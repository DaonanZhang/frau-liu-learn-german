import secrets
from dataclasses import dataclass
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import DatabaseError, IntegrityError, transaction
from django.db.models import Q

from apps.accounts.models import Entitlement, PromotionCodeRecord, ReferralCode


CAMPAIGN_TAG = "exam_preparation_referral_v1"
CAMPAIGN_NAME = "备考季推广"
CODE_PREFIX = "BK1"


@dataclass(frozen=True)
class ReferralCampaignConfig:
    campaign_tag: str
    campaign_name: str
    code_prefix: str
    module_key: str
    suffix_length: int
    alphabet: str


@dataclass(frozen=True)
class ReferralBackfillStats:
    created: int = 0
    existing: int = 0
    skipped: int = 0
    failed: int = 0


FIRST_REFERRAL_CAMPAIGN = ReferralCampaignConfig(
    campaign_tag=CAMPAIGN_TAG,
    campaign_name=CAMPAIGN_NAME,
    code_prefix=CODE_PREFIX,
    module_key="exam_preparation",
    suffix_length=9,
    alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
)


def _eligible_referral_backfill_users(*, config=FIRST_REFERRAL_CAMPAIGN):
    return (
        get_user_model().objects.filter(
            Q(entitlements__module__key=config.module_key)
            | Q(
                entitlements__module__isnull=True,
                entitlements__season__isnull=True,
            )
        )
        .filter(entitlements__isnull=False)
        .distinct()
        .order_by("pk")
        .only("pk")
    )


def promotion_code_prefix_collision_exists(*, config=FIRST_REFERRAL_CAMPAIGN) -> bool:
    safe_promotion_ids = ReferralCode.objects.filter(
        campaign_tag=config.campaign_tag,
        promotion_code__source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
    ).values("promotion_code_id")
    return (
        PromotionCodeRecord.objects
        .filter(code__startswith=f"{config.code_prefix}-")
        .exclude(pk__in=safe_promotion_ids)
        .exists()
    )


def assert_referral_code_prefix_available(*, config=FIRST_REFERRAL_CAMPAIGN) -> None:
    prefix = f"{config.code_prefix}-"
    if promotion_code_prefix_collision_exists(config=config):
        raise ValueError("Referral code prefix is already in use")
    from apps.accounts.services.activation_codes import (
        durable_activation_code_prefix_exists,
        legacy_activation_code_prefix_exists,
    )
    if durable_activation_code_prefix_exists(prefix):
        raise ValueError("Referral code prefix is already in use")
    if legacy_activation_code_prefix_exists(prefix):
        raise ValueError("Referral code prefix is already in use")


_RESERVED_REFERRAL_CAMPAIGNS = (FIRST_REFERRAL_CAMPAIGN,)
_REGISTERED_REFERRAL_CAMPAIGNS = {
    config.campaign_tag: config for config in _RESERVED_REFERRAL_CAMPAIGNS
}


def generate_referral_code_candidate(
    *, config=FIRST_REFERRAL_CAMPAIGN
) -> str:
    if (
        not config.code_prefix.strip()
        or config.suffix_length <= 0
        or not config.alphabet.strip()
    ):
        raise ValueError("Invalid referral campaign code configuration")
    return f"{config.code_prefix}-" + "".join(
        secrets.choice(config.alphabet) for _ in range(config.suffix_length)
    )


def is_reserved_referral_code(code) -> bool:
    normalized = str(code or "").strip().upper()
    return any(
        normalized.startswith(f"{config.code_prefix}-")
        for config in _RESERVED_REFERRAL_CAMPAIGNS
    )


def has_historical_exam_preparation_access(
    *, user, before=None, exclude_external_ref=""
) -> bool:
    entitlements = Entitlement.objects.filter(user=user).filter(
        Q(module__key=FIRST_REFERRAL_CAMPAIGN.module_key)
        | Q(module__isnull=True, season__isnull=True)
    )
    if before is not None:
        entitlements = entitlements.filter(created_at__lt=before)
    if exclude_external_ref:
        entitlements = entitlements.exclude(external_ref=exclude_external_ref)
    return entitlements.exists()


def ensure_referral_code(*, user, campaign_tag=CAMPAIGN_TAG) -> ReferralCode:
    config = _REGISTERED_REFERRAL_CAMPAIGNS.get(campaign_tag)
    if config is None:
        raise ValueError(f"Unknown referral campaign: {campaign_tag}")

    with transaction.atomic():
        locked_user = get_user_model().objects.select_for_update().get(pk=user.pk)
        existing = ReferralCode.objects.filter(
            user=locked_user, campaign_tag=config.campaign_tag
        ).first()
        if existing is not None:
            return existing

        if not has_historical_exam_preparation_access(user=locked_user):
            raise ValueError("User is not eligible for this referral campaign")

        module = apps.get_model("accounts", "Module").objects.get(key=config.module_key)
        from apps.accounts.services.activation_codes import activation_code_exists

        for _ in range(100):
            code = generate_referral_code_candidate(config=config)
            if activation_code_exists(code):
                continue
            if PromotionCodeRecord.objects.filter(code=code).exists():
                continue
            try:
                with transaction.atomic():
                    promotion = PromotionCodeRecord.objects.create(
                        code=code,
                        source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
                        operator_name="system",
                        campaign_name=config.campaign_name,
                        organization_name="",
                        remark="",
                        discount_amount=Decimal("5.00"),
                        minimum_order_amount=Decimal("0.00"),
                        applicable_module=module,
                        applicable_season=None,
                        applicable_offer=None,
                        coupon_valid_days=None,
                        redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
                        stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
                        status=PromotionCodeRecord.Status.ACTIVE,
                        expires_at=None,
                        consumed_by_user=None,
                        consumed_at=None,
                    )
                    referral = ReferralCode.objects.create(
                        user=locked_user,
                        campaign_tag=config.campaign_tag,
                        code_prefix=config.code_prefix,
                        promotion_code=promotion,
                        is_active=True,
                    )
                return referral
            except IntegrityError:
                existing = ReferralCode.objects.filter(
                    user=locked_user, campaign_tag=config.campaign_tag
                ).first()
                if existing is not None:
                    return existing
        raise RuntimeError("Failed to generate a unique referral code")


def backfill_referral_codes(*, dry_run: bool) -> ReferralBackfillStats:
    assert_referral_code_prefix_available(config=FIRST_REFERRAL_CAMPAIGN)

    created = 0
    existing = 0
    skipped = 0
    failed = 0
    users = _eligible_referral_backfill_users(config=FIRST_REFERRAL_CAMPAIGN)
    for user in users.iterator(chunk_size=500):
        if ReferralCode.objects.filter(user=user, campaign_tag=CAMPAIGN_TAG).exists():
            existing += 1
        elif dry_run:
            skipped += 1
        else:
            try:
                ensure_referral_code(user=user, campaign_tag=CAMPAIGN_TAG)
                created += 1
            except (ValueError, RuntimeError, DatabaseError):
                failed += 1

    return ReferralBackfillStats(
        created=created,
        existing=existing,
        skipped=skipped,
        failed=failed,
    )
