from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db.models import QuerySet
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    Entitlement,
    Module,
    ModuleSeason,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralCode,
    ReferralParticipation,
    UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_redemption import (
    ALREADY_PARTICIPATED,
    ALREADY_ISSUED,
    COUPON_RESERVED,
    EXISTING_EXAM_PREPARATION_ACCESS,
    REPLACEMENT_REQUIRED,
    ReferralRedemptionError,
    redeem_referral_code,
)


class ReferralRedemptionOpenParticipationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(telephone="13600137111", password="pass")
        self.other_owner = User.objects.create_user(telephone="13600137112", password="pass")
        self.user = User.objects.create_user(telephone="13600137113", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.referral, self.promotion = self.make_referral(
            self.owner, "BK1-ABCDEFGH2"
        )
        self.other_referral, self.other_promotion = self.make_referral(
            self.other_owner, "BK1-BCDEFGH2"
        )

    def make_referral(self, owner, code):
        promotion = PromotionCodeRecord.objects.create(
            code=code,
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="备考季推广",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        referral = ReferralCode.objects.create(
            user=owner,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1",
            promotion_code=promotion,
        )
        return referral, promotion

    def make_coupon(self, *, status=UserCoupon.Status.AVAILABLE):
        return UserCoupon.objects.create(
            user=self.user,
            promotion_code=self.promotion,
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            status=status,
        )

    def make_participation(self, *, status=ReferralParticipation.Status.OPEN, coupon="available"):
        locked_coupon = self.make_coupon() if coupon == "available" else (
            self.make_coupon(status=coupon) if coupon is not None else None
        )
        participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.user,
            referral_code=self.referral,
            current_coupon=locked_coupon,
            status=status,
        )
        return participation, locked_coupon

    def snapshot(self):
        return (
            list(UserCoupon.objects.order_by("pk").values()),
            list(ReferralParticipation.objects.order_by("pk").values()),
        )

    def redeem(self, code="BK1-ABCDEFGH2", **kwargs):
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=True):
            return redeem_referral_code(user=self.user, code=code, **kwargs)

    def assert_rejected_without_writes(self, outcome, message, *, code="BK1-ABCDEFGH2", **kwargs):
        before = self.snapshot()
        with self.assertRaises(ReferralRedemptionError) as raised:
            self.redeem(code, **kwargs)
        self.assertEqual((raised.exception.outcome, raised.exception.code, str(raised.exception)),
                         (outcome, code, message))
        self.assertEqual(self.snapshot(), before)

    def test_same_code_open_available_is_idempotent_even_with_confirmation(self):
        _, coupon = self.make_participation()
        for confirm_replace in (False, True):
            with self.subTest(confirm_replace=confirm_replace):
                before = self.snapshot()
                result = self.redeem(confirm_replace=confirm_replace)
                self.assertEqual(
                    (result.outcome, result.code, result.message, result.coupon.pk, result.replacement),
                    (ALREADY_ISSUED, "BK1-ABCDEFGH2", "你已领取过本次活动优惠券。", coupon.pk, None),
                )
                self.assertEqual(self.snapshot(), before)

    def test_same_code_open_reserved_is_idempotent_even_with_confirmation(self):
        _, coupon = self.make_participation(coupon=UserCoupon.Status.RESERVED)
        for confirm_replace in (False, True):
            with self.subTest(confirm_replace=confirm_replace):
                before = self.snapshot()
                result = self.redeem(confirm_replace=confirm_replace)
                self.assertEqual(
                    (result.outcome, result.code, result.message, result.coupon.pk, result.replacement),
                    (ALREADY_ISSUED, "BK1-ABCDEFGH2", "你已领取过本次活动优惠券。", coupon.pk, None),
                )
                self.assertEqual(self.snapshot(), before)

    def test_different_code_available_without_confirmation_returns_replacement_required(self):
        _, coupon = self.make_participation()
        expected_replacement = {
            "old_code": "BK1-ABCDEFGH2",
            "new_code": "BK1-BCDEFGH2",
            "old_coupon_id": coupon.pk,
        }
        before = self.snapshot()
        result = self.redeem("bk1-bcdefgh2", confirm_replace=False)
        self.assertEqual(
            (result.outcome, result.code, result.message, result.coupon.pk),
            (REPLACEMENT_REQUIRED, "BK1-BCDEFGH2", "兑换后，当前活动优惠券将失效。是否继续？", coupon.pk),
        )
        self.assertEqual(result.replacement, expected_replacement)
        self.assertEqual(self.snapshot(), before)

    def test_different_code_reserved_coupon_is_rejected_without_writes(self):
        self.make_participation(coupon=UserCoupon.Status.RESERVED)
        self.assert_rejected_without_writes(
            COUPON_RESERVED,
            "当前活动优惠券正被待支付订单占用，请先完成或关闭该订单。",
            code="BK1-BCDEFGH2",
        )

    def test_open_participation_without_coupon_or_with_unusable_coupon_is_rejected(self):
        for coupon_status in (None, UserCoupon.Status.USED, UserCoupon.Status.EXPIRED, UserCoupon.Status.REVOKED):
            with self.subTest(coupon_status=coupon_status):
                self.make_participation(coupon=coupon_status)
                self.assert_rejected_without_writes(
                    ALREADY_PARTICIPATED, "你已经参加过本次推广活动。"
                )
                ReferralParticipation.objects.filter(referred_user=self.user).delete()
                UserCoupon.objects.filter(user=self.user).delete()

    def test_every_non_open_participation_state_is_rejected(self):
        non_open = (
            ReferralParticipation.Status.PAYMENT_RESERVED,
            ReferralParticipation.Status.REWARD_PENDING,
            ReferralParticipation.Status.QUALIFIED,
            ReferralParticipation.Status.DISQUALIFIED,
            ReferralParticipation.Status.REFUNDED,
        )
        for status in non_open:
            for code in ("BK1-ABCDEFGH2", "BK1-BCDEFGH2"):
                with self.subTest(status=status, code=code):
                    self.make_participation(status=status)
                    self.assert_rejected_without_writes(
                        ALREADY_PARTICIPATED,
                        "你已经参加过本次推广活动。",
                        code=code,
                    )
                    ReferralParticipation.objects.filter(referred_user=self.user).delete()
                    UserCoupon.objects.filter(user=self.user).delete()

    def test_non_open_state_precedes_later_historical_access_for_different_code(self):
        for status in (
            ReferralParticipation.Status.PAYMENT_RESERVED,
            ReferralParticipation.Status.REWARD_PENDING,
            ReferralParticipation.Status.QUALIFIED,
            ReferralParticipation.Status.DISQUALIFIED,
            ReferralParticipation.Status.REFUNDED,
        ):
            with self.subTest(status=status):
                self.make_participation(status=status)
                Entitlement.objects.create(
                    user=self.user,
                    module=self.module,
                    plan=Entitlement.Plan.MONTH_1,
                )
                try:
                    self.assert_rejected_without_writes(
                        ALREADY_PARTICIPATED,
                        "你已经参加过本次推广活动。",
                        code="BK1-BCDEFGH2",
                    )
                finally:
                    ReferralParticipation.objects.filter(referred_user=self.user).delete()
                    UserCoupon.objects.filter(user=self.user).delete()
                    Entitlement.objects.filter(user=self.user).delete()

    def test_existing_open_participation_still_validates_locked_target_terms(self):
        self.make_participation()
        other_module = Module.objects.exclude(pk=self.module.pk).first()
        if other_module is None:
            other_module = Module.objects.create(key="referral_other", name="Other")
        season = ModuleSeason.objects.create(
            module=self.module, season_number=991, title="Referral test"
        )
        offer = PurchaseOffer.objects.create(
            code="referral-open-validation",
            title="Referral test",
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("10.00"),
        )
        invalid_values = (
            ("discount_amount", Decimal("6.00")),
            ("minimum_order_amount", Decimal("1.00")),
            ("applicable_module", other_module),
            ("applicable_season", season),
            ("applicable_offer", offer),
            ("coupon_valid_days", 10),
            ("redemption_mode", PromotionCodeRecord.RedemptionMode.SINGLE_USE),
            ("stacking_policy", PromotionCodeRecord.StackingPolicy.EXCLUSIVE_BRAND_FRIEND),
            ("expires_at", timezone.now() + timedelta(days=1)),
        )
        originals = {
            "discount_amount": Decimal("5.00"),
            "minimum_order_amount": Decimal("0.00"),
            "applicable_module": self.module,
            "applicable_season": None,
            "applicable_offer": None,
            "coupon_valid_days": None,
            "redemption_mode": PromotionCodeRecord.RedemptionMode.REUSABLE,
            "stacking_policy": PromotionCodeRecord.StackingPolicy.STACK,
            "expires_at": None,
        }

        for target_promotion, code in (
            (self.promotion, "BK1-ABCDEFGH2"),
            (self.other_promotion, "BK1-BCDEFGH2"),
        ):
            for field, value in invalid_values:
                with self.subTest(code=code, field=field):
                    setattr(target_promotion, field, value)
                    target_promotion.save()
                    try:
                        self.assert_rejected_without_writes(
                            "invalid_code", "推广码无效。", code=code
                        )
                    finally:
                        setattr(target_promotion, field, originals[field])
                        target_promotion.save()

    def test_new_historical_access_blocks_different_code_but_not_same_code_retry(self):
        _, coupon = self.make_participation()
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
        )
        before = self.snapshot()
        result = self.redeem()
        self.assertEqual((result.outcome, result.coupon.pk), (ALREADY_ISSUED, coupon.pk))
        self.assertEqual(self.snapshot(), before)
        self.assert_rejected_without_writes(
            EXISTING_EXAM_PREPARATION_ACCESS,
            "你已经获得过备考季权限，无法参加本次推广活动。",
            code="BK1-BCDEFGH2",
        )

    def test_locked_rows_are_acquired_in_order_and_locked_coupon_is_returned(self):
        _, coupon = self.make_participation()
        events = []
        locked_coupon = []
        original_first = QuerySet.first
        original_get = QuerySet.get

        def capture_first(queryset):
            if queryset.query.select_for_update:
                events.append({
                    ReferralCode: "referral",
                    PromotionCodeRecord: "promotion",
                    ReferralParticipation: "participation",
                    UserCoupon: "coupon",
                }[queryset.model])
            result = original_first(queryset)
            if queryset.query.select_for_update and queryset.model is UserCoupon:
                locked_coupon.append(result)
            return result

        def capture_get(queryset, *args, **kwargs):
            result = original_get(queryset, *args, **kwargs)
            if queryset.query.select_for_update:
                events.append({
                    get_user_model(): "user",
                    ReferralCode: "referral",
                    PromotionCodeRecord: "promotion",
                    UserCoupon: "coupon",
                }[queryset.model])
                if queryset.model is UserCoupon:
                    locked_coupon.append(result)
            return result

        with patch.object(QuerySet, "first", capture_first), patch.object(QuerySet, "get", capture_get):
            result = self.redeem()

        self.assertEqual(events, ["user", "referral", "promotion", "participation", "coupon"])
        self.assertIs(locked_coupon[0], result.coupon)
        self.assertEqual(result.coupon.pk, coupon.pk)
