from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    ModuleSeason,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralCode,
    ReferralParticipation,
    ReferralReward,
    UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_qualification import (
    reserve_referral_participation_for_payment,
)


@override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
class ReferralQualificationReservationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13600139001", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139002", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.other_module = Module.objects.exclude(pk=self.module.pk).first()
        if self.other_module is None:
            self.other_module = Module.objects.create(key="reservation_other", name="Other")
        self.offer = PurchaseOffer.objects.create(
            code="reservation-offer", title="Reservation", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-RESERVE001", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
            status=PromotionCodeRecord.Status.ACTIVE,
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1", promotion_code=self.promotion,
        )
        self.coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=self.promotion,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module, status=UserCoupon.Status.RESERVED,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=self.user,
            referral_code=self.referral, current_coupon=self.coupon,
            status=ReferralParticipation.Status.OPEN,
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="reservation-order", subject="Offer",
            total_amount=Decimal("54.90"),
        )
        UserCoupon.objects.filter(pk=self.coupon.pk).update(reserved_payment=self.payment)
        self.coupon.refresh_from_db()
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=self.coupon, promotion_code=self.promotion,
            user=self.user, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.RESERVED,
        )

    def reserve(self, **overrides):
        params = dict(user=self.user, offer=self.offer, coupon=self.coupon, payment=self.payment)
        params.update(overrides)
        return reserve_referral_participation_for_payment(**params)

    def snapshot(self):
        return (
            list(ReferralParticipation.objects.order_by("pk").values()),
            list(ReferralReward.objects.order_by("pk").values()),
        )

    def test_none_false_and_ordinary_coupon_return_without_writes(self):
        before = self.snapshot()
        self.assertIsNone(self.reserve(coupon=None))
        self.assertIsNone(self.reserve(coupon=False))
        ordinary = PromotionCodeRecord.objects.create(
            code="ORDINARY-RESERVE", campaign_name="ordinary",
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
        )
        ordinary_coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=ordinary, discount_amount=Decimal("5.00"),
        )
        self.assertIsNone(self.reserve(coupon=ordinary_coupon))
        self.assertEqual(self.snapshot(), before)

    def test_reserves_open_participation_at_payment_timestamp_without_rewards(self):
        before = self.snapshot()
        result = self.reserve()
        result.refresh_from_db()
        self.assertEqual(result.status, ReferralParticipation.Status.PAYMENT_RESERVED)
        self.assertEqual(result.qualifying_payment_id, self.payment.pk)
        self.assertEqual(result.order_created_at, self.payment.created_at)
        self.assertIsNotNone(result.status_changed_at)
        self.assertGreaterEqual(result.status_changed_at, result.updated_at - timedelta(seconds=2))
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralParticipation.objects.count(), len(before[0]))

    def test_same_payment_is_idempotent_and_does_not_write(self):
        first = self.reserve()
        before = self.snapshot()
        result = self.reserve()
        self.assertEqual(result.pk, first.pk)
        self.assertEqual(self.snapshot(), before)

    def test_historical_access_uses_strict_payment_created_at_cutoff(self):
        for offset, blocks in ((-1, True), (0, False), (1, False)):
            with self.subTest(offset=offset):
                self.participation.status = ReferralParticipation.Status.OPEN
                self.participation.qualifying_payment = None
                self.participation.order_created_at = None
                self.participation.save()
                Entitlement.objects.filter(user=self.user).delete()
                entitlement = Entitlement.objects.create(
                    user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
                )
                Entitlement.objects.filter(pk=entitlement.pk).update(
                    created_at=self.payment.created_at + timedelta(microseconds=offset)
                )
                before = self.snapshot()
                if blocks:
                    with self.assertRaisesRegex(ValueError, "Referral qualification is not eligible"):
                        self.reserve()
                    self.assertEqual(self.snapshot(), before)
                else:
                    self.assertEqual(self.reserve().status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_valid_referral_is_not_blocked_when_feature_flag_is_disabled(self):
        self.assertEqual(self.reserve().status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_pending_payment_is_accepted(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.PENDING
        )
        self.assertEqual(self.reserve().status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_rejects_each_coupon_and_promotion_scope_or_policy_drift(self):
        other_offer = self.make_other_offer()
        promotion_changes = (
            {"applicable_module": self.other_module},
            {"applicable_offer": other_offer},
            {"minimum_order_amount": Decimal("1.00")},
            {"applicable_season": ModuleSeason.objects.create(
                module=self.module, season_number=981, title="Drift"
            )},
            {"coupon_valid_days": 30},
            {"redemption_mode": PromotionCodeRecord.RedemptionMode.SINGLE_USE},
            {"stacking_policy": PromotionCodeRecord.StackingPolicy.EXCLUSIVE_BRAND_FRIEND},
            {"status": PromotionCodeRecord.Status.REVOKED},
            {"expires_at": timezone.now()},
        )
        coupon_changes = (
            {"applicable_module": self.other_module},
            {"applicable_offer": other_offer},
            {"minimum_order_amount": Decimal("1.00")},
            {"applicable_season": ModuleSeason.objects.create(
                module=self.module, season_number=982, title="Drift"
            )},
            {"expires_at": timezone.now()},
        )
        for fields in promotion_changes:
            with self.subTest(promotion_fields=fields):
                self.assert_rejected_mutation(
                    lambda fields=fields: PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(**fields),
                    "Referral qualification is invalid",
                )
        for fields in coupon_changes:
            with self.subTest(coupon_fields=fields):
                self.assert_rejected_mutation(
                    lambda fields=fields: UserCoupon.objects.filter(pk=self.coupon.pk).update(**fields),
                    "Referral qualification is invalid",
                )

    def test_rejects_invalid_referral_chains_without_mutation(self):
        cases = [
            ("wrong module", lambda: None, {"offer": self.make_other_offer()}),
            ("wrong user", lambda: None, {"coupon": self.make_other_user_coupon()}),
            ("not current coupon", lambda: None, {"coupon": self.replace_current_coupon()}),
            ("referral promotion mismatch", lambda: ReferralParticipation.objects.filter(pk=self.participation.pk).update(referral_code=self.make_other_referral()), {}),
            ("coupon not reserved", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(status=UserCoupon.Status.AVAILABLE), {}),
            ("coupon reserved elsewhere", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(reserved_payment=self.make_payment("other-reserved")), {}),
            ("missing application", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).delete(), {}),
            ("wrong application status", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(status=PaymentDiscountApplication.Status.RELEASED), {}),
            ("wrong application user", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(user=self.referrer), {}),
            ("bad payment status", lambda: AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.PAID), {}),
            ("promotion terms drift", lambda: PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(discount_amount=Decimal("6.00")), {}),
            ("coupon terms drift", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(discount_amount=Decimal("6.00")), {}),
        ]
        for label, mutate, overrides in cases:
            with self.subTest(case=label):
                self.assert_rejected_mutation(mutate, "Referral qualification is invalid", **overrides)

    def test_rejects_wrong_application_offer_and_promotion_and_non_created_pending_status(self):
        other_offer = self.make_other_offer()
        self.assert_rejected_mutation(
            lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(offer=other_offer),
            "Referral qualification is invalid",
        )
        other_promotion = PromotionCodeRecord.objects.create(
            code="OTHER-RESERVE", campaign_name="other", discount_amount=Decimal("5.00"),
        )
        self.assert_rejected_mutation(
            lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(promotion_code=other_promotion),
            "Referral qualification is invalid",
        )
        for status in (AlipayWebsitePayment.Status.FAILED, AlipayWebsitePayment.Status.CLOSED):
            with self.subTest(status=status):
                self.assert_rejected_mutation(
                    lambda: AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status),
                    "Referral qualification is invalid",
                )

    def test_rejects_reserved_for_other_payment_and_terminal_participation_statuses(self):
        other = self.make_payment("another-payment")
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(
            status=ReferralParticipation.Status.PAYMENT_RESERVED, qualifying_payment=other,
        )
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "Referral qualification is invalid"):
            self.reserve()
        self.assertEqual(self.snapshot(), before)
        for status in (
            ReferralParticipation.Status.REWARD_PENDING, ReferralParticipation.Status.QUALIFIED,
            ReferralParticipation.Status.DISQUALIFIED, ReferralParticipation.Status.REFUNDED,
        ):
            with self.subTest(status=status):
                self.participation.status = ReferralParticipation.Status.OPEN
                self.participation.qualifying_payment = None
                self.participation.save()
                self.assert_rejected_mutation(
                    lambda: ReferralParticipation.objects.filter(pk=self.participation.pk).update(status=status),
                    "Referral qualification is invalid",
                )

    def test_locks_user_then_participation_then_coupon_and_returns_locked_coupon_relation(self):
        events = []
        from django.db.models.query import QuerySet
        original = QuerySet.select_for_update

        def tracked(queryset, *args, **kwargs):
            events.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracked):
            result = self.reserve()
        self.assertEqual(
            events[:5],
            [get_user_model().__name__, "ReferralParticipation", "UserCoupon", "ReferralCode", "PromotionCodeRecord"],
        )
        self.assertEqual(result.current_coupon.pk, self.coupon.pk)

    def test_rechecks_referral_and_promotion_after_their_locks(self):
        from django.db.models.query import QuerySet

        original = QuerySet.select_for_update

        def deactivate_after_lock(queryset, *args, **kwargs):
            locked = original(queryset, *args, **kwargs)
            if queryset.model is ReferralCode:
                ReferralCode.objects.filter(pk=self.referral.pk).update(is_active=False)
            return locked

        before = self.snapshot()
        with patch.object(QuerySet, "select_for_update", deactivate_after_lock):
            with self.assertRaisesRegex(ValueError, "Referral qualification is invalid"):
                self.reserve()
        self.assertEqual(self.snapshot(), before)

        def drift_after_lock(queryset, *args, **kwargs):
            locked = original(queryset, *args, **kwargs)
            if queryset.model is PromotionCodeRecord:
                PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(
                    minimum_order_amount=Decimal("1.00")
                )
            return locked

        with patch.object(QuerySet, "select_for_update", drift_after_lock):
            with self.assertRaisesRegex(ValueError, "Referral qualification is invalid"):
                self.reserve()
        self.assertEqual(self.snapshot(), before)

    def make_payment(self, order):
        return AlipayWebsitePayment.objects.create(
            merchant_order_no=order, subject="Offer", total_amount=Decimal("54.90"),
        )

    def assert_rejected_mutation(self, mutate, message, **overrides):
        savepoint = transaction.savepoint()
        try:
            mutate()
            before = self.snapshot()
            with self.assertRaisesRegex(ValueError, message):
                self.reserve(**overrides)
            self.assertEqual(self.snapshot(), before)
        finally:
            transaction.savepoint_rollback(savepoint)

    def make_other_offer(self):
        return PurchaseOffer.objects.create(
            code="reservation-other-offer", title="Other", module=self.other_module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )

    def make_other_user_coupon(self):
        other = get_user_model().objects.create_user(telephone="13600139003", password="pass")
        coupon = UserCoupon.objects.create(
            user=other, promotion_code=self.promotion, discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=self.module,
        )
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(coupon=coupon, user=other)
        return coupon

    def replace_current_coupon(self):
        coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=self.promotion, discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=self.module,
        )
        return coupon

    def make_other_referral(self):
        other = PromotionCodeRecord.objects.create(
            code="BK1-OTHER0001", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
        )
        other_referrer = get_user_model().objects.create_user(
            telephone="13600139004", password="pass"
        )
        return ReferralCode.objects.create(
            user=other_referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1", promotion_code=other,
        )
