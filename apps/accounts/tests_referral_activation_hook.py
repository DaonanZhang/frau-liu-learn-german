from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.accounts.models import (
    ActivationCodeRecord,
    Entitlement,
    Module,
    ModuleSeason,
)
from apps.accounts.security.activation import apply_activation_code_for_user
from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPayload,
    ActivationPlan,
    store_activation_code,
)
from apps.accounts.services.referral_campaign import CAMPAIGN_TAG


class ActivationReferralHookTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13600136021", password="pass"
        )
        self.exam_module = Module.objects.get(key="exam_preparation")
        self.other_module = Module.objects.create(
            key="activation_hook_other", name="Other", is_active=True
        )
        self.exam_season = ModuleSeason.objects.create(
            module=self.exam_module, season_number=901, title="Referral activation"
        )

    def store_code(self, code, *entitlements):
        store_activation_code(
            code=code,
            payload=ActivationPayload(entitlements=list(entitlements)),
        )

    def exam_access(self, season_number=None):
        return ActivationEntitlementItem(
            module_key="exam_preparation",
            plan=ActivationPlan.LIFETIME,
            season_number=season_number,
        )

    def test_exam_activation_calls_ensure_after_grant_and_consumption(self):
        code = "REFHOOK01"
        self.store_code(code, self.exam_access())

        def ensure(*, user, campaign_tag):
            record = ActivationCodeRecord.objects.get(code=code)
            self.assertEqual(record.status, ActivationCodeRecord.Status.CONSUMED)
            self.assertEqual(record.consumed_by_user_id, self.user.pk)
            self.assertTrue(
                Entitlement.objects.filter(
                    user=self.user, module=self.exam_module
                ).exists()
            )
            self.assertIs(user, self.user)
            self.assertEqual(campaign_tag, CAMPAIGN_TAG)

        with patch(
            "apps.accounts.security.activation.ensure_referral_code", side_effect=ensure
        ) as ensure_mock:
            with self.captureOnCommitCallbacks(execute=True):
                apply_activation_code_for_user(user=self.user, code=code)

        ensure_mock.assert_called_once_with(user=self.user, campaign_tag=CAMPAIGN_TAG)

    def test_platform_wide_grant_calls_ensure_once(self):
        code = "REFHOOK07"
        self.store_code(
            code,
            ActivationEntitlementItem(
                module_key=self.other_module.key, plan=ActivationPlan.LIFETIME
            ),
        )

        def grant_platform_wide(**kwargs):
            return Entitlement.objects.create(
                user=self.user,
                module=None,
                season=None,
                plan=Entitlement.Plan.LIFETIME,
                external_ref=f"activation_code:{code}",
            )

        with patch(
            "apps.accounts.security.activation.grant_or_extend_entitlement",
            side_effect=grant_platform_wide,
        ), patch(
            "apps.accounts.security.activation.ensure_referral_code"
        ) as ensure:
            with self.captureOnCommitCallbacks(execute=True):
                apply_activation_code_for_user(user=self.user, code=code)

        self.assertTrue(
            Entitlement.objects.filter(
                user=self.user, module__isnull=True, season__isnull=True
            ).exists()
        )
        ensure.assert_called_once_with(user=self.user, campaign_tag=CAMPAIGN_TAG)

    def test_multiple_covering_grants_call_ensure_once_and_season_counts(self):
        self.store_code(
            "REFHOOK02", self.exam_access(season_number=901), self.exam_access()
        )

        with patch(
            "apps.accounts.security.activation.ensure_referral_code"
        ) as ensure:
            with self.captureOnCommitCallbacks(execute=True):
                apply_activation_code_for_user(user=self.user, code="REFHOOK02")

        self.assertEqual(
            Entitlement.objects.filter(user=self.user, module=self.exam_module).count(),
            2,
        )
        ensure.assert_called_once_with(user=self.user, campaign_tag=CAMPAIGN_TAG)

    def test_unrelated_only_grant_does_not_call_ensure(self):
        self.store_code(
            "REFHOOK03",
            ActivationEntitlementItem(
                module_key=self.other_module.key, plan=ActivationPlan.LIFETIME
            ),
        )

        with patch(
            "apps.accounts.security.activation.ensure_referral_code"
        ) as ensure:
            with self.captureOnCommitCallbacks(execute=True):
                apply_activation_code_for_user(user=self.user, code="REFHOOK03")

        ensure.assert_not_called()

    def test_grant_failure_rolls_back_and_does_not_call_ensure(self):
        self.store_code("REFHOOK04", self.exam_access())

        with patch(
            "apps.accounts.security.activation.grant_or_extend_entitlement",
            side_effect=ValueError("database grant failed"),
        ), patch(
            "apps.accounts.security.activation.ensure_referral_code"
        ) as ensure:
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaisesRegex(ValueError, "database grant failed"):
                    apply_activation_code_for_user(user=self.user, code="REFHOOK04")

        ensure.assert_not_called()
        self.assertFalse(Entitlement.objects.filter(user=self.user).exists())
        record = ActivationCodeRecord.objects.get(code="REFHOOK04")
        self.assertEqual(record.status, ActivationCodeRecord.Status.ACTIVE)
        self.assertIsNone(record.consumed_by_user_id)

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    def test_covering_activation_ensures_code_when_feature_flag_is_false(self):
        self.store_code("REFHOOK05", self.exam_access())

        with patch(
            "apps.accounts.security.activation.ensure_referral_code"
        ) as ensure:
            with self.captureOnCommitCallbacks(execute=True):
                apply_activation_code_for_user(user=self.user, code="REFHOOK05")

        ensure.assert_called_once_with(user=self.user, campaign_tag=CAMPAIGN_TAG)

    def test_ensure_failure_does_not_undo_successful_activation(self):
        self.store_code("REFHOOK06", self.exam_access())

        with patch(
            "apps.accounts.security.activation.ensure_referral_code",
            side_effect=RuntimeError("referral creation failed"),
        ) as ensure:
            with self.captureOnCommitCallbacks(execute=True):
                granted = apply_activation_code_for_user(user=self.user, code="REFHOOK06")

        ensure.assert_called_once_with(user=self.user, campaign_tag=CAMPAIGN_TAG)
        self.assertEqual(len(granted), 1)
        self.assertEqual(
            ActivationCodeRecord.objects.get(code="REFHOOK06").status,
            ActivationCodeRecord.Status.CONSUMED,
        )
        self.assertEqual(Entitlement.objects.filter(user=self.user).count(), 1)
