from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError, connection
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITransactionTestCase

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralNotice,
    ReferralReward,
    UserCoupon,
)
from apps.accounts.views.payment import _query_and_sync_payment_status


class ReferralRefundPaymentDispatchTests(APITransactionTestCase):
    reset_sequences = True

    def setUp(self) -> None:
        super().setUp()
        self.user = get_user_model().objects.create_user(
            telephone="13600139991",
            country_code="+86",
            password="pass-123456",
        )
        self.module, _ = Module.objects.get_or_create(
            key="refund-dispatch-module",
            defaults={"name": "Refund dispatch module", "is_active": True},
        )
        self.offer = PurchaseOffer.objects.create(
            code="refund-dispatch-offer",
            title="Refund dispatch offer",
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("30.00"),
            currency="CNY",
            is_active=True,
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="REFUND-DISPATCH",
            campaign_name="Refund dispatch",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
        )

    def _payment(
        self,
        *,
        suffix: str,
        status_value: str = AlipayWebsitePayment.Status.PAID,
        with_discount: bool = False,
    ) -> AlipayWebsitePayment:
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"refund-dispatch-{suffix}",
            subject="Refund dispatch offer",
            total_amount=Decimal("25.00"),
            status=status_value,
            paid_at=timezone.now() if status_value == AlipayWebsitePayment.Status.PAID else None,
            alipay_trade_no="",
        )
        if not with_discount:
            return payment
        coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=self.promotion,
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            status=UserCoupon.Status.RESERVED,
            reserved_payment=payment,
            reserved_at=timezone.now(),
        )
        PaymentDiscountApplication.objects.create(
            payment=payment,
            coupon=coupon,
            promotion_code=self.promotion,
            user=self.user,
            offer=self.offer,
            original_amount=Decimal("30.00"),
            automatic_discount_amount=Decimal("0.00"),
            promotion_discount_amount=Decimal("5.00"),
            final_amount=Decimal("25.00"),
            status=PaymentDiscountApplication.Status.APPLIED,
            applied_at=payment.paid_at or timezone.now(),
        )
        return payment

    @staticmethod
    def _query_service(
        *, payment: AlipayWebsitePayment, trade_status: str, refund_amount: str,
    ) -> Mock:
        service = Mock()
        service.config.seller_id = "2088000000000000"
        service.query_trade.return_value = {
            "code": "10000",
            "trade_status": trade_status,
            "trade_no": f"trade-query-{payment.pk}",
            "seller_id": "2088000000000000",
            "total_amount": "25.00",
            "refund_amount": refund_amount,
        }
        return service

    @staticmethod
    def _notify_service() -> Mock:
        service = Mock()
        service.verify_notify_signature.return_value = True
        service.config.app_id = "test-app-id"
        service.config.seller_id = "2088000000000000"
        return service

    def _notify(self, *, payment: AlipayWebsitePayment, refund_amount: str):
        return self.client.post(
            "/api/accounts/payments/alipay/notify/",
            {
                "out_trade_no": payment.merchant_order_no,
                "trade_no": f"trade-notify-{payment.pk}",
                "trade_status": "TRADE_SUCCESS",
                "total_amount": "25.00",
                "refund_amount": refund_amount,
                "app_id": "test-app-id",
                "seller_id": "2088000000000000",
                "sign": "mock-signature",
            },
            format="json",
        )

    @patch("apps.accounts.views.payment.revoke_and_compact_payment_entitlement")
    @patch("apps.accounts.views.payment.get_alipay_service")
    @patch("apps.accounts.services.referral_refunds.reconcile_referral_refund")
    def test_query_full_refund_dispatches_after_canonical_discount_commit(
        self,
        mock_reconcile: Mock,
        mock_get_alipay_service: Mock,
        mock_revoke: Mock,
    ) -> None:
        payment = self._payment(suffix="query-full", with_discount=True)
        mock_get_alipay_service.return_value = self._query_service(
            payment=payment, trade_status="TRADE_SUCCESS", refund_amount="25.00",
        )

        def assert_committed(*, payment_id: int):
            self.assertFalse(connection.in_atomic_block)
            synced_payment = AlipayWebsitePayment.objects.get(pk=payment_id)
            application = PaymentDiscountApplication.objects.get(payment_id=payment_id)
            coupon = UserCoupon.objects.get(payment_applications=application)
            self.assertEqual(synced_payment.status, AlipayWebsitePayment.Status.REFUNDED)
            self.assertEqual(application.status, PaymentDiscountApplication.Status.REFUNDED)
            self.assertEqual(coupon.status, UserCoupon.Status.USED)
            self.assertEqual(coupon.used_payment_id, payment_id)
            self.assertIsNone(coupon.reserved_payment_id)

        mock_reconcile.side_effect = assert_committed

        result = _query_and_sync_payment_status(payment=payment)

        self.assertEqual(result, "synced")
        mock_reconcile.assert_called_once_with(payment_id=payment.pk)
        mock_revoke.assert_called_once()

    @patch("apps.accounts.views.payment.revoke_and_compact_payment_entitlement")
    @patch("apps.accounts.views.payment.get_alipay_service")
    @patch("apps.accounts.services.referral_refunds.reconcile_referral_refund")
    def test_notify_full_refund_dispatches_after_canonical_discount_commit(
        self,
        mock_reconcile: Mock,
        mock_get_alipay_service: Mock,
        mock_revoke: Mock,
    ) -> None:
        payment = self._payment(suffix="notify-full", with_discount=True)
        mock_get_alipay_service.return_value = self._notify_service()

        def assert_committed(*, payment_id: int):
            self.assertFalse(connection.in_atomic_block)
            synced_payment = AlipayWebsitePayment.objects.get(pk=payment_id)
            application = PaymentDiscountApplication.objects.get(payment_id=payment_id)
            coupon = UserCoupon.objects.get(payment_applications=application)
            self.assertEqual(synced_payment.status, AlipayWebsitePayment.Status.REFUNDED)
            self.assertEqual(application.status, PaymentDiscountApplication.Status.REFUNDED)
            self.assertEqual(coupon.status, UserCoupon.Status.USED)
            self.assertEqual(coupon.used_payment_id, payment_id)
            self.assertIsNone(coupon.reserved_payment_id)

        mock_reconcile.side_effect = assert_committed

        response = self._notify(payment=payment, refund_amount="25.00")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.content, b"success")
        mock_reconcile.assert_called_once_with(payment_id=payment.pk)
        mock_revoke.assert_called_once()

    @patch("apps.accounts.views.payment.process_pending_payment_grant_tasks_for_payment")
    @patch("apps.accounts.views.payment.get_alipay_service")
    @patch("apps.accounts.services.referral_refunds.reconcile_referral_refund")
    def test_query_non_refund_terminal_states_do_not_dispatch(
        self,
        mock_reconcile: Mock,
        mock_get_alipay_service: Mock,
        _mock_grants: Mock,
    ) -> None:
        cases = (
            ("created", AlipayWebsitePayment.Status.CREATED, "UNKNOWN", "0.00"),
            ("pending", AlipayWebsitePayment.Status.PENDING, "WAIT_BUYER_PAY", "0.00"),
            ("paid", AlipayWebsitePayment.Status.PENDING, "TRADE_SUCCESS", "0.00"),
            ("partial", AlipayWebsitePayment.Status.PAID, "TRADE_SUCCESS", "1.00"),
            ("failed", AlipayWebsitePayment.Status.FAILED, "WAIT_BUYER_PAY", "0.00"),
            ("closed", AlipayWebsitePayment.Status.PENDING, "TRADE_CLOSED", "0.00"),
        )
        for suffix, starting_status, trade_status, refund_amount in cases:
            with self.subTest(status=suffix):
                payment = self._payment(suffix=suffix, status_value=starting_status)
                mock_get_alipay_service.return_value = self._query_service(
                    payment=payment, trade_status=trade_status, refund_amount=refund_amount,
                )
                _query_and_sync_payment_status(payment=payment)

        mock_reconcile.assert_not_called()

    @patch("apps.accounts.views.payment.revoke_and_compact_payment_entitlement")
    @patch("apps.accounts.views.payment.get_alipay_service")
    @patch("apps.accounts.services.referral_refunds.reconcile_referral_refund")
    def test_referral_reconcile_database_error_does_not_block_notify_or_revocation(
        self,
        mock_reconcile: Mock,
        mock_get_alipay_service: Mock,
        mock_revoke: Mock,
    ) -> None:
        payment = self._payment(suffix="notify-error", with_discount=True)
        mock_get_alipay_service.return_value = self._notify_service()
        mock_reconcile.side_effect = DatabaseError("temporary referral failure")

        with self.assertLogs("apps.accounts.views.payment", level="ERROR"):
            response = self._notify(payment=payment, refund_amount="25.00")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.content, b"success")
        mock_revoke.assert_called_once()
        payment.refresh_from_db()
        application = PaymentDiscountApplication.objects.get(payment=payment)
        self.assertEqual(payment.status, AlipayWebsitePayment.Status.REFUNDED)
        self.assertEqual(application.status, PaymentDiscountApplication.Status.REFUNDED)

    @patch("apps.accounts.views.payment.revoke_and_compact_payment_entitlement")
    @patch("apps.accounts.views.payment.get_alipay_service")
    def test_ordinary_full_refund_and_replay_have_no_referral_side_effects(
        self,
        mock_get_alipay_service: Mock,
        mock_revoke: Mock,
    ) -> None:
        payment = self._payment(suffix="ordinary-full")
        entitlement = Entitlement.objects.create(
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(),
            expires_at=timezone.now() + timedelta(days=30),
        )
        mock_get_alipay_service.return_value = self._notify_service()

        first = self._notify(payment=payment, refund_amount="25.00")
        second = self._notify(payment=payment, refund_amount="25.00")

        self.assertEqual(first.content, b"success")
        self.assertEqual(second.content, b"success")
        payment.refresh_from_db()
        entitlement.refresh_from_db()
        self.assertEqual(payment.status, AlipayWebsitePayment.Status.REFUNDED)
        self.assertEqual(entitlement.status, Entitlement.Status.ACTIVE)
        self.assertEqual(ReferralNotice.objects.count(), 0)
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(mock_revoke.call_count, 2)
