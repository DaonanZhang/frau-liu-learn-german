from decimal import Decimal
from unittest.mock import call, patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.test import TestCase, override_settings

from apps.accounts.models import Entitlement, Module, PromotionCodeRecord, ReferralCode
from apps.accounts.services import referral_campaign
from apps.accounts.services.referral_campaign import CAMPAIGN_TAG


class ReferralCodeBackfillTests(TestCase):
    def setUp(self):
        self.User = get_user_model()
        self.module = Module.objects.get(key="exam_preparation")

    def user(self, telephone):
        return self.User.objects.create_user(telephone=telephone, password="pass")

    def grant_access(self, user):
        return Entitlement.objects.create(
            user=user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
        )

    def existing_referral(self, user, code):
        promotion = PromotionCodeRecord.objects.create(
            code=code,
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="Existing",
            discount_amount=Decimal("5.00"),
        )
        return ReferralCode.objects.create(
            user=user,
            campaign_tag=CAMPAIGN_TAG,
            code_prefix="BK1",
            promotion_code=promotion,
        )

    def test_prefix_preflight_runs_first_once_and_failure_stops_selection_and_writes(self):
        events = []
        error = ValueError("prefix collision")

        def preflight(*, config):
            events.append(("preflight", config))
            raise error

        def selection(*, config):
            events.append(("selection", config))
            return []

        with (
            patch.object(referral_campaign, "assert_referral_code_prefix_available", side_effect=preflight) as check,
            patch.object(referral_campaign, "_eligible_referral_backfill_users", side_effect=selection) as eligible,
            patch.object(referral_campaign, "ensure_referral_code") as ensure,
        ):
            with self.assertRaises(ValueError) as raised:
                referral_campaign.backfill_referral_codes(dry_run=False)

        self.assertIs(raised.exception, error)
        self.assertEqual(events, [("preflight", referral_campaign.FIRST_REFERRAL_CAMPAIGN)])
        check.assert_called_once_with(config=referral_campaign.FIRST_REFERRAL_CAMPAIGN)
        eligible.assert_not_called()
        ensure.assert_not_called()
        self.assertEqual(ReferralCode.objects.count(), 0)
        self.assertEqual(PromotionCodeRecord.objects.count(), 0)

    def test_known_per_user_failures_are_counted_and_processing_continues_in_pk_order(self):
        users = [self.user(f"1360014110{index}") for index in range(5)]
        for user in users:
            self.grant_access(user)

        errors = [ValueError("bad user"), RuntimeError("creation failed"), DatabaseError("db failure")]

        with (
            patch.object(referral_campaign, "assert_referral_code_prefix_available"),
            patch.object(
                referral_campaign,
                "ensure_referral_code",
                side_effect=[*errors, None, None],
            ) as ensure,
        ):
            stats = referral_campaign.backfill_referral_codes(dry_run=False)

        self.assertEqual(stats, referral_campaign.ReferralBackfillStats(created=2, failed=3))
        self.assertEqual(
            ensure.call_args_list,
            [call(user=user, campaign_tag=CAMPAIGN_TAG) for user in users],
        )

    def test_unexpected_type_error_propagates_without_processing_later_users(self):
        users = [self.user("13600141110"), self.user("13600141111")]
        for user in users:
            self.grant_access(user)
        error = TypeError("unexpected failure")

        with (
            patch.object(referral_campaign, "assert_referral_code_prefix_available"),
            patch.object(referral_campaign, "ensure_referral_code", side_effect=error) as ensure,
        ):
            with self.assertRaises(TypeError) as raised:
                referral_campaign.backfill_referral_codes(dry_run=False)

        self.assertIs(raised.exception, error)
        ensure.assert_called_once_with(user=users[0], campaign_tag=CAMPAIGN_TAG)

    def test_database_error_from_prefix_preflight_propagates_before_selection_and_ensure(self):
        error = DatabaseError("preflight query failed")
        with (
            patch.object(referral_campaign, "assert_referral_code_prefix_available", side_effect=error),
            patch.object(referral_campaign, "_eligible_referral_backfill_users") as eligible,
            patch.object(referral_campaign, "ensure_referral_code") as ensure,
        ):
            with self.assertRaises(DatabaseError) as raised:
                referral_campaign.backfill_referral_codes(dry_run=False)

        self.assertIs(raised.exception, error)
        eligible.assert_not_called()
        ensure.assert_not_called()

    def test_dry_run_counts_existing_and_missing_without_ensure_or_writes(self):
        existing = self.user("13600141001")
        missing = self.user("13600141002")
        self.grant_access(existing)
        self.grant_access(missing)
        self.existing_referral(existing, "BK1-EXISTING01")
        referral_rows = list(ReferralCode.objects.values_list("pk", "user_id", "promotion_code_id"))
        promotion_rows = list(PromotionCodeRecord.objects.values_list("pk", "code"))

        with (
            patch.object(referral_campaign, "assert_referral_code_prefix_available"),
            patch.object(referral_campaign, "ensure_referral_code") as ensure,
        ):
            stats = referral_campaign.backfill_referral_codes(dry_run=True)

        self.assertEqual(stats, referral_campaign.ReferralBackfillStats(existing=1, skipped=1))
        ensure.assert_not_called()
        self.assertEqual(
            list(ReferralCode.objects.values_list("pk", "user_id", "promotion_code_id")),
            referral_rows,
        )
        self.assertEqual(list(PromotionCodeRecord.objects.values_list("pk", "code")), promotion_rows)

    def test_actual_creation_then_rerun_has_exact_idempotent_counts(self):
        users = [self.user("13600141011"), self.user("13600141012")]
        for user in users:
            self.grant_access(user)
        codes = iter(("BK1-BACKFILL01", "BK1-BACKFILL02"))

        with (
            patch.object(referral_campaign, "assert_referral_code_prefix_available"),
            patch(
                "apps.accounts.services.activation_codes.activation_code_exists",
                return_value=False,
            ),
            patch.object(
                referral_campaign,
                "generate_referral_code_candidate",
                side_effect=lambda **kwargs: next(codes),
            ),
        ):
            first = referral_campaign.backfill_referral_codes(dry_run=False)
            second = referral_campaign.backfill_referral_codes(dry_run=False)

        self.assertEqual(first, referral_campaign.ReferralBackfillStats(created=2))
        self.assertEqual(second, referral_campaign.ReferralBackfillStats(existing=2))
        self.assertEqual(ReferralCode.objects.filter(campaign_tag=CAMPAIGN_TAG).count(), 2)
        self.assertEqual(
            PromotionCodeRecord.objects.filter(source_kind=PromotionCodeRecord.SourceKind.REFERRAL).count(),
            2,
        )

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    def test_flag_false_still_uses_real_eligibility_and_processes_users_in_pk_order(self):
        first = self.user("13600141021")
        excluded = self.user("13600141022")
        last = self.user("13600141023")
        self.grant_access(first)
        self.grant_access(last)
        other_module = Module.objects.create(key="backfill_excluded", name="Excluded")
        Entitlement.objects.create(
            user=excluded,
            module=other_module,
            plan=Entitlement.Plan.MONTH_1,
        )
        before = (ReferralCode.objects.count(), PromotionCodeRecord.objects.count())

        with (
            patch(
                "apps.accounts.services.activation_codes.legacy_activation_code_prefix_exists",
                return_value=False,
            ),
            patch.object(referral_campaign, "ensure_referral_code", return_value=None) as ensure,
            patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=False) as flag,
        ):
            stats = referral_campaign.backfill_referral_codes(dry_run=False)

        self.assertEqual(stats, referral_campaign.ReferralBackfillStats(created=2))
        self.assertEqual(
            ensure.call_args_list,
            [call(user=first, campaign_tag=CAMPAIGN_TAG), call(user=last, campaign_tag=CAMPAIGN_TAG)],
        )
        flag.assert_not_called()
        self.assertEqual((ReferralCode.objects.count(), PromotionCodeRecord.objects.count()), before)
