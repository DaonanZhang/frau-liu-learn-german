from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.db.models.query import QuerySet

from apps.accounts.models import (
    Entitlement, Module, ModuleSeason, ReferralCode, ReferralParticipation, ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN


class ReferralRefundDebitTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13610000001", password="pass")
        self.referred = User.objects.create_user(telephone="13610000002", password="pass")
        self.module, _ = Module.objects.get_or_create(key="exam_preparation", defaults={"name": "Exam preparation"})
        self.code = ReferralCode.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1", promotion_code_id=self._promotion().pk,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.referred, referral_code=self.code,
        )
        self.at = datetime(2026, 10, 15, 12, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.expiry = datetime(2026, 12, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.entitlement = Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            starts_at=datetime(2026, 11, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=self.expiry,
            external_ref=f"referral_reward:{self.participation.campaign_tag}:{self.participation.pk}:month",
        )
        self.reward = ReferralReward.objects.create(
            campaign_tag=self.participation.campaign_tag, referrer=self.user,
            participation=self.participation, kind=ReferralReward.Kind.REFERRAL_MONTH,
            amount_days=30, threshold=None, generation=1, entitlement=self.entitlement,
            idempotency_key=f"referral:{self.participation.campaign_tag}:participation:{self.participation.pk}:month",
        )

    @staticmethod
    def _promotion():
        from apps.accounts.models import PromotionCodeRecord
        return PromotionCodeRecord.objects.create(
            code=f"REFUND{get_user_model().objects.count():04d}", source_kind="referral",
            campaign_name="test", discount_amount="5.00"
        )

    def test_debits_exactly_thirty_days_and_replay_is_idempotent(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        prior = Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 10, 2, 12, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=datetime(2026, 11, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")), external_ref="purchase:prior",
        )
        self.assertEqual(debit_exam_preparation_reward(reward=self.reward, at=self.at),
                         datetime(2026, 11, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")))
        self.entitlement.refresh_from_db()
        prior.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(self.entitlement.status, Entitlement.Status.CANCELED)
        self.assertEqual(prior.expires_at, datetime(2026, 11, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")))
        self.assertEqual(max(Entitlement.objects.filter(
            user=self.user, module=self.module, season=None, status=Entitlement.Status.ACTIVE,
            expires_at__isnull=False,
        ).values_list("expires_at", flat=True)), datetime(2026, 11, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")))
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(self.reward.revoked_at, self.at)
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))

    def test_less_than_thirty_days_debits_only_to_shanghai_day_end(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        self.entitlement.expires_at = datetime(2026, 10, 25, 9, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.entitlement.starts_at = datetime(2026, 9, 25, 9, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.entitlement.save(update_fields=["expires_at", "starts_at"])
        target = datetime(2026, 10, 15, 23, 59, 59, 999999, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.assertEqual(debit_exam_preparation_reward(reward=self.reward, at=self.at), target)
        self.entitlement.refresh_from_db()
        self.assertEqual(self.entitlement.expires_at, target)
        self.reward.refresh_from_db()
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))

    def test_cancelled_linked_row_replays_and_invalid_revoked_record_fails_closed(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        prior = Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 10, 2, 12, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=datetime(2026, 11, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")), external_ref="purchase:prior-replay",
        )
        debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.reward.refresh_from_db()
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.reward.revocation_pending_at = self.at
        self.reward.save(update_fields=["revocation_pending_at"])
        with self.assertRaises(ValueError):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)

    def test_stale_passed_referrer_does_not_select_lock_owner(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        self._prior_entitlement()
        other = get_user_model().objects.create_user(telephone="13610000003", password="pass")
        self.reward.referrer = other
        order = []
        original = QuerySet.select_for_update

        def tracking(queryset, *args, **kwargs):
            if queryset.model._meta.model_name == "user":
                order.append(tuple(queryset.values_list("pk", flat=True)))
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracking):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.assertEqual(order[0], (self.user.pk,))

    def test_orphaned_target_fails_and_rolls_back_all_changes(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        with self.assertRaises(ValueError):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.entitlement.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(self.entitlement.status, Entitlement.Status.ACTIVE)
        self.assertEqual(self.entitlement.expires_at, self.expiry)
        self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
        self.assertIsNone(self.reward.revoked_at)

    def test_shared_lifetime_artifact_allows_independent_reward_revocation(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        lifetime = Entitlement.objects.create(
            user=self.user, module=None, season=None, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 1, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=None, external_ref="admin:shared-lifetime",
        )
        self.reward.entitlement = lifetime
        self.reward.save(update_fields=["entitlement"])
        other_referred = get_user_model().objects.create_user(telephone="13610000005", password="pass")
        other_participation = ReferralParticipation.objects.create(
            campaign_tag=self.participation.campaign_tag, referred_user=other_referred, referral_code=self.code,
        )
        other_reward = ReferralReward.objects.create(
            campaign_tag=other_participation.campaign_tag, referrer=self.user, participation=other_participation,
            kind=ReferralReward.Kind.REFERRAL_MONTH, amount_days=30, threshold=None, generation=1,
            entitlement=lifetime,
            idempotency_key=f"referral:{other_participation.campaign_tag}:participation:{other_participation.pk}:month",
        )
        before = list(Entitlement.objects.filter(pk=lifetime.pk).values())
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.reward.refresh_from_db()
        other_reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(other_reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(list(Entitlement.objects.filter(pk=lifetime.pk).values()), before)

    def test_canceled_shared_lifetime_artifact_allows_reward_revocation(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        lifetime = Entitlement.objects.create(
            user=self.user, module=None, season=None, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.CANCELED, starts_at=datetime(2026, 1, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=None, external_ref="admin:shared-canceled-lifetime",
        )
        self.reward.entitlement = lifetime
        self.reward.save(update_fields=["entitlement"])
        self.entitlement.delete()
        before = list(Entitlement.objects.filter(pk=lifetime.pk).values())

        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(list(Entitlement.objects.filter(pk=lifetime.pk).values()), before)

    def test_shared_reward_specific_timed_artifact_fails_without_writes(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        other_referred = get_user_model().objects.create_user(telephone="13610000006", password="pass")
        other_participation = ReferralParticipation.objects.create(
            campaign_tag=self.participation.campaign_tag, referred_user=other_referred, referral_code=self.code,
        )
        other_reward = ReferralReward.objects.create(
            campaign_tag=other_participation.campaign_tag, referrer=self.user, participation=other_participation,
            kind=ReferralReward.Kind.REFERRAL_MONTH, amount_days=30, threshold=None, generation=1,
            entitlement=self.entitlement,
            idempotency_key=f"referral:{other_participation.campaign_tag}:participation:{other_participation.pk}:month",
        )
        with self.assertRaises(ValueError):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.reward.refresh_from_db()
        other_reward.refresh_from_db()
        self.entitlement.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(other_reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(self.entitlement.status, Entitlement.Status.ACTIVE)
        self.assertEqual(self.entitlement.expires_at, self.expiry)

    def test_corrupt_reward_fails_without_writes(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        self.reward.amount_days = 29
        self.reward.save(update_fields=["amount_days"])
        with self.assertRaises(ValueError):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.entitlement.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(self.entitlement.expires_at, self.expiry)
        self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)

    def test_no_expiry_before_floor_does_not_extend(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        self.entitlement.expires_at = datetime(2026, 10, 15, 20, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.entitlement.starts_at = datetime(2026, 9, 15, 20, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.entitlement.save(update_fields=["expires_at", "starts_at"])
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.entitlement.refresh_from_db()
        self.assertEqual(self.entitlement.expires_at, datetime(2026, 10, 15, 20, tzinfo=ZoneInfo("Asia/Shanghai")))
        self.reward.refresh_from_db()
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))

    def test_expired_balance_revokes_without_change_and_new_purchase_starts_at_now(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        self.entitlement.starts_at = datetime(2026, 9, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.entitlement.expires_at = datetime(2026, 10, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai"))
        self.entitlement.save(update_fields=["starts_at", "expires_at"])
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.entitlement.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(self.entitlement.expires_at, datetime(2026, 10, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")))
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        from apps.accounts.services.entitlement_grant_service import grant_or_extend_entitlement
        with patch("apps.accounts.services.entitlement_grant_service.timezone.now", return_value=self.at):
            purchase = grant_or_extend_entitlement(
                user=self.user, module=self.module, season=None, plan=Entitlement.Plan.MONTH_1,
                external_ref="purchase:after-expiry",
            )
        self.assertEqual(purchase.starts_at, self.at)

    def test_future_tail_is_canceled_and_crossing_period_is_shortened(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        crossing = Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 10, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=datetime(2027, 1, 1, tzinfo=ZoneInfo("Asia/Shanghai")), external_ref="purchase:crossing",
        )
        tail = Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2027, 1, 1, tzinfo=ZoneInfo("Asia/Shanghai")), expires_at=datetime(2027, 1, 10, tzinfo=ZoneInfo("Asia/Shanghai")),
            external_ref="purchase:tail",
        )
        self.assertEqual(debit_exam_preparation_reward(reward=self.reward, at=self.at),
                         datetime(2026, 12, 11, tzinfo=ZoneInfo("Asia/Shanghai")))
        crossing.refresh_from_db()
        tail.refresh_from_db()
        self.assertEqual(crossing.expires_at, datetime(2026, 12, 11, tzinfo=ZoneInfo("Asia/Shanghai")))
        self.assertEqual(tail.status, Entitlement.Status.CANCELED)
        self.assertEqual(tail.starts_at, datetime(2027, 1, 1, tzinfo=ZoneInfo("Asia/Shanghai")))
        from apps.accounts.services.entitlement_grant_service import grant_or_extend_entitlement
        with patch("apps.accounts.services.entitlement_grant_service.timezone.now", return_value=self.at):
            renewed = grant_or_extend_entitlement(
                user=self.user, module=self.module, season=None, plan=Entitlement.Plan.MONTH_1,
                external_ref="purchase:after-refund",
            )
        self.assertEqual(renewed.starts_at, datetime(2026, 12, 11, tzinfo=ZoneInfo("Asia/Shanghai")))

    def test_permanent_cover_does_not_change_timed_entitlements(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        permanent = Entitlement.objects.create(
            user=self.user, module=None, season=None, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 1, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=None, external_ref="admin:lifetime",
        )
        self.reward.entitlement = permanent
        self.reward.save(update_fields=["entitlement"])
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.entitlement.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(self.entitlement.expires_at, self.expiry)
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)

    def test_lifetime_added_after_reward_does_not_change_linked_timed_entitlement(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        Entitlement.objects.create(
            user=self.user, module=self.module, season=None, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 1, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=None, external_ref="admin:module-lifetime",
        )
        self.assertIsNone(debit_exam_preparation_reward(reward=self.reward, at=self.at))
        self.entitlement.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(self.entitlement.status, Entitlement.Status.ACTIVE)
        self.assertEqual(self.entitlement.expires_at, self.expiry)
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)

    def test_only_active_module_level_timed_rows_are_changed(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        self._prior_entitlement()
        other_module = Module.objects.create(key="other-module", name="Other")
        season = ModuleSeason.objects.create(module=self.module, season_number=1, title="Season 1")
        untouched = [
            Entitlement.objects.create(user=self.user, module=None, season=None, plan=Entitlement.Plan.MONTH_1,
                status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 10, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
                expires_at=datetime(2027, 1, 10, tzinfo=ZoneInfo("Asia/Shanghai")), external_ref="platform:timed"),
            Entitlement.objects.create(user=self.user, module=other_module, season=None, plan=Entitlement.Plan.MONTH_1,
                status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 10, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
                expires_at=datetime(2027, 1, 10, tzinfo=ZoneInfo("Asia/Shanghai")), external_ref="other:timed"),
            Entitlement.objects.create(user=self.user, module=self.module, season=season, plan=Entitlement.Plan.MONTH_1,
                status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 10, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
                expires_at=datetime(2027, 1, 10, tzinfo=ZoneInfo("Asia/Shanghai")), external_ref="season:timed"),
            Entitlement.objects.create(user=self.user, module=self.module, season=None, plan=Entitlement.Plan.MONTH_1,
                status=Entitlement.Status.CANCELED, starts_at=datetime(2026, 10, 1, tzinfo=ZoneInfo("Asia/Shanghai")),
                expires_at=datetime(2027, 1, 10, tzinfo=ZoneInfo("Asia/Shanghai")), external_ref="canceled:timed"),
        ]
        before = list(Entitlement.objects.filter(pk__in=[row.pk for row in untouched]).values())
        debit_exam_preparation_reward(reward=self.reward, at=self.at)
        after = list(Entitlement.objects.filter(pk__in=[row.pk for row in untouched]).values())
        self.assertEqual(after, before)

    def test_corruption_matrix_fails_without_writes(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        second_user = get_user_model().objects.create_user(telephone="13610000003", password="pass")
        other_referred = get_user_model().objects.create_user(telephone="13610000004", password="pass")
        other_participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=other_referred, referral_code=self.code,
        )
        other_module = Module.objects.create(key="corrupt-module", name="Other")
        season = ModuleSeason.objects.create(module=self.module, season_number=1)
        coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=self.code.promotion_code, discount_amount="5.00",
        )
        mutations = [
            ("campaign_tag", "wrong-campaign"), ("kind", ReferralReward.Kind.SCIENCE_3),
            ("amount_days", 29), ("generation", 2), ("threshold", 1),
            ("referrer", second_user), ("idempotency_key", "wrong-key"), ("coupon", coupon),
            ("participation", other_participation),
        ]
        for field, invalid in mutations:
            with self.subTest(field=field):
                original = getattr(self.reward, field)
                setattr(self.reward, field, invalid)
                self.reward.save(update_fields=[field])
                with self.assertRaises(ValueError):
                    debit_exam_preparation_reward(reward=self.reward, at=self.at)
                self.reward.refresh_from_db()
                self.entitlement.refresh_from_db()
                self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
                self.assertEqual(self.entitlement.expires_at, self.expiry)
                setattr(self.reward, field, original)
                self.reward.save(update_fields=[field])

        artifact_mutations = [
            ("user", second_user), ("module", other_module), ("status", Entitlement.Status.CANCELED),
            ("external_ref", "wrong-ref"),
        ]
        for field, invalid in artifact_mutations:
            with self.subTest(artifact_field=field):
                original = getattr(self.entitlement, field)
                setattr(self.entitlement, field, invalid)
                self.entitlement.save(update_fields=[field])
                with self.assertRaises(ValueError):
                    debit_exam_preparation_reward(reward=self.reward, at=self.at)
                self.reward.refresh_from_db()
                self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
                setattr(self.entitlement, field, original)
                self.entitlement.save(update_fields=[field])
        self.entitlement.season = season
        self.entitlement.save(update_fields=["season"])
        with self.assertRaises(ValueError):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.entitlement.season = None
        self.entitlement.save(update_fields=["season"])
        original_start = self.entitlement.starts_at
        self.entitlement.starts_at = original_start - timedelta(days=1)
        self.entitlement.save(update_fields=["starts_at"])
        with self.assertRaises(ValueError):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.entitlement.starts_at = original_start
        self.entitlement.save(update_fields=["starts_at"])

    def test_user_is_locked_before_reward_and_entitlements(self):
        from apps.accounts.services.referral_refunds import debit_exam_preparation_reward

        self._prior_entitlement()
        order = []
        original = QuerySet.select_for_update

        def tracking(queryset, *args, **kwargs):
            order.append(queryset.model._meta.model_name)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracking):
            debit_exam_preparation_reward(reward=self.reward, at=self.at)
        self.assertEqual(order[:4], ["user", "referralreward", "referralparticipation", "entitlement"])

    def _prior_entitlement(self):
        return Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=datetime(2026, 10, 2, 12, tzinfo=ZoneInfo("Asia/Shanghai")),
            expires_at=datetime(2026, 11, 1, 12, tzinfo=ZoneInfo("Asia/Shanghai")),
            external_ref="purchase:prior-for-test",
        )
