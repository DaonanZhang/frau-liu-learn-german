from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TransactionTestCase
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
    ReferralNotice,
    ReferralParticipation,
    ReferralReward,
    UserCoupon,
)
from apps.accounts.services.promotion_codes import sync_payment_discount_status
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_milestones import reconcile_referral_milestones


class ReferralMilestoneTerminalHookTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13600202001", password="pass",
        )
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation", defaults={"name": "Exam preparation"},
        )
        self.offer = PurchaseOffer.objects.create(
            code="terminal-hook-offer", title="Terminal hook", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("20.00"),
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="TERMINAL-HOOK", campaign_name="terminal hook",
            discount_amount=Decimal("5.00"),
        )

    def make_application(
        self, *, suffix, payment_status=AlipayWebsitePayment.Status.CREATED,
        milestone=True, promotion=None,
    ):
        promotion = promotion or self.promotion
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"terminal-hook-{suffix}", subject="Fixture",
            total_amount=Decimal("15.00"), status=payment_status,
        )
        coupon = UserCoupon.objects.create(
            user=self.user, promotion_code=promotion,
            discount_amount=Decimal("5.00"), status=UserCoupon.Status.RESERVED,
            reserved_payment=payment, reserved_at=timezone.now(),
        )
        application = PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=promotion,
            user=self.user, offer=self.offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("15.00"),
        )
        if milestone:
            ReferralReward.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referrer=self.user, kind=ReferralReward.Kind.SCIENCE_3,
                amount_days=0, threshold=3, coupon=coupon,
                idempotency_key=f"terminal-hook-{suffix}",
            )
        return payment, application, coupon

    def test_five_terminal_statuses_resolve_only_after_canonical_state_commits(self):
        cases = (
            (AlipayWebsitePayment.Status.PAID,
             PaymentDiscountApplication.Status.APPLIED, UserCoupon.Status.USED),
            (AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
             PaymentDiscountApplication.Status.APPLIED, UserCoupon.Status.USED),
            (AlipayWebsitePayment.Status.REFUNDED,
             PaymentDiscountApplication.Status.REFUNDED, UserCoupon.Status.USED),
            (AlipayWebsitePayment.Status.FAILED,
             PaymentDiscountApplication.Status.RELEASED, UserCoupon.Status.AVAILABLE),
            (AlipayWebsitePayment.Status.CLOSED,
             PaymentDiscountApplication.Status.RELEASED, UserCoupon.Status.AVAILABLE),
        )
        for index, (status, expected_application, expected_coupon) in enumerate(cases):
            with self.subTest(status=status):
                payment, application, coupon = self.make_application(suffix=index)
                AlipayWebsitePayment.objects.filter(pk=payment.pk).update(
                    status=status,
                    paid_at=timezone.now() if status in {
                        AlipayWebsitePayment.Status.PAID,
                        AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
                        AlipayWebsitePayment.Status.REFUNDED,
                    } else None,
                    refunded_at=timezone.now()
                    if status == AlipayWebsitePayment.Status.REFUNDED else None,
                )
                observed = []

                def observe(*, payment_id):
                    observed.append((
                        PaymentDiscountApplication.objects.get(payment_id=payment_id).status,
                        UserCoupon.objects.get(pk=coupon.pk).status,
                    ))

                with patch(
                    "apps.accounts.services.referral_milestones."
                    "resolve_pending_milestone_revocation",
                    side_effect=observe,
                ):
                    with transaction.atomic():
                        sync_payment_discount_status(payment_id=payment.pk)
                        self.assertEqual(observed, [])
                    self.assertEqual(observed, [(expected_application, expected_coupon)])

                application.refresh_from_db()
                coupon.refresh_from_db()
                self.assertEqual(application.status, expected_application)
                self.assertEqual(coupon.status, expected_coupon)

    def test_outer_rollback_discards_terminal_resolution(self):
        payment, application, coupon = self.make_application(suffix="rollback")
        AlipayWebsitePayment.objects.filter(pk=payment.pk).update(
            status=AlipayWebsitePayment.Status.PAID, paid_at=timezone.now(),
        )
        calls = []
        with patch(
            "apps.accounts.services.referral_milestones.resolve_pending_milestone_revocation",
            side_effect=lambda **kwargs: calls.append(kwargs),
        ):
            try:
                with transaction.atomic():
                    sync_payment_discount_status(payment_id=payment.pk)
                    raise RuntimeError("rollback")
            except RuntimeError:
                pass
        self.assertEqual(calls, [])
        application.refresh_from_db()
        coupon.refresh_from_db()
        self.assertEqual(application.status, PaymentDiscountApplication.Status.RESERVED)
        self.assertEqual(coupon.status, UserCoupon.Status.RESERVED)

    def test_nonterminal_or_missing_application_does_not_schedule_resolution(self):
        calls = []
        with patch(
            "apps.accounts.services.referral_milestones.resolve_pending_milestone_revocation",
            side_effect=lambda **kwargs: calls.append(kwargs),
        ):
            for index, status in enumerate((
                AlipayWebsitePayment.Status.CREATED,
                AlipayWebsitePayment.Status.PENDING,
            )):
                payment, _application, _coupon = self.make_application(
                    suffix=f"open-{index}", payment_status=status,
                )
                sync_payment_discount_status(payment_id=payment.pk)
            payment = AlipayWebsitePayment.objects.create(
                merchant_order_no="terminal-hook-no-application", subject="Fixture",
                total_amount=Decimal("15.00"), status=AlipayWebsitePayment.Status.PAID,
            )
            sync_payment_discount_status(payment_id=payment.pk)
        self.assertEqual(calls, [])

    def test_failed_and_closed_release_participation_before_resolving_milestone(self):
        for index, status in enumerate((
            AlipayWebsitePayment.Status.FAILED,
            AlipayWebsitePayment.Status.CLOSED,
        )):
            with self.subTest(status=status):
                payment, _application, _coupon = self.make_application(suffix=f"order-{index}")
                AlipayWebsitePayment.objects.filter(pk=payment.pk).update(status=status)
                order = []
                with patch(
                    "apps.accounts.services.referral_qualification."
                    "release_referral_participation_for_payment",
                    side_effect=lambda **kwargs: order.append("release"),
                ), patch(
                    "apps.accounts.services.referral_milestones."
                    "resolve_pending_milestone_revocation",
                    side_effect=lambda **kwargs: order.append("resolve"),
                ):
                    with transaction.atomic():
                        sync_payment_discount_status(payment_id=payment.pk)
                        self.assertEqual(order, [])
                    self.assertEqual(order, ["release", "resolve"])

    def assert_non_milestone_coupon_does_not_resolve(self, *, promotion, prefix):
        cases = (
            (AlipayWebsitePayment.Status.PAID,
             PaymentDiscountApplication.Status.APPLIED, UserCoupon.Status.USED),
            (AlipayWebsitePayment.Status.REFUNDED,
             PaymentDiscountApplication.Status.REFUNDED, UserCoupon.Status.USED),
            (AlipayWebsitePayment.Status.FAILED,
             PaymentDiscountApplication.Status.RELEASED, UserCoupon.Status.AVAILABLE),
        )
        for index, (status, expected_application, expected_coupon) in enumerate(cases):
            with self.subTest(status=status):
                payment, application, coupon = self.make_application(
                    suffix=f"{prefix}-{index}", milestone=False, promotion=promotion,
                )
                AlipayWebsitePayment.objects.filter(pk=payment.pk).update(
                    status=status,
                    paid_at=timezone.now() if status in {
                        AlipayWebsitePayment.Status.PAID,
                        AlipayWebsitePayment.Status.REFUNDED,
                    } else None,
                    refunded_at=(
                        timezone.now()
                        if status == AlipayWebsitePayment.Status.REFUNDED
                        else None
                    ),
                )
                with patch(
                    "apps.accounts.services.referral_milestones."
                    "resolve_pending_milestone_revocation",
                ) as resolver:
                    sync_payment_discount_status(payment_id=payment.pk)
                resolver.assert_not_called()
                application.refresh_from_db()
                coupon.refresh_from_db()
                self.assertEqual(application.status, expected_application)
                self.assertEqual(coupon.status, expected_coupon)
                if status == AlipayWebsitePayment.Status.REFUNDED:
                    self.assertIsNotNone(application.applied_at)
                    self.assertIsNotNone(application.refunded_at)
                    self.assertIsNone(coupon.reserved_payment_id)
                    self.assertIsNone(coupon.reserved_at)
                    self.assertEqual(coupon.used_payment_id, payment.pk)
                    self.assertIsNotNone(coupon.used_at)

    def test_ordinary_coupon_terminal_states_do_not_call_milestone_resolver(self):
        self.assert_non_milestone_coupon_does_not_resolve(
            promotion=self.promotion, prefix="ordinary",
        )
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_five_yuan_referral_coupon_terminal_states_do_not_call_milestone_resolver(self):
        referrer = get_user_model().objects.create_user(
            telephone="13600202002", password="pass",
        )
        promotion = PromotionCodeRecord.objects.create(
            code="BK1-HOOKTEST1",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        ReferralCode.objects.create(
            user=referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix, promotion_code=promotion,
        )

        self.assert_non_milestone_coupon_does_not_resolve(
            promotion=promotion, prefix="five-yuan-referral",
        )
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_resolver_error_does_not_roll_back_terminal_lifecycle(self):
        payment, application, coupon = self.make_application(suffix="resolver-error")
        AlipayWebsitePayment.objects.filter(pk=payment.pk).update(
            status=AlipayWebsitePayment.Status.REFUNDED,
            paid_at=timezone.now(), refunded_at=timezone.now(),
        )

        with patch(
            "apps.accounts.services.referral_milestones."
            "resolve_pending_milestone_revocation",
            side_effect=ValueError("fixture resolver failure"),
        ), self.assertLogs("django.db.backends.base", level="ERROR"):
            sync_payment_discount_status(payment_id=payment.pk)

        application.refresh_from_db()
        coupon.refresh_from_db()
        self.assertEqual(application.status, PaymentDiscountApplication.Status.REFUNDED)
        self.assertEqual(coupon.status, UserCoupon.Status.USED)


class ReferralMilestoneTerminalHookReplayTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(telephone="13600202101", password="pass")
        module, _ = Module.objects.get_or_create(key="learning_by_video", defaults={"name": "Learning"})
        ModuleSeason.objects.get_or_create(module=module, season_number=1)
        ModuleSeason.objects.get_or_create(module=module, season_number=4)
        Entitlement.objects.create(
            user=self.owner, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        self.offer = PurchaseOffer.objects.create(
            code="terminal-hook-replay-offer", title="Fixture", module=module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("20.00"),
        )
        promotion = PromotionCodeRecord.objects.create(
            code="TERMINAL-HOOK-REF", campaign_name="fixture",
            discount_amount=Decimal("1.00"),
        )
        self.referral_code = ReferralCode.objects.create(
            user=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="TH1", promotion_code=promotion,
        )
        for index in range(3):
            referred = User.objects.create_user(
                telephone=f"1360020211{index}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=referred, referral_code=self.referral_code,
                status=ReferralParticipation.Status.QUALIFIED,
            )
        self.reward = reconcile_referral_milestones(
            referrer=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )[0]
        self.coupon = self.reward.coupon

    def make_reserved_application(self, *, suffix, payment_status):
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"terminal-hook-replay-{suffix}", subject="Fixture",
            total_amount=Decimal("10.00"), status=payment_status,
            paid_at=timezone.now() if payment_status == AlipayWebsitePayment.Status.PAID else None,
        )
        now = timezone.now()
        UserCoupon.objects.filter(pk=self.coupon.pk).update(
            status=UserCoupon.Status.RESERVED, reserved_payment=payment,
            reserved_at=now, used_payment=None, used_at=None,
        )
        ReferralReward.objects.filter(pk=self.reward.pk).update(
            status=ReferralReward.Status.REVOCATION_PENDING,
            revocation_pending_at=now,
        )
        PaymentDiscountApplication.objects.create(
            payment=payment, coupon=self.coupon,
            promotion_code=self.coupon.promotion_code, user=self.owner,
            offer=self.offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("10.00"), final_amount=Decimal("10.00"),
        )
        return payment

    def test_paid_replay_settles_milestone_only_once(self):
        payment = self.make_reserved_application(
            suffix="paid", payment_status=AlipayWebsitePayment.Status.PAID,
        )

        sync_payment_discount_status(payment_id=payment.pk)
        self.reward.refresh_from_db()
        settled_at = self.reward.settled_at
        reward_count = ReferralReward.objects.count()
        sync_payment_discount_status(payment_id=payment.pk)
        self.reward.refresh_from_db()

        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)
        self.assertIsNotNone(settled_at)
        self.assertEqual(self.reward.settled_at, settled_at)
        self.assertEqual(ReferralReward.objects.count(), reward_count)

    def test_failed_replay_revokes_milestone_only_once(self):
        payment = self.make_reserved_application(
            suffix="failed", payment_status=AlipayWebsitePayment.Status.FAILED,
        )
        ReferralParticipation.objects.filter(referral_code=self.referral_code).update(
            status=ReferralParticipation.Status.OPEN,
        )

        sync_payment_discount_status(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        revoked_at = self.reward.revoked_at
        reward_count = ReferralReward.objects.count()
        sync_payment_discount_status(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()

        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(self.coupon.status, UserCoupon.Status.REVOKED)
        self.assertIsNotNone(revoked_at)
        self.assertEqual(self.reward.revoked_at, revoked_at)
        self.assertEqual(ReferralReward.objects.count(), reward_count)
