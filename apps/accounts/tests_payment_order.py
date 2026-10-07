from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    Entitlement,
    Module,
    PaymentDiscountApplication,
    PaymentGrantTask,
    PaymentOrder,
    PromotionCodeRecord,
    PurchaseOffer,
    UserCoupon,
)
from apps.accounts.services.entitlement_grant_service import (
    revoke_and_compact_payment_entitlement,
)
from apps.accounts.services.payment_grant_service import process_payment_grant_task_by_id
from apps.accounts.services.promotion_codes import sync_payment_discount_status


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


class PaymentOrderSharedServiceTests(TestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            telephone="13900000135",
            password="test-password",
        )
        self.module = Module.objects.create(key="shared-payment", name="Shared payment")
        self.offer = PurchaseOffer.objects.create(
            code="shared-payment-m1",
            title="Shared payment M1",
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount="29.90",
        )

    def _paid_order(self, *, provider: str, suffix: str) -> PaymentOrder:
        return PaymentOrder.objects.create(
            merchant_order_no=f"SHARED-{suffix}",
            subject="Shared payment",
            total_amount="29.90",
            provider=provider,
            status=PaymentOrder.Status.PAID,
            paid_at=timezone.now(),
        )

    def test_retry_uses_canonical_ref_without_duplicate_entitlement(self) -> None:
        payment = self._paid_order(provider=PaymentOrder.Provider.ALIPAY, suffix="RETRY")
        Entitlement.objects.create(
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            starts_at=timezone.now(),
            expires_at=timezone.now() + timedelta(days=30),
            external_ref=payment.entitlement_external_ref,
        )
        task = PaymentGrantTask.objects.create(
            payment=payment,
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            status=PaymentGrantTask.Status.FAILED,
        )

        process_payment_grant_task_by_id(payment_grant_task_id=task.pk)

        self.assertEqual(
            Entitlement.objects.filter(external_ref=payment.entitlement_external_ref).count(),
            1,
        )
        task.refresh_from_db()
        self.assertEqual(task.status, PaymentGrantTask.Status.SUCCEEDED)

    def test_wechat_order_grants_and_revokes_by_canonical_ref(self) -> None:
        payment = self._paid_order(provider=PaymentOrder.Provider.WECHAT_PAY, suffix="WECHAT")
        task = PaymentGrantTask.objects.create(
            payment=payment,
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
        )

        process_payment_grant_task_by_id(payment_grant_task_id=task.pk)

        entitlement = Entitlement.objects.get(external_ref=payment.entitlement_external_ref)
        self.assertEqual(entitlement.external_ref, "payment:wechat_pay:SHARED-WECHAT")
        self.assertTrue(revoke_and_compact_payment_entitlement(payment=payment))
        entitlement.refresh_from_db()
        self.assertEqual(entitlement.status, Entitlement.Status.CANCELED)

    def test_coupon_state_transitions_are_provider_neutral(self) -> None:
        for provider, suffix in (
            (PaymentOrder.Provider.ALIPAY, "COUPON-A"),
            (PaymentOrder.Provider.WECHAT_PAY, "COUPON-W"),
        ):
            payment = self._paid_order(provider=provider, suffix=suffix)
            code = PromotionCodeRecord.objects.create(
                code=f"CODE-{suffix}",
                campaign_name="Shared payment",
                discount_amount="5.00",
            )
            coupon = UserCoupon.objects.create(
                user=self.user,
                promotion_code=code,
                discount_amount="5.00",
                status=UserCoupon.Status.RESERVED,
                reserved_payment=payment,
            )
            application = PaymentDiscountApplication.objects.create(
                payment=payment,
                coupon=coupon,
                promotion_code=code,
                user=self.user,
                offer=self.offer,
                original_amount="29.90",
                promotion_discount_amount="5.00",
                final_amount="24.90",
            )

            sync_payment_discount_status(payment_id=payment.pk)

            coupon.refresh_from_db()
            application.refresh_from_db()
            self.assertEqual(coupon.status, UserCoupon.Status.USED)
            self.assertEqual(application.status, PaymentDiscountApplication.Status.APPLIED)

            closed_payment = PaymentOrder.objects.create(
                merchant_order_no=f"SHARED-{suffix}-CLOSED",
                subject="Shared payment",
                total_amount="24.90",
                provider=provider,
                status=PaymentOrder.Status.CLOSED,
            )
            release_code = PromotionCodeRecord.objects.create(
                code=f"RELEASE-{suffix}",
                campaign_name="Shared payment",
                discount_amount="5.00",
            )
            released_coupon = UserCoupon.objects.create(
                user=self.user,
                promotion_code=release_code,
                discount_amount="5.00",
                status=UserCoupon.Status.RESERVED,
                reserved_payment=closed_payment,
            )
            released_application = PaymentDiscountApplication.objects.create(
                payment=closed_payment,
                coupon=released_coupon,
                promotion_code=release_code,
                user=self.user,
                offer=self.offer,
                original_amount="29.90",
                promotion_discount_amount="5.00",
                final_amount="24.90",
            )

            sync_payment_discount_status(payment_id=closed_payment.pk)

            released_coupon.refresh_from_db()
            released_application.refresh_from_db()
            self.assertEqual(released_coupon.status, UserCoupon.Status.AVAILABLE)
            self.assertEqual(
                released_application.status,
                PaymentDiscountApplication.Status.RELEASED,
            )
