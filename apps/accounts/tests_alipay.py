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
    PaymentGrantTask,
    PurchaseOffer,
)
from apps.accounts.views.payment import _apply_payment_status
from apps.accounts.services.payment_grant_service import process_payment_grant_task_by_id


@override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=False)
class AlipayPaymentApiTests(APITestCase):
    def setUp(self) -> None:
        super().setUp()
        self.user = get_user_model().objects.create_user(
            telephone="13700137000",
            country_code="+86",
            password="pass-123456",
            email="buyer@example.com",
        )
        self.module = Module.objects.create(
            key="science",
            name="Science",
            is_active=True,
        )
        self.season = ModuleSeason.objects.create(
            module=self.module,
            season_number=1,
            title="Season 1",
        )
        self.season2 = ModuleSeason.objects.create(
            module=self.module,
            season_number=2,
            title="Season 2",
        )
        self.season4 = ModuleSeason.objects.create(
            module=self.module,
            season_number=4,
            title="Vlog季",
        )
        self.offer = PurchaseOffer.objects.create(
            code="science-s1-m1",
            title="Science Season 1 Monthly",
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("29.90"),
            currency="CNY",
            is_active=True,
        )
        self.vlog_offer = PurchaseOffer.objects.create(
            code="vlog-season-lifetime",
            title="Vlog季终身版",
            module=self.module,
            season=self.season4,
            plan=Entitlement.Plan.LIFETIME,
            price_amount=Decimal("99.00"),
            currency="CNY",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_create_purchase_reuses_existing_pending_payment(self, mock_get_alipay_service: Mock) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"

        first_response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code},
            format="json",
        )
        second_response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(AlipayWebsitePayment.objects.count(), 1)
        self.assertEqual(PaymentGrantTask.objects.count(), 1)
        self.assertEqual(
            first_response.data["merchant_order_no"],
            second_response.data["merchant_order_no"],
        )
        self.assertTrue(second_response.data["reused_existing_payment"])

    def test_paid_payment_status_is_not_downgraded_by_late_notify(self) -> None:
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="pay-locked-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=AlipayWebsitePayment.Status.PAID,
            paid_at=timezone.now(),
            alipay_trade_no="202605120001",
        )

        _apply_payment_status(
            payment=payment,
            trade_status="TRADE_CLOSED",
            alipay_trade_no="202605120001",
            raw_payload={"trade_status": "TRADE_CLOSED"},
        )

        self.assertEqual(payment.status, AlipayWebsitePayment.Status.PAID)
        self.assertIsNotNone(payment.paid_at)

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_notify_processes_entitlement_without_async_worker(self, mock_get_alipay_service: Mock) -> None:
        service = Mock()
        service.verify_notify_signature.return_value = True
        service.config.app_id = "test-app-id"
        service.config.seller_id = "2088000000000000"
        mock_get_alipay_service.return_value = service

        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="pay-notify-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=AlipayWebsitePayment.Status.PENDING,
        )
        grant_task = PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            status=PaymentGrantTask.Status.PENDING,
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/notify/",
            {
                "out_trade_no": payment.merchant_order_no,
                "trade_no": "202605120002",
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "29.90",
                "app_id": "test-app-id",
                "seller_id": "2088000000000000",
                "sign": "mock-signature",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        grant_task.refresh_from_db()

        self.assertEqual(payment.status, AlipayWebsitePayment.Status.PAID)
        self.assertEqual(grant_task.status, PaymentGrantTask.Status.SUCCEEDED)
        self.assertTrue(
            Entitlement.objects.filter(
                user=self.user,
                module=self.module,
                season=self.season,
                plan=Entitlement.Plan.MONTH_1,
                external_ref=f"alipay_payment:{payment.merchant_order_no}",
            ).exists()
        )

    def test_paid_purchase_extends_existing_access_once(self) -> None:
        current_expiry = timezone.now() + timedelta(days=10)
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            expires_at=current_expiry,
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="pay-extension-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=AlipayWebsitePayment.Status.PAID,
            paid_at=timezone.now(),
            alipay_trade_no="202605120003",
        )
        grant_task = PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
        )

        process_payment_grant_task_by_id(payment_grant_task_id=grant_task.id)
        process_payment_grant_task_by_id(payment_grant_task_id=grant_task.id)

        extension = Entitlement.objects.get(
            external_ref="alipay_payment:pay-extension-001"
        )
        self.assertEqual(extension.starts_at, current_expiry)
        self.assertEqual(extension.expires_at, current_expiry + timedelta(days=30))
        self.assertEqual(
            Entitlement.objects.filter(
                external_ref="alipay_payment:pay-extension-001"
            ).count(),
            1,
        )

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_active_timed_user_can_buy_extension_with_estimated_expiry(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"
        current_expiry = timezone.now() + timedelta(days=10)
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            expires_at=current_expiry,
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["estimated_expires_at"],
            (current_expiry + timedelta(days=30)).isoformat(),
        )

    @patch("apps.accounts.views.payment.process_pending_payment_grant_tasks_for_payment")
    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_notify_returns_failure_when_entitlement_grant_fails(
        self,
        mock_get_alipay_service: Mock,
        mock_process_grants: Mock,
    ) -> None:
        service = Mock()
        service.verify_notify_signature.return_value = True
        service.config.app_id = "test-app-id"
        service.config.seller_id = "2088000000000000"
        mock_get_alipay_service.return_value = service
        mock_process_grants.side_effect = RuntimeError("grant failed")
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="pay-notify-failure-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=AlipayWebsitePayment.Status.PENDING,
        )
        PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/notify/",
            {
                "out_trade_no": payment.merchant_order_no,
                "trade_no": "202605120004",
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "29.90",
                "app_id": "test-app-id",
                "seller_id": "2088000000000000",
                "sign": "mock-signature",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    def test_purchase_offers_list_marks_vlog_discount_for_season1_owner(self) -> None:
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        )

        response = self.client.get(
            "/api/accounts/purchase-offers/",
            {"module": self.module.key, "season_number": 4},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["code"], self.vlog_offer.code)
        self.assertEqual(response.data[0]["discount_amount"], "5.00")
        self.assertEqual(response.data[0]["final_price_amount"], "94.00")
        self.assertTrue(response.data[0]["is_discounted_for_user"])

    def test_purchase_offers_list_marks_vlog_discount_for_season2_owner(self) -> None:
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season2,
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        )

        response = self.client.get(
            "/api/accounts/purchase-offers/",
            {"module": self.module.key, "season_number": 4},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["code"], self.vlog_offer.code)
        self.assertEqual(response.data[0]["discount_amount"], "5.00")
        self.assertEqual(response.data[0]["final_price_amount"], "94.00")
        self.assertTrue(response.data[0]["is_discounted_for_user"])

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_create_purchase_applies_vlog_discount_for_season1_owner(self, mock_get_alipay_service: Mock) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.vlog_offer.code},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["offer_code"], self.vlog_offer.code)
        self.assertEqual(response.data["amount"], "94.00")

        payment = AlipayWebsitePayment.objects.get(id=response.data["payment_id"])
        self.assertEqual(payment.total_amount, Decimal("94.00"))

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_create_purchase_applies_vlog_discount_for_season2_owner(self, mock_get_alipay_service: Mock) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season2,
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.vlog_offer.code},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["offer_code"], self.vlog_offer.code)
        self.assertEqual(response.data["amount"], "94.00")

        payment = AlipayWebsitePayment.objects.get(id=response.data["payment_id"])
        self.assertEqual(payment.total_amount, Decimal("94.00"))
