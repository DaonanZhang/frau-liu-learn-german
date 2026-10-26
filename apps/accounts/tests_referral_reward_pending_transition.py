from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models.query import QuerySet
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, PaymentDiscountApplication,
    PaymentGrantTask, PromotionCodeRecord, PurchaseOffer, ReferralCode,
    ReferralNotice, ReferralParticipation, ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_qualification import mark_referral_reward_pending


@override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
class ReferralRewardPendingTransitionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13600139011", password="pass")
        self.referrer = User.objects.create_user(telephone="13600139012", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.other_module = Module.objects.exclude(pk=self.module.pk).first()
        if self.other_module is None:
            self.other_module = Module.objects.create(key="reward_other", name="Other")
        self.offer = self.make_offer("reward-offer", self.module)
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="reward-order", subject="Offer", total_amount=Decimal("54.90"),
            status=AlipayWebsitePayment.Status.PAID,
        )
        self.task = PaymentGrantTask.objects.create(
            payment=self.payment, offer=self.offer, user=self.buyer, module=self.module,
            plan=Entitlement.Plan.MONTH_1, status=PaymentGrantTask.Status.SUCCEEDED,
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-REWARD001", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module, redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
            status=PromotionCodeRecord.Status.REVOKED,
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
            qualifying_payment=self.payment, status=ReferralParticipation.Status.PAYMENT_RESERVED,
            order_created_at=self.payment.created_at, last_error="",
        )
        self.application = PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=self.coupon, promotion_code=self.promotion,
            user=self.buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED,
        )

    def test_paid_chain_moves_once_and_ignores_disabled_campaign_and_new_access(self):
        Entitlement.objects.create(user=self.buyer, module=self.module, plan=Entitlement.Plan.MONTH_1)
        result = mark_referral_reward_pending(payment_grant_task=self.task)
        result.refresh_from_db()
        self.assertEqual(result.status, ReferralParticipation.Status.REWARD_PENDING)
        self.assertEqual(result.qualifying_payment_id, self.payment.pk)
        self.assertEqual(result.current_coupon_id, self.coupon.pk)
        self.assertEqual(result.order_created_at, self.payment.created_at)
        self.assertIsNone(result.qualified_at)
        self.assertEqual(result.last_error, "")
        changed_at = result.status_changed_at
        updated_at = result.updated_at
        self.assertEqual(mark_referral_reward_pending(payment_grant_task=self.task).pk, result.pk)
        result.refresh_from_db()
        self.assertEqual((result.status_changed_at, result.updated_at), (changed_at, updated_at))

    def test_partially_refunded_payment_moves_to_reward_pending(self):
        AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(
            status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED
        )
        result = mark_referral_reward_pending(payment_grant_task=self.task)
        self.assertEqual(result.status, ReferralParticipation.Status.REWARD_PENDING)

    def test_pre_order_access_history_disqualifies_regardless_of_status_or_scope(self):
        for status, platform_wide in (
            (Entitlement.Status.ACTIVE, False),
            (Entitlement.Status.EXPIRED, False),
            (Entitlement.Status.CANCELED, False),
            (Entitlement.Status.ACTIVE, True),
        ):
            with self.subTest(status=status, platform_wide=platform_wide):
                Entitlement.objects.all().delete()
                entitlement = Entitlement.objects.create(
                    user=self.buyer,
                    module=None if platform_wide else self.module,
                    plan=Entitlement.Plan.MONTH_1,
                    status=status,
                )
                Entitlement.objects.filter(pk=entitlement.pk).update(
                    created_at=self.payment.created_at - timezone.timedelta(seconds=1)
                )
                result = mark_referral_reward_pending(payment_grant_task=self.task)
                result.refresh_from_db()
                self.assertEqual(result.status, ReferralParticipation.Status.DISQUALIFIED)
                self.assertEqual(result.last_error, "Referral reward qualification is invalid")
                self.assertEqual(ReferralReward.objects.count(), 0)
                self.assertEqual(ReferralNotice.objects.count(), 0)
                ReferralParticipation.objects.filter(pk=result.pk).update(
                    status=ReferralParticipation.Status.PAYMENT_RESERVED
                )

    def test_current_order_and_cutoff_access_history_are_allowed(self):
        cases = (
            ("excluded current order", f"alipay_payment:{self.payment.merchant_order_no}",
             self.payment.created_at - timezone.timedelta(seconds=1)),
            ("at cutoff", "", self.payment.created_at),
            ("after cutoff", "", self.payment.created_at + timezone.timedelta(seconds=1)),
        )
        for label, external_ref, created_at in cases:
            with self.subTest(case=label):
                Entitlement.objects.all().delete()
                entitlement = Entitlement.objects.create(
                    user=self.buyer, module=self.module, plan=Entitlement.Plan.MONTH_1,
                    external_ref=external_ref,
                )
                Entitlement.objects.filter(pk=entitlement.pk).update(created_at=created_at)
                ReferralParticipation.objects.filter(pk=self.participation.pk).update(
                    status=ReferralParticipation.Status.PAYMENT_RESERVED,
                    last_error="",
                )
                result = mark_referral_reward_pending(payment_grant_task=self.task)
                result.refresh_from_db()
                self.assertEqual(result.status, ReferralParticipation.Status.REWARD_PENDING)

    def test_unpaid_and_terminal_payments_leave_participation_unchanged(self):
        for status in (
            AlipayWebsitePayment.Status.REFUNDED, AlipayWebsitePayment.Status.FAILED,
            AlipayWebsitePayment.Status.CLOSED, AlipayWebsitePayment.Status.CREATED,
            AlipayWebsitePayment.Status.PENDING,
        ):
            with self.subTest(status=status):
                AlipayWebsitePayment.objects.filter(pk=self.payment.pk).update(status=status)
                self.participation.refresh_from_db()
                before = (self.participation.status, self.participation.status_changed_at,
                          self.participation.updated_at, self.participation.last_error)
                self.assertIsNone(mark_referral_reward_pending(payment_grant_task=self.task))
                self.participation.refresh_from_db()
                self.assertEqual((self.participation.status, self.participation.status_changed_at,
                                  self.participation.updated_at, self.participation.last_error), before)

    def test_structural_mismatches_disqualify_paid_reserved_participation(self):
        cases = [
            ("task user", lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(user=self.referrer)),
            ("task module", lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(module=self.other_module)),
            ("task offer", lambda: PaymentGrantTask.objects.filter(pk=self.task.pk).update(offer=self.make_offer("other-offer", self.module))),
            ("application coupon", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(coupon=self.make_coupon())),
            ("application promotion", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(promotion_code=self.make_promotion())),
            ("application status", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(status=PaymentDiscountApplication.Status.RELEASED)),
            ("application discount", lambda: PaymentDiscountApplication.objects.filter(pk=self.application.pk).update(promotion_discount_amount=Decimal("6.00"))),
            ("coupon used payment", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(used_payment=self.make_payment("other-payment"))),
            ("coupon status", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(status=UserCoupon.Status.AVAILABLE)),
            ("coupon terms", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(discount_amount=Decimal("6.00"))),
            ("coupon promotion", lambda: UserCoupon.objects.filter(pk=self.coupon.pk).update(promotion_code=self.make_promotion())),
            ("campaign attribution", lambda: ReferralParticipation.objects.filter(pk=self.participation.pk).update(campaign_tag="other")),
            ("referral attribution", lambda: ReferralCode.objects.filter(pk=self.referral.pk).update(campaign_tag="other")),
            ("self referral", lambda: ReferralCode.objects.filter(pk=self.referral.pk).update(user=self.buyer)),
            ("promotion source", lambda: PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(source_kind=PromotionCodeRecord.SourceKind.OPERATIONAL)),
            ("promotion campaign", lambda: PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(campaign_name="other")),
            ("promotion terms", lambda: PromotionCodeRecord.objects.filter(pk=self.promotion.pk).update(minimum_order_amount=Decimal("1.00"))),
        ]
        for label, mutate in cases:
            with self.subTest(case=label):
                savepoint = transaction.savepoint()
                try:
                    mutate()
                    result = mark_referral_reward_pending(payment_grant_task=self.task)
                    self.assertEqual(result.status, ReferralParticipation.Status.DISQUALIFIED)
                    self.assertEqual(result.last_error, "Referral reward qualification is invalid")
                finally:
                    transaction.savepoint_rollback(savepoint)

    def test_terminal_participation_states_are_noop(self):
        for status in (ReferralParticipation.Status.QUALIFIED, ReferralParticipation.Status.REFUNDED,
                       ReferralParticipation.Status.DISQUALIFIED):
            with self.subTest(status=status):
                ReferralParticipation.objects.filter(pk=self.participation.pk).update(status=status)
                self.participation.refresh_from_db()
                before = (self.participation.status, self.participation.status_changed_at,
                          self.participation.updated_at, self.participation.last_error)
                self.assertIsNone(mark_referral_reward_pending(payment_grant_task=self.task))
                self.participation.refresh_from_db()
                self.assertEqual((self.participation.status, self.participation.status_changed_at,
                                  self.participation.updated_at, self.participation.last_error), before)

    def test_no_candidate_and_existing_reward_pending_are_non_mutating(self):
        ReferralParticipation.objects.filter(pk=self.participation.pk).delete()
        self.assertIsNone(mark_referral_reward_pending(payment_grant_task=self.task))

    def test_service_only_mutates_participation_and_creates_no_reward_artifacts(self):
        before = (self.payment.updated_at, self.task.updated_at, self.application.updated_at,
                  self.coupon.updated_at, Entitlement.objects.count())
        result = mark_referral_reward_pending(payment_grant_task=self.task)
        self.assertEqual(result.status, ReferralParticipation.Status.REWARD_PENDING)
        self.payment.refresh_from_db(); self.task.refresh_from_db()
        self.application.refresh_from_db(); self.coupon.refresh_from_db()
        self.assertEqual((self.payment.updated_at, self.task.updated_at, self.application.updated_at,
                          self.coupon.updated_at, Entitlement.objects.count()), before)
        self.assertEqual(ReferralReward.objects.count(), 0)
        self.assertEqual(ReferralNotice.objects.count(), 0)

    def test_locks_rows_in_required_order(self):
        events = []
        original = QuerySet.select_for_update

        def tracked(queryset, *args, **kwargs):
            events.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", tracked):
            mark_referral_reward_pending(payment_grant_task=self.task)
        self.assertEqual(events, [
            get_user_model().__name__, "PaymentGrantTask", "AlipayWebsitePayment",
            "ReferralParticipation", "PaymentDiscountApplication", "UserCoupon",
            "ReferralCode", "PromotionCodeRecord",
        ])

    def make_offer(self, code, module):
        return PurchaseOffer.objects.create(
            code=code, title=code, module=module, plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("59.90"),
        )

    def make_payment(self, order):
        return AlipayWebsitePayment.objects.create(
            merchant_order_no=order, subject="Offer", total_amount=Decimal("54.90"),
            status=AlipayWebsitePayment.Status.PAID,
        )

    def make_coupon(self):
        return UserCoupon.objects.create(
            user=self.buyer, promotion_code=self.promotion, discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=self.module,
            status=UserCoupon.Status.USED,
        )

    def make_promotion(self):
        return PromotionCodeRecord.objects.create(
            code="OTHER-REWARD", campaign_name="other", discount_amount=Decimal("5.00"),
        )
