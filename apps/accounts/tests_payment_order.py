from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.accounts.models import PaymentOrder


class PaymentOrderModelTests(TestCase):
    def test_provider_values_and_entitlement_external_ref(self) -> None:
        payment = PaymentOrder.objects.create(
            merchant_order_no="ORDER-ALIPAY-1",
            subject="Test payment",
            total_amount="29.90",
            provider=PaymentOrder.Provider.ALIPAY,
        )

        self.assertEqual(PaymentOrder.Provider.ALIPAY, "alipay")
        self.assertEqual(PaymentOrder.Provider.WECHAT_PAY, "wechat_pay")
        self.assertEqual(
            payment.entitlement_external_ref,
            "payment:alipay:ORDER-ALIPAY-1",
        )

    def test_multiple_blank_provider_trade_numbers_are_allowed(self) -> None:
        for suffix in ("1", "2"):
            PaymentOrder.objects.create(
                merchant_order_no=f"ORDER-BLANK-{suffix}",
                subject="Test payment",
                total_amount="29.90",
                provider=PaymentOrder.Provider.ALIPAY,
            )

        self.assertEqual(PaymentOrder.objects.filter(provider_trade_no="").count(), 2)

    def test_provider_trade_number_is_unique_within_provider(self) -> None:
        PaymentOrder.objects.create(
            merchant_order_no="ORDER-UNIQUE-1",
            subject="Test payment",
            total_amount="29.90",
            provider=PaymentOrder.Provider.ALIPAY,
            provider_trade_no="TRADE-1",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PaymentOrder.objects.create(
                merchant_order_no="ORDER-UNIQUE-2",
                subject="Test payment",
                total_amount="29.90",
                provider=PaymentOrder.Provider.ALIPAY,
                provider_trade_no="TRADE-1",
            )

    def test_same_trade_number_is_allowed_for_different_providers(self) -> None:
        for provider, suffix in (
            (PaymentOrder.Provider.ALIPAY, "ALIPAY"),
            (PaymentOrder.Provider.WECHAT_PAY, "WECHAT"),
        ):
            PaymentOrder.objects.create(
                merchant_order_no=f"ORDER-{suffix}",
                subject="Test payment",
                total_amount="29.90",
                provider=provider,
                provider_trade_no="SHARED-TRADE-1",
            )

        self.assertEqual(
            PaymentOrder.objects.filter(provider_trade_no="SHARED-TRADE-1").count(),
            2,
        )
