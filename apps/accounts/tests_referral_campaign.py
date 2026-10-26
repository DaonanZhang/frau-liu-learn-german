from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from apps.accounts.models import Entitlement, Module, ModuleSeason
from apps.accounts.services.referral_campaign import (
    CAMPAIGN_NAME,
    CAMPAIGN_TAG,
    CODE_PREFIX,
    FIRST_REFERRAL_CAMPAIGN,
    ReferralCampaignConfig,
    has_historical_exam_preparation_access,
    is_reserved_referral_code,
)


class ReferralCampaignConfigTests(SimpleTestCase):
    def test_first_campaign_configuration_contract(self):
        self.assertEqual(CAMPAIGN_TAG, "exam_preparation_referral_v1")
        self.assertEqual(CAMPAIGN_NAME, "备考季推广")
        self.assertEqual(CODE_PREFIX, "BK1")
        self.assertIsInstance(FIRST_REFERRAL_CAMPAIGN, ReferralCampaignConfig)
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.campaign_tag, CAMPAIGN_TAG)
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.campaign_name, CAMPAIGN_NAME)
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.code_prefix, CODE_PREFIX)
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.module_key, "exam_preparation")
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.suffix_length, 9)
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.alphabet, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.alphabet, FIRST_REFERRAL_CAMPAIGN.alphabet.upper())
        with self.assertRaises((AttributeError, TypeError)):
            FIRST_REFERRAL_CAMPAIGN.suffix_length = 8


class ReservedReferralCodeTests(SimpleTestCase):
    def test_matches_only_the_first_campaign_prefix_with_normalization(self):
        for code in ("BK1-ABC123", "bk1-abc123", "  bK1-AbC123  "):
            with self.subTest(code=code):
                self.assertTrue(is_reserved_referral_code(code))

    def test_rejects_empty_or_non_boundary_prefixes(self):
        for code in (None, "", "   ", "BK1", "BK1X-ABC", "BK10-ABC", "XBK1-ABC"):
            with self.subTest(code=code):
                self.assertFalse(is_reserved_referral_code(code))


class HistoricalExamPreparationAccessTests(TestCase):
    def setUp(self):
        self.User = get_user_model()
        self.user = self.User.objects.create_user(telephone="13600136011", password="pass")
        self.other_user = self.User.objects.create_user(telephone="13600136012", password="pass")
        self.exam_module = Module.objects.get(key="exam_preparation")
        self.other_module = Module.objects.exclude(key="exam_preparation").first()
        if self.other_module is None:
            self.other_module = Module.objects.create(key="referral_test_other", name="Other")
        self.exam_season = ModuleSeason.objects.create(
            module=self.exam_module, season_number=701, title="Referral test"
        )

    def grant(self, user=None, **values):
        return Entitlement.objects.create(
            user=user or self.user,
            plan=Entitlement.Plan.MONTH_1,
            **values,
        )

    def test_no_history_is_false(self):
        self.assertFalse(has_historical_exam_preparation_access(user=self.user))

    def test_module_and_season_entitlements_are_true(self):
        for scope in (
            {"module": self.exam_module},
            {"module": self.exam_module, "season": self.exam_season},
        ):
            with self.subTest(scope=scope):
                self.grant(**scope)
                self.assertTrue(has_historical_exam_preparation_access(user=self.user))
                Entitlement.objects.filter(user=self.user).delete()

    def test_platform_wide_requires_both_scope_fields_to_be_null(self):
        self.grant()
        self.assertTrue(has_historical_exam_preparation_access(user=self.user))

        Entitlement.objects.filter(user=self.user).delete()
        self.grant(season=self.exam_season)
        self.assertFalse(has_historical_exam_preparation_access(user=self.user))

    def test_unrelated_module_does_not_count(self):
        self.grant(module=self.other_module)
        self.assertFalse(has_historical_exam_preparation_access(user=self.user))

    def test_status_and_validity_timestamps_do_not_change_historical_access(self):
        now = timezone.now()
        for status in Entitlement.Status.values:
            with self.subTest(status=status):
                self.grant(
                    module=self.exam_module,
                    status=status,
                    starts_at=now + timedelta(days=10),
                    expires_at=now - timedelta(days=1),
                )
                self.assertTrue(has_historical_exam_preparation_access(user=self.user))
                Entitlement.objects.filter(user=self.user).delete()

    def test_before_is_strict_and_excludes_boundary_and_later_rows(self):
        before = timezone.now()
        earlier = self.grant(module=self.exam_module)
        boundary = self.grant(module=self.exam_module)
        later = self.grant(module=self.exam_module)
        Entitlement.objects.filter(pk=earlier.pk).update(created_at=before - timedelta(microseconds=1))
        Entitlement.objects.filter(pk=boundary.pk).update(created_at=before)
        Entitlement.objects.filter(pk=later.pk).update(created_at=before + timedelta(microseconds=1))

        self.assertTrue(has_historical_exam_preparation_access(user=self.user, before=before))
        Entitlement.objects.filter(pk=earlier.pk).delete()
        self.assertFalse(has_historical_exam_preparation_access(user=self.user, before=before))

    def test_exact_external_ref_exclusion_is_scoped_to_user(self):
        self.grant(module=self.exam_module, external_ref="payment-1")
        self.assertTrue(
            has_historical_exam_preparation_access(user=self.user, exclude_external_ref="")
        )
        self.assertTrue(has_historical_exam_preparation_access(user=self.user))
        self.assertFalse(
            has_historical_exam_preparation_access(
                user=self.user, exclude_external_ref="payment-1"
            )
        )

        Entitlement.objects.filter(user=self.user).delete()
        self.grant(module=self.exam_module, external_ref="payment-10")
        self.assertTrue(
            has_historical_exam_preparation_access(
                user=self.user, exclude_external_ref="payment-1"
            )
        )

        Entitlement.objects.filter(user=self.user).delete()
        self.grant(
            user=self.other_user, module=self.exam_module, external_ref="payment-10"
        )
        self.assertFalse(
            has_historical_exam_preparation_access(
                user=self.user, exclude_external_ref="payment-1"
            )
        )
