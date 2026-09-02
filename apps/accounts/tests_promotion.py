from __future__ import annotations

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
    ModuleSeason,
    PaymentDiscountApplication,
    PromotionCampaign,
    PromotionCodeRecord,
    PurchaseOffer,
    UserCoupon,
)
from apps.accounts.services.promotion_codes import store_promotion_code
from apps.accounts.services.promotion_codes import sync_payment_discount_status
from apps.accounts.views.payment import _mark_open_payment_closed


class PromotionCodeTests(APITestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            telephone="13600136000",
            country_code="+86",
            password="pass-123456",
        )
        self.module = Module.objects.create(key="promo-video", name="Promo Video", is_active=True)
        self.season = ModuleSeason.objects.create(module=self.module, season_number=1, title="Season 1")
        self.offer = PurchaseOffer.objects.create(
            code="promo-video-s1",
            title="Promo Video Season 1",
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("39.90"),
            currency="CNY",
        )
        self.campaign = PromotionCampaign.objects.create(
            code="partner-a-2026",
            name="合作机构 A",
            organization_name="机构 A",
        )
        self.record = store_promotion_code(
            code="PARTNER001",
            campaign=self.campaign,
            discount_amount=Decimal("10.00"),
            minimum_order_amount=Decimal("20.00"),
            applicable_offer=self.offer,
            coupon_valid_days=30,
            expires_at=timezone.now() + timedelta(days=90),
        )
        self.client.force_authenticate(user=self.user)

    def redeem(self):
        return self.client.post(
            "/api/accounts/auth/redeem-code/",
            {"code": "partner001"},
            format="json",
        )

    def test_redeem_promotion_code_creates_durable_coupon_and_consumption_record(self) -> None:
        response = self.redeem()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["type"], "promotion")
        self.assertEqual(response.data["coupon"]["discount_amount"], "10.00")
        self.record.refresh_from_db()
        coupon = UserCoupon.objects.get(promotion_code=self.record)
        self.assertEqual(self.record.status, PromotionCodeRecord.Status.CONSUMED)
        self.assertEqual(self.record.consumed_by_user, self.user)
        self.assertIsNotNone(self.record.consumed_at)
        self.assertEqual(coupon.user, self.user)
        self.assertEqual(coupon.campaign, self.campaign)
        self.assertEqual(coupon.status, UserCoupon.Status.AVAILABLE)

        duplicate = self.redeem()
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(UserCoupon.objects.count(), 1)

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_paid_purchase_applies_coupon_and_records_channel_product_and_amounts(self) -> None:
        coupon_id = self.redeem().data["coupon"]["id"]

        offers = self.client.get("/api/accounts/purchase-offers/", {"module": self.module.key})
        self.assertEqual(offers.status_code, status.HTTP_200_OK)
        self.assertEqual(offers.data[0]["promotion_coupon_id"], coupon_id)
        self.assertEqual(offers.data[0]["final_price_amount"], "29.90")
        self.assertEqual(offers.data[0]["discount_amount"], "10.00")

        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "coupon_id": coupon_id,
                "idempotency_key": "00000000-0000-4000-8000-000000000101",
            },
            format="json",
        )

        self.assertEqual(purchase.status_code, status.HTTP_201_CREATED)
        self.assertEqual(purchase.data["amount"], "29.90")
        payment = AlipayWebsitePayment.objects.get(pk=purchase.data["payment_id"])
        coupon = UserCoupon.objects.get(pk=coupon_id)
        application = PaymentDiscountApplication.objects.get(payment=payment)
        self.assertEqual(payment.status, AlipayWebsitePayment.Status.PAID)
        self.assertEqual(coupon.status, UserCoupon.Status.USED)
        self.assertEqual(coupon.used_payment, payment)
        self.assertEqual(application.status, PaymentDiscountApplication.Status.APPLIED)
        self.assertEqual(application.campaign, self.campaign)
        self.assertEqual(application.user, self.user)
        self.assertEqual(application.offer, self.offer)
        self.assertEqual(application.original_amount, Decimal("39.90"))
        self.assertEqual(application.promotion_discount_amount, Decimal("10.00"))
        self.assertEqual(application.final_amount, Decimal("29.90"))

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=False)
    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_closed_payment_releases_reserved_coupon(self, mock_get_alipay_service: Mock) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"
        coupon_id = self.redeem().data["coupon"]["id"]
        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "coupon_id": coupon_id,
                "idempotency_key": "00000000-0000-4000-8000-000000000102",
            },
            format="json",
        )
        self.assertEqual(purchase.status_code, status.HTTP_201_CREATED)
        payment_id = purchase.data["payment_id"]
        coupon = UserCoupon.objects.get(pk=coupon_id)
        self.assertEqual(coupon.status, UserCoupon.Status.RESERVED)

        _mark_open_payment_closed(payment_id=payment_id)

        coupon.refresh_from_db()
        application = PaymentDiscountApplication.objects.get(payment_id=payment_id)
        self.assertEqual(coupon.status, UserCoupon.Status.AVAILABLE)
        self.assertIsNone(coupon.reserved_payment_id)
        self.assertEqual(application.status, PaymentDiscountApplication.Status.RELEASED)

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_same_coupon_purchase_intent_is_idempotent(self) -> None:
        coupon_id = self.redeem().data["coupon"]["id"]
        payload = {
            "offer_code": self.offer.code,
            "coupon_id": coupon_id,
            "idempotency_key": "00000000-0000-4000-8000-000000000103",
        }
        first = self.client.post("/api/accounts/payments/alipay/create/", payload, format="json")
        second = self.client.post("/api/accounts/payments/alipay/create/", payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["merchant_order_no"], second.data["merchant_order_no"])
        self.assertEqual(PaymentDiscountApplication.objects.count(), 1)

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_full_refund_keeps_coupon_consumed_and_marks_discount_refunded(self) -> None:
        coupon_id = self.redeem().data["coupon"]["id"]
        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "coupon_id": coupon_id,
                "idempotency_key": "00000000-0000-4000-8000-000000000104",
            },
            format="json",
        )
        payment = AlipayWebsitePayment.objects.get(pk=purchase.data["payment_id"])
        payment.status = AlipayWebsitePayment.Status.REFUNDED
        payment.refunded_amount = payment.total_amount
        payment.refunded_at = timezone.now()
        payment.save(update_fields=["status", "refunded_amount", "refunded_at", "updated_at"])

        sync_payment_discount_status(payment_id=payment.id)

        coupon = UserCoupon.objects.get(pk=coupon_id)
        application = PaymentDiscountApplication.objects.get(payment=payment)
        self.assertEqual(coupon.status, UserCoupon.Status.USED)
        self.assertEqual(application.status, PaymentDiscountApplication.Status.REFUNDED)
        self.assertIsNotNone(application.refunded_at)
