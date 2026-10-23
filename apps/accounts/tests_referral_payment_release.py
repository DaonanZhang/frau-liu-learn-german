from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralCode,
    ReferralNotice,
    ReferralParticipation,
    ReferralReward,
    UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.promotion_codes import sync_payment_discount_status
from apps.accounts.services.referral_qualification import release_referral_participation_for_payment


@override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
class ReferralPaymentReleaseTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13600139031", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139032", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.offer = PurchaseOffer.objects.create(
            code="release-offer", title="Release", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-RELEASE01", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix, promotion_code=self.promotion,
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="release-order", subject="Offer", total_amount=Decimal("54.90"),
        )
        self.coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=self.promotion,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module, status=UserCoupon.Status.RESERVED,
            reserved_payment=self.payment,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.user, referral_code=self.referral, current_coupon=self.coupon,
            status=ReferralParticipation.Status.PAYMENT_RESERVED,
            qualifying_payment=self.payment, order_created_at=self.payment.created_at,
        )
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=self.coupon, promotion_code=self.promotion,
            user=self.user, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.RESERVED,
        )

    def test_failed_and_closed_release_only_after_discount_release_commit(self):
        for status in (AlipayWebsitePayment.Status.FAILED, AlipayWebsitePayment.Status.CLOSED):
            with self.subTest(status=status):
                self.reset_reservation()
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                with self.captureOnCommitCallbacks(execute=False) as callbacks:
                    sync_payment_discount_status(payment_id=self.payment.pk)
                    self.application.refresh_from_db()
                    self.coupon.refresh_from_db()
                    self.participation.refresh_from_db()
                    self.assertEqual(self.application.status, PaymentDiscountApplication.Status.RELEASED)
                    self.assertEqual(self.coupon.status, UserCoupon.Status.AVAILABLE)
                    self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)
                self.assertEqual(len(callbacks), 1)
                callbacks[0]()
                self.participation.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.OPEN)
                self.assertIsNone(self.participation.qualifying_payment_id)
                self.assertIsNone(self.participation.order_created_at)
                self.assertIsNotNone(self.participation.status_changed_at)
                self.assertEqual(ReferralReward.objects.count(), 0)
                self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_callback_discarded_by_outer_rollback_keeps_reservation(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.FAILED)
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            sync_payment_discount_status(payment_id=self.payment.pk)
        self.assertEqual(len(callbacks), 1)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_late_paid_payment_makes_callback_noop(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.FAILED)
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            sync_payment_discount_status(payment_id=self.payment.pk)
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.PAID)
        callbacks[0]()
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_refund_and_partial_refund_never_schedule_release(self):
        for status in (AlipayWebsitePayment.Status.REFUNDED, AlipayWebsitePayment.Status.PARTIALLY_REFUNDED):
            with self.subTest(status=status):
                self.reset_reservation()
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                with self.captureOnCommitCallbacks(execute=False) as callbacks:
                    sync_payment_discount_status(payment_id=self.payment.pk)
                self.assertEqual(callbacks, [])
                self.participation.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_created_and_pending_service_calls_do_not_release(self):
        for status in (AlipayWebsitePayment.Status.CREATED, AlipayWebsitePayment.Status.PENDING):
            with self.subTest(status=status):
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                self.assertIsNone(release_referral_participation_for_payment(payment_id=self.payment.pk))
                self.participation.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_nonmatching_chains_are_safe_noops(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.FAILED)
        cases = (
            ("missing application", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).delete()),
            ("application not released", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(status=PaymentDiscountApplication.Status.RESERVED)),
            ("coupon unavailable", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(status=UserCoupon.Status.USED, reserved_payment=None)),
            ("coupon still reserved", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(status=UserCoupon.Status.RESERVED, reserved_payment=self.payment)),
            ("wrong current coupon", lambda: ReferralParticipation.objects.filter(pk=self.participation.pk).update(current_coupon=None)),
        )
        for label, mutate in cases:
            with self.subTest(case=label):
                self.reset_reservation()
                mutate()
                self.assertIsNone(release_referral_participation_for_payment(payment_id=self.payment.pk))
                self.participation.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)
                self.assertIsNotNone(self.participation.qualifying_payment_id)
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_ordinary_coupon_and_application_for_another_coupon_do_not_release(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.FAILED)
        ordinary_promotion = PromotionCodeRecord.objects.create(
            code="ORDINARY-RELEASE", campaign_name="ordinary",
            discount_amount=Decimal("1.00"),
        )
        ordinary_coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=ordinary_promotion,
            discount_amount=Decimal("1.00"),
        )
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(coupon=ordinary_coupon)
        self.assertIsNone(release_referral_participation_for_payment(payment_id=self.payment.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_payment_without_candidate_does_not_touch_participation(self):
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(qualifying_payment=None)
        self.assertIsNone(release_referral_participation_for_payment(payment_id=self.payment.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)

    def test_repeated_release_callback_is_idempotent(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.FAILED)
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            sync_payment_discount_status(payment_id=self.payment.pk)
        callbacks[0]()
        released = ReferralParticipation.objects.get(pk=self.participation.pk)
        self.assertEqual(released.status, ReferralParticipation.Status.OPEN)
        self.assertIsNone(release_referral_participation_for_payment(payment_id=self.payment.pk))
        released.refresh_from_db()
        self.assertEqual(released.status, ReferralParticipation.Status.OPEN)

    def test_release_locks_and_revalidates_user_payment_participation_coupon(self):
        from django.db.models.query import QuerySet

        original = QuerySet.select_for_update
        events = []

        def tracked(queryset, *args, **kwargs):
            events.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.FAILED)
        with patch.object(QuerySet, "select_for_update", tracked):
            release_referral_participation_for_payment(payment_id=self.payment.pk)
        self.assertEqual(events[:4], [get_user_model().__name__, "AlipayWebsitePayment", "ReferralParticipation", "UserCoupon"])

    def reset_reservation(self):
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(status=PaymentDiscountApplication.Status.RESERVED)
        UserCoupon.objects.filter(pk=self.coupon.pk).update(
            status=UserCoupon.Status.RESERVED, reserved_payment=self.payment, used_payment=None,
        )
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(
            status=ReferralParticipation.Status.PAYMENT_RESERVED,
            qualifying_payment=self.payment, order_created_at=self.payment.created_at,
        )
