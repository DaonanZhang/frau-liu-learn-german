from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    ModuleSeason,
    PaymentGrantTask,
    PurchaseOffer,
)
from apps.accounts.services.payment_grant_service import process_payment_grant_task_by_id
from apps.accounts.services.referral_campaign import CAMPAIGN_TAG
from apps.accounts.services.entitlement_grant_service import ExistingLifetimeAccessError


class PaymentGrantReferralHookTests(TestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            telephone="13700137111",
            country_code="+86",
            password="pass-123456",
        )
        self.exam_module, _ = Module.objects.get_or_create(
            key="exam_preparation", defaults={"name": "Exam Preparation"}
        )
        self.season, _ = ModuleSeason.objects.get_or_create(
            module=self.exam_module,
            season_number=1,
            defaults={"title": "TELC B1"},
        )
        self.other_module, _ = Module.objects.get_or_create(
            key="science", defaults={"name": "Science"}
        )
        self.exam_offer = self._offer("exam-s1", self.exam_module, self.season)
        self.other_offer = self._offer("science-all", self.other_module, None)

    @staticmethod
    def _offer(code: str, module: Module | None, season: ModuleSeason | None):
        offer, _ = PurchaseOffer.objects.get_or_create(
            code=code,
            defaults={
                "title": code,
                "module": module,
                "season": season,
                "plan": Entitlement.Plan.MONTH_1,
                "price_amount": Decimal("29.90"),
                "currency": "CNY",
                "is_active": True,
            },
        )
        return offer

    def _task(
        self,
        *,
        suffix: str,
        module: Module | None,
        season: ModuleSeason | None = None,
        paid: bool = True,
        status: str = PaymentGrantTask.Status.PENDING,
    ) -> PaymentGrantTask:
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"referral-hook-{suffix}",
            subject=suffix,
            total_amount=Decimal("29.90"),
            status=(
                AlipayWebsitePayment.Status.PAID
                if paid
                else AlipayWebsitePayment.Status.PENDING
            ),
            paid_at=timezone.now() if paid else None,
        )
        offer = self.exam_offer if module == self.exam_module else self.other_offer
        return PaymentGrantTask.objects.create(
            payment=payment,
            offer=offer,
            user=self.user,
            module=module,
            season=season,
            plan=Entitlement.Plan.MONTH_1,
            status=status,
        )

    @patch("apps.accounts.services.payment_grant_service.ensure_referral_code")
    def test_exam_preparation_hook_runs_after_entitlement_and_success_commit(
        self, ensure_referral_code
    ) -> None:
        task = self._task(suffix="exam-season", module=self.exam_module, season=self.season)
        def assert_committed_state(*, user, campaign_tag):
            self.assertEqual(user, self.user)
            self.assertEqual(campaign_tag, CAMPAIGN_TAG)
            self.assertEqual(
                PaymentGrantTask.objects.get(pk=task.pk).status,
                PaymentGrantTask.Status.SUCCEEDED,
            )
            self.assertTrue(
                Entitlement.objects.filter(
                    external_ref=f"alipay_payment:{task.payment.merchant_order_no}"
                ).exists()
            )

        ensure_referral_code.side_effect = assert_committed_state

        with self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=task.pk)

        task.refresh_from_db()
        entitlement = Entitlement.objects.get(
            external_ref=f"alipay_payment:{task.payment.merchant_order_no}"
        )
        ensure_referral_code.assert_called_once_with(
            user=self.user, campaign_tag=CAMPAIGN_TAG
        )
        self.assertEqual(task.status, PaymentGrantTask.Status.SUCCEEDED)
        self.assertEqual(entitlement.module, self.exam_module)
        self.assertEqual(entitlement.season, self.season)

    @patch("apps.accounts.services.payment_grant_service.ensure_referral_code")
    def test_platform_wide_grant_calls_hook_and_other_module_does_not(
        self, ensure_referral_code
    ) -> None:
        platform_task = self._task(suffix="platform", module=None)
        with self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=platform_task.pk)
        ensure_referral_code.assert_called_once_with(
            user=self.user, campaign_tag=CAMPAIGN_TAG
        )

        ensure_referral_code.reset_mock()
        unrelated_task = self._task(suffix="unrelated", module=self.other_module)
        with self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=unrelated_task.pk)
        ensure_referral_code.assert_not_called()

    @patch("apps.accounts.services.payment_grant_service.ensure_referral_code")
    def test_succeeded_task_reprocessing_does_not_schedule_hook(
        self, ensure_referral_code
    ) -> None:
        task = self._task(
            suffix="already-succeeded",
            module=self.exam_module,
            season=self.season,
            status=PaymentGrantTask.Status.SUCCEEDED,
        )
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            process_payment_grant_task_by_id(payment_grant_task_id=task.pk)

        self.assertEqual(callbacks, [])
        ensure_referral_code.assert_not_called()

    @patch("apps.accounts.services.payment_grant_service.ensure_referral_code")
    def test_unpaid_grant_failure_and_lifetime_cancellation_do_not_call_hook(
        self, ensure_referral_code
    ) -> None:
        unpaid_task = self._task(
            suffix="unpaid", module=self.exam_module, season=self.season, paid=False
        )
        with self.assertRaises(ValueError), self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=unpaid_task.pk)

        failed_task = self._task(suffix="grant-failure", module=self.exam_module, season=self.season)
        with patch(
            "apps.accounts.services.payment_grant_service.grant_or_extend_entitlement",
            side_effect=ValueError("grant failed"),
        ), self.assertRaises(ValueError), self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=failed_task.pk)

        canceled_task = self._task(suffix="lifetime", module=self.exam_module, season=self.season)
        with patch(
            "apps.accounts.services.payment_grant_service.grant_or_extend_entitlement",
            side_effect=ExistingLifetimeAccessError("lifetime access"),
        ), self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=canceled_task.pk)

        ensure_referral_code.assert_not_called()

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    @patch("apps.accounts.services.payment_grant_service.ensure_referral_code")
    def test_feature_flag_does_not_suppress_covering_hook(self, ensure_referral_code) -> None:
        task = self._task(suffix="flag-off", module=self.exam_module, season=self.season)
        with self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=task.pk)

        ensure_referral_code.assert_called_once_with(
            user=self.user, campaign_tag=CAMPAIGN_TAG
        )

    @patch(
        "apps.accounts.services.payment_grant_service.ensure_referral_code",
        side_effect=RuntimeError("referral backend unavailable"),
    )
    def test_ensure_failure_does_not_change_committed_grant(self, ensure_referral_code) -> None:
        task = self._task(suffix="robust-failure", module=self.exam_module, season=self.season)
        with self.captureOnCommitCallbacks(execute=True):
            process_payment_grant_task_by_id(payment_grant_task_id=task.pk)

        task.refresh_from_db()
        self.assertEqual(task.status, PaymentGrantTask.Status.SUCCEEDED)
        self.assertTrue(
            Entitlement.objects.filter(
                external_ref=f"alipay_payment:{task.payment.merchant_order_no}"
            ).exists()
        )
        ensure_referral_code.assert_called_once()
