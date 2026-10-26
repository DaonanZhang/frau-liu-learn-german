from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase
from django.utils import timezone
from django.db.models.query import QuerySet

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, ModuleSeason, PaymentDiscountApplication,
    PaymentGrantTask, PromotionCodeRecord, PurchaseOffer, ReferralCode,
    ReferralNotice, ReferralParticipation, ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services import referral_refunds
from apps.accounts.services.referral_qualification import process_referral_reward_pending
from apps.accounts.services.referral_milestones import reconcile_referral_milestones


class ReferralRefundReconciliationTests(TestCase):
    def reconcile(self):
        operation = getattr(referral_refunds, "reconcile_referral_refund", None)
        self.assertTrue(callable(operation), "reconcile_referral_refund is not implemented")
        return operation

    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13600139101", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139102", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.offer = PurchaseOffer.objects.create(
            code="refund-offer", title="Refund offer", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="refund-order", subject="Offer",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
        )
        self.task = PaymentGrantTask.objects.create(
            payment=self.payment, offer=self.offer, user=self.buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1, status=PaymentGrantTask.Status.SUCCEEDED,
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-REFUND001", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
            status=PromotionCodeRecord.Status.ACTIVE,
        )
        self.referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix,
            promotion_code=self.promotion, is_active=False,
        )
        self.coupon = UserCoupon.objects.create(
            user=self.buyer, promotion_code=self.promotion,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module, status=UserCoupon.Status.USED,
            used_payment=self.payment, used_at=timezone.now(),
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=self.buyer,
            referral_code=self.referral, current_coupon=self.coupon,
            qualifying_payment=self.payment,
            status=ReferralParticipation.Status.REWARD_PENDING,
            order_created_at=self.payment.created_at,
        )
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=self.coupon, promotion_code=self.promotion,
            user=self.buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED, applied_at=timezone.now(),
        )

    def full_refund(self):
        when = timezone.now()
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.REFUNDED,
            refunded_amount=Decimal("54.90"), refunded_at=when,
        )
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(
            status=PaymentDiscountApplication.Status.REFUNDED, refunded_at=when,
        )
        return when

    def make_additional_purchase(self, *, telephone, order_no):
        buyer = get_user_model().objects.create_user(telephone=telephone, password="pass")
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=order_no, subject="Offer",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
        )
        PaymentGrantTask.objects.create(
            payment=payment, offer=self.offer, user=buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1, status=PaymentGrantTask.Status.SUCCEEDED,
        )
        coupon = UserCoupon.objects.create(
            user=buyer, promotion_code=self.promotion,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module, status=UserCoupon.Status.USED,
            used_payment=payment, used_at=timezone.now(),
        )
        participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=buyer,
            referral_code=self.referral, current_coupon=coupon,
            qualifying_payment=payment,
            status=ReferralParticipation.Status.REWARD_PENDING,
            order_created_at=payment.created_at,
        )
        application = PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=self.promotion,
            user=buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED, applied_at=timezone.now(),
        )
        return payment, participation, application

    def prepare_coupon_milestone(self, suffix):
        process_referral_reward_pending(participation_id=self.participation.pk)
        Entitlement.objects.create(
            user=self.referrer, plan=Entitlement.Plan.LIFETIME,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        for index in (1, 2):
            referred = get_user_model().objects.create_user(
                telephone=f"139{suffix}{index:07d}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=referred, referral_code=self.referral,
                status=ReferralParticipation.Status.QUALIFIED,
            )
        learning, _ = Module.objects.get_or_create(
            key="learning_by_video", defaults={"name": "Learning by video"},
        )
        ModuleSeason.objects.get_or_create(module=learning, season_number=1)
        ModuleSeason.objects.get_or_create(module=learning, season_number=4)
        reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        return ReferralReward.objects.get(
            referrer=self.referrer, kind=ReferralReward.Kind.SCIENCE_3,
        )

    def test_non_refunded_payment_is_a_non_mutating_noop(self):
        before = (self.participation.status, self.participation.updated_at,
                  ReferralNotice.objects.count(), ReferralReward.objects.count())
        result = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertFalse(result.changed)
        self.assertEqual((self.participation.status, self.participation.updated_at,
                          ReferralNotice.objects.count(), ReferralReward.objects.count()), before)

    def test_all_non_refunded_states_are_noops(self):
        for status in (
            AlipayWebsitePayment.Status.CREATED, AlipayWebsitePayment.Status.PENDING,
            AlipayWebsitePayment.Status.PAID, AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            AlipayWebsitePayment.Status.FAILED, AlipayWebsitePayment.Status.CLOSED,
        ):
            with self.subTest(status=status):
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                before = (self.participation.status, self.participation.updated_at,
                          ReferralNotice.objects.count(), ReferralReward.objects.count())
                result = self.reconcile()(payment_id=self.payment.pk)
                self.participation.refresh_from_db()
                self.assertFalse(result.changed)
                self.assertEqual((self.participation.status, self.participation.updated_at,
                                  ReferralNotice.objects.count(), ReferralReward.objects.count()), before)

    def test_ordinary_full_refund_without_referral_participation_is_noop(self):
        self.full_refund()
        ReferralParticipation.objects.filter(pk=self.participation.pk).delete()
        before = (ReferralNotice.objects.count(), ReferralReward.objects.count())
        result = self.reconcile()(payment_id=self.payment.pk)
        self.assertFalse(result.changed)
        self.assertIsNone(result.participation_id)
        self.assertEqual((ReferralNotice.objects.count(), ReferralReward.objects.count()), before)

    def test_pending_participation_becomes_refunded_without_reward_or_notice(self):
        when = self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertTrue(result.changed)
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertEqual(self.participation.refunded_at, when)
        self.assertEqual(self.participation.refund_reconciled_at, when)
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_supported_prequalification_states_refund_without_artifacts(self):
        for status in (
            ReferralParticipation.Status.PAYMENT_RESERVED,
            ReferralParticipation.Status.REWARD_PENDING,
            ReferralParticipation.Status.DISQUALIFIED,
        ):
            with self.subTest(status=status):
                ReferralParticipation.objects.filter(pk=self.participation.pk).update(
                    status=status, qualified_at=None, refunded_at=None,
                    refund_reconciled_at=None, last_error="old validation error",
                )
                self.full_refund()
                result = self.reconcile()(payment_id=self.payment.pk)
                self.participation.refresh_from_db()
                self.assertTrue(result.changed)
                self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
                self.assertEqual(self.participation.last_error, "")
                self.assertFalse(result.progress_removed)
                self.assertIsNone(result.access_expires_at)
                self.assertEqual(ReferralReward.objects.count(), 0)
                self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_refund_marker_makes_replay_exactly_once(self):
        self.full_refund()
        first = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        changed_at = self.participation.status_changed_at
        second = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertTrue(first.changed)
        self.assertFalse(second.changed)
        self.assertEqual(self.participation.status_changed_at, changed_at)

    def test_multiple_legitimate_refunds_do_not_break_any_participation_replay(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.full_refund()
        self.assertTrue(self.reconcile()(payment_id=self.payment.pk).changed)

        second_payment, second_participation, second_application = self.make_additional_purchase(
            telephone="13600139401", order_no="refund-order-multiple-qualified",
        )
        process_referral_reward_pending(participation_id=second_participation.pk)
        second_refunded_at = timezone.now()
        AlipayWebsitePayment.objects.filter(pk=second_payment.pk).update(
            status=AlipayWebsitePayment.Status.REFUNDED,
            refunded_amount=second_payment.total_amount,
            refunded_at=second_refunded_at,
        )
        PaymentDiscountApplication.objects.filter(pk=second_application.pk).update(
            status=PaymentDiscountApplication.Status.REFUNDED,
            refunded_at=second_refunded_at,
        )
        self.assertTrue(self.reconcile()(payment_id=second_payment.pk).changed)
        self.assertEqual(
            ReferralNotice.objects.filter(event_type="referral_refunded").count(), 2,
        )
        self.assertFalse(self.reconcile()(payment_id=self.payment.pk).changed)
        self.assertFalse(self.reconcile()(payment_id=second_payment.pk).changed)

        third_payment, third_participation, third_application = self.make_additional_purchase(
            telephone="13600139402", order_no="refund-order-multiple-prequalification",
        )
        third_refunded_at = timezone.now()
        AlipayWebsitePayment.objects.filter(pk=third_payment.pk).update(
            status=AlipayWebsitePayment.Status.REFUNDED,
            refunded_amount=third_payment.total_amount,
            refunded_at=third_refunded_at,
        )
        PaymentDiscountApplication.objects.filter(pk=third_application.pk).update(
            status=PaymentDiscountApplication.Status.REFUNDED,
            refunded_at=third_refunded_at,
        )
        self.assertTrue(self.reconcile()(payment_id=third_payment.pk).changed)
        third_participation.refresh_from_db()
        self.assertEqual(third_participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertFalse(self.reconcile()(payment_id=third_payment.pk).changed)

    def test_partial_then_full_refund_reconciles_only_on_full_refund(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            refunded_amount=Decimal("10.00"),
        )
        self.assertFalse(self.reconcile()(payment_id=self.payment.pk).changed)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)
        self.full_refund()
        self.assertTrue(self.reconcile()(payment_id=self.payment.pk).changed)

    def test_full_refund_locks_referrer_before_payment(self):
        self.full_refund()
        seen = []
        original = QuerySet.select_for_update

        def tracked(queryset, *args, **kwargs):
            seen.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracked):
            self.reconcile()(payment_id=self.payment.pk)
        self.assertEqual(seen[:4], [
            get_user_model().__name__, "PaymentGrantTask", "AlipayWebsitePayment",
            "ReferralParticipation",
        ])

    def test_campaign_chain_corruption_fails_without_writes(self):
        self.full_refund()
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(
            promotion_discount_amount=Decimal("6.00"),
        )
        before = (self.participation.status, self.participation.updated_at,
                  ReferralNotice.objects.count(), ReferralReward.objects.count())
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        self.assertEqual((self.participation.status, self.participation.updated_at,
                          ReferralNotice.objects.count(), ReferralReward.objects.count()), before)

    def test_corrupt_chain_representatives_fail_closed_without_writes(self):
        mutations = (
            ("participation campaign", lambda: ReferralParticipation.objects.filter(
                pk=self.participation.pk).update(campaign_tag="other")),
            ("referral owner", lambda: ReferralCode.objects.filter(
                pk=self.referral.pk).update(user=self.buyer)),
            ("application state", lambda: PaymentDiscountApplication.objects.filter(
                pk=self.application.pk).update(status=PaymentDiscountApplication.Status.RELEASED)),
            ("coupon reservation", lambda: UserCoupon.objects.filter(
                pk=self.coupon.pk).update(reserved_at=timezone.now())),
            ("promotion terms", lambda: PromotionCodeRecord.objects.filter(
                pk=self.promotion.pk).update(minimum_order_amount=Decimal("1.00"))),
        )
        self.full_refund()
        for label, mutate in mutations:
            with self.subTest(case=label):
                savepoint = transaction.savepoint()
                try:
                    mutate()
                    participation = ReferralParticipation.objects.get(pk=self.participation.pk)
                    before = (participation.status, participation.updated_at,
                              ReferralNotice.objects.count(), ReferralReward.objects.count())
                    with self.assertRaises(ValueError):
                        self.reconcile()(payment_id=self.payment.pk)
                    participation.refresh_from_db()
                    self.assertEqual((participation.status, participation.updated_at,
                                      ReferralNotice.objects.count(), ReferralReward.objects.count()), before)
                finally:
                    transaction.savepoint_rollback(savepoint)

    def test_grant_task_user_and_module_must_match_referral_purchase(self):
        self.full_refund()
        other_module, _ = Module.objects.get_or_create(
            key="refund_other", defaults={"name": "Other"},
        )
        other_offer = PurchaseOffer.objects.create(
            code="refund-other-offer", title="Other offer", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        mutations = (
            lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(user=self.referrer),
            lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(module=other_module),
            lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(offer=other_offer),
            lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(offer=None),
        )
        for mutate in mutations:
            savepoint = transaction.savepoint()
            try:
                mutate()
                with self.assertRaises(ValueError):
                    self.reconcile()(payment_id=self.payment.pk)
                self.assertEqual(
                    ReferralParticipation.objects.get(pk=self.participation.pk).status,
                    ReferralParticipation.Status.REWARD_PENDING,
                )
                self.assertEqual(ReferralNotice.objects.count(), 0)
            finally:
                transaction.savepoint_rollback(savepoint)

    def test_later_inactive_promotion_does_not_block_refund_reconciliation(self):
        self.full_refund()
        PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(
            status=PromotionCodeRecord.Status.REVOKED,
        )
        result = self.reconcile()(payment_id=self.payment.pk)
        self.assertTrue(result.changed)

    def test_refunded_participation_without_reconciliation_marker_is_corrupt(self):
        self.full_refund()
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(
            status=ReferralParticipation.Status.REFUNDED,
            refunded_at=timezone.now(), refund_reconciled_at=None,
        )
        before = ReferralParticipation.objects.get(pk=self.participation.pk).updated_at
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)
        self.assertEqual(ReferralParticipation.objects.get(pk=self.participation.pk).updated_at, before)

    def test_open_or_unknown_status_with_campaign_payment_is_corrupt(self):
        self.full_refund()
        for status in (ReferralParticipation.Status.OPEN, "unrecognized"):
            with self.subTest(status=status):
                ReferralParticipation.objects.filter(pk=self.participation.pk).update(status=status)
                before = ReferralParticipation.objects.get(pk=self.participation.pk).updated_at
                with self.assertRaises(ValueError):
                    self.reconcile()(payment_id=self.payment.pk)
                self.assertEqual(
                    ReferralParticipation.objects.get(pk=self.participation.pk).updated_at, before,
                )

    def test_refunded_status_with_partial_amount_fails_closed(self):
        self.full_refund()
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            refunded_amount=Decimal("10.00"),
        )
        before = ReferralParticipation.objects.get(pk=self.participation.pk).updated_at
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)
        self.assertEqual(ReferralParticipation.objects.get(pk=self.participation.pk).updated_at, before)

    def test_prequalification_residual_timestamps_fail_closed(self):
        self.full_refund()
        for field in ("qualified_at", "refunded_at", "refund_reconciled_at"):
            with self.subTest(field=field):
                savepoint = transaction.savepoint()
                try:
                    ReferralParticipation.objects.filter(pk=self.participation.pk).update(
                        **{field: timezone.now()},
                    )
                    before = ReferralParticipation.objects.get(pk=self.participation.pk)
                    snapshot = (before.status, before.qualified_at, before.refunded_at,
                                before.refund_reconciled_at, before.updated_at)
                    with self.assertRaises(ValueError):
                        self.reconcile()(payment_id=self.payment.pk)
                    after = ReferralParticipation.objects.get(pk=self.participation.pk)
                    self.assertEqual((after.status, after.qualified_at, after.refunded_at,
                                      after.refund_reconciled_at, after.updated_at), snapshot)
                finally:
                    transaction.savepoint_rollback(savepoint)

    def test_qualified_state_requires_clean_refund_markers_and_qualified_at(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.full_refund()
        for field, value in (
            ("qualified_at", None),
            ("refunded_at", timezone.now()),
            ("refund_reconciled_at", timezone.now()),
        ):
            with self.subTest(field=field):
                savepoint = transaction.savepoint()
                try:
                    ReferralParticipation.objects.filter(pk=self.participation.pk).update(
                        **{field: value},
                    )
                    with self.assertRaises(ValueError):
                        self.reconcile()(payment_id=self.payment.pk)
                finally:
                    transaction.savepoint_rollback(savepoint)

    def test_refunded_replay_requires_payment_timestamp_and_matching_reward_history(self):
        refunded_at = self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(
            refunded_at=refunded_at + timedelta(seconds=1),
        )
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)
        ReferralParticipation.objects.filter(pk=self.participation.pk).update(
            refunded_at=refunded_at, qualified_at=refunded_at,
        )
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)

    def test_prequalification_audit_chain_amount_and_offer_corruption_fails_closed(self):
        self.full_refund()
        season = ModuleSeason.objects.create(module=self.module, season_number=9)
        mutations = (
            ("task plan", lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(
                plan=Entitlement.Plan.MONTH_2,
            )),
            ("offer season", lambda: PurchaseOffer.objects.filter(pk=self.offer.pk).update(
                season=season,
            )),
            ("original amount", lambda: PaymentDiscountApplication.objects.filter(
                pk=self.application.pk).update(original_amount=Decimal("60.00"))),
            ("automatic discount equation", lambda: PaymentDiscountApplication.objects.filter(
                pk=self.application.pk).update(automatic_discount_amount=Decimal("1.00"))),
            ("final amount equation", lambda: PaymentDiscountApplication.objects.filter(
                pk=self.application.pk).update(final_amount=Decimal("53.90"))),
        )
        for label, mutate in mutations:
            with self.subTest(case=label):
                savepoint = transaction.savepoint()
                try:
                    mutate()
                    with self.assertRaises(ValueError):
                        self.reconcile()(payment_id=self.payment.pk)
                    self.assertEqual(
                        ReferralParticipation.objects.get(pk=self.participation.pk).status,
                        ReferralParticipation.Status.REWARD_PENDING,
                    )
                    self.assertEqual(ReferralNotice.objects.count(), 0)
                finally:
                    transaction.savepoint_rollback(savepoint)

    def test_valid_automatic_and_promotion_discounts_can_stack(self):
        PurchaseOffer.objects.filter(pk=self.offer.pk).update(price_amount=Decimal("64.90"))
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            total_amount=Decimal("54.90"),
        )
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(
            original_amount=Decimal("64.90"), automatic_discount_amount=Decimal("5.00"),
        )
        self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)
        self.assertTrue(result.changed)

    def test_platform_finite_access_remains_effective_after_module_reward_debit(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        platform_expiry = timezone.now() + timedelta(days=90)
        Entitlement.objects.create(
            user=self.referrer, module=None, season=None,
            plan=Entitlement.Plan.MONTH_3, status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(), expires_at=platform_expiry, external_ref="admin:platform-finite",
        )
        self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        self.assertEqual(result.access_expires_at, platform_expiry)
        self.assertEqual(notice.payload["access_expires_at"], platform_expiry.isoformat())
        self.assertEqual(notice.payload["days_removed"], 0)

    def test_platform_lifetime_access_means_no_effective_expiry_or_days_removed(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        Entitlement.objects.create(
            user=self.referrer, module=None, season=None,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(), expires_at=None, external_ref="admin:platform-lifetime",
        )
        self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        self.assertIsNone(result.access_expires_at)
        self.assertIsNone(notice.payload["access_expires_at"])
        self.assertEqual(notice.payload["days_removed"], 0)

    def test_refund_before_delayed_worker_cannot_restore_progress(self):
        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertEqual(ReferralReward.objects.count(), 0)

    def test_pending_and_processing_grant_tasks_allow_prequalification_refund(self):
        for status in (
            PaymentGrantTask.Status.PENDING, PaymentGrantTask.Status.PROCESSING,
            PaymentGrantTask.Status.FAILED, PaymentGrantTask.Status.CANCELED,
        ):
            with self.subTest(task_status=status):
                savepoint = transaction.savepoint()
                try:
                    PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=status)
                    self.full_refund()
                    result = self.reconcile()(payment_id=self.payment.pk)
                    self.participation.refresh_from_db()
                    self.assertTrue(result.changed)
                    self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
                    self.assertIsNone(process_referral_reward_pending(participation_id=self.participation.pk))
                    self.assertEqual(ReferralReward.objects.count(), 0)
                finally:
                    transaction.savepoint_rollback(savepoint)

    def test_qualified_canceled_task_requires_post_order_lifetime_history(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        PaymentGrantTask.objects.filter(pk=self.task.pk).update(
            status=PaymentGrantTask.Status.CANCELED,
        )
        self.full_refund()
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        reward = ReferralReward.objects.get(participation=self.participation)
        self.assertEqual(self.participation.status, ReferralParticipation.Status.QUALIFIED)
        self.assertEqual(reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(ReferralNotice.objects.count(), 1)

    def test_qualified_canceled_task_with_lifetime_history_can_refund(self):
        Entitlement.objects.create(
            user=self.buyer, module=self.module, season=None,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(), expires_at=None, external_ref="admin:after-order-lifetime",
        )
        PaymentGrantTask.objects.filter(pk=self.task.pk).update(
            status=PaymentGrantTask.Status.CANCELED,
        )
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.QUALIFIED)
        self.full_refund()
        self.assertTrue(self.reconcile()(payment_id=self.payment.pk).changed)

    def test_qualified_canceled_task_rejects_finite_entitlement_as_lifetime_proof(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.participation.refresh_from_db()
        Entitlement.objects.create(
            user=self.buyer, module=self.module, season=None,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=self.participation.qualified_at, expires_at=timezone.now() + timedelta(days=365),
            external_ref="admin:fake-lifetime",
        )
        PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=PaymentGrantTask.Status.CANCELED)
        self.full_refund()
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)

    def test_qualified_canceled_task_rejects_lifetime_created_after_qualification(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.participation.refresh_from_db()
        created_after_qualification = self.participation.qualified_at + timedelta(seconds=1)
        Entitlement.objects.create(
            user=self.buyer, module=self.module, season=None,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=created_after_qualification, expires_at=None,
            external_ref="admin:late-lifetime-proof",
        )
        Entitlement.objects.filter(external_ref="admin:late-lifetime-proof").update(
            created_at=created_after_qualification,
        )
        PaymentGrantTask.objects.filter(pk=self.task.pk).update(status=PaymentGrantTask.Status.CANCELED)
        self.full_refund()
        with self.assertRaises(ValueError):
            self.reconcile()(payment_id=self.payment.pk)

    def test_earlier_month_refund_reports_global_access_reduction(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        second_buyer = get_user_model().objects.create_user(
            telephone="13600139301", password="pass",
        )
        second_payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="refund-order-second", subject="Offer",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
        )
        PaymentGrantTask.objects.create(
            payment=second_payment, offer=self.offer, user=second_buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1, status=PaymentGrantTask.Status.SUCCEEDED,
        )
        second_coupon = UserCoupon.objects.create(
            user=second_buyer, promotion_code=self.promotion,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module, status=UserCoupon.Status.USED,
            used_payment=second_payment, used_at=timezone.now(),
        )
        second_participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=second_buyer,
            referral_code=self.referral, current_coupon=second_coupon,
            qualifying_payment=second_payment,
            status=ReferralParticipation.Status.REWARD_PENDING,
            order_created_at=second_payment.created_at,
        )
        second_application = PaymentDiscountApplication.objects.create(
            payment=second_payment, coupon=second_coupon, promotion_code=self.promotion,
            user=second_buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED, applied_at=timezone.now(),
        )
        process_referral_reward_pending(participation_id=second_participation.pk)
        first_reward = ReferralReward.objects.get(participation=self.participation)
        first_expiry = first_reward.entitlement.expires_at
        global_expiry = max(Entitlement.objects.filter(
            user=self.referrer, module=self.module, season__isnull=True,
            status=Entitlement.Status.ACTIVE, expires_at__isnull=False,
        ).values_list("expires_at", flat=True))
        self.assertLess(first_expiry, global_expiry)
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.REFUNDED,
            refunded_amount=Decimal("54.90"), refunded_at=timezone.now(),
        )
        PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(
            status=PaymentDiscountApplication.Status.REFUNDED,
            refunded_at=timezone.now(),
        )
        result = self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        expected_days = round((global_expiry - result.access_expires_at).total_seconds() / 86400, 2)
        self.assertGreaterEqual(expected_days, 29)
        self.assertEqual(notice.payload["days_removed"], expected_days)
        self.assertIn(type(notice.payload["days_removed"]), (int, float))

    def test_qualified_refund_revokes_month_and_reconciles_once(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.participation.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.QUALIFIED)
        reward = ReferralReward.objects.get(participation=self.participation)
        original_expiry = reward.entitlement.expires_at
        self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        reward.refresh_from_db()
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        self.assertTrue(result.progress_removed)
        self.assertEqual(result.access_expires_at, reward.entitlement.expires_at)
        self.assertLessEqual(original_expiry - result.access_expires_at, timezone.timedelta(days=30))
        self.assertGreaterEqual(original_expiry - result.access_expires_at, timezone.timedelta(days=29))
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertEqual(reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(notice.user_id, self.referrer.pk)
        self.assertTrue(notice.is_global_notice)
        self.assertIsNone(notice.acknowledged_at)
        self.assertEqual(set(notice.payload), {
            "progress_removed", "days_removed", "access_expires_at",
            "effective_count", "milestone_changes",
        })
        self.assertTrue(notice.payload["progress_removed"])
        self.assertIn(type(notice.payload["days_removed"]), (int, float))
        self.assertEqual(
            notice.payload["days_removed"],
            round((original_expiry - result.access_expires_at).total_seconds() / 86400, 2),
        )
        self.assertEqual(ReferralNotice.objects.filter(event_type="referral_refunded").count(), 1)

    def test_qualified_refund_reconciles_when_reused_lifetime_was_canceled(self):
        lifetime = Entitlement.objects.create(
            user=self.referrer, module=self.module, season=None,
            plan=Entitlement.Plan.LIFETIME, status=Entitlement.Status.ACTIVE,
            starts_at=timezone.now(), expires_at=None, external_ref="purchase:lifetime",
        )
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.participation.refresh_from_db()
        reward = ReferralReward.objects.get(participation=self.participation)
        self.assertEqual(self.participation.status, ReferralParticipation.Status.QUALIFIED)
        self.assertEqual(reward.entitlement_id, lifetime.pk)

        lifetime.status = Entitlement.Status.CANCELED
        lifetime.save(update_fields=["status"])
        lifetime_before = list(Entitlement.objects.filter(pk=lifetime.pk).values())
        timed_before = list(Entitlement.objects.filter(
            user=self.referrer, plan=Entitlement.Plan.MONTH_1,
        ).values())

        self.full_refund()
        result = self.reconcile()(payment_id=self.payment.pk)

        self.assertTrue(result.changed)
        self.participation.refresh_from_db()
        reward.refresh_from_db()
        lifetime.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REFUNDED)
        self.assertIsNotNone(self.participation.refund_reconciled_at)
        self.assertEqual(reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(list(Entitlement.objects.filter(pk=lifetime.pk).values()), lifetime_before)
        self.assertEqual(list(Entitlement.objects.filter(
            user=self.referrer, plan=Entitlement.Plan.MONTH_1,
        ).values()), timed_before)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        self.assertTrue(notice.payload["progress_removed"])
        self.assertEqual(notice.payload["effective_count"], 0)

        result = self.reconcile()(payment_id=self.payment.pk)
        self.assertFalse(result.changed)
        entitlement_expiry = reward.entitlement.expires_at
        result = self.reconcile()(payment_id=self.payment.pk)
        reward.refresh_from_db()
        reward.entitlement.refresh_from_db()
        self.assertFalse(result.changed)
        self.assertEqual(reward.entitlement.expires_at, entitlement_expiry)
        self.assertEqual(ReferralNotice.objects.filter(event_type="referral_refunded").count(), 1)

    def test_milestone_threshold_drop_revokes_real_science_entitlement(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        for index in (1, 2):
            user = get_user_model().objects.create_user(
                telephone=f"1360013920{index}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=user, referral_code=self.referral,
                status=ReferralParticipation.Status.QUALIFIED,
            )
        learning, _ = Module.objects.get_or_create(
            key="learning_by_video", defaults={"name": "Learning by video"},
        )
        science, _ = ModuleSeason.objects.get_or_create(module=learning, season_number=1)
        ModuleSeason.objects.get_or_create(module=learning, season_number=4)
        reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        milestone = ReferralReward.objects.get(
            referrer=self.referrer, kind=ReferralReward.Kind.SCIENCE_3,
        )
        self.assertEqual(milestone.entitlement.season_id, science.pk)
        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        milestone.refresh_from_db()
        milestone.entitlement.refresh_from_db()
        self.assertEqual(milestone.status, ReferralReward.Status.REVOKED)
        self.assertEqual(milestone.entitlement.status, Entitlement.Status.CANCELED)

    def test_refund_notice_reports_effective_count_and_real_entitlement_revocation(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        for index in (1, 2):
            user = get_user_model().objects.create_user(
                telephone=f"1360013911{index}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=user, referral_code=self.referral,
                status=ReferralParticipation.Status.QUALIFIED,
            )
        learning, _ = Module.objects.get_or_create(
            key="learning_by_video", defaults={"name": "Learning by video"},
        )
        science, _ = ModuleSeason.objects.get_or_create(module=learning, season_number=1)
        ModuleSeason.objects.get_or_create(module=learning, season_number=4)
        reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        self.assertEqual(notice.payload["effective_count"], 2)
        self.assertEqual(notice.payload["milestone_changes"], [{
            "threshold": 3, "kind": "science_3", "outcome": "revoked",
            "reward_type": "entitlement",
        }])

    def test_five_to_four_refund_only_reports_vlog_milestone_change(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        for index in range(1, 5):
            referred = get_user_model().objects.create_user(
                telephone=f"1380013940{index}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                referred_user=referred, referral_code=self.referral,
                status=ReferralParticipation.Status.QUALIFIED,
            )
        learning, _ = Module.objects.get_or_create(
            key="learning_by_video", defaults={"name": "Learning by video"},
        )
        science, _ = ModuleSeason.objects.get_or_create(module=learning, season_number=1)
        vlog, _ = ModuleSeason.objects.get_or_create(module=learning, season_number=4)
        reconcile_referral_milestones(
            referrer=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        science_reward = ReferralReward.objects.get(
            referrer=self.referrer, kind=ReferralReward.Kind.SCIENCE_3,
        )
        vlog_reward = ReferralReward.objects.get(
            referrer=self.referrer, kind=ReferralReward.Kind.VLOG_5,
        )
        self.assertEqual(science_reward.entitlement.season_id, science.pk)
        self.assertEqual(vlog_reward.entitlement.season_id, vlog.pk)

        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        science_reward.refresh_from_db()
        vlog_reward.refresh_from_db()
        self.assertEqual(notice.payload["effective_count"], 4)
        self.assertEqual(science_reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(vlog_reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(notice.payload["milestone_changes"], [{
            "threshold": 5, "kind": "vlog_5", "outcome": "revoked",
            "reward_type": "entitlement",
        }])

    def test_refund_notice_reports_available_coupon_revocation(self):
        reward = self.prepare_coupon_milestone("1")
        self.assertEqual(reward.coupon.status, UserCoupon.Status.AVAILABLE)
        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        self.assertEqual(notice.payload["milestone_changes"], [{
            "threshold": 3, "kind": "science_3", "outcome": "revoked", "reward_type": "coupon",
        }])

    def test_refund_notice_reports_reserved_coupon_pending_revocation(self):
        reward = self.prepare_coupon_milestone("2")
        coupon = reward.coupon
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="milestone-reserved-refund", subject="Offer",
            total_amount=Decimal("10.00"), status=AlipayWebsitePayment.Status.PENDING,
        )
        application = PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=coupon.promotion_code,
            user=self.referrer, offer=self.offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("10.00"), final_amount=Decimal("10.00"),
            status=PaymentDiscountApplication.Status.RESERVED,
        )
        coupon.status = UserCoupon.Status.RESERVED
        coupon.reserved_payment = payment
        coupon.reserved_at = timezone.now()
        coupon.save(update_fields=["status", "reserved_payment", "reserved_at", "updated_at"])
        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.REVOCATION_PENDING)
        self.assertEqual(application.status, PaymentDiscountApplication.Status.RESERVED)
        self.assertEqual(notice.payload["milestone_changes"], [{
            "threshold": 3, "kind": "science_3", "outcome": "revocation_pending", "reward_type": "coupon",
        }])

    def test_refund_notice_reports_used_coupon_as_non_reversible(self):
        reward = self.prepare_coupon_milestone("3")
        coupon = reward.coupon
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="milestone-used-refund", subject="Offer",
            total_amount=Decimal("10.00"), status=AlipayWebsitePayment.Status.PAID,
        )
        application = PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=coupon.promotion_code,
            user=self.referrer, offer=self.offer, original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("10.00"), final_amount=Decimal("10.00"),
            status=PaymentDiscountApplication.Status.APPLIED, applied_at=timezone.now(),
        )
        coupon.status = UserCoupon.Status.USED
        coupon.used_payment = payment
        coupon.used_at = timezone.now()
        coupon.save(update_fields=["status", "used_payment", "used_at", "updated_at"])
        self.full_refund()
        self.reconcile()(payment_id=self.payment.pk)
        notice = ReferralNotice.objects.get(event_type="referral_refunded")
        reward.refresh_from_db()
        self.assertEqual(reward.status, ReferralReward.Status.NON_REVERSIBLE)
        self.assertEqual(application.status, PaymentDiscountApplication.Status.APPLIED)
        self.assertEqual(notice.payload["milestone_changes"], [{
            "threshold": 3, "kind": "science_3", "outcome": "non_reversible", "reward_type": "coupon",
        }])

    def test_milestone_failure_rolls_back_refund_and_real_month_debit(self):
        process_referral_reward_pending(participation_id=self.participation.pk)
        month = ReferralReward.objects.get(participation=self.participation)
        entitlement_before = month.entitlement.expires_at
        self.full_refund()
        with patch(
            "apps.accounts.services.referral_refunds.reconcile_referral_milestones",
            side_effect=ValueError("milestone failure"),
        ):
            with self.assertRaisesMessage(ValueError, "milestone failure"):
                self.reconcile()(payment_id=self.payment.pk)
        self.participation.refresh_from_db()
        month.refresh_from_db()
        month.entitlement.refresh_from_db()
        self.assertEqual(self.participation.status, ReferralParticipation.Status.QUALIFIED)
        self.assertIsNone(self.participation.refund_reconciled_at)
        self.assertEqual(month.status, ReferralReward.Status.GRANTED)
        self.assertEqual(month.entitlement.expires_at, entitlement_before)
        self.assertFalse(ReferralNotice.objects.filter(event_type="referral_refunded").exists())
        self.assertTrue(self.reconcile()(payment_id=self.payment.pk).changed)
        self.assertEqual(ReferralNotice.objects.filter(event_type="referral_refunded").count(), 1)

