from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from django.db.models.query import QuerySet

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, PaymentDiscountApplication,
    PaymentGrantTask, PromotionCodeRecord, PurchaseOffer, ReferralCode,
    ReferralNotice, ReferralParticipation, ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services import referral_refunds
from apps.accounts.services.referral_qualification import process_referral_reward_pending


class ReferralRefundReconciliationTests(TestCase):
    def reconcile(self):
        operation = getattr(referral_refunds, "reconcile_referral_refund", None)
        self.assertTrue(callable(operation), "reconcile_referral_refund is not implemented")
        return operation

    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13600139101", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139102", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.offer = PurchaseOffer.objects.create(
            code="refund-offer", title="Refund offer", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="refund-order", subject="Offer",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
        )
        PaymentGrantTask.objects.create(
            payment=self.payment, offer=self.offer, user=self.buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1, status=PaymentGrantTask.Status.SUCCEEDED,
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-REFUND001", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
            status=PromotionCodeRecord.Status.ACTIVE,
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix,
            promotion_code=self.promotion, is_active=False,
        )
        self.coupon = UserCoupon.objects.create(
            user=self.buyer, promotion_code=self.promotion,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module, status=UserCoupon.Status.USED,
            used_payment=self.payment, used_at=timezone.now(),
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=self.buyer,
            referral_code=self.referral, current_coupon=self.coupon,
            qualifying_payment=self.payment,
            status=ReferralParticipation.Status.REWARD_PENDING,
            order_created_at=self.payment.created_at,
        )
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=self.coupon, promotion_code=self.promotion,
            user=self.buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED, applied_at=timezone.now(),
        )

    def full_refund(self):
        when = timezone.now()
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.REFUNDED,
            refunded_amount=Decimal("54.90"), refunded_at=when,
        )
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(
            status=PaymentDiscountApplication.Status.REFUNDED, refunded_at=when,
        )
        return when

    def test_non_refunded_payment_is_a_non_mutating_noop(self):
        before = (self.participation.status, self.participation.updated_at,
                  ReferralNotice.objects.count(), ReferralReward.objects.count())
        result = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertFalse(result.changed)
        self.assertEqual((self.participation.status, self.participation.updated_at,
                          ReferralNotice.objects.count(), ReferralReward.objects.count()), before)

    def test_all_non_refunded_states_are_noops(self):
        for status in (
            AlipayWebsitePayment.Status.CREATED, AlipayWebsitePayment.Status.PENDING,
            AlipayWebsitePayment.Status.PAID, AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            AlipayWebsitePayment.Status.FAILED, AlipayWebsitePayment.Status.CLOSED,
        ):
            with self.subTest(status=status):
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                before = (self.participation.status, self.participation.updated_at,
                          ReferralNotice.objects.count(), ReferralReward.objects.count())
                result = self.reconcile()(payment_id=self.payment.pk)
                self.participation.refresh_from_db()
                self.assertFalse(result.changed)
                self.assertEqual((self.participation.status, self.participation.updated_at,
                                  ReferralNotice.objects.count(), ReferralReward.objects.count()), before)

    def test_pending_participation_becomes_refunded_without_reward_or_notice(self):
        when = self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertTrue(result.changed)
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertEqual(self.participation.refunded_at, when)
        self.assertEqual(self.participation.refund_reconciled_at, when)
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_refund_marker_makes_replay_exactly_once(self):
        self.full_refund()
        first = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        changed_at = self.participation.status_changed_at
        second = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertTrue(first.changed)
        self.assertFalse(second.changed)
        self.assertEqual(self.participation.status_changed_at, changed_at)

    def test_partial_then_full_refund_reconciles_only_on_full_refund(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            refunded_amount=Decimal("10.00"),
        )
        self.assertFalse(self.reconcile()(payment_id=self.payment.pk).changed)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
        self.full_refund()
        self.assertTrue(self.reconcile()(payment_id=self.payment.pk).changed)

    def test_full_refund_locks_referrer_before_payment(self):
        self.full_refund()
        seen = []
        original = QuerySet.select_for_update

        def tracked(queryset, *args, **kwargs):
            seen.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracked):
            self.reconcile()(payment_id=self.payment.pk)
        self.assertEqual(seen[:4], [
            get_user_model().__name__, "AlipayWebsitePayment", "ReferralParticipation",
            "PaymentDiscountApplication",
        ])

    def test_campaign_chain_corruption_fails_without_writes(self):
        self.full_refund()
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(
            promotion_discount_amount=Decimal("6.00"),
        )
        before = (self.participation.status, self.participation.updated_at,
                  ReferralNotice.objects.count(), ReferralReward.objects.count())
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertEqual((self.participation.status, self.participation.updated_at,
                          ReferralNotice.objects.count(), ReferralReward.objects.count()), before)

    def test_refund_before_delayed_worker_cannot_restore_progress(self):
        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertEqual(ReferralReward.objects.count(), 0)

    def test_qualified_refund_revokes_month_and_reconciles_once(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.QUALIFIED)
        self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        reward = ReferralReward.objects.get(
            participation=self.participation, kind=ReferralReward.Kind.REFERRAL_MONTH,
        )
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        self.assertTrue(result.progress_removed)
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertEqual(reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(notice.user_id, self.referrer.pk)
        self.assertTrue(notice.is_global_notice)
        self.assertIsNone(notice.acknowledged_at)
        self.assertEqual(set(notice.payload), {
            "progress_removed", "days_removed", "access_expires_at",
        })
        self.assertTrue(notice.payload["progress_removed"])
        self.assertEqual(ReferralNotice.objects.filter(event_type="referral_refunded").count(), 1)
        self.assertFalse(self.reconcile()(payment_id=self.payment.pk).changed)
        self.assertEqual(ReferralNotice.objects.filter(event_type="referral_refunded").count(), 1)

