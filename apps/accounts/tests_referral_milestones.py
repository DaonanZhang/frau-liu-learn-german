from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, ModuleSeason, PromotionCodeRecord, ReferralCode,
    PaymentDiscountApplication, PurchaseOffer, ReferralNotice, ReferralParticipation,
    ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_milestones import reconcile_referral_milestones
from apps.accounts.services.promotion_codes import redeem_promotion_code


class ReferralMilestoneTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.referrer = User.objects.create_user(telephone="13600139051", password="pass")
        self.module = Module.objects.create(key="learning_by_video", name="Learning by video")
        self.science = ModuleSeason.objects.create(module=self.module, season_number=1)
        self.vlog = ModuleSeason.objects.create(module=self.module, season_number=4)

    def add_referrals(self, count, *, campaign_tag=None, owner=None):
        owner = owner or self.referrer
        campaign_tag = campaign_tag or FIRST_REFERRAL_CAMPAIGN.campaign_tag
        code = ReferralCode.objects.filter(user=owner, campaign_tag=campaign_tag).first()
        if code is None:
            promo = PromotionCodeRecord.objects.create(
                code=f"MILESTONE-{ReferralCode.objects.count():04d}",
                campaign_name="fixture", discount_amount=Decimal("1.00"),
            )
            code = ReferralCode.objects.create(
                user=owner, campaign_tag=campaign_tag, code_prefix="BK1", promotion_code=promo,
            )
        start = ReferralParticipation.objects.count()
        for index in range(count):
            referred = get_user_model().objects.create_user(
                telephone=f"1360099{start + index:04d}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=campaign_tag or FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=referred, referral_code=code,
                status=ReferralParticipation.Status.QUALIFIED,
            )

    def reconcile(self):
        return reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )

    def test_milestones_are_thresholded_ordered_and_idempotent(self):
        self.add_referrals(2)
        self.assertEqual(self.reconcile(), [])
        self.add_referrals(1)
        rewards = self.reconcile()
        self.assertEqual([reward.kind for reward in rewards], [ReferralReward.Kind.SCIENCE_3])
        self.assertEqual(rewards[0].amount_days, 0)
        self.assertEqual(rewards[0].threshold, 3)
        self.assertEqual(rewards[0].entitlement.season, self.science)
        self.add_referrals(1)
        self.assertEqual(self.reconcile(), [])
        self.add_referrals(2)
        rewards = self.reconcile()
        self.assertEqual([reward.kind for reward in rewards], [ReferralReward.Kind.VLOG_5])
        self.assertEqual(rewards[0].entitlement.season, self.vlog)
        self.add_referrals(1)
        self.assertEqual(self.reconcile(), [])
        self.assertEqual(ReferralReward.objects.count(), 2)
        self.assertEqual(ReferralNotice.objects.count(), 2)

    def test_count_five_directly_issues_both_and_uses_coupons_if_covered(self):
        Entitlement.objects.create(
            user=self.referrer, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        self.add_referrals(5)
        rewards = self.reconcile()
        self.assertEqual([reward.kind for reward in rewards], [
            ReferralReward.Kind.SCIENCE_3, ReferralReward.Kind.VLOG_5,
        ])
        self.assertTrue(all(reward.entitlement_id is None for reward in rewards))
        for reward in rewards:
            coupon = reward.coupon
            promo = coupon.promotion_code
            self.assertEqual(coupon.user, self.referrer)
            self.assertEqual(coupon.discount_amount, Decimal("10.00"))
            self.assertEqual(coupon.minimum_order_amount, Decimal("0.00"))
            self.assertEqual(coupon.status, UserCoupon.Status.AVAILABLE)
            self.assertIsNone(coupon.expires_at)
            self.assertIsNone(coupon.applicable_module_id)
            self.assertIsNone(coupon.applicable_season_id)
            self.assertIsNone(coupon.applicable_offer_id)
            self.assertEqual(promo.source_kind, PromotionCodeRecord.SourceKind.INTERNAL_REWARD)
            self.assertEqual(promo.discount_amount, Decimal("10.00"))
            self.assertEqual(promo.minimum_order_amount, Decimal("0.00"))
            self.assertEqual(promo.redemption_mode, PromotionCodeRecord.RedemptionMode.SINGLE_USE)
            self.assertEqual(promo.stacking_policy, PromotionCodeRecord.StackingPolicy.STACK)
            self.assertEqual(promo.status, PromotionCodeRecord.Status.ACTIVE)
            self.assertIsNone(promo.applicable_module_id)
            self.assertIsNone(promo.applicable_season_id)
            self.assertIsNone(promo.applicable_offer_id)
            self.assertIsNone(promo.coupon_valid_days)
            self.assertIsNone(promo.expires_at)
        for notice in ReferralNotice.objects.all():
            self.assertFalse(notice.is_global_notice)
            self.assertEqual(set(notice.payload), {"threshold", "kind", "reward_type"})
            self.assertEqual(notice.payload["reward_type"], "coupon")

    def test_module_or_platform_lifetime_substitutes_coupon_and_public_redemption_rejects_it(self):
        for index, (module, season) in enumerate(
            ((self.module, self.science), (self.module, None), (None, None))
        ):
            user = get_user_model().objects.create_user(
                telephone=f"1370099{index:04d}", password="pass",
            )
            Entitlement.objects.create(
                user=user, module=module, season=season, plan=Entitlement.Plan.LIFETIME,
                status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
            )
            self.add_referrals(3, owner=user)
            rewards = reconcile_referral_milestones(
                referrer=user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            )
            self.assertEqual(len(rewards), 1)
            coupon = rewards[0].coupon
            before = UserCoupon.objects.count()
            with self.assertRaisesMessage(ValueError, "推广码无效"):
                redeem_promotion_code(user=user, code=coupon.promotion_code.code)
            self.assertEqual(UserCoupon.objects.count(), before)

    def test_ineligible_lifetime_records_are_upgraded_and_other_module_does_not_cover(self):
        future = timezone.now() + timezone.timedelta(days=2)
        Entitlement.objects.create(
            user=self.referrer, module=self.module, season=self.science,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=future, expires_at=None,
        )
        other = Module.objects.create(key="other", name="Other")
        other_season = ModuleSeason.objects.create(module=other, season_number=1)
        Entitlement.objects.create(
            user=self.referrer, module=other, season=other_season,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(), expires_at=None,
        )
        self.add_referrals(3)
        reward = self.reconcile()[0]
        self.assertIsNotNone(reward.entitlement_id)
        self.assertEqual(reward.entitlement.module, self.module)
        self.assertEqual(reward.entitlement.season, self.science)
        self.assertEqual(reward.entitlement.plan, Entitlement.Plan.LIFETIME)
        self.assertIsNone(reward.entitlement.expires_at)

    def test_temporary_expired_canceled_and_malformed_no_expiry_records_do_not_cover(self):
        now = timezone.now()
        cases = (
            (Entitlement.Plan.MONTH_1, Entitlement.Status.ACTIVE, now, now + timezone.timedelta(days=3)),
            (Entitlement.Plan.LIFETIME, Entitlement.Status.EXPIRED, now, None),
            (Entitlement.Plan.LIFETIME, Entitlement.Status.CANCELED, now, None),
            (Entitlement.Plan.MONTH_1, Entitlement.Status.ACTIVE, now, None),
        )
        for index, (plan, status, starts_at, expires_at) in enumerate(cases):
            user = get_user_model().objects.create_user(
                telephone=f"1380099{index:04d}", password="pass",
            )
            Entitlement.objects.create(
                user=user, module=self.module, season=self.science, plan=plan,
                status=status, starts_at=starts_at, expires_at=expires_at,
            )
            self.add_referrals(3, owner=user)
            reward = reconcile_referral_milestones(
                referrer=user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            )[0]
            self.assertIsNotNone(reward.entitlement_id)
            self.assertEqual(reward.entitlement.plan, Entitlement.Plan.LIFETIME)
            self.assertEqual(reward.entitlement.status, Entitlement.Status.ACTIVE)

    def test_other_season_lifetime_does_not_cover_target_season(self):
        other_season = ModuleSeason.objects.create(module=self.module, season_number=2)
        Entitlement.objects.create(
            user=self.referrer, module=self.module, season=other_season,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(),
        )
        self.add_referrals(3)
        reward = self.reconcile()[0]
        self.assertIsNotNone(reward.entitlement_id)
        self.assertEqual(reward.entitlement.season, self.science)

    def test_corrupt_linked_artifact_fails_without_side_effects(self):
        self.add_referrals(3)
        reward = self.reconcile()[0]
        Entitlement.objects.filter(pk=reward.entitlement_id).update(plan=Entitlement.Plan.MONTH_1)
        before = (ReferralReward.objects.count(), Entitlement.objects.count(), ReferralNotice.objects.count())
        with self.assertRaises(ValueError):
            self.reconcile()
        self.assertEqual(
            (ReferralReward.objects.count(), Entitlement.objects.count(), ReferralNotice.objects.count()),
            before,
        )

    def _payment(self, suffix):
        return AlipayWebsitePayment.objects.create(
            merchant_order_no=f"milestone-order-{suffix}",
            subject="Milestone fixture", total_amount=Decimal("10.00"),
        )

    def _covered_referrer(self, owner=None):
        owner = owner or self.referrer
        Entitlement.objects.create(
            user=owner, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        self.add_referrals(3, owner=owner)
        return reconcile_referral_milestones(
            referrer=owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )[0]

    def test_non_reversible_coupon_never_reissues(self):
        reward = self._covered_referrer()
        coupon = reward.coupon
        payment = self._payment("used")
        payment.status = AlipayWebsitePayment.Status.PAID
        payment.save(update_fields=["status", "updated_at"])
        offer = PurchaseOffer.objects.create(
            code="milestone-used-coupon", title="Fixture", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("20.00"),
        )
        PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=coupon.promotion_code,
            user=self.referrer, offer=offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("10.00"), final_amount=Decimal("10.00"),
            status=PaymentDiscountApplication.Status.APPLIED, applied_at=timezone.now(),
        )
        coupon.status = UserCoupon.Status.USED
        coupon.used_payment = payment
        coupon.used_at = timezone.now()
        coupon.reserved_payment = None
        coupon.save(update_fields=["status", "used_payment", "used_at", "reserved_payment", "updated_at"])
        reward.status = ReferralReward.Status.NON_REVERSIBLE
        reward.settled_at = timezone.now()
        reward.save(update_fields=["status", "settled_at", "updated_at"])
        counts = (ReferralReward.objects.count(), UserCoupon.objects.count(), ReferralNotice.objects.count())
        self.assertEqual(self.reconcile(), [])
        self.assertEqual(
            (ReferralReward.objects.count(), UserCoupon.objects.count(), ReferralNotice.objects.count()),
            counts,
        )

    def test_pending_coupon_restores_grant_without_releasing_open_reservation(self):
        reward = self._covered_referrer()
        coupon = reward.coupon
        payment = self._payment("reserved")
        offer = PurchaseOffer.objects.create(
            code="milestone-reserved-coupon", title="Fixture", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("20.00"),
        )
        PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=coupon.promotion_code,
            user=self.referrer, offer=offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("10.00"), final_amount=Decimal("10.00"),
            status=PaymentDiscountApplication.Status.RESERVED,
        )
        coupon.status = UserCoupon.Status.RESERVED
        coupon.reserved_payment = payment
        coupon.reserved_at = timezone.now()
        coupon.save(update_fields=["status", "reserved_payment", "reserved_at", "updated_at"])
        reward.status = ReferralReward.Status.REVOCATION_PENDING
        reward.revocation_pending_at = timezone.now()
        reward.save(update_fields=["status", "revocation_pending_at", "updated_at"])
        counts = (ReferralReward.objects.count(), UserCoupon.objects.count(), ReferralNotice.objects.count())
        self.assertEqual(self.reconcile(), [])
        reward.refresh_from_db()
        coupon.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.GRANTED)
        self.assertIsNone(reward.revocation_pending_at)
        self.assertEqual(coupon.status, UserCoupon.Status.RESERVED)
        self.assertEqual(coupon.reserved_payment_id, payment.pk)
        self.assertEqual(self.reconcile(), [])
        reward.refresh_from_db()
        coupon.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(coupon.status, UserCoupon.Status.RESERVED)
        self.assertEqual(coupon.reserved_payment_id, payment.pk)
        self.assertEqual(
            (ReferralReward.objects.count(), UserCoupon.objects.count(), ReferralNotice.objects.count()),
            counts,
        )

    def test_revoked_entitlement_reissues_as_new_entitlement_generation(self):
        self.add_referrals(3)
        reward = self.reconcile()[0]
        old_entitlement = reward.entitlement
        old_entitlement.status = Entitlement.Status.CANCELED
        old_entitlement.save(update_fields=["status"])
        reward.status = ReferralReward.Status.REVOKED
        reward.revoked_at = timezone.now()
        reward.save(update_fields=["status", "revoked_at", "updated_at"])
        new_reward = self.reconcile()[0]
        self.assertEqual(new_reward.generation, 2)
        self.assertNotEqual(new_reward.entitlement_id, old_entitlement.pk)
        self.assertIsNone(new_reward.coupon_id)
        self.assertEqual(new_reward.entitlement.status, Entitlement.Status.ACTIVE)
        self.assertEqual(new_reward.entitlement.season, self.science)

    def test_revoked_coupon_reissues_new_coupon_without_reviving_old_coupon(self):
        reward = self._covered_referrer()
        old_coupon = reward.coupon
        old_coupon.status = UserCoupon.Status.REVOKED
        old_coupon.revoked_at = timezone.now()
        old_coupon.revocation_reason = "referral_milestone_count_below_threshold"
        old_coupon.reserved_payment = None
        old_coupon.reserved_at = None
        old_coupon.used_payment = None
        old_coupon.used_at = None
        old_coupon.save(update_fields=[
            "status", "revoked_at", "revocation_reason", "reserved_payment", "reserved_at",
            "used_payment", "used_at", "updated_at",
        ])
        reward.status = ReferralReward.Status.REVOKED
        reward.revoked_at = timezone.now()
        reward.save(update_fields=["status", "revoked_at", "updated_at"])
        new_reward = self.reconcile()[0]
        self.assertEqual(new_reward.generation, 2)
        self.assertNotEqual(new_reward.coupon_id, old_coupon.pk)
        self.assertEqual(new_reward.coupon.status, UserCoupon.Status.AVAILABLE)
        self.assertEqual(old_coupon.status, UserCoupon.Status.REVOKED)

    def test_shared_coupon_between_milestone_rewards_is_rejected(self):
        Entitlement.objects.create(
            user=self.referrer,
            plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(),
        )
        self.add_referrals(5)
        rewards = self.reconcile()
        ReferralReward.objects.filter(pk=rewards[1].pk).update(coupon_id=rewards[0].coupon_id)
        before = (
            ReferralReward.objects.count(),
            UserCoupon.objects.count(),
            ReferralNotice.objects.count(),
        )
        with self.assertRaises(ValueError):
            self.reconcile()
        self.assertEqual(
            (
                ReferralReward.objects.count(),
                UserCoupon.objects.count(),
                ReferralNotice.objects.count(),
            ),
            before,
        )

    def test_revoked_coupon_without_coupon_revoked_at_is_rejected(self):
        reward = self._covered_referrer()
        UserCoupon.objects.filter(pk=reward.coupon_id).update(
            status=UserCoupon.Status.REVOKED,
            revoked_at=None,
        )
        reward.status = ReferralReward.Status.REVOKED
        reward.revoked_at = timezone.now()
        reward.save(update_fields=["status", "revoked_at", "updated_at"])
        with self.assertRaises(ValueError):
            self.reconcile()

    def test_inconsistent_reward_artifact_states_fail_closed(self):
        for index, state in enumerate((
            ReferralReward.Status.REVOCATION_PENDING,
            ReferralReward.Status.NON_REVERSIBLE,
            ReferralReward.Status.REVOKED,
        )):
            user = get_user_model().objects.create_user(
                telephone=f"1390099{index:04d}", password="pass",
            )
            if state != ReferralReward.Status.REVOKED:
                Entitlement.objects.create(
                    user=user, plan=Entitlement.Plan.LIFETIME,
                    status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
                )
            self.add_referrals(3, owner=user)
            reward = reconcile_referral_milestones(
                referrer=user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            )[0]
            reward.status = state
            if state == ReferralReward.Status.REVOCATION_PENDING:
                reward.revocation_pending_at = timezone.now()
            elif state == ReferralReward.Status.NON_REVERSIBLE:
                reward.settled_at = timezone.now()
            else:
                reward.revoked_at = timezone.now()
            reward.save()
            with self.subTest(state=state), self.assertRaises(ValueError):
                reconcile_referral_milestones(
                    referrer=user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                )

    def test_granted_coupon_rejects_missing_or_stale_payment_links(self):
        for index, (status, link) in enumerate((
            (UserCoupon.Status.RESERVED, "none"),
            (UserCoupon.Status.AVAILABLE, "reserved"),
        )):
            with self.subTest(status=status, link=link):
                owner = get_user_model().objects.create_user(
                    telephone=f"1400099{index:04d}", password="pass",
                )
                reward = self._covered_referrer(owner)
                coupon = reward.coupon
                if status == UserCoupon.Status.RESERVED:
                    coupon.status = status
                    coupon.save(update_fields=["status", "updated_at"])
                else:
                    coupon.reserved_payment = self._payment(f"stale-{index}")
                    coupon.save(update_fields=["reserved_payment", "updated_at"])
                with self.assertRaises(ValueError):
                    reconcile_referral_milestones(
                        referrer=owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                    )

    def test_unqualified_or_wrong_owner_campaign_participations_do_not_count(self):
        self.add_referrals(2)
        self.add_referrals(1, campaign_tag="another_campaign")
        other_user = get_user_model().objects.create_user(telephone="13700990009", password="pass")
        self.add_referrals(1, owner=other_user)
        self.assertEqual(self.reconcile(), [])

    def test_wrong_campaign_rejected_and_missing_catalog_rolls_back(self):
        with self.assertRaises(ValueError):
            reconcile_referral_milestones(referrer=self.referrer, campaign_tag="other")
        self.add_referrals(3)
        self.vlog.delete()
        with self.assertRaises(ModuleSeason.DoesNotExist):
            self.reconcile()
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_missing_module_rolls_back(self):
        self.add_referrals(3)
        self.module.delete()
        with self.assertRaises(Module.DoesNotExist):
            self.reconcile()
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_below_threshold_without_catalog_or_rewards_returns_without_writes(self):
        self.module.delete()
        for count in range(3):
            with self.subTest(count=count):
                owner = get_user_model().objects.create_user(
                    telephone=f"1410099{count:04d}", password="pass",
                )
                self.add_referrals(count, owner=owner)
                before = (ReferralReward.objects.count(), Entitlement.objects.count(), ReferralNotice.objects.count())
                rewards = reconcile_referral_milestones(
                    referrer=owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                )
                self.assertEqual(rewards, [])
                self.assertEqual(
                    (ReferralReward.objects.count(), Entitlement.objects.count(), ReferralNotice.objects.count()),
                    before,
                )

    def test_below_threshold_still_validates_existing_milestone_ledger(self):
        ReferralReward.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referrer=self.referrer,
            kind=ReferralReward.Kind.SCIENCE_3,
            threshold=4,
            amount_days=0,
            idempotency_key="corrupt-milestone-ledger",
        )
        with self.assertRaisesMessage(ValueError, "Referral milestone ledger or artifact is invalid"):
            self.reconcile()

    def test_locking_user_precedes_reward_or_artifact_lookup(self):
        events = []
        original_user_lock = get_user_model().objects.select_for_update
        original_reward_lock = ReferralReward.objects.select_for_update
        def record_user_lock(*args, **kwargs):
            events.append("user")
            return original_user_lock(*args, **kwargs)
        def record_reward_lock(*args, **kwargs):
            events.append("reward")
            return original_reward_lock(*args, **kwargs)
        self.add_referrals(1)
        with patch.object(get_user_model().objects, "select_for_update", side_effect=record_user_lock), \
             patch.object(ReferralReward.objects, "select_for_update", side_effect=record_reward_lock):
            self.reconcile()
        self.assertLess(events.index("user"), events.index("reward"))
