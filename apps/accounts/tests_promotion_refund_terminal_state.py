from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralNotice,
    ReferralParticipation,
    ReferralReward,
    UserCoupon,
)
from apps.accounts.services.promotion_codes import sync_payment_discount_status


class PromotionRefundTerminalStateTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13600139041", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.offer = PurchaseOffer.objects.create(
            code="refund-terminal-offer",
            title="Refund terminal",
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("59.90"),
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="REFUND-TERMINAL",
            campaign_name="refund terminal",
            discount_amount=Decimal("5.00"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="refund-terminal-order",
            subject="Offer",
            total_amount=Decimal("54.90"),
        )
        self.coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=self.promotion,
            discount_amount=Decimal("5.00"),
            status=UserCoupon.Status.RESERVED,
            reserved_payment=self.payment,
            reserved_at=timezone.now(),
        )
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment,
            coupon=self.coupon,
            promotion_code=self.promotion,
            user=self.user,
            offer=self.offer,
            original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"),
            final_amount=Decimal("54.90"),
        )

    def set_payment_status(self, status, *, paid_at=None, refunded_at=None):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=status, paid_at=paid_at, refunded_at=refunded_at
        )

    def test_reserved_application_and_coupon_become_terminal_on_refund(self):
        paid_at = timezone.now() - timedelta(hours=2)
        refunded_at = timezone.now() - timedelta(hours=1)
        self.set_payment_status(
            AlipayWebsitePayment.Status.REFUNDED,
            paid_at=paid_at,
            refunded_at=refunded_at,
        )

        sync_payment_discount_status(payment_id=self.payment.pk)

        self.application.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual(self.application.status, PaymentDiscountApplication.Status.REFUNDED)
        self.assertEqual(self.application.applied_at, paid_at)
        self.assertEqual(self.application.refunded_at, refunded_at)
        self.assertEqual(self.coupon.status, UserCoupon.Status.USED)
        self.assertIsNone(self.coupon.reserved_payment_id)
        self.assertIsNone(self.coupon.reserved_at)
        self.assertEqual(self.coupon.used_payment_id, self.payment.pk)
        self.assertEqual(self.coupon.used_at, paid_at)

    def test_paid_then_refunded_preserves_applied_and_used_times(self):
        paid_at = timezone.now() - timedelta(hours=2)
        self.set_payment_status(AlipayWebsitePayment.Status.PAID, paid_at=paid_at)
        sync_payment_discount_status(payment_id=self.payment.pk)
        self.application.refresh_from_db()
        self.coupon.refresh_from_db()
        applied_at = self.application.applied_at
        used_at = self.coupon.used_at

        refunded_at = timezone.now()
        self.set_payment_status(
            AlipayWebsitePayment.Status.REFUNDED,
            paid_at=paid_at,
            refunded_at=refunded_at,
        )
        sync_payment_discount_status(payment_id=self.payment.pk)

        self.application.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual(self.application.status, PaymentDiscountApplication.Status.REFUNDED)
        self.assertEqual(self.application.applied_at, applied_at)
        self.assertEqual(self.application.refunded_at, refunded_at)
        self.assertEqual(self.coupon.used_at, used_at)

    def test_refunded_replay_preserves_all_terminal_fields(self):
        self.set_payment_status(
            AlipayWebsitePayment.Status.REFUNDED,
            paid_at=timezone.now() - timedelta(hours=2),
            refunded_at=timezone.now() - timedelta(hours=1),
        )
        sync_payment_discount_status(payment_id=self.payment.pk)
        self.application.refresh_from_db()
        self.coupon.refresh_from_db()
        application_times = (self.application.applied_at, self.application.refunded_at)
        coupon_state = (
            self.coupon.used_payment_id,
            self.coupon.used_at,
            self.coupon.reserved_payment_id,
            self.coupon.reserved_at,
        )

        sync_payment_discount_status(payment_id=self.payment.pk)

        self.application.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual((self.application.applied_at, self.application.refunded_at), application_times)
        self.assertEqual(
            (
                self.coupon.used_payment_id,
                self.coupon.used_at,
                self.coupon.reserved_payment_id,
                self.coupon.reserved_at,
            ),
            coupon_state,
        )

    def test_failed_and_closed_release_without_referral_side_effects(self):
        for status in (AlipayWebsitePayment.Status.FAILED, AlipayWebsitePayment.Status.CLOSED):
            with self.subTest(status=status):
                self.set_payment_status(status)
                sync_payment_discount_status(payment_id=self.payment.pk)
                self.application.refresh_from_db()
                self.coupon.refresh_from_db()
                self.assertEqual(self.application.status, PaymentDiscountApplication.Status.RELEASED)
                self.assertEqual(self.coupon.status, UserCoupon.Status.AVAILABLE)
                self.assertIsNone(self.coupon.reserved_payment_id)
                self.assertIsNone(self.coupon.reserved_at)
                self.assertNotEqual(self.coupon.status, UserCoupon.Status.USED)
                self.assertEqual(ReferralReward.objects.count(), 0)
                self.assertEqual(ReferralNotice.objects.count(), 0)
                self.assertEqual(ReferralParticipation.objects.count(), 0)
                self.application.status = PaymentDiscountApplication.Status.RESERVED
                self.application.save(update_fields=["status"])
                self.coupon.status = UserCoupon.Status.RESERVED
                self.coupon.reserved_payment = self.payment
                self.coupon.reserved_at = timezone.now()
                self.coupon.save(update_fields=["status", "reserved_payment", "reserved_at"])

    def test_refund_does_not_consume_coupon_reserved_for_another_payment(self):
        other_payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="refund-terminal-other-order",
            subject="Other offer",
            total_amount=Decimal("54.90"),
        )
        reserved_at = timezone.now()
        UserCoupon.objects.filter(pk=self.coupon.pk).update(
            status=UserCoupon.Status.RESERVED,
            reserved_payment=other_payment,
            reserved_at=reserved_at,
        )
        self.set_payment_status(
            AlipayWebsitePayment.Status.REFUNDED,
            paid_at=timezone.now() - timedelta(hours=2),
            refunded_at=timezone.now() - timedelta(hours=1),
        )

        sync_payment_discount_status(payment_id=self.payment.pk)

        self.coupon.refresh_from_db()
        self.assertEqual(self.coupon.status, UserCoupon.Status.RESERVED)
        self.assertEqual(self.coupon.reserved_payment_id, other_payment.pk)
        self.assertEqual(self.coupon.reserved_at, reserved_at)
        self.assertIsNone(self.coupon.used_payment_id)
        self.assertIsNone(self.coupon.used_at)
