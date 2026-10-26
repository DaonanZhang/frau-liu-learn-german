from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db.models import QuerySet
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    Entitlement,
    Module,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralCode,
    ReferralParticipation,
    UserCoupon,
    ModuleSeason,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_redemption import (
    ReferralRedemptionError,
    redeem_referral_code,
)


class ReferralRedemptionFirstIssueTests(TestCase):
    def setUp(self):
        self.User = get_user_model()
        self.owner = self.User.objects.create_user(telephone="13600137101", password="pass")
        self.user = self.User.objects.create_user(telephone="13600137102", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-ABCDEFGH2",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="备考季推广",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        self.referral = ReferralCode.objects.create(
            user=self.owner,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1",
            promotion_code=self.promotion,
        )

    def snapshot(self):
        return (
            list(UserCoupon.objects.order_by("pk").values()),
            list(ReferralParticipation.objects.order_by("pk").values()),
        )

    def redeem(self, code="BK1-ABCDEFGH2", **kwargs):
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=True):
            return redeem_referral_code(user=self.user, code=code, **kwargs)

    def assert_rejected_without_writes(self, outcome, message, **kwargs):
        before = self.snapshot()
        with self.assertRaises(ReferralRedemptionError) as raised:
            self.redeem(**kwargs)
        self.assertEqual((raised.exception.outcome, str(raised.exception)), (outcome, message))
        self.assertEqual(self.snapshot(), before)

    def test_first_issue_creates_exact_coupon_and_open_participation(self):
        result = self.redeem("  bk1-abcdefgh2  ", confirm_replace=True)
        coupon = result.coupon
        participation = ReferralParticipation.objects.get(referred_user=self.user)
        self.assertEqual((result.outcome, result.code, result.message),
                         ("issued", "BK1-ABCDEFGH2", "已领取 ¥5 备考季专用优惠券。"))
        self.assertIsNone(result.replacement)
        self.assertEqual((coupon.user_id, coupon.promotion_code_id, coupon.discount_amount,
                          coupon.minimum_order_amount, coupon.applicable_module_id,
                          coupon.applicable_season_id, coupon.applicable_offer_id,
                          coupon.status, coupon.expires_at),
                         (self.user.pk, self.promotion.pk, Decimal("5.00"), Decimal("0.00"),
                          self.module.pk, None, None, UserCoupon.Status.AVAILABLE, None))
        self.assertEqual((participation.campaign_tag, participation.referral_code_id,
                          participation.current_coupon_id, participation.status),
                         (FIRST_REFERRAL_CAMPAIGN.campaign_tag, self.referral.pk,
                          coupon.pk, ReferralParticipation.Status.OPEN))
        self.assertEqual(participation.eligibility_checked_at, participation.status_changed_at)
        self.assertEqual((UserCoupon.objects.count(), ReferralParticipation.objects.count()), (1, 1))

    def test_user_is_locked_before_coupon_and_participation_creation(self):
        events = []
        locked_rows = {}
        original_get = QuerySet.get

        def capture_locked_row(queryset, *args, **kwargs):
            instance = original_get(queryset, *args, **kwargs)
            if queryset.query.select_for_update:
                locked_rows[queryset.model] = instance
            return instance

        original_lock = self.User.objects.select_for_update
        original_referral_lock = ReferralCode.objects.select_for_update
        original_promotion_lock = PromotionCodeRecord.objects.select_for_update
        original_coupon_create = UserCoupon.objects.create
        original_participation_create = ReferralParticipation.objects.create

        def create_coupon(*args, **kwargs):
            self.assertIs(kwargs["user"], locked_rows[self.User])
            self.assertIs(kwargs["promotion_code"], locked_rows[PromotionCodeRecord])
            events.append("coupon")
            return original_coupon_create(*args, **kwargs)

        def create_participation(*args, **kwargs):
            self.assertIs(kwargs["referred_user"], locked_rows[self.User])
            self.assertIs(kwargs["referral_code"], locked_rows[ReferralCode])
            events.append("participation")
            return original_participation_create(*args, **kwargs)

        with patch.object(self.User.objects, "select_for_update", side_effect=lambda *a, **kw: (events.append("lock") or original_lock(*a, **kw))), \
             patch.object(ReferralCode.objects, "select_for_update", side_effect=lambda *a, **kw: (events.append("referral_lock") or original_referral_lock(*a, **kw))), \
             patch.object(PromotionCodeRecord.objects, "select_for_update", side_effect=lambda *a, **kw: (events.append("promotion_lock") or original_promotion_lock(*a, **kw))), \
             patch.object(UserCoupon.objects, "create", side_effect=create_coupon), \
             patch.object(ReferralParticipation.objects, "create", side_effect=create_participation), \
             patch.object(QuerySet, "get", capture_locked_row):
            self.redeem()
        self.assertEqual(events, ["lock", "referral_lock", "promotion_lock", "coupon", "participation"])
        self.assertEqual(locked_rows[self.User].pk, self.user.pk)

    def test_locked_referral_and_promotion_rows_are_revalidated(self):
        original_get = QuerySet.get
        cases = (
            (ReferralCode, "is_active", False),
            (PromotionCodeRecord, "discount_amount", Decimal("6.00")),
        )
        for model, field, value in cases:
            with self.subTest(model=model.__name__):
                def mutate_locked_row(queryset, *args, **kwargs):
                    instance = original_get(queryset, *args, **kwargs)
                    if queryset.query.select_for_update and queryset.model is model:
                        setattr(instance, field, value)
                    return instance

                before = self.snapshot()
                with patch.object(QuerySet, "get", mutate_locked_row):
                    with self.assertRaises(ReferralRedemptionError) as raised:
                        self.redeem()
                self.assertEqual(raised.exception.outcome, "invalid_code")
                self.assertEqual(self.snapshot(), before)

    def test_self_referral_is_write_free(self):
        before = self.snapshot()
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=True):
            with self.assertRaises(ReferralRedemptionError) as raised:
                redeem_referral_code(user=self.owner, code=self.referral.promotion_code.code)
        self.assertEqual((raised.exception.outcome, str(raised.exception)),
                         ("self_referral", "不能兑换自己的推广码。"))
        self.assertEqual(self.snapshot(), before)

    def test_disabled_campaign_is_write_free(self):
        before = self.snapshot()
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=False):
            with self.assertRaises(ReferralRedemptionError) as raised:
                redeem_referral_code(user=self.user, code="BK1-ABCDEFGH2")
        self.assertEqual(raised.exception.outcome, "campaign_disabled")
        self.assertEqual(self.snapshot(), before)

    def test_historical_module_and_platform_access_block_but_unrelated_history_does_not(self):
        other_module = Module.objects.exclude(key="exam_preparation").first()
        if other_module is None:
            other_module = Module.objects.create(key="referral_unrelated", name="Other")
        Entitlement.objects.create(user=self.user, module=other_module, plan=Entitlement.Plan.MONTH_1)
        self.assertEqual(self.redeem().outcome, "issued")

        self.user = self.User.objects.create_user(telephone="13600137103", password="pass")
        Entitlement.objects.create(
            user=self.user,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.EXPIRED,
            expires_at=timezone.now() - timedelta(days=1),
        )
        self.assert_rejected_without_writes(
            "existing_exam_preparation_access", "本次推广活动仅针对第一次购买备考季的用户哦！"
        )
        Entitlement.objects.filter(user=self.user).delete()
        for status in Entitlement.Status.values:
            Entitlement.objects.create(
                user=self.user,
                module=self.module,
                plan=Entitlement.Plan.MONTH_1,
                status=status,
                starts_at=timezone.now() + timedelta(days=1),
                expires_at=timezone.now() - timedelta(days=1),
            )
            self.assert_rejected_without_writes(
                "existing_exam_preparation_access", "本次推广活动仅针对第一次购买备考季的用户哦！"
            )
            Entitlement.objects.filter(user=self.user).delete()

    def test_every_existing_non_open_participation_state_rejects_without_writes(self):
        statuses = (
            ReferralParticipation.Status.PAYMENT_RESERVED,
            ReferralParticipation.Status.REWARD_PENDING,
            ReferralParticipation.Status.QUALIFIED,
            ReferralParticipation.Status.DISQUALIFIED,
            ReferralParticipation.Status.REFUNDED,
        )
        for status in statuses:
            with self.subTest(status=status):
                coupon = UserCoupon.objects.create(
                    user=self.user,
                    promotion_code=self.promotion,
                    discount_amount=Decimal("5.00"),
                    applicable_module=self.module,
                )
                ReferralParticipation.objects.create(
                    campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                    referred_user=self.user,
                    referral_code=self.referral,
                    current_coupon=coupon,
                    status=status,
                )
                self.assert_rejected_without_writes(
                    "already_participated", "你已经参加过本次推广活动。"
                )
                ReferralParticipation.objects.filter(referred_user=self.user).delete()
                coupon.delete()

    def test_promotion_terms_drift_rejects_without_writes(self):
        fields = (
            ("discount_amount", Decimal("6.00")),
            ("minimum_order_amount", Decimal("1.00")),
            ("applicable_module", None),
            ("applicable_season", ModuleSeason.objects.create(
                module=self.module, season_number=709, title="Referral test"
            )),
            ("applicable_offer", PurchaseOffer.objects.create(
                code="referral-test-offer", title="Test", module=self.module,
                plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("10.00"),
            )),
            ("coupon_valid_days", 10),
            ("redemption_mode", PromotionCodeRecord.RedemptionMode.SINGLE_USE),
            ("stacking_policy", PromotionCodeRecord.StackingPolicy.EXCLUSIVE_BRAND_FRIEND),
            ("expires_at", timezone.now() + timedelta(days=1)),
        )
        for field, value in fields:
            with self.subTest(field=field):
                setattr(self.promotion, field, value)
                self.promotion.save()
                self.assert_rejected_without_writes("invalid_code", "推广码无效。")
                setattr(self.promotion, field, {
                    "discount_amount": Decimal("5.00"),
                    "minimum_order_amount": Decimal("0.00"),
                    "applicable_module": self.module,
                    "applicable_season": None,
                    "applicable_offer": None,
                    "coupon_valid_days": None,
                    "redemption_mode": PromotionCodeRecord.RedemptionMode.REUSABLE,
                    "stacking_policy": PromotionCodeRecord.StackingPolicy.STACK,
                    "expires_at": None,
                }[field])
                self.promotion.save()
