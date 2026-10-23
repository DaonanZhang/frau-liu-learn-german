from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models.query import QuerySet
from django.test import TestCase
from django.utils import timezone
from unittest.mock import patch

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, ModuleSeason, PaymentDiscountApplication,
    PaymentGrantTask, PromotionCodeRecord, PurchaseOffer, ReferralCode,
    ReferralNotice, ReferralParticipation, ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_qualification import process_referral_reward_pending


class ReferralRewardProcessingTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13600139031", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139032", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.offer = PurchaseOffer.objects.create(
            code="reward-processing", title="Reward", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="reward-processing-order", subject="Reward",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
        )
        self.task = PaymentGrantTask.objects.create(
            payment=self.payment, offer=self.offer, user=self.buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1, status=PaymentGrantTask.Status.SUCCEEDED,
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-REWARD01", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix, promotion_code=self.promotion,
            is_active=False,
        )
        self.coupon = UserCoupon.objects.create(
            user=self.buyer, promotion_code=self.promotion, discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=self.module,
            status=UserCoupon.Status.USED, used_payment=self.payment,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=self.buyer,
            referral_code=self.referral, current_coupon=self.coupon,
            qualifying_payment=self.payment, status=ReferralParticipation.Status.REWARD_PENDING,
            order_created_at=self.payment.created_at,
        )
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=self.coupon, promotion_code=self.promotion,
            user=self.buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED,
        )

    def test_grants_one_month_and_private_history_event_then_replay_is_stable(self):
        before = timezone.now()
        reward = process_referral_reward_pending(participation_id=self.participation.pk)
        after = timezone.now()
        self.assertEqual(ReferralReward.objects.count(), 1)
        self.assertEqual(reward.amount_days, 30)
        self.assertEqual(reward.kind, ReferralReward.Kind.REFERRAL_MONTH)
        entitlement = reward.entitlement
        self.assertEqual(
            entitlement.external_ref,
            f"referral_reward:{FIRST_REFERRAL_CAMPAIGN.campaign_tag}:{self.participation.pk}:month",
        )
        self.assertGreaterEqual(entitlement.starts_at, before)
        self.assertLessEqual(entitlement.starts_at, after)
        self.assertEqual(entitlement.expires_at - entitlement.starts_at, timezone.timedelta(days=30))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.QUALIFIED)
        self.assertEqual(self.participation.qualified_at, self.participation.status_changed_at)
        notice = ReferralNotice.objects.get()
        self.assertFalse(notice.is_global_notice)
        self.assertEqual(notice.event_type, "referral_qualified")
        self.assertEqual(notice.payload, {"days": 30, "effective_count": 1})
        for secret in (self.buyer.telephone, self.payment.merchant_order_no, self.promotion.code):
            self.assertNotIn(secret, str(notice.payload))
        self.assertEqual(set(notice.payload), {"days", "effective_count"})
        status_changed_at = self.participation.status_changed_at
        qualified_at = self.participation.qualified_at
        self.assertEqual(process_referral_reward_pending(participation_id=self.participation.pk), reward)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status_changed_at, status_changed_at)
        self.assertEqual(self.participation.qualified_at, qualified_at)
        self.assertEqual(ReferralNotice.objects.count(), 1)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 1)

    def test_future_timed_access_stacks(self):
        future = timezone.now() + timezone.timedelta(days=12)
        existing = Entitlement.objects.create(
            user=self.referrer, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
            expires_at=future, external_ref="existing",
        )
        reward = process_referral_reward_pending(participation_id=self.participation.pk)
        self.assertEqual(reward.entitlement.starts_at, existing.expires_at)
        self.assertEqual(reward.entitlement.expires_at, future + timezone.timedelta(days=30))

    def test_lifetime_access_is_reused(self):
        lifetime = Entitlement.objects.create(
            user=self.referrer, module=self.module, plan=Entitlement.Plan.LIFETIME,
            expires_at=None,
        )
        reward = process_referral_reward_pending(participation_id=self.participation.pk)
        self.assertEqual(reward.entitlement, lifetime)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 1)

    def test_platform_lifetime_access_is_reused(self):
        lifetime = Entitlement.objects.create(
            user=self.referrer, module=None, season=None, plan=Entitlement.Plan.LIFETIME,
            expires_at=None,
        )
        reward = process_referral_reward_pending(participation_id=self.participation.pk)
        self.assertEqual(reward.entitlement, lifetime)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 1)

    def test_nonfinal_or_refunded_payment_is_unchanged(self):
        for status in (AlipayWebsitePayment.Status.REFUNDED, AlipayWebsitePayment.Status.FAILED,
                       AlipayWebsitePayment.Status.CLOSED, AlipayWebsitePayment.Status.CREATED,
                       AlipayWebsitePayment.Status.PENDING):
            with self.subTest(status=status):
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
                self.participation.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
                self.assertEqual(ReferralReward.objects.count(), 0)
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
                    status=AlipayWebsitePayment.Status.PAID
                )

    def test_partially_refunded_payment_qualifies(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED
        )
        self.assertIsNotNone(process_referral_reward_pending(participation_id=self.participation.pk))

    def test_canceled_task_requires_post_order_covering_lifetime(self):
        PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=PaymentGrantTask.Status.CANCELED)
        lifetime = Entitlement.objects.create(
            user=self.buyer, module=self.module, plan=Entitlement.Plan.LIFETIME,
        )
        self.assertIsNotNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.assertGreaterEqual(lifetime.created_at, self.payment.created_at)

    def test_canceled_task_without_lifetime_disqualifies(self):
        PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=PaymentGrantTask.Status.CANCELED)
        self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.DISQUALIFIED)

    def test_canceled_task_rejects_non_lifetime_without_expiry(self):
        PaymentGrantTask.objects.filter(pk=self.task.pk).update(
            status=PaymentGrantTask.Status.CANCELED
        )
        Entitlement.objects.create(
            user=self.buyer,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE,
            expires_at=None,
        )

        self.assertIsNone(
            process_referral_reward_pending(participation_id=self.participation.pk)
        )

        self.participation.refresh_from_db()
        self.assertEqual(
            self.participation.status,
            ReferralParticipation.Status.DISQUALIFIED,
        )
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 0)

    def test_lock_order_is_deterministic(self):
        events = []
        original = QuerySet.select_for_update

        def tracked(queryset, *args, **kwargs):
            events.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracked):
            process_referral_reward_pending(participation_id=self.participation.pk)
        self.assertEqual(events[:9], [
            "User", "ReferralParticipation", "ReferralReward", "AlipayWebsitePayment",
            "PaymentGrantTask", "PaymentDiscountApplication", "UserCoupon", "ReferralCode",
            "PromotionCodeRecord",
        ])

    def test_failure_after_reward_creation_rolls_back_all_artifacts(self):
        with patch("apps.accounts.services.referral_qualification.ReferralNotice.objects.create",
                   side_effect=RuntimeError("notice failure")):
            with self.assertRaises(RuntimeError):
                process_referral_reward_pending(participation_id=self.participation.pk)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 0)

    def test_sixth_referral_gets_full_reward_and_count_is_uncapped(self):
        catalog, _ = Module.objects.get_or_create(
            key="learning_by_video", defaults={"name": "Learning by video"},
        )
        for season_number in (1, 4):
            ModuleSeason.objects.get_or_create(module=catalog, season_number=season_number)

        User = get_user_model()
        for index in range(5):
            user = User.objects.create_user(
                telephone=f"136001391{index:02d}", password="pass"
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=user,
                referral_code=self.referral, status=ReferralParticipation.Status.QUALIFIED,
            )
        reward = process_referral_reward_pending(participation_id=self.participation.pk)
        self.assertEqual(reward.amount_days, 30)
        self.assertEqual(reward.kind, ReferralReward.Kind.REFERRAL_MONTH)
        notice = ReferralNotice.objects.get(event_type="referral_qualified")
        self.assertEqual(notice.payload["effective_count"], 6)
        self.assertEqual(
            ReferralReward.objects.filter(
                referrer=self.referrer, kind=ReferralReward.Kind.REFERRAL_MONTH,
            ).count(),
            1,
        )
        self.assertEqual(
            ReferralReward.objects.filter(
                referrer=self.referrer, kind=ReferralReward.Kind.SCIENCE_3,
            ).count(),
            1,
        )
        self.assertEqual(
            ReferralReward.objects.filter(
                referrer=self.referrer, kind=ReferralReward.Kind.VLOG_5,
            ).count(),
            1,
        )

    def test_corrupt_chain_disqualifies_without_artifacts(self):
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(
            promotion_discount_amount=Decimal("4.00")
        )
        self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.DISQUALIFIED)
        self.assertEqual(self.participation.last_error, "Referral reward qualification is invalid")
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 0)

    def test_same_key_foreign_reward_is_unchanged_and_disqualifies_participation(self):
        key = f"referral:{self.participation.campaign_tag}:participation:{self.participation.pk}:month"
        foreign = ReferralReward.objects.create(
            campaign_tag=self.participation.campaign_tag, referrer=self.buyer,
            kind=ReferralReward.Kind.REFERRAL_MONTH, status=ReferralReward.Status.GRANTED,
            amount_days=30, idempotency_key=key,
        )
        before = dict(ReferralReward.objects.filter(pk=foreign.pk).values().get())
        self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.DISQUALIFIED)
        self.assertEqual(dict(ReferralReward.objects.filter(pk=foreign.pk).values().get()), before)
        self.assertEqual(ReferralNotice.objects.count(), 0)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 0)

    def test_qualified_replay_requires_exact_reward_and_entitlement(self):
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(
            status=ReferralParticipation.Status.QUALIFIED,
        )
        original_timestamp = ReferralParticipation.objects.get(pk=self.participation.pk).status_changed_at
        self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status_changed_at, original_timestamp)
        self.assertEqual(ReferralNotice.objects.count(), 0)

        key = f"referral:{self.participation.campaign_tag}:participation:{self.participation.pk}:month"
        wrong = ReferralReward.objects.create(
            campaign_tag=self.participation.campaign_tag, referrer=self.buyer,
            participation=self.participation, kind=ReferralReward.Kind.REFERRAL_MONTH,
            status=ReferralReward.Status.GRANTED, amount_days=30, idempotency_key=key,
        )
        before = dict(ReferralReward.objects.filter(pk=wrong.pk).values().get())
        self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.assertEqual(dict(ReferralReward.objects.filter(pk=wrong.pk).values().get()), before)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_bad_existing_external_ref_entitlement_rolls_back_reward(self):
        external_ref = (
            f"referral_reward:{FIRST_REFERRAL_CAMPAIGN.campaign_tag}:"
            f"{self.participation.pk}:month"
        )
        for status, duration_days in (
            (Entitlement.Status.CANCELED, 30),
            (Entitlement.Status.ACTIVE, 29),
        ):
            with self.subTest(status=status, duration_days=duration_days):
                entitlement = Entitlement.objects.create(
                    user=self.referrer, module=self.module, season=None,
                    plan=Entitlement.Plan.MONTH_1, status=status,
                    starts_at=timezone.now(),
                    expires_at=timezone.now() + timezone.timedelta(days=duration_days),
                    external_ref=external_ref,
                )
                before = dict(Entitlement.objects.filter(pk=entitlement.pk).values().get())
                with self.assertRaisesRegex(ValueError, "Referral reward entitlement is invalid"):
                    process_referral_reward_pending(participation_id=self.participation.pk)
                self.participation.refresh_from_db()
                self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
                self.assertEqual(ReferralReward.objects.count(), 0)
                self.assertEqual(ReferralNotice.objects.count(), 0)
                self.assertEqual(dict(Entitlement.objects.filter(pk=entitlement.pk).values().get()), before)
                entitlement.delete()
