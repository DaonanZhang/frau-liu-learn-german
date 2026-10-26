from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    PaymentDiscountApplication,
    PaymentGrantTask,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralCode,
    ReferralParticipation,
    UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.tasks import reconcile_alipay_payments_now


class ReferralRefundTaskSelectionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.referrer = User.objects.create_user(
            telephone="13670139100", password="pass"
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-TASKSELECT",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"),
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix,
            promotion_code=self.promotion,
        )
        self.sequence = 0

    def make_participation(
        self,
        *,
        status=AlipayWebsitePayment.Status.REFUNDED,
        refunded_amount=Decimal("54.90"),
        refunded_at=True,
        campaign_tag=None,
        refund_reconciled_at=None,
    ):
        self.sequence += 1
        buyer = get_user_model().objects.create_user(
            telephone=f"13670139{self.sequence + 100:03d}", password="pass"
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"refund-task-{self.sequence}",
            subject="Referral refund",
            total_amount=Decimal("54.90"),
            status=status,
            refunded_amount=refunded_amount,
            refunded_at=timezone.now() if refunded_at else None,
        )
        participation = ReferralParticipation.objects.create(
            campaign_tag=campaign_tag or FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=buyer,
            referral_code=self.referral,
            qualifying_payment=payment,
            status=ReferralParticipation.Status.REWARD_PENDING,
            order_created_at=payment.created_at,
            refund_reconciled_at=refund_reconciled_at,
        )
        return payment, participation

    def reconciliation(self):
        from apps.accounts import tasks

        operation = getattr(tasks, "reconcile_referral_refunds_now", None)
        self.assertTrue(callable(operation), "reconcile_referral_refunds_now is missing")
        return operation

    def test_filters_non_campaign_nonfull_missing_timestamp_and_existing_marker(self):
        eligible_payment, eligible = self.make_participation()
        self.make_participation(status=AlipayWebsitePayment.Status.PAID)
        self.make_participation(refunded_amount=Decimal("10.00"))
        self.make_participation(refunded_at=False)
        self.make_participation(campaign_tag="another-campaign")
        self.make_participation(refund_reconciled_at=timezone.now())
        AlipayWebsitePayment.objects.create(
            merchant_order_no="ordinary-refund",
            subject="Ordinary refund",
            total_amount=Decimal("10.00"),
            status=AlipayWebsitePayment.Status.REFUNDED,
            refunded_amount=Decimal("10.00"),
            refunded_at=timezone.now(),
        )

        with patch(
            "apps.accounts.services.referral_refunds.reconcile_referral_refund",
            return_value=SimpleNamespace(changed=True),
        ) as reconcile:
            stats = self.reconciliation()(limit=100)

        reconcile.assert_called_once_with(payment_id=eligible_payment.pk)
        self.assertEqual(
            stats,
            {
                "referral_refunds_reconciled": 1,
                "referral_refunds_deferred": 0,
                "referral_refunds_failed": 0,
            },
        )
        eligible.refresh_from_db()
        self.assertIsNone(eligible.refund_reconciled_at)

    def test_mismatched_referral_code_campaign_is_not_a_candidate(self):
        _, participation = self.make_participation()
        ReferralCode.objects.filter(pk=self.referral.pk).update(
            campaign_tag="another-campaign"
        )
        original_updated_at = participation.updated_at

        stats = self.reconciliation()(limit=100)

        participation.refresh_from_db()
        self.assertEqual(
            stats,
            {
                "referral_refunds_reconciled": 0,
                "referral_refunds_deferred": 0,
                "referral_refunds_failed": 0,
            },
        )
        self.assertEqual(participation.updated_at, original_updated_at)

    def test_limit_oldest_first_and_deferred_rows_rotate(self):
        rows = [self.make_participation() for _ in range(4)]
        base = timezone.now() - timedelta(minutes=5)
        for index, (_, participation) in enumerate(rows):
            ReferralParticipation.objects.filter(pk=participation.pk).update(
                updated_at=base + timedelta(seconds=index)
            )
        seen = []

        def defer(*, payment_id):
            seen.append(payment_id)
            return SimpleNamespace(changed=False)

        with patch(
            "apps.accounts.services.referral_refunds.reconcile_referral_refund",
            side_effect=defer,
        ):
            first = self.reconciliation()(limit=2)
            second = self.reconciliation()(limit=2)

        self.assertEqual(seen[:2], [payment.pk for payment, _ in rows[:2]])
        self.assertEqual(seen[2:], [payment.pk for payment, _ in rows[2:]])
        self.assertEqual(first["referral_refunds_deferred"], 2)
        self.assertEqual(second["referral_refunds_deferred"], 2)

    def test_one_failure_does_not_block_later_rows_or_write_a_fake_marker(self):
        first_payment, first_participation = self.make_participation()
        second_payment, _ = self.make_participation()
        seen = []

        def reconcile(*, payment_id):
            seen.append(payment_id)
            if payment_id == first_payment.pk:
                raise ValueError("invalid referral chain")
            return SimpleNamespace(changed=True)

        with patch(
            "apps.accounts.services.referral_refunds.reconcile_referral_refund",
            side_effect=reconcile,
        ):
            stats = self.reconciliation()(limit=100)

        self.assertEqual(seen, [first_payment.pk, second_payment.pk])
        self.assertEqual(stats["referral_refunds_reconciled"], 1)
        self.assertEqual(stats["referral_refunds_failed"], 1)
        first_participation.refresh_from_db()
        self.assertIsNone(first_participation.refund_reconciled_at)

    def test_failed_rows_rotate_so_later_rows_are_not_starved(self):
        rows = [self.make_participation() for _ in range(4)]
        base = timezone.now() - timedelta(minutes=5)
        for index, (_, participation) in enumerate(rows):
            ReferralParticipation.objects.filter(pk=participation.pk).update(
                updated_at=base + timedelta(seconds=index)
            )
        seen = []

        def fail(*, payment_id):
            seen.append(payment_id)
            raise RuntimeError("retry later")

        with patch(
            "apps.accounts.services.referral_refunds.reconcile_referral_refund",
            side_effect=fail,
        ):
            first = self.reconciliation()(limit=2)
            second = self.reconciliation()(limit=2)

        self.assertEqual(seen[:2], [payment.pk for payment, _ in rows[:2]])
        self.assertEqual(seen[2:], [payment.pk for payment, _ in rows[2:]])
        self.assertEqual(first["referral_refunds_failed"], 2)
        self.assertEqual(second["referral_refunds_failed"], 2)

    def test_alipay_reconciliation_merges_refund_counters(self):
        pending = {
            "referral_processed": 0,
            "referral_disqualified": 0,
            "referral_deferred": 0,
            "referral_failed": 0,
        }
        refunds = {
            "referral_refunds_reconciled": 2,
            "referral_refunds_deferred": 1,
            "referral_refunds_failed": 3,
        }
        with patch(
            "apps.accounts.views.payment._query_and_sync_payment_status"
        ), patch(
            "apps.accounts.tasks.reconcile_pending_referrals_now", return_value=pending
        ), patch(
            "apps.accounts.tasks.reconcile_referral_refunds_now", return_value=refunds
        ) as reconcile:
            stats = reconcile_alipay_payments_now(limit=7)

        reconcile.assert_called_once_with(limit=7)
        for key, value in refunds.items():
            self.assertEqual(stats[key], value)


class ReferralRefundTaskRealReconciliationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13670239101", password="pass")
        self.referrer = User.objects.create_user(telephone="13670239102", password="pass")
        module = Module.objects.get(key="exam_preparation")
        offer = PurchaseOffer.objects.create(
            code="refund-task-real",
            title="Refund task real",
            module=module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("59.90"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="refund-task-real",
            subject="Referral refund",
            total_amount=Decimal("54.90"),
            status=AlipayWebsitePayment.Status.REFUNDED,
            refunded_amount=Decimal("54.90"),
            refunded_at=timezone.now(),
        )
        PaymentGrantTask.objects.create(
            payment=self.payment,
            offer=offer,
            user=self.buyer,
            module=module,
            plan=Entitlement.Plan.MONTH_1,
            status=PaymentGrantTask.Status.SUCCEEDED,
        )
        promotion = PromotionCodeRecord.objects.create(
            code="BK1-TASKREAL01",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        referral = ReferralCode.objects.create(
            user=self.referrer,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix,
            promotion_code=promotion,
            is_active=False,
        )
        coupon = UserCoupon.objects.create(
            user=self.buyer,
            promotion_code=promotion,
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=module,
            status=UserCoupon.Status.USED,
            used_payment=self.payment,
            used_at=timezone.now(),
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.buyer,
            referral_code=referral,
            current_coupon=coupon,
            qualifying_payment=self.payment,
            status=ReferralParticipation.Status.REWARD_PENDING,
            order_created_at=self.payment.created_at,
        )
        PaymentDiscountApplication.objects.create(
            payment=self.payment,
            coupon=coupon,
            promotion_code=promotion,
            user=self.buyer,
            offer=offer,
            original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"),
            final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.REFUNDED,
            applied_at=timezone.now(),
            refunded_at=self.payment.refunded_at,
        )

    def test_real_reconciliation_writes_marker_and_replay_is_not_selected(self):
        from apps.accounts.tasks import reconcile_referral_refunds_now

        first = reconcile_referral_refunds_now(limit=100)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertIsNotNone(self.participation.refund_reconciled_at)
        self.assertEqual(first["referral_refunds_reconciled"], 1)

        second = reconcile_referral_refunds_now(limit=100)
        self.assertEqual(
            second,
            {
                "referral_refunds_reconciled": 0,
                "referral_refunds_deferred": 0,
                "referral_refunds_failed": 0,
            },
        )
