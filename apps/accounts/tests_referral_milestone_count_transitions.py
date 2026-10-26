from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    ModuleSeason,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    ReferralCode,
    ReferralParticipation,
    ReferralReward,
    UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_milestones import reconcile_referral_milestones


class ReferralMilestoneCountTransitionTests(TestCase):
    def setUp(self):
        self.referrer = get_user_model().objects.create_user(telephone="13600201001", password="pass")
        self.module = Module.objects.create(key="learning_by_video", name="Learning by video")
        self.science = ModuleSeason.objects.create(module=self.module, season_number=1)
        self.vlog = ModuleSeason.objects.create(module=self.module, season_number=4)
        self.offer = PurchaseOffer.objects.create(
            code="count-transition-offer", title="Fixture", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("20.00"),
        )
        promo = PromotionCodeRecord.objects.create(
            code="MILESTONE-COUNT-001", campaign_name="fixture", discount_amount=Decimal("1.00"),
        )
        self.referral_code = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1", promotion_code=promo,
        )
        self.participations = []
        for index in range(5):
            referred = get_user_model().objects.create_user(
                telephone=f"1360021{index:04d}", password="pass",
            )
            self.participations.append(ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=referred, referral_code=self.referral_code,
                status=ReferralParticipation.Status.QUALIFIED,
            ))

    def reconcile(self):
        return reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )

    def set_count(self, count):
        for index, participation in enumerate(self.participations):
            participation.status = (
                ReferralParticipation.Status.QUALIFIED if index < count
                else ReferralParticipation.Status.OPEN
            )
        ReferralParticipation.objects.bulk_update(self.participations, ["status"])

    def issue_for_count(self, count):
        self.set_count(count)
        return self.reconcile()

    def cover_with_lifetime(self):
        Entitlement.objects.create(
            user=self.referrer, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )

    def make_payment(self, suffix):
        return AlipayWebsitePayment.objects.create(
            merchant_order_no=f"count-transition-{suffix}", subject="Fixture", total_amount=Decimal("10.00"),
        )

    def make_used_chain(self, coupon, suffix, *, payment_status=None, application_status=None):
        payment = self.make_payment(suffix)
        payment.status = payment_status or AlipayWebsitePayment.Status.PAID
        payment.save(update_fields=["status", "updated_at"])
        application = PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=coupon.promotion_code,
            user=self.referrer, offer=self.offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("10.00"), final_amount=Decimal("10.00"),
            status=application_status or PaymentDiscountApplication.Status.APPLIED,
            applied_at=timezone.now(),
            refunded_at=(
                timezone.now()
                if application_status == PaymentDiscountApplication.Status.REFUNDED
                else None
            ),
        )
        coupon.status = UserCoupon.Status.USED
        coupon.used_payment = payment
        coupon.used_at = timezone.now()
        coupon.save(update_fields=["status", "used_payment", "used_at", "updated_at"])
        return payment, application

    def test_count_two_revokes_science_and_count_four_only_revokes_vlog(self):
        self.issue_for_count(3)
        science = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        self.set_count(2)
        self.assertEqual(self.reconcile(), [])
        science.refresh_from_db()
        self.assertEqual(science.status, ReferralReward.Status.REVOKED)
        self.assertEqual(science.entitlement.status, Entitlement.Status.CANCELED)
        science_revoked_at = science.revoked_at
        self.assertIsNotNone(science_revoked_at)
        self.reconcile()
        science.refresh_from_db()
        self.assertEqual(science.revoked_at, science_revoked_at)
        self.assertFalse(ReferralReward.objects.filter(kind=ReferralReward.Kind.VLOG_5).exists())

        self.set_count(4)
        created = self.reconcile()
        self.assertEqual([reward.generation for reward in created], [2])

    def test_count_four_preserves_science_and_revokes_only_vlog(self):
        self.issue_for_count(5)
        science = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        vlog = ReferralReward.objects.get(kind=ReferralReward.Kind.VLOG_5)
        self.set_count(4)
        self.assertEqual(self.reconcile(), [])
        science.refresh_from_db()
        vlog.refresh_from_db()
        self.assertEqual(science.status, ReferralReward.Status.GRANTED)
        self.assertEqual(vlog.status, ReferralReward.Status.REVOKED)
        self.assertEqual(vlog.entitlement.status, Entitlement.Status.CANCELED)

    def test_available_coupon_is_revoked_once_and_old_coupon_stays_revoked_after_reissue(self):
        self.cover_with_lifetime()
        self.issue_for_count(3)
        reward = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        coupon = reward.coupon
        self.set_count(2)
        self.reconcile()
        reward.refresh_from_db()
        coupon.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.REVOKED)
        self.assertIsNotNone(reward.revoked_at)
        self.assertEqual(coupon.status, UserCoupon.Status.REVOKED)
        self.assertIsNotNone(coupon.revoked_at)
        self.assertTrue(coupon.revocation_reason)
        reward_revoked_at, coupon_revoked_at = reward.revoked_at, coupon.revoked_at
        self.reconcile()
        reward.refresh_from_db()
        coupon.refresh_from_db()
        self.assertEqual(reward.revoked_at, reward_revoked_at)
        self.assertEqual(coupon.revoked_at, coupon_revoked_at)
        self.set_count(3)
        issued = self.reconcile()
        self.assertEqual([item.generation for item in issued], [2])
        coupon.refresh_from_db()
        self.assertEqual(coupon.status, UserCoupon.Status.REVOKED)

    def test_reserved_coupon_waits_and_restores_same_reward_when_count_returns(self):
        self.cover_with_lifetime()
        self.issue_for_count(3)
        reward = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        coupon = reward.coupon
        payment = self.make_payment("reserved")
        PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=coupon.promotion_code,
            user=self.referrer, offer=self.offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("10.00"), final_amount=Decimal("10.00"),
            status=PaymentDiscountApplication.Status.RESERVED,
        )
        coupon.status = UserCoupon.Status.RESERVED
        coupon.reserved_payment = payment
        coupon.reserved_at = timezone.now()
        coupon.save(update_fields=["status", "reserved_payment", "reserved_at", "updated_at"])
        self.set_count(2)
        self.reconcile()
        reward.refresh_from_db()
        coupon.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.REVOCATION_PENDING)
        pending_at = reward.revocation_pending_at
        self.assertEqual(coupon.status, UserCoupon.Status.RESERVED)
        self.assertEqual(coupon.reserved_payment_id, payment.pk)
        payment.refresh_from_db()
        self.assertEqual(payment.status, AlipayWebsitePayment.Status.CREATED)
        self.set_count(3)
        self.assertEqual(self.reconcile(), [])
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.GRANTED)
        self.assertIsNone(reward.revocation_pending_at)
        self.assertEqual(reward.generation, 1)
        self.set_count(2)
        self.reconcile()
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.REVOCATION_PENDING)
        self.assertNotEqual(reward.revocation_pending_at, pending_at)

    def test_used_coupon_becomes_non_reversible_and_never_reissues(self):
        self.cover_with_lifetime()
        self.issue_for_count(3)
        reward = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        coupon = reward.coupon
        self.make_used_chain(coupon, "used")
        self.set_count(2)
        self.assertEqual(self.reconcile(), [])
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.NON_REVERSIBLE)
        self.assertIsNotNone(reward.settled_at)
        self.set_count(3)
        self.assertEqual(self.reconcile(), [])
        self.assertEqual(ReferralReward.objects.filter(kind=ReferralReward.Kind.SCIENCE_3).count(), 1)

    def test_used_coupon_rejects_nonterminal_payment_and_mismatched_application_chains(self):
        self.cover_with_lifetime()
        self.issue_for_count(3)
        reward = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        coupon = reward.coupon
        payment, application = self.make_used_chain(coupon, "invalid-chain")
        self.set_count(2)
        other_user = get_user_model().objects.create_user(telephone="13600219999", password="pass")
        other_coupon = UserCoupon.objects.create(
            user=other_user, promotion_code=coupon.promotion_code,
            discount_amount=Decimal("10.00"), minimum_order_amount=Decimal("0.00"),
        )
        other_promotion = PromotionCodeRecord.objects.create(
            code="MILESTONE-COUNT-OTHER", source_kind=PromotionCodeRecord.SourceKind.INTERNAL_REWARD,
            campaign_name="fixture", discount_amount=Decimal("10.00"),
        )

        for status in (
            AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.FAILED,
            AlipayWebsitePayment.Status.CLOSED,
        ):
            payment.status = status
            payment.save(update_fields=["status", "updated_at"])
            with self.subTest(payment_status=status), self.assertRaises(ValueError):
                self.reconcile()
            reward.refresh_from_db()
            self.assertEqual(reward.status, ReferralReward.Status.GRANTED)
        payment.status = AlipayWebsitePayment.Status.PAID
        payment.save(update_fields=["status", "updated_at"])

        mismatches = (
            ("coupon", {"coupon": other_coupon}),
            ("user", {"user": other_user}),
            ("promotion", {"promotion_code": other_promotion}),
        )
        for label, changes in mismatches:
            original = {field: getattr(application, f"{field}_id") for field in changes}
            for field, value in changes.items():
                setattr(application, field, value)
            application.save(update_fields=[*changes, "updated_at"])
            with self.subTest(application_chain=label), self.assertRaises(ValueError):
                self.reconcile()
            reward.refresh_from_db()
            self.assertEqual(reward.status, ReferralReward.Status.GRANTED)
            for field, value in original.items():
                setattr(application, f"{field}_id", value)
            application.save(update_fields=[f"{field}_id" for field in original] + ["updated_at"])

        application.delete()
        with self.assertRaises(ValueError):
            self.reconcile()
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.GRANTED)

    def test_partially_refunded_payment_chain_is_valid(self):
        self.cover_with_lifetime()
        self.issue_for_count(3)
        reward = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        self.make_used_chain(
            reward.coupon, "partial-refund-valid",
            payment_status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
        )
        self.set_count(2)
        self.assertEqual(self.reconcile(), [])
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.NON_REVERSIBLE)

    def test_refunded_payment_and_application_chain_is_valid(self):
        self.cover_with_lifetime()
        self.issue_for_count(3)
        reward = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        self.make_used_chain(
            reward.coupon, "refund-valid",
            payment_status=AlipayWebsitePayment.Status.REFUNDED,
            application_status=PaymentDiscountApplication.Status.REFUNDED,
        )
        self.set_count(2)
        self.assertEqual(self.reconcile(), [])
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.NON_REVERSIBLE)

    def test_corrupt_second_threshold_rolls_back_first_threshold_revocation(self):
        self.issue_for_count(5)
        science = ReferralReward.objects.get(kind=ReferralReward.Kind.SCIENCE_3)
        vlog = ReferralReward.objects.get(kind=ReferralReward.Kind.VLOG_5)
        self.set_count(2)
        Entitlement.objects.filter(pk=vlog.entitlement_id).update(plan=Entitlement.Plan.MONTH_1)
        with self.assertRaises(ValueError):
            self.reconcile()
        science.refresh_from_db()
        self.assertEqual(science.status, ReferralReward.Status.GRANTED)
        self.assertEqual(science.entitlement.status, Entitlement.Status.ACTIVE)
