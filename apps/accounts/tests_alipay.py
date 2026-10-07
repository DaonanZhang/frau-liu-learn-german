from __future__ import annotations

import base64
from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import (
    PaymentOrder,
    Entitlement,
    Module,
    ModuleSeason,
    PaymentGrantTask,
    PurchaseOffer,
)
from apps.accounts.views.payment import _apply_payment_status, _query_and_sync_payment_status
from apps.accounts.services.payment_grant_service import process_payment_grant_task_by_id
from apps.accounts.services.alipay_service import (
    AlipayClientConfig,
    AlipayGatewayError,
    AlipayService,
)
from apps.accounts.tasks import reconcile_alipay_payments_now


class AlipayNotifySignatureTests(SimpleTestCase):
    @staticmethod
    def _build_signed_notify() -> tuple[AlipayService, dict[str, str]]:
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_key = private_key.public_key()
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")
        public_key_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")
        service = AlipayService(
            config=AlipayClientConfig(
                app_id="test-app-id",
                gateway_url="https://openapi.alipay.test/gateway.do",
                app_private_key=private_key_pem,
                app_public_key=public_key_pem,
                alipay_public_key=public_key_pem,
                notify_url="https://example.test/alipay/notify/",
                return_url="https://example.test/alipay/return/",
                seller_id="2088000000000000",
                sign_type="RSA2",
                timeout_express="15m",
                api_timeout_seconds=3.0,
            )
        )
        payload = {
            "app_id": "test-app-id",
            "out_trade_no": "pay-notify-signature-001",
            "total_amount": "29.90",
            "trade_no": "202609280001",
            "trade_status": "TRADE_SUCCESS",
            "sign_type": "RSA2",
        }
        signed_content = (
            "app_id=test-app-id"
            "&out_trade_no=pay-notify-signature-001"
            "&total_amount=29.90"
            "&trade_no=202609280001"
            "&trade_status=TRADE_SUCCESS"
        )
        signature = private_key.sign(
            signed_content.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        payload["sign"] = base64.b64encode(signature).decode("utf-8")
        return service, payload

    def test_valid_notify_signature_excludes_sign_type_from_signed_content(self) -> None:
        service, payload = self._build_signed_notify()

        self.assertTrue(service.verify_notify_signature(payload))

    def test_notify_signature_rejects_unexpected_sign_type(self) -> None:
        service, payload = self._build_signed_notify()
        payload["sign_type"] = "RSA"

        self.assertFalse(service.verify_notify_signature(payload))

    def test_notify_signature_rejects_tampered_payload(self) -> None:
        service, payload = self._build_signed_notify()
        payload["total_amount"] = "39.90"

        self.assertFalse(service.verify_notify_signature(payload))


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
    def test_notify_logs_rejected_signature_without_payload(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        service = Mock()
        service.verify_notify_signature.return_value = False
        mock_get_alipay_service.return_value = service

        with self.assertLogs("apps.accounts.views.payment", level="WARNING") as logs:
            response = self.client.post(
                "/api/accounts/payments/alipay/notify/",
                {
                    "out_trade_no": "secret-order-number",
                    "sign_type": "RSA2",
                    "sign": "secret-signature",
                },
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Rejected invalid Alipay notify signature", logs.output[0])
        self.assertNotIn("secret-order-number", logs.output[0])
        self.assertNotIn("secret-signature", logs.output[0])

    def test_exam_preparation_offers_use_launch_pricing(self) -> None:
        response = self.client.get(
            "/api/accounts/purchase-offers/",
            {"module": "exam_preparation"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [
                (
                    offer["code"],
                    offer["plan"],
                    offer["price_amount"],
                    offer["access_duration_days"],
                )
                for offer in response.data
            ],
            [
                ("exam-preparation-30d", "m1", "59.90", 30),
                ("exam-preparation-90d", "m3", "99.90", 90),
                ("exam-preparation-180d", "m6", "169.90", 180),
            ],
        )

    @override_settings(COMING_SOON=True)
    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_mock_exam_coming_soon_does_not_block_exam_purchase(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        exam_module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        exam_offer = PurchaseOffer.objects.create(
            code="exam-preview-gated-offer",
            title="Exam preview gated offer",
            module=exam_module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("29.90"),
            currency="CNY",
            is_active=True,
        )
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = (
            "https://alipay.test/pay"
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": exam_offer.code,
                "idempotency_key": "00000000-0000-4000-8000-000000000099",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["offer_code"], exam_offer.code)
        self.assertEqual(PaymentOrder.objects.count(), 1)

    @override_settings(COMING_SOON=True)
    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_payment_test_account_can_create_exam_purchase_while_coming_soon(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        payment_test_user = get_user_model().objects.create_user(
            telephone="11223344551",
            country_code="+86",
            password="pass-123456",
        )
        self.client.force_authenticate(user=payment_test_user)
        exam_module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        exam_offer = PurchaseOffer.objects.create(
            code="exam-payment-test-offer",
            title="Exam payment test offer",
            module=exam_module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("0.01"),
            currency="CNY",
            is_active=True,
        )
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = (
            "https://alipay.test/pay"
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": exam_offer.code,
                "idempotency_key": "00000000-0000-4000-8000-000000000098",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["offer_code"], exam_offer.code)
        self.assertEqual(PaymentOrder.objects.count(), 1)

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_same_purchase_intent_reuses_existing_pending_payment(self, mock_get_alipay_service: Mock) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"

        first_response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000001"},
            format="json",
        )
        second_response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000001"},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(PaymentOrder.objects.count(), 1)
        self.assertEqual(PaymentGrantTask.objects.count(), 1)
        self.assertEqual(
            PaymentOrder.objects.get().provider,
            PaymentOrder.Provider.ALIPAY,
        )
        self.assertEqual(
            first_response.data["merchant_order_no"],
            second_response.data["merchant_order_no"],
        )
        self.assertTrue(second_response.data["reused_existing_payment"])

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_closed_purchase_intent_requires_a_new_idempotency_key(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-closed-intent-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.CLOSED,
        )
        PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            idempotency_key="00000000-0000-4000-8000-000000000019",
        )

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000019"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "purchase_intent_closed")
        self.assertEqual(PaymentOrder.objects.count(), 1)

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_new_purchase_closes_open_order_before_creating_a_different_plan(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        second_offer = PurchaseOffer.objects.create(
            code="science-s1-m2",
            title="Science Season 1 60 days",
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_2,
            price_amount=Decimal("49.90"),
            currency="CNY",
            is_active=True,
        )
        service = Mock()
        service.config.seller_id = "2088000000000000"
        service.build_page_pay_url.return_value = "https://alipay.test/pay"
        service.query_trade.return_value = {
            "code": "10000",
            "trade_status": "WAIT_BUYER_PAY",
            "trade_no": "",
            "seller_id": "2088000000000000",
            "total_amount": "29.90",
        }
        service.close_trade.return_value = {"code": "10000"}
        mock_get_alipay_service.return_value = service

        first_response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000020"},
            format="json",
        )
        second_response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": second_offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000021"},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.data["offer_code"], second_offer.code)
        self.assertEqual(PaymentOrder.objects.count(), 2)
        first_payment = PaymentOrder.objects.get(
            merchant_order_no=first_response.data["merchant_order_no"]
        )
        self.assertEqual(first_payment.status, PaymentOrder.Status.CLOSED)
        service.close_trade.assert_called_once_with(
            merchant_order_no=first_payment.merchant_order_no
        )

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_new_purchase_replaces_expired_order_missing_from_alipay(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        expired_payment = PaymentOrder.objects.create(
            merchant_order_no="pay-expired-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PENDING,
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        PaymentGrantTask.objects.create(
            payment=expired_payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
        )
        service = Mock()
        service.query_trade.return_value = {
            "code": "40004",
            "sub_code": "ACQ.TRADE_NOT_EXIST",
        }
        service.build_page_pay_url.return_value = "https://alipay.test/new-pay"
        mock_get_alipay_service.return_value = service

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000022"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        expired_payment.refresh_from_db()
        self.assertEqual(expired_payment.status, PaymentOrder.Status.CLOSED)
        self.assertNotEqual(response.data["merchant_order_no"], expired_payment.merchant_order_no)
        self.assertEqual(PaymentOrder.objects.count(), 2)
        service.close_trade.assert_not_called()

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_new_purchase_finishes_previous_order_if_alipay_reports_it_paid(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-became-paid-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PENDING,
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
        )
        service = Mock()
        service.config.seller_id = "2088000000000000"
        service.config.return_url = "https://frontend.test/payments/alipay/return"
        service.query_trade.return_value = {
            "code": "10000",
            "trade_status": "TRADE_SUCCESS",
            "trade_no": "202608310001",
            "seller_id": "2088000000000000",
            "total_amount": "29.90",
            "refund_amount": "0.00",
        }
        mock_get_alipay_service.return_value = service

        response = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000023"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["already_paid"])
        self.assertEqual(PaymentOrder.objects.count(), 1)
        payment.refresh_from_db()
        self.assertEqual(payment.status, PaymentOrder.Status.PAID)
        self.assertTrue(
            Entitlement.objects.filter(
                external_ref=payment.entitlement_external_ref
            ).exists()
        )
        service.close_trade.assert_not_called()

    def test_paid_payment_status_is_not_downgraded_by_late_notify(self) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-locked-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PAID,
            paid_at=timezone.now(),
            provider_trade_no="202605120001",
        )

        _apply_payment_status(
            payment=payment,
            trade_status="TRADE_CLOSED",
            alipay_trade_no="202605120001",
            raw_payload={"trade_status": "TRADE_CLOSED"},
        )

        self.assertEqual(payment.status, PaymentOrder.Status.PAID)
        self.assertIsNotNone(payment.paid_at)

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_stale_gateway_query_cannot_downgrade_concurrently_paid_order(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-concurrency-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PENDING,
        )
        stale_payment = PaymentOrder.objects.get(pk=payment.pk)
        PaymentOrder.objects.filter(pk=payment.pk).update(
            status=PaymentOrder.Status.PAID,
            paid_at=timezone.now(),
            provider_trade_no="202605120099",
        )
        service = Mock()
        service.config.seller_id = "2088000000000000"
        service.query_trade.return_value = {
            "code": "10000",
            "trade_status": "WAIT_BUYER_PAY",
            "trade_no": "202605120099",
            "seller_id": "2088000000000000",
            "total_amount": "29.90",
        }
        mock_get_alipay_service.return_value = service

        _query_and_sync_payment_status(payment=stale_payment)

        payment.refresh_from_db()
        self.assertEqual(payment.status, PaymentOrder.Status.PAID)

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_notify_processes_entitlement_without_async_worker(self, mock_get_alipay_service: Mock) -> None:
        service = Mock()
        service.verify_notify_signature.return_value = True
        service.config.app_id = "test-app-id"
        service.config.seller_id = "2088000000000000"
        mock_get_alipay_service.return_value = service

        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-notify-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PENDING,
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

        self.assertEqual(payment.status, PaymentOrder.Status.PAID)
        self.assertEqual(grant_task.status, PaymentGrantTask.Status.SUCCEEDED)
        self.assertTrue(
            Entitlement.objects.filter(
                user=self.user,
                module=self.module,
                season=self.season,
                plan=Entitlement.Plan.MONTH_1,
                external_ref=payment.entitlement_external_ref,
            ).exists()
        )

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_notify_accepts_valid_payment_when_seller_id_is_not_configured(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        service = Mock()
        service.verify_notify_signature.return_value = True
        service.config.app_id = "test-app-id"
        service.config.seller_id = ""
        mock_get_alipay_service.return_value = service

        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-notify-optional-seller-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PENDING,
        )
        PaymentGrantTask.objects.create(
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
                "trade_no": "202605120088",
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
        self.assertEqual(payment.status, PaymentOrder.Status.PAID)
        self.assertNotIn("sign", payment.raw_notify_payload)

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
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-extension-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PAID,
            paid_at=timezone.now(),
            provider_trade_no="202605120003",
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
            external_ref="payment:alipay:pay-extension-001"
        )
        self.assertEqual(extension.starts_at, current_expiry)
        self.assertEqual(extension.expires_at, current_expiry + timedelta(days=30))
        self.assertEqual(
            Entitlement.objects.filter(
                external_ref="payment:alipay:pay-extension-001"
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
            {"offer_code": self.offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000003"},
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
        mock_process_grants.side_effect = ValueError("grant failed")
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-notify-failure-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PENDING,
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
    def test_exam_preparation_offer_gets_five_yuan_discount_for_video_trial_user(self, mock_get_alipay_service: Mock) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"
        video_module = Module.objects.create(
            key="learning_by_video",
            name="Learning by Video",
            is_active=True,
        )
        exam_module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "备考季", "is_active": True},
        )
        Entitlement.objects.create(
            user=self.user,
            module=video_module,
            plan=Entitlement.Plan.TRIAL_7D,
            status=Entitlement.Status.ACTIVE,
            expires_at=timezone.now() + timedelta(days=7),
        )
        exam_offer = PurchaseOffer.objects.create(
            code="exam-preparation-30d-test",
            title="备考季 30 天",
            module=exam_module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("29.90"),
            currency="CNY",
            is_active=True,
        )

        response = self.client.get(
            "/api/accounts/purchase-offers/",
            {"module": exam_module.key},
        )

        offer_data = next(item for item in response.data if item["code"] == exam_offer.code)
        self.assertEqual(offer_data["discount_amount"], "5.00")
        self.assertEqual(offer_data["final_price_amount"], "24.90")
        self.assertEqual(offer_data["discount_label"], "品牌挚友优惠券")
        self.assertEqual(offer_data["brand_friend_coupon_discount_amount"], "5.00")

        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": exam_offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000010"},
            format="json",
        )
        self.assertEqual(purchase.status_code, status.HTTP_201_CREATED)
        self.assertEqual(purchase.data["amount"], "24.90")

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_video_offer_is_half_price_for_active_exam_preparation_user(self, mock_get_alipay_service: Mock) -> None:
        mock_get_alipay_service.return_value.build_page_pay_url.return_value = "https://alipay.test/pay"
        video_module = Module.objects.create(
            key="learning_by_video",
            name="Learning by Video",
            is_active=True,
        )
        exam_module = Module.objects.get(key="exam_preparation")
        video_season = ModuleSeason.objects.create(
            module=video_module,
            season_number=4,
            title="Vlog季",
        )
        Entitlement.objects.create(
            user=self.user,
            module=exam_module,
            season=None,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            expires_at=timezone.now() + timedelta(days=30),
        )
        video_offer = PurchaseOffer.objects.create(
            code="vlog-season-half-price-test",
            title="Vlog季终身版",
            module=video_module,
            season=video_season,
            plan=Entitlement.Plan.LIFETIME,
            price_amount=Decimal("59.90"),
            currency="CNY",
            is_active=True,
        )

        response = self.client.get(
            "/api/accounts/purchase-offers/",
            {"module": video_module.key, "season_number": 4},
        )

        offer_data = next(item for item in response.data if item["code"] == video_offer.code)
        self.assertEqual(offer_data["discount_amount"], "29.95")
        self.assertEqual(offer_data["final_price_amount"], "29.95")
        self.assertEqual(offer_data["discount_label"], "备考季专享")

        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": video_offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000011"},
            format="json",
        )
        self.assertEqual(purchase.status_code, status.HTTP_201_CREATED)
        self.assertEqual(purchase.data["amount"], "29.95")

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
            {"offer_code": self.vlog_offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000004"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["offer_code"], self.vlog_offer.code)
        self.assertEqual(response.data["amount"], "94.00")

        payment = PaymentOrder.objects.get(id=response.data["payment_id"])
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
            {"offer_code": self.vlog_offer.code, "idempotency_key": "00000000-0000-4000-8000-000000000005"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["offer_code"], self.vlog_offer.code)
        self.assertEqual(response.data["amount"], "94.00")

        payment = PaymentOrder.objects.get(id=response.data["payment_id"])
        self.assertEqual(payment.total_amount, Decimal("94.00"))

    def test_paid_grant_failure_is_reported_as_attention_not_payment_failure(self) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-attention-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PAID,
            paid_at=timezone.now(),
            provider_trade_no="202605120200",
        )
        PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            status=PaymentGrantTask.Status.FAILED,
            last_error="secret database details",
        )

        with patch(
            "apps.accounts.views.payment.process_payment_grant_task_by_id",
            side_effect=ValueError("still broken"),
        ):
            response = self.client.get(
                "/api/accounts/payments/alipay/status/",
                {"merchant_order_no": payment.merchant_order_no},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_paid"])
        self.assertFalse(response.data["is_failed"])
        self.assertTrue(response.data["needs_attention"])
        self.assertNotIn("last_error", response.data)
        self.assertNotIn("secret", str(response.data))

    def test_lifetime_access_race_fails_grant_instead_of_consuming_paid_order(self) -> None:
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
        )
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-lifetime-race-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PAID,
            paid_at=timezone.now(),
            provider_trade_no="202605120201",
        )
        grant_task = PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
        )

        with self.assertRaisesRegex(ValueError, "lifetime access"):
            process_payment_grant_task_by_id(payment_grant_task_id=grant_task.id)

        grant_task.refresh_from_db()
        self.assertEqual(grant_task.status, PaymentGrantTask.Status.FAILED)
        self.assertFalse(
            Entitlement.objects.filter(
                external_ref=payment.entitlement_external_ref
            ).exists()
        )

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_full_refund_revokes_entitlement_and_compacts_later_extension(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        now = timezone.now()
        payment = PaymentOrder.objects.create(
            merchant_order_no="pay-refund-001",
            subject="Science Season 1 Monthly",
            total_amount=Decimal("29.90"),
            status=PaymentOrder.Status.PAID,
            paid_at=now,
            provider_trade_no="202605120202",
        )
        PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            status=PaymentGrantTask.Status.SUCCEEDED,
        )
        refunded_entitlement = Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            starts_at=now,
            expires_at=now + timedelta(days=30),
            external_ref=payment.entitlement_external_ref,
        )
        later = Entitlement.objects.create(
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_2,
            starts_at=now + timedelta(days=30),
            expires_at=now + timedelta(days=90),
            external_ref="payment:alipay:later-order",
        )
        service = Mock()
        service.config.seller_id = "2088000000000000"
        service.query_trade.return_value = {
            "code": "10000",
            "trade_status": "TRADE_SUCCESS",
            "trade_no": "202605120202",
            "seller_id": "2088000000000000",
            "total_amount": "29.90",
            "refund_amount": "29.90",
        }
        mock_get_alipay_service.return_value = service

        _query_and_sync_payment_status(payment=payment)

        payment.refresh_from_db()
        refunded_entitlement.refresh_from_db()
        later.refresh_from_db()
        self.assertEqual(payment.status, PaymentOrder.Status.REFUNDED)
        self.assertEqual(refunded_entitlement.status, Entitlement.Status.CANCELED)
        self.assertLess(later.starts_at, now + timedelta(minutes=1))
        self.assertEqual(later.expires_at - later.starts_at, timedelta(days=60))

    def test_alipay_service_rejects_wechat_order(self) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="wechat-not-for-alipay",
            subject="WeChat payment",
            total_amount=Decimal("29.90"),
            provider=PaymentOrder.Provider.WECHAT_PAY,
        )
        service, _ = AlipayNotifySignatureTests._build_signed_notify()

        with self.assertRaises(AlipayGatewayError):
            service.build_page_pay_params(payment=payment)

    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_alipay_notify_does_not_match_wechat_order(
        self,
        mock_get_alipay_service: Mock,
    ) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="wechat-notify-isolated",
            subject="WeChat payment",
            total_amount=Decimal("29.90"),
            provider=PaymentOrder.Provider.WECHAT_PAY,
            status=PaymentOrder.Status.PENDING,
        )
        service = Mock()
        service.verify_notify_signature.return_value = True
        service.config.app_id = "test-app-id"
        service.config.seller_id = "seller-id"
        mock_get_alipay_service.return_value = service

        response = self.client.post(
            "/api/accounts/payments/alipay/notify/",
            {
                "out_trade_no": payment.merchant_order_no,
                "trade_no": "alipay-trade-must-not-bind",
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "29.90",
                "app_id": "test-app-id",
                "seller_id": "seller-id",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payment.refresh_from_db()
        self.assertEqual(payment.status, PaymentOrder.Status.PENDING)
        self.assertEqual(payment.provider_trade_no, "")

    def test_alipay_status_does_not_expose_wechat_order(self) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="wechat-status-isolated",
            subject="WeChat payment",
            total_amount=Decimal("29.90"),
            provider=PaymentOrder.Provider.WECHAT_PAY,
            status=PaymentOrder.Status.PENDING,
        )
        PaymentGrantTask.objects.create(
            payment=payment,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
        )

        response = self.client.get(
            "/api/accounts/payments/alipay/status/",
            {"merchant_order_no": payment.merchant_order_no},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("apps.accounts.services.revoke_and_compact_payment_entitlement")
    @patch("apps.accounts.tasks.process_payment_grant_task_by_id")
    @patch("apps.accounts.views.payment._query_and_sync_payment_status")
    def test_alipay_reconciliation_ignores_wechat_orders(
        self,
        mock_query: Mock,
        mock_process_grant: Mock,
        mock_revoke: Mock,
    ) -> None:
        pending = PaymentOrder.objects.create(
            merchant_order_no="wechat-reconcile-pending",
            subject="WeChat payment",
            total_amount=Decimal("29.90"),
            provider=PaymentOrder.Provider.WECHAT_PAY,
            status=PaymentOrder.Status.PENDING,
        )
        paid = PaymentOrder.objects.create(
            merchant_order_no="wechat-reconcile-paid",
            subject="WeChat payment",
            total_amount=Decimal("29.90"),
            provider=PaymentOrder.Provider.WECHAT_PAY,
            status=PaymentOrder.Status.PAID,
            paid_at=timezone.now(),
        )
        PaymentGrantTask.objects.create(
            payment=paid,
            offer=self.offer,
            user=self.user,
            module=self.module,
            season=self.season,
            plan=Entitlement.Plan.MONTH_1,
            status=PaymentGrantTask.Status.FAILED,
        )
        refunded = PaymentOrder.objects.create(
            merchant_order_no="wechat-reconcile-refunded",
            subject="WeChat payment",
            total_amount=Decimal("29.90"),
            provider=PaymentOrder.Provider.WECHAT_PAY,
            status=PaymentOrder.Status.REFUNDED,
            refunded_amount=Decimal("29.90"),
            refunded_at=timezone.now(),
            raw_notify_payload={"private": "wechat"},
        )
        PaymentOrder.objects.filter(pk=refunded.pk).update(
            updated_at=timezone.now() - timedelta(days=100)
        )

        stats = reconcile_alipay_payments_now()

        mock_query.assert_not_called()
        mock_process_grant.assert_not_called()
        mock_revoke.assert_not_called()
        refunded.refresh_from_db()
        self.assertEqual(refunded.raw_notify_payload, {"private": "wechat"})
        self.assertEqual(stats["queried"], 0)
        self.assertEqual(stats["grant_retried"], 0)
