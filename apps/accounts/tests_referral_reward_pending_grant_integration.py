from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.db.models.query import QuerySet
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
from apps.accounts.services.entitlement_grant_service import ExistingLifetimeAccessError
from apps.accounts.services.payment_grant_service import process_payment_grant_task_by_id
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN


class ReferralRewardPaymentGrantIntegrationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13600139021", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139022", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.offer = PurchaseOffer.objects.create(
            code="grant-referral-offer", title="Referral offer", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="grant-referral-order", subject="Referral offer",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
            paid_at=timezone.now(),
        )
        self.task = PaymentGrantTask.objects.create(
            payment=self.payment, offer=self.offer, user=self.buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1,
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-GRANT001", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
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
        self.coupon = UserCoupon.objects.create(
            user=self.buyer, promotion_code=self.promotion, discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=self.module,
            status=UserCoupon.Status.USED, used_payment=self.payment,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=self.buyer,
            referral_code=self.referral, current_coupon=self.coupon,
            qualifying_payment=self.payment, status=ReferralParticipation.Status.PAYMENT_RESERVED,
            order_created_at=self.payment.created_at,
        )
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=self.coupon, promotion_code=self.promotion,
            user=self.buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED,
        )

    def _entitlement(self):
        return Entitlement.objects.filter(
            external_ref=f"alipay_payment:{self.payment.merchant_order_no}"
        )

    @patch("apps.accounts.services.payment_grant_service.mark_referral_reward_pending")
    def test_paid_marker_sees_processing_task_and_new_entitlement(self, marker):
        from apps.accounts.services.referral_qualification import mark_referral_reward_pending

        def mark(*, payment_grant_task):
            self.assertEqual(payment_grant_task.status, PaymentGrantTask.Status.PROCESSING)
            self.assertEqual(PaymentGrantTask.objects.get(pk=self.task.pk).status, PaymentGrantTask.Status.PROCESSING)
            self.assertTrue(self._entitlement().exists())
            return mark_referral_reward_pending(payment_grant_task=payment_grant_task)

        marker.side_effect = mark
        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        marker.assert_called_once()
        self.participation.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.participation.order_created_at, self.payment.created_at)
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
        self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)
    def test_partially_refunded_payment_is_granted_and_marked(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED
        )
        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        self.assertTrue(self._entitlement().exists())
        self.participation.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
        self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)
    def test_unconfirmed_or_fully_refunded_payments_fail_without_marking(self):
        for status in (
            AlipayWebsitePayment.Status.REFUNDED, AlipayWebsitePayment.Status.FAILED,
            AlipayWebsitePayment.Status.CLOSED, AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
        ):
            with self.subTest(status=status):
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                with patch("apps.accounts.services.payment_grant_service.mark_referral_reward_pending") as marker:
                    with self.assertRaises(ValueError):
                        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                marker.assert_not_called()
                self.assertFalse(self._entitlement().exists())
                self.participation.refresh_from_db()
                self.task.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)
                self.assertEqual(self.task.status, PaymentGrantTask.Status.FAILED)
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=AlipayWebsitePayment.Status.PAID)
                PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=PaymentGrantTask.Status.PENDING)

    def test_grant_failure_skips_marker_and_retry_completes_once(self):
        with patch("apps.accounts.services.payment_grant_service.mark_referral_reward_pending") as marker, patch(
            "apps.accounts.services.payment_grant_service.grant_or_extend_entitlement",
            side_effect=ValueError("grant failed"),
        ):
            with self.assertRaises(ValueError):
                process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        marker.assert_not_called()
        self.assertFalse(self._entitlement().exists())
        self.participation.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)
        self.assertEqual(self.task.status, PaymentGrantTask.Status.FAILED)
        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        self.assertEqual(self._entitlement().count(), 1)
        self.participation.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
        self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)

    def test_covering_lifetime_added_after_order_cancels_but_marks_referral(self):
        order_created_at = timezone.now() - timezone.timedelta(days=1)
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(created_at=order_created_at)
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(
            order_created_at=order_created_at
        )
        self.payment.refresh_from_db()
        Entitlement.objects.create(
            user=self.buyer, module=self.module, plan=Entitlement.Plan.LIFETIME,
        )
        from apps.accounts.services.referral_qualification import mark_referral_reward_pending
        with patch(
            "apps.accounts.services.payment_grant_service.mark_referral_reward_pending",
            wraps=mark_referral_reward_pending,
        ) as marker:
            process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        marker.assert_called_once()
        self.assertIsNotNone(marker.return_value)
        self.assertEqual(self._entitlement().count(), 0)
        self.participation.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
        self.assertEqual(self.task.status, PaymentGrantTask.Status.CANCELED)

    def test_pre_order_timed_or_inactive_access_does_not_block_paid_grant(self):
        for status in (Entitlement.Status.ACTIVE, Entitlement.Status.EXPIRED, Entitlement.Status.CANCELED):
            with self.subTest(status=status):
                entitlement = Entitlement.objects.create(
                    user=self.buyer, module=self.module, plan=Entitlement.Plan.MONTH_1,
                    status=status,
                    expires_at=(timezone.now() + timezone.timedelta(days=1)
                                if status == Entitlement.Status.ACTIVE
                                else timezone.now() - timezone.timedelta(days=1)),
                )
                Entitlement.objects.filter(pk=entitlement.pk).update(
                    created_at=self.payment.created_at - timezone.timedelta(seconds=1)
                )
                process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                self.assertTrue(self._entitlement().exists())
                self.participation.refresh_from_db()
                self.task.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.DISQUALIFIED)
                self.assertEqual(self.participation.last_error, "Referral reward qualification is invalid")
                self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)
                self.assertEqual(Entitlement.objects.filter(user=self.buyer).count(), 2)
                Entitlement.objects.exclude(external_ref=f"alipay_payment:{self.payment.merchant_order_no}").delete()
                ReferralParticipation.objects.filter(pk=self.participation.pk).update(
                    status=ReferralParticipation.Status.PAYMENT_RESERVED, last_error=""
                )
                PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=PaymentGrantTask.Status.PENDING)

    def test_pre_order_lifetime_disqualifies_and_cancels_grant(self):
        entitlement = Entitlement.objects.create(
            user=self.buyer, module=self.module, plan=Entitlement.Plan.LIFETIME,
        )
        Entitlement.objects.filter(pk=entitlement.pk).update(
            created_at=self.payment.created_at - timezone.timedelta(seconds=1)
        )
        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        self.assertFalse(self._entitlement().exists())
        self.participation.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.DISQUALIFIED)
        self.assertEqual(self.participation.last_error, "Referral reward qualification is invalid")
        self.assertEqual(self.task.status, PaymentGrantTask.Status.CANCELED)

    def test_invalid_chain_can_disqualify_without_blocking_grant(self):
        PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(
            source_kind=PromotionCodeRecord.SourceKind.OPERATIONAL
        )
        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        self.assertTrue(self._entitlement().exists())
        self.participation.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.DISQUALIFIED)
        self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)

    def test_marker_database_or_value_error_rolls_back_grant_and_retry_succeeds(self):
        for error in (ValueError("marker invalid"), DatabaseError("marker unavailable")):
            with self.subTest(error=type(error).__name__):
                with patch(
                    "apps.accounts.services.payment_grant_service.mark_referral_reward_pending",
                    side_effect=error,
                ):
                    with self.assertRaises(type(error)):
                        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                self.assertFalse(self._entitlement().exists())
                self.participation.refresh_from_db()
                self.task.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)
                self.assertEqual(self.task.status, PaymentGrantTask.Status.FAILED)
                process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                self.assertEqual(self._entitlement().count(), 1)
                self.participation.refresh_from_db()
                self.task.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
                self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)
                Entitlement.objects.filter(external_ref=f"alipay_payment:{self.payment.merchant_order_no}").delete()
                ReferralParticipation.objects.filter(pk=self.participation.pk).update(
                    status=ReferralParticipation.Status.PAYMENT_RESERVED
                )
                PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=PaymentGrantTask.Status.PENDING)

    def test_buyer_task_payment_are_first_lock_prefix(self):
        events = []
        original = QuerySet.select_for_update

        def tracked(queryset, *args, **kwargs):
            events.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracked):
            process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        self.assertEqual(events[:3], [get_user_model().__name__, "PaymentGrantTask", "AlipayWebsitePayment"])

    def test_non_referral_grant_still_succeeds_and_marker_is_noop(self):
        ReferralParticipation.objects.all().delete()
        with patch("apps.accounts.services.payment_grant_service.mark_referral_reward_pending") as marker:
            marker.return_value = None
            process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        marker.assert_called_once()
        self.assertTrue(self._entitlement().exists())
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)
