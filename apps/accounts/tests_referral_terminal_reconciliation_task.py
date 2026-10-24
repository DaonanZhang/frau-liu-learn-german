from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, PaymentDiscountApplication, PromotionCodeRecord,
    PurchaseOffer, ReferralCode, ReferralParticipation, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.promotion_codes import sync_payment_discount_status
from apps.accounts.tasks import reconcile_referral_terminal_states_now


class ReferralTerminalReconciliationTaskTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(telephone="13600209901", password="x")
        module, _ = Module.objects.get_or_create(key="exam_preparation", defaults={"name": "Exam preparation"})
        self.offer = PurchaseOffer.objects.create(
            code="terminal-reconcile", title="Terminal", module=module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("10"),
        )
        promo = PromotionCodeRecord.objects.create(
            code="BK1-TERMINAL-RECON", campaign_name="备考季推广",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            discount_amount=Decimal("5"), minimum_order_amount=Decimal("0"),
            applicable_module=module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        self.code = ReferralCode.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1", promotion_code=promo,
        )

    def make_chain(self, status):
        referred = get_user_model().objects.create_user(
            telephone=f"1360020{ReferralParticipation.objects.count():04d}", password="x",
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"terminal-reconcile-{payment_status_slug(status)}",
            subject="Terminal", total_amount=Decimal("5"), status=status,
        )
        coupon = UserCoupon.objects.create(
            user=referred, promotion_code=self.code.promotion_code,
            discount_amount=Decimal("5"), minimum_order_amount=Decimal("0"),
            applicable_module=self.offer.module, status=UserCoupon.Status.RESERVED,
            reserved_payment=payment,
        )
        application = PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=self.code.promotion_code,
            user=referred, offer=self.offer, original_amount=Decimal("10"),
            promotion_discount_amount=Decimal("5"), final_amount=Decimal("5"),
        )
        participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=referred, referral_code=self.code,
            qualifying_payment=payment,
            status=ReferralParticipation.Status.PAYMENT_RESERVED,
            current_coupon=coupon,
            order_created_at=payment.created_at,
        )
        return payment, participation, coupon, application

    def test_failed_and_closed_reservations_release_and_replay_is_empty(self):
        for status in (AlipayWebsitePayment.Status.FAILED, AlipayWebsitePayment.Status.CLOSED):
            payment, participation, coupon, application = self.make_chain(status)
            with patch("apps.accounts.services.promotion_codes.transaction.on_commit") as on_commit:
                sync_payment_discount_status(payment_id=payment.pk)
            on_commit.assert_called_once()
            participation.refresh_from_db()
            coupon.refresh_from_db()
            application.refresh_from_db()
            self.assertEqual(participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)
            self.assertEqual(coupon.status, UserCoupon.Status.AVAILABLE)
            self.assertEqual(application.status, PaymentDiscountApplication.Status.RELEASED)

            first = reconcile_referral_terminal_states_now()
            second = reconcile_referral_terminal_states_now()
            self.assertEqual(first["referral_terminal_processed"], 1)
            self.assertEqual(second["referral_terminal_processed"], 0)
            self.assertEqual(second["referral_terminal_failed"], 0)
            participation.refresh_from_db()
            self.assertEqual(participation.status, ReferralParticipation.Status.OPEN)
            self.assertIsNone(participation.qualifying_payment_id)
            self.assertIsNone(participation.order_created_at)

    def test_paid_and_partial_refunded_reservations_are_not_released(self):
        for status in (AlipayWebsitePayment.Status.PAID, AlipayWebsitePayment.Status.PARTIALLY_REFUNDED):
            _payment, participation, _coupon, _application = self.make_chain(status)
            stats = reconcile_referral_terminal_states_now()
            self.assertEqual(stats["referral_terminal_processed"], 0)
            participation.refresh_from_db()
            self.assertEqual(participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)


def payment_status_slug(status):
    return str(status).lower().replace(" ", "-")
