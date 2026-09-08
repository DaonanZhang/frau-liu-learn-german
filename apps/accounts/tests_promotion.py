from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    ModuleSeason,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    UserCoupon,
)
from apps.accounts.services.promotion_codes import store_promotion_code
from apps.accounts.services.promotion_codes import create_promotion_code_batch
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
        self.campaign_name = "合作机构 A"
        self.organization_name = "机构 A"
        self.record = store_promotion_code(
            code="PARTNER001",
            campaign_name=self.campaign_name,
            organization_name=self.organization_name,
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

    def test_redeem_requires_authentication_without_consuming_code(self) -> None:
        self.client.force_authenticate(user=None)

        response = self.client.post(
            "/api/accounts/auth/redeem-code/",
            {"code": "PARTNER001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, PromotionCodeRecord.Status.ACTIVE)

    def test_redeem_accepts_the_same_bearer_jwt_used_by_the_frontend(self) -> None:
        self.client.force_authenticate(user=None)
        access_token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        response = self.client.post(
            "/api/accounts/auth/redeem-code/",
            {"code": "PARTNER001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["type"], "promotion")
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, PromotionCodeRecord.Status.CONSUMED)

    def test_redeem_promotion_code_creates_durable_coupon_and_consumption_record(self) -> None:
        response = self.redeem()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["type"], "promotion")
        self.assertEqual(response.data["coupon"]["discount_amount"], "10.00")
        self.assertNotIn("campaign", response.data["coupon"])
        self.assertNotIn("organization", response.data["coupon"])
        self.record.refresh_from_db()
        coupon = UserCoupon.objects.get(promotion_code=self.record)
        self.assertEqual(self.record.status, PromotionCodeRecord.Status.CONSUMED)
        self.assertEqual(self.record.consumed_by_user, self.user)
        self.assertIsNotNone(self.record.consumed_at)
        self.assertEqual(coupon.user, self.user)
        self.assertEqual(coupon.promotion_code.campaign_name, self.campaign_name)
        self.assertEqual(coupon.promotion_code.organization_name, self.organization_name)
        self.assertEqual(coupon.status, UserCoupon.Status.AVAILABLE)

        duplicate = self.redeem()
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(UserCoupon.objects.count(), 1)

    def test_batch_generation_stores_plaintext_and_persists_operator_remark(self) -> None:
        codes = create_promotion_code_batch(
            campaign_name=self.campaign_name,
            organization_name=self.organization_name,
            count=2,
            length=12,
            remark="发给合作老师刘老师",
            discount_amount=Decimal("8.00"),
            minimum_order_amount=Decimal("20.00"),
            applicable_module=self.module,
            applicable_season=self.season,
            applicable_offer=self.offer,
            is_stackable=False,
            coupon_valid_days=30,
            expires_at=timezone.now() + timedelta(days=90),
        )

        self.assertEqual(len(codes), 2)
        self.assertEqual(len(set(codes)), 2)
        records = PromotionCodeRecord.objects.filter(remark="发给合作老师刘老师")
        self.assertEqual(records.count(), 2)
        self.assertEqual({record.code for record in records}, set(codes))
        field_names = {field.name for field in PromotionCodeRecord._meta.fields}
        self.assertNotIn("code_hash", field_names)
        self.assertNotIn("code_ciphertext", field_names)

    def test_coupon_wallet_is_private_and_exposes_scope_and_usage_history(self) -> None:
        coupon_id = self.redeem().data["coupon"]["id"]
        response = self.client.get("/api/accounts/coupons/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], coupon_id)
        self.assertEqual(response.data[0]["scope"]["module_key"], self.module.key)
        self.assertEqual(response.data[0]["scope"]["season_number"], self.season.season_number)
        self.assertEqual(response.data[0]["scope"]["offer_code"], self.offer.code)
        self.assertEqual(response.data[0]["usage_history"], [])
        self.assertNotIn("campaign_name", response.data[0])
        self.assertNotIn("organization_name", response.data[0])

        other_user = get_user_model().objects.create_user(
            telephone="13700137000",
            country_code="+86",
            password="pass-123456",
        )
        self.client.force_authenticate(user=other_user)
        other_response = self.client.get("/api/accounts/coupons/")
        self.assertEqual(other_response.data, [])

    def test_coupon_without_valid_days_is_unlimited(self) -> None:
        store_promotion_code(
            code="FOREVER001",
            campaign_name="长期优惠",
            organization_name="机构 A",
            discount_amount=Decimal("6.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_offer=self.offer,
            coupon_valid_days=None,
            expires_at=timezone.now() + timedelta(days=90),
        )

        redeemed = self.client.post(
            "/api/accounts/auth/redeem-code/",
            {"code": "FOREVER001"},
            format="json",
        )

        self.assertEqual(redeemed.status_code, status.HTTP_200_OK)
        self.assertIsNone(redeemed.data["coupon"]["expires_at"])
        coupon = UserCoupon.objects.get(pk=redeemed.data["coupon"]["id"])
        self.assertIsNone(coupon.expires_at)
        choices = self.client.get(
            "/api/accounts/coupons/choices/",
            {"offer_code": self.offer.code},
        )
        self.assertEqual(choices.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(
                choice["coupon"]["id"] == coupon.id and choice["is_applicable"]
                for choice in choices.data["choices"]
            )
        )

    def test_generation_command_defaults_to_unlimited_coupon(self) -> None:
        output = StringIO()
        call_command(
            "generate_promotion_codes",
            campaign_name="默认长期券",
            organization="机构 A",
            discount=Decimal("3.00"),
            count=1,
            stdout=output,
        )

        generated = PromotionCodeRecord.objects.get(campaign_name="默认长期券")
        self.assertIsNone(generated.coupon_valid_days)
        self.assertIn("coupon_valid_days=unlimited", output.getvalue())

    def test_coupon_choices_default_to_the_largest_effective_discount(self) -> None:
        best_coupon_id = self.redeem().data["coupon"]["id"]
        smaller_record = store_promotion_code(
            code="PARTNER002",
            campaign_name=self.campaign_name,
            organization_name=self.organization_name,
            remark="较小面额测试券",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("20.00"),
            applicable_offer=self.offer,
            coupon_valid_days=30,
            expires_at=timezone.now() + timedelta(days=90),
        )
        self.client.post(
            "/api/accounts/auth/redeem-code/",
            {"code": "PARTNER002"},
            format="json",
        )

        response = self.client.get(
            "/api/accounts/coupons/choices/",
            {"offer_code": self.offer.code},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["default_coupon_id"], best_coupon_id)
        self.assertEqual(response.data["available_count"], 2)
        self.assertEqual(response.data["choices"][0]["pricing"]["final_amount"], "29.90")
        self.assertEqual(smaller_record.remark, "较小面额测试券")

    def test_user_cannot_apply_another_users_coupon(self) -> None:
        coupon_id = self.redeem().data["coupon"]["id"]
        other_user = get_user_model().objects.create_user(
            telephone="13800138000",
            country_code="+86",
            password="pass-123456",
        )
        self.client.force_authenticate(user=other_user)

        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "coupon_id": coupon_id,
                "use_coupon": True,
                "idempotency_key": "00000000-0000-4000-8000-000000000108",
            },
            format="json",
        )

        self.assertEqual(purchase.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PaymentDiscountApplication.objects.exists())

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_explicit_no_coupon_keeps_coupon_available(self) -> None:
        coupon_id = self.redeem().data["coupon"]["id"]
        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "use_coupon": False,
                "idempotency_key": "00000000-0000-4000-8000-000000000105",
            },
            format="json",
        )

        self.assertEqual(purchase.status_code, status.HTTP_201_CREATED)
        self.assertEqual(purchase.data["amount"], "39.90")
        self.assertFalse(PaymentDiscountApplication.objects.exists())
        self.assertEqual(
            UserCoupon.objects.get(pk=coupon_id).status,
            UserCoupon.Status.AVAILABLE,
        )

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_manual_coupon_selection_is_recorded_with_audit_snapshots(self) -> None:
        self.redeem()
        smaller_record = store_promotion_code(
            code="PARTNER003",
            campaign_name=self.campaign_name,
            organization_name=self.organization_name,
            remark="手动选择测试券",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("20.00"),
            applicable_offer=self.offer,
            coupon_valid_days=30,
            expires_at=timezone.now() + timedelta(days=90),
        )
        smaller_coupon_id = self.client.post(
            "/api/accounts/auth/redeem-code/",
            {"code": "PARTNER003"},
            format="json",
        ).data["coupon"]["id"]

        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "coupon_id": smaller_coupon_id,
                "use_coupon": True,
                "idempotency_key": "00000000-0000-4000-8000-000000000106",
            },
            format="json",
        )

        self.assertEqual(purchase.status_code, status.HTTP_201_CREATED)
        self.assertEqual(purchase.data["amount"], "34.90")
        application = PaymentDiscountApplication.objects.get(
            payment_id=purchase.data["payment_id"]
        )
        self.assertEqual(
            application.selection_source,
            PaymentDiscountApplication.SelectionSource.MANUAL,
        )
        self.assertEqual(application.campaign_name_snapshot, self.campaign_name)
        self.assertEqual(
            application.campaign_organization_snapshot,
            self.organization_name,
        )
        self.assertEqual(
            application.promotion_code_remark_snapshot,
            smaller_record.remark,
        )

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_omitted_coupon_id_uses_best_coupon_and_records_automatic_selection(self) -> None:
        best_coupon_id = self.redeem().data["coupon"]["id"]
        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "use_coupon": True,
                "idempotency_key": "00000000-0000-4000-8000-000000000107",
            },
            format="json",
        )

        self.assertEqual(purchase.status_code, status.HTTP_201_CREATED)
        application = PaymentDiscountApplication.objects.get(
            payment_id=purchase.data["payment_id"]
        )
        self.assertEqual(application.coupon_id, best_coupon_id)
        self.assertEqual(
            application.selection_source,
            PaymentDiscountApplication.SelectionSource.AUTOMATIC,
        )

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
        self.assertEqual(application.campaign_name_snapshot, self.campaign_name)
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
