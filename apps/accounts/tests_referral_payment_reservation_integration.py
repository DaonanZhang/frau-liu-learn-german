from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

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


@override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=False)
class ReferralPaymentReservationIntegrationTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13600139101", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139102", password="pass")
        self.exam_module, _ = Module.objects.get_or_create(
            key="exam_preparation", defaults={"name": "Exam Preparation", "is_active": True},
        )
        self.video_module, _ = Module.objects.get_or_create(
            key="learning_by_video", defaults={"name": "Learning by Video", "is_active": True},
        )
        self.offer = PurchaseOffer.objects.create(
            code="referral-payment-exam", title="Exam", module=self.exam_module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"), currency="CNY",
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-PAYMENT01", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.exam_module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix, promotion_code=self.promotion,
        )
        self.client.force_authenticate(user=self.user)
        self.alipay = Mock()
        self.alipay.build_page_pay_url.return_value = "https://alipay.test/pay"

    def add_coupon(self):
        coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=self.promotion,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.exam_module,
        )
        ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.user, referral_code=self.referral, current_coupon=coupon,
        )
        return coupon

    def purchase(self, key="00000000-0000-4000-8000-000000000201", **data):
        payload = {"offer_code": self.offer.code, "idempotency_key": key, **data}
        with patch("apps.accounts.views.payment.get_alipay_service", return_value=self.alipay):
            return self.client.post("/api/accounts/payments/alipay/create/", payload, format="json")

    def test_explicit_referral_coupon_reserves_participation_and_stacks_price(self):
        Entitlement.objects.create(
            user=self.user, module=self.video_module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        coupon = self.add_coupon()

        response = self.purchase(coupon_id=coupon.pk)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["amount"], "46.90")
        payment = AlipayWebsitePayment.objects.get(pk=response.data["payment_id"])
        application = PaymentDiscountApplication.objects.get(payment=payment)
        self.assertEqual(application.automatic_discount_amount, Decimal("8.00"))
        self.assertEqual(application.promotion_discount_amount, Decimal("5.00"))
        self.assertEqual(application.final_amount, Decimal("46.90"))
        coupon.refresh_from_db()
        participation = ReferralParticipation.objects.get(referred_user=self.user)
        self.assertEqual(coupon.status, UserCoupon.Status.RESERVED)
        self.assertEqual(coupon.reserved_payment_id, payment.pk)
        self.assertEqual(participation.status, ReferralParticipation.Status.PAYMENT_RESERVED)
        self.assertEqual(participation.qualifying_payment_id, payment.pk)
        self.assertEqual(participation.order_created_at, payment.created_at)

    def test_automatic_coupon_selection_reserves_referral(self):
        self.add_coupon()
        response = self.purchase()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            ReferralParticipation.objects.get(referred_user=self.user).status,
            ReferralParticipation.Status.PAYMENT_RESERVED,
        )

    def test_use_coupon_false_does_not_bind_referral(self):
        self.add_coupon()
        response = self.purchase(use_coupon=False)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            ReferralParticipation.objects.get(referred_user=self.user).status,
            ReferralParticipation.Status.OPEN,
        )

    def test_ordinary_coupon_does_not_touch_participation(self):
        self.add_coupon()
        ordinary = PromotionCodeRecord.objects.create(
            code="PAYMENT-ORDINARY", campaign_name="ordinary",
            discount_amount=Decimal("1.00"), applicable_module=self.exam_module,
        )
        ordinary_coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=ordinary, discount_amount=Decimal("1.00"),
            applicable_module=self.exam_module,
        )
        response = self.purchase(coupon_id=ordinary_coupon.pk)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            ReferralParticipation.objects.get(referred_user=self.user).status,
            ReferralParticipation.Status.OPEN,
        )

    def test_invalid_historical_exam_access_rolls_back_all_payment_rows(self):
        coupon = self.add_coupon()
        Entitlement.objects.create(
            user=self.user, module=self.exam_module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
            expires_at=timezone.now() + timedelta(days=30),
        )
        before = (AlipayWebsitePayment.objects.count(), PaymentGrantTask.objects.count(), PaymentDiscountApplication.objects.count())

        response = self.purchase(coupon_id=coupon.pk)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertEqual(response.data, {
            "detail": "推荐优惠券状态已变化，请刷新优惠券后重试。",
            "code": "referral_coupon_invalid",
        })
        self.assertEqual(
            (AlipayWebsitePayment.objects.count(), PaymentGrantTask.objects.count(), PaymentDiscountApplication.objects.count()),
            before,
        )
        coupon.refresh_from_db()
        self.assertEqual(coupon.status, UserCoupon.Status.AVAILABLE)
        self.assertIsNone(coupon.reserved_payment_id)
        self.assertEqual(
            ReferralParticipation.objects.get(referred_user=self.user).status,
            ReferralParticipation.Status.OPEN,
        )

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    def test_flag_disabled_after_coupon_issue_does_not_block_purchase(self):
        coupon = self.add_coupon()
        response = self.purchase(coupon_id=coupon.pk)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            ReferralParticipation.objects.get(referred_user=self.user).status,
            ReferralParticipation.Status.PAYMENT_RESERVED,
        )

    def test_idempotent_retry_reuses_payment_without_changing_reservation(self):
        coupon = self.add_coupon()
        first = self.purchase(coupon_id=coupon.pk)
        participation = ReferralParticipation.objects.get(referred_user=self.user)
        second = self.purchase(coupon_id=coupon.pk)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["payment_id"], first.data["payment_id"])
        self.assertTrue(second.data["reused_existing_payment"])
        participation.refresh_from_db()
        self.assertEqual(participation.qualifying_payment_id, first.data["payment_id"])
