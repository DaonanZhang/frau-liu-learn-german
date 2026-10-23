from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, ModuleSeason,
    PaymentDiscountApplication, PaymentGrantTask, PromotionCodeRecord,
    PurchaseOffer, ReferralCode, ReferralNotice, ReferralParticipation,
    ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_milestones import reconcile_referral_milestones
from apps.accounts.services.referral_qualification import process_referral_reward_pending


class ReferralMilestoneQualificationIntegrationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.referrer = User.objects.create_user(telephone="13600139901", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.catalog = Module.objects.create(key="learning_by_video", name="Learning by video")
        self.science = ModuleSeason.objects.create(module=self.catalog, season_number=1)
        self.vlog = ModuleSeason.objects.create(module=self.catalog, season_number=4)
        self.offer = PurchaseOffer.objects.create(
            code="milestone-integration", title="Reward", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-MILESTONE", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix,
            promotion_code=self.promotion, is_active=False,
        )
        self.pending = self.make_pending(0)

    def make_pending(self, index):
        User = get_user_model()
        buyer = User.objects.create_user(
            telephone=f"13600139{100 + index:02d}", password="pass",
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"milestone-order-{index}", subject="Reward",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
        )
        task = PaymentGrantTask.objects.create(
            payment=payment, offer=self.offer, user=buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1, status=PaymentGrantTask.Status.SUCCEEDED,
        )
        coupon = UserCoupon.objects.create(
            user=buyer, promotion_code=self.promotion, discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=self.module,
            status=UserCoupon.Status.USED, used_payment=payment,
        )
        participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=buyer,
            referral_code=self.referral, current_coupon=coupon, qualifying_payment=payment,
            status=ReferralParticipation.Status.REWARD_PENDING, order_created_at=payment.created_at,
        )
        PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=self.promotion, user=buyer,
            offer=task.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED,
        )
        return participation

    def add_qualified(self, count):
        User = get_user_model()
        for index in range(count):
            buyer = User.objects.create_user(
                telephone=f"1360099{index:04d}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=buyer, referral_code=self.referral,
                status=ReferralParticipation.Status.QUALIFIED,
            )

    def reward_for(self, kind):
        return ReferralReward.objects.get(referrer=self.referrer, kind=kind)

    def test_reconcile_runs_after_qualification_artifacts_exist(self):
        calls = []

        def inspect_and_reconcile(*, referrer, campaign_tag):
            self.pending.refresh_from_db()
            month = ReferralReward.objects.get(participation=self.pending)
            notice = ReferralNotice.objects.get(event_type="referral_qualified")
            calls.append((self.pending.status, month.entitlement_id is not None,
                          notice.user_id, notice.payload, referrer.pk, campaign_tag))
            return reconcile_referral_milestones(referrer=referrer, campaign_tag=campaign_tag)

        with patch(
            "apps.accounts.services.referral_qualification.reconcile_referral_milestones",
            side_effect=inspect_and_reconcile,
        ) as reconcile:
            result = process_referral_reward_pending(participation_id=self.pending.pk)

        self.assertIsNotNone(result)
        reconcile.assert_called_once_with(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        self.assertEqual(calls, [(
            ReferralParticipation.Status.QUALIFIED, True, self.referrer.pk,
            {"days": 30, "effective_count": 1}, self.referrer.pk,
            FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )])

    def test_milestone_failure_rolls_back_qualification_and_retry_succeeds(self):
        self.add_qualified(2)
        observed = {}

        def reconcile_then_fail(*, referrer, campaign_tag):
            rewards = reconcile_referral_milestones(
                referrer=referrer, campaign_tag=campaign_tag,
            )
            science = ReferralReward.objects.get(
                referrer=referrer, kind=ReferralReward.Kind.SCIENCE_3,
            )
            milestone_notice = ReferralNotice.objects.get(
                user=referrer, event_type="referral_milestone_granted",
            )
            self.assertIn(science, rewards)
            self.assertEqual(science.status, ReferralReward.Status.GRANTED)
            self.assertEqual(science.entitlement.season, self.science)
            self.assertTrue(Entitlement.objects.filter(
                pk=science.entitlement_id, user=referrer,
            ).exists())
            self.assertEqual(milestone_notice.payload["threshold"], 3)
            observed["science_reward_id"] = science.pk
            observed["entitlement_id"] = science.entitlement_id
            observed["notice_id"] = milestone_notice.pk
            raise ValueError("milestone failure")

        with patch(
            "apps.accounts.services.referral_qualification.reconcile_referral_milestones",
            side_effect=reconcile_then_fail,
        ) as reconcile:
            with self.assertRaisesMessage(ValueError, "milestone failure"):
                process_referral_reward_pending(participation_id=self.pending.pk)
        reconcile.assert_called_once_with(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        self.assertTrue(observed["science_reward_id"])
        self.assertTrue(observed["entitlement_id"])
        self.assertTrue(observed["notice_id"])

        self.pending.refresh_from_db()
        self.assertEqual(self.pending.status, ReferralParticipation.Status.REWARD_PENDING)
        self.assertFalse(ReferralReward.objects.filter(
            participation=self.pending, kind=ReferralReward.Kind.REFERRAL_MONTH,
        ).exists())
        self.assertFalse(ReferralReward.objects.filter(
            referrer=self.referrer, kind=ReferralReward.Kind.SCIENCE_3,
        ).exists())
        self.assertFalse(Entitlement.objects.filter(
            user=self.referrer, module=self.catalog, season=self.science,
        ).exists())
        self.assertFalse(Entitlement.objects.filter(
            user=self.referrer, module=self.module, season__isnull=True,
            external_ref=f"referral_reward:{FIRST_REFERRAL_CAMPAIGN.campaign_tag}:{self.pending.pk}:month",
        ).exists())
        self.assertFalse(ReferralNotice.objects.filter(
            user=self.referrer, event_type__in=("referral_qualified", "referral_milestone_granted"),
        ).exists())

        process_referral_reward_pending(participation_id=self.pending.pk)
        self.assertEqual(self.pending.__class__.objects.get(pk=self.pending.pk).status,
                         ReferralParticipation.Status.QUALIFIED)
        self.assertEqual(self.reward_for(ReferralReward.Kind.SCIENCE_3).entitlement.season, self.science)
        self.assertEqual(ReferralReward.objects.get(participation=self.pending).amount_days, 30)

    def test_third_qualification_gets_month_and_science_milestone(self):
        self.add_qualified(2)
        process_referral_reward_pending(participation_id=self.pending.pk)

        month = ReferralReward.objects.get(participation=self.pending)
        science = self.reward_for(ReferralReward.Kind.SCIENCE_3)
        self.assertEqual(month.kind, ReferralReward.Kind.REFERRAL_MONTH)
        self.assertEqual(month.amount_days, 30)
        self.assertEqual(month.entitlement.module, self.module)
        self.assertEqual(month.entitlement.expires_at - month.entitlement.starts_at,
                         timedelta(days=30))
        self.assertEqual(science.entitlement.season, self.science)
        self.assertEqual(ReferralNotice.objects.filter(event_type="referral_qualified").get().payload,
                         {"days": 30, "effective_count": 3})

    def test_fifth_qualification_gets_month_and_vlog_without_repeating_science(self):
        self.add_qualified(4)
        reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        process_referral_reward_pending(participation_id=self.pending.pk)

        month = ReferralReward.objects.get(participation=self.pending)
        self.assertEqual(month.kind, ReferralReward.Kind.REFERRAL_MONTH)
        self.assertEqual(month.amount_days, 30)
        self.assertIsNotNone(month.entitlement_id)
        self.assertEqual(self.reward_for(ReferralReward.Kind.SCIENCE_3).entitlement.season,
                         self.science)
        self.assertEqual(self.reward_for(ReferralReward.Kind.VLOG_5).entitlement.season,
                         self.vlog)
        self.assertEqual(ReferralReward.objects.filter(
            referrer=self.referrer, kind=ReferralReward.Kind.SCIENCE_3,
        ).count(), 1)
        self.assertEqual(ReferralNotice.objects.filter(event_type="referral_qualified").get().payload,
                         {"days": 30, "effective_count": 5})

    def test_sixth_qualification_gets_only_month_reward(self):
        self.add_qualified(5)
        reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        process_referral_reward_pending(participation_id=self.pending.pk)

        self.assertEqual(ReferralReward.objects.filter(participation=self.pending).get().amount_days, 30)
        self.assertEqual(ReferralReward.objects.filter(referrer=self.referrer).count(), 3)
        self.assertEqual(ReferralReward.objects.filter(kind=ReferralReward.Kind.SCIENCE_3).count(), 1)
        self.assertEqual(ReferralReward.objects.filter(kind=ReferralReward.Kind.VLOG_5).count(), 1)

    def test_replay_invalid_and_non_pending_do_not_reconcile(self):
        with patch("apps.accounts.services.referral_qualification.reconcile_referral_milestones") as reconcile:
            self.add_qualified(2)
            process_referral_reward_pending(participation_id=self.pending.pk)
            process_referral_reward_pending(participation_id=self.pending.pk)
            reconcile.assert_called_once()

        pending = self.make_pending(1)
        ReferralParticipation.objects.filter(pk=pending.pk).update(
            status=ReferralParticipation.Status.DISQUALIFIED,
        )
        with patch("apps.accounts.services.referral_qualification.reconcile_referral_milestones") as reconcile:
            process_referral_reward_pending(participation_id=pending.pk)
            reconcile.assert_not_called()

        pending = self.make_pending(2)
        AlipayWebsitePayment.objects.filter(pk=pending.qualifying_payment_id).update(
            status=AlipayWebsitePayment.Status.REFUNDED,
        )
        with patch("apps.accounts.services.referral_qualification.reconcile_referral_milestones") as reconcile:
            process_referral_reward_pending(participation_id=pending.pk)
            reconcile.assert_not_called()
