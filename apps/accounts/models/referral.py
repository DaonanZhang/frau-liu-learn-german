from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class ReferralCode(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_codes",
    )
    campaign_tag = models.CharField(max_length=128)
    code_prefix = models.CharField(max_length=16)
    promotion_code = models.OneToOneField(
        "accounts.PromotionCodeRecord",
        on_delete=models.PROTECT,
        related_name="referral_code",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "campaign_tag"],
                name="uniq_ref_code_user_campaign",
            ),
        ]
        indexes = [
            models.Index(fields=["campaign_tag", "is_active"], name="idx_ref_code_campaign_active"),
        ]

    def __str__(self) -> str:
        return f"ReferralCode<user={self.user_id} campaign={self.campaign_tag}>"


class ReferralParticipation(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PAYMENT_RESERVED = "payment_reserved", "Payment reserved"
        REWARD_PENDING = "reward_pending", "Reward pending"
        QUALIFIED = "qualified", "Qualified"
        DISQUALIFIED = "disqualified", "Disqualified"
        REFUNDED = "refunded", "Refunded"

    campaign_tag = models.CharField(max_length=128)
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_participations",
    )
    referral_code = models.ForeignKey(
        ReferralCode,
        on_delete=models.PROTECT,
        related_name="participations",
    )
    current_coupon = models.OneToOneField(
        "accounts.UserCoupon",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="referral_participation",
    )
    qualifying_payment = models.OneToOneField(
        "accounts.AlipayWebsitePayment",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="referral_participation",
    )
    status = models.CharField(
        max_length=24,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    eligibility_checked_at = models.DateTimeField(null=True, blank=True)
    order_created_at = models.DateTimeField(null=True, blank=True)
    qualified_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    refund_reconciled_at = models.DateTimeField(null=True, blank=True)
    status_changed_at = models.DateTimeField(default=timezone.now)
    last_error = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["campaign_tag", "referred_user"],
                name="uniq_ref_part_user_campaign",
            ),
        ]
        indexes = [
            models.Index(fields=["campaign_tag", "status"], name="idx_ref_part_campaign_status"),
        ]

    def __str__(self) -> str:
        return f"ReferralParticipation<user={self.referred_user_id} campaign={self.campaign_tag} status={self.status}>"


class ReferralReward(models.Model):
    class Kind(models.TextChoices):
        REFERRAL_MONTH = "referral_month", "Referral month"
        SCIENCE_3 = "science_3", "Science 3"
        VLOG_5 = "vlog_5", "Vlog 5"

    class Status(models.TextChoices):
        GRANTED = "granted", "Granted"
        REVOCATION_PENDING = "revocation_pending", "Revocation pending"
        REVOKED = "revoked", "Revoked"
        NON_REVERSIBLE = "non_reversible", "Non-reversible"

    campaign_tag = models.CharField(max_length=128)
    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_rewards",
    )
    participation = models.ForeignKey(
        ReferralParticipation,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="rewards",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.GRANTED, db_index=True)
    amount_days = models.PositiveIntegerField(default=0)
    threshold = models.PositiveSmallIntegerField(null=True, blank=True)
    generation = models.PositiveIntegerField(default=1)
    entitlement = models.ForeignKey(
        "accounts.Entitlement",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="referral_rewards",
    )
    coupon = models.ForeignKey(
        "accounts.UserCoupon",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="referral_rewards",
    )
    idempotency_key = models.CharField(max_length=191, unique=True)
    revocation_pending_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount_days__gte=0), name="ref_reward_days_nonnegative"),
            models.CheckConstraint(condition=Q(generation__gt=0), name="ref_reward_generation_positive"),
            models.CheckConstraint(
                condition=Q(threshold__isnull=True) | Q(threshold__gt=0),
                name="ref_reward_threshold_positive",
            ),
        ]
        indexes = [
            models.Index(fields=["referrer", "campaign_tag", "status"], name="idx_ref_reward_owner_state"),
        ]

    def __str__(self) -> str:
        return f"ReferralReward<referrer={self.referrer_id} campaign={self.campaign_tag} kind={self.kind}>"


class ReferralNotice(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_notices",
    )
    campaign_tag = models.CharField(max_length=128)
    event_type = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)
    is_global_notice = models.BooleanField(default=False)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["user", "is_global_notice", "acknowledged_at"],
                name="idx_ref_notice_unread",
            ),
            models.Index(fields=["user", "campaign_tag", "created_at"], name="idx_ref_notice_history"),
        ]

    def __str__(self) -> str:
        return f"ReferralNotice<user={self.user_id} campaign={self.campaign_tag} event={self.event_type}>"
