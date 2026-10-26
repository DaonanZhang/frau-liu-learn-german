from dataclasses import FrozenInstanceError
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Entitlement, Module, ModuleSeason
from apps.accounts.services import referral_campaign
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN, ReferralCampaignConfig


class ReferralBackfillSelectionTests(TestCase):
    def setUp(self):
        self.User = get_user_model()
        self.module = Module.objects.get(key="exam_preparation")
        self.other_module = Module.objects.exclude(pk=self.module.pk).first()
        if self.other_module is None:
            self.other_module = Module.objects.create(key="backfill_other", name="Other")
        self.season = ModuleSeason.objects.create(
            module=self.module, season_number=809, title="Backfill selection"
        )

    def user(self):
        number = 13700000000 + self.User.objects.count()
        return self.User.objects.create_user(telephone=str(number), password="pass")

    def entitlement(self, user, **values):
        return Entitlement.objects.create(
            user=user, plan=Entitlement.Plan.MONTH_1, **values
        )

    def test_stats_are_frozen_and_default_to_zero(self):
        self.assertTrue(hasattr(referral_campaign, "ReferralBackfillStats"))
        stats_type = referral_campaign.ReferralBackfillStats
        stats = stats_type()
        self.assertEqual(
            (stats.created, stats.existing, stats.skipped, stats.failed), (0, 0, 0, 0)
        )
        self.assertEqual(
            stats_type(created=1, existing=2, skipped=3, failed=4),
            stats_type(1, 2, 3, 4),
        )
        with self.assertRaises(FrozenInstanceError):
            stats.created = 1

    def test_includes_all_historical_statuses_scopes_and_duplicates_once_in_pk_order(self):
        self.assertTrue(hasattr(referral_campaign, "_eligible_referral_backfill_users"))
        now = timezone.now()
        eligible = []
        for status in Entitlement.Status.values:
            user = self.user()
            eligible.append(user)
            self.entitlement(
                user,
                module=self.module,
                status=status,
                starts_at=now + timedelta(days=2),
                expires_at=now - timedelta(days=2),
            )
        expired_user = self.user()
        eligible.append(expired_user)
        self.entitlement(
            expired_user,
            module=self.module,
            starts_at=now - timedelta(days=2),
            expires_at=now - timedelta(days=1),
        )
        future_user = self.user()
        eligible.append(future_user)
        self.entitlement(
            future_user,
            module=self.module,
            starts_at=now + timedelta(days=1),
        )
        module_season_user = self.user()
        eligible.append(module_season_user)
        self.entitlement(module_season_user, module=self.module, season=self.season)

        duplicate_user = self.user()
        eligible.append(duplicate_user)
        self.entitlement(duplicate_user, module=self.module)
        self.entitlement(duplicate_user, module=self.module, season=self.season)

        platform_user = self.user()
        eligible.append(platform_user)
        self.entitlement(platform_user)

        self.assertEqual(
            list(referral_campaign._eligible_referral_backfill_users().values_list("pk", flat=True)),
            sorted(user.pk for user in eligible),
        )

    def test_excludes_out_of_scope_users_is_lazy_defers_fields_and_honors_config(self):
        self.assertTrue(hasattr(referral_campaign, "_eligible_referral_backfill_users"))
        custom_module = Module.objects.create(key="custom_referral_scope", name="Custom")
        candidate = self.user()
        self.entitlement(candidate, module=custom_module)
        no_history = self.user()
        unrelated = self.user()
        self.entitlement(unrelated, module=self.other_module)
        season_only = self.user()
        self.entitlement(season_only, season=self.season)
        default_only = self.user()
        self.entitlement(default_only, module=self.module)
        custom_config = ReferralCampaignConfig(
            campaign_tag="custom",
            campaign_name="Custom",
            code_prefix="CUS",
            module_key=custom_module.key,
            suffix_length=4,
            alphabet="ABCD",
        )

        with self.assertNumQueries(0):
            queryset = referral_campaign._eligible_referral_backfill_users(config=custom_config)
        with self.assertNumQueries(1):
            users = list(queryset)
        self.assertEqual([user.pk for user in users], [candidate.pk])
        self.assertEqual(users[0].get_deferred_fields(), {
            field.attname for field in self.User._meta.concrete_fields
            if not field.primary_key
        })
        self.assertTrue({"telephone", "email", "first_name", "last_name"}.issubset(
            users[0].get_deferred_fields()
        ))
        self.assertNotIn("id", users[0].get_deferred_fields())
        self.assertNotIn("pk", users[0].get_deferred_fields())
        self.assertEqual(FIRST_REFERRAL_CAMPAIGN.module_key, "exam_preparation")
