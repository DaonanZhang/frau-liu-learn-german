from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, PaymentDiscountApplication,
    PaymentGrantTask, PromotionCodeRecord, PurchaseOffer, ReferralCode,
    ReferralNotice, ReferralParticipation, ReferralReward, UserCoupon,
)
from apps.accounts.services.entitlement_grant_service import ExistingLifetimeAccessError
from apps.accounts.services.payment_grant_service import process_payment_grant_task_by_id
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_qualification import process_referral_reward_pending
from apps.accounts.tasks import reconcile_alipay_payments_now, reconcile_pending_referrals_now


class ReferralRewardDispatchTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13610139021", password="pass")
        self.referrer = User.objects.create_user(telephone="13610139022", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.offer = PurchaseOffer.objects.create(
            code="dispatch-offer", title="Dispatch", module=self.module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="dispatch-order", subject="Dispatch",
            total_amount=Decimal("54.90"), status=AlipayWebsitePayment.Status.PAID,
        )
        self.task = PaymentGrantTask.objects.create(
            payment=self.payment, offer=self.offer, user=self.buyer,
            module=self.module, plan=Entitlement.Plan.MONTH_1,
        )
        promotion = PromotionCodeRecord.objects.create(
            code="BK1-DISPATCH01", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        referral = ReferralCode.objects.create(
            user=self.referrer, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix, promotion_code=promotion,
        )
        coupon = UserCoupon.objects.create(
            user=self.buyer, promotion_code=promotion, discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=self.module,
            status=UserCoupon.Status.USED, used_payment=self.payment,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=self.buyer,
            referral_code=referral, current_coupon=coupon, qualifying_payment=self.payment,
            status=ReferralParticipation.Status.PAYMENT_RESERVED,
            order_created_at=self.payment.created_at,
        )
        PaymentDiscountApplication.objects.create(
            payment=self.payment, coupon=coupon, promotion_code=promotion,
            user=self.buyer, offer=self.offer, original_amount=Decimal("59.90"),
            promotion_discount_amount=Decimal("5.00"), final_amount=Decimal("54.90"),
            status=PaymentDiscountApplication.Status.APPLIED,
        )

    def test_success_dispatch_runs_after_commit_and_sees_final_state(self):
        observed = []

        def inspect_state(participation_id):
            observed.append(
                (
                    PaymentGrantTask.objects.get(pk=self.task.pk).status,
                    ReferralParticipation.objects.get(pk=participation_id).status,
                )
            )

        with patch(
            "apps.accounts.tasks.process_referral_reward_pending_task.delay",
            side_effect=inspect_state,
        ) as delay:
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                self.assertEqual(delay.call_count, 0)
                self.assertEqual(PaymentGrantTask.objects.get(pk=self.task.pk).status, PaymentGrantTask.Status.SUCCEEDED)
            for callback in callbacks:
                callback()
            delay.assert_called_once_with(self.participation.pk)
        self.assertEqual(
            observed,
            [
                (
                    PaymentGrantTask.Status.SUCCEEDED,
                    ReferralParticipation.Status.REWARD_PENDING,
                )
            ],
        )

    def test_canceled_lifetime_branch_dispatches_after_commit(self):
        observed = []

        def inspect_state(participation_id):
            observed.append(
                (
                    PaymentGrantTask.objects.get(pk=self.task.pk).status,
                    ReferralParticipation.objects.get(pk=participation_id).status,
                )
            )

        with patch("apps.accounts.services.payment_grant_service.grant_or_extend_entitlement", side_effect=ExistingLifetimeAccessError("lifetime")):
            with patch(
                "apps.accounts.tasks.process_referral_reward_pending_task.delay",
                side_effect=inspect_state,
            ) as delay:
                with self.captureOnCommitCallbacks(execute=False) as callbacks:
                    process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                    self.assertEqual(delay.call_count, 0)
                    self.assertEqual(PaymentGrantTask.objects.get(pk=self.task.pk).status, PaymentGrantTask.Status.CANCELED)
                callbacks[0]()
                delay.assert_called_once_with(self.participation.pk)
        self.assertEqual(
            observed,
            [
                (
                    PaymentGrantTask.Status.CANCELED,
                    ReferralParticipation.Status.REWARD_PENDING,
                )
            ],
        )

    def test_none_marker_does_not_dispatch(self):
        with patch(
            "apps.accounts.services.payment_grant_service.mark_referral_reward_pending",
            return_value=None,
        ):
            with patch("apps.accounts.tasks.process_referral_reward_pending_task.delay") as delay:
                with self.captureOnCommitCallbacks(execute=True):
                    process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                delay.assert_not_called()

    def test_disqualified_marker_does_not_dispatch(self):
        self.participation.status = ReferralParticipation.Status.DISQUALIFIED
        with patch(
            "apps.accounts.services.payment_grant_service.mark_referral_reward_pending",
            return_value=self.participation,
        ):
            with patch("apps.accounts.tasks.process_referral_reward_pending_task.delay") as delay:
                with self.captureOnCommitCallbacks(execute=True):
                    process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                delay.assert_not_called()

    def test_delay_error_does_not_rollback_commit(self):
        with patch("apps.accounts.tasks.process_referral_reward_pending_task.delay", side_effect=RuntimeError("broker")):
            with self.captureOnCommitCallbacks(execute=True):
                process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        self.task.refresh_from_db()
        self.participation.refresh_from_db()
        self.assertEqual(self.task.status, PaymentGrantTask.Status.SUCCEEDED)
        self.assertEqual(self.participation.status, ReferralParticipation.Status.REWARD_PENDING)

    def test_duplicate_processing_creates_single_reward(self):
        process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
        process_referral_reward_pending(participation_id=self.participation.pk)
        process_referral_reward_pending(participation_id=self.participation.pk)
        self.assertEqual(ReferralReward.objects.count(), 1)
        self.assertEqual(Entitlement.objects.filter(user=self.referrer).count(), 1)
        self.assertEqual(ReferralNotice.objects.count(), 1)


class ReferralRewardTaskTests(TestCase):
    def test_wrapper_passes_exact_keyword(self):
        from apps.accounts.tasks import process_referral_reward_pending_task
        with patch("apps.accounts.services.referral_qualification.process_referral_reward_pending") as processor:
            process_referral_reward_pending_task.run(123)
        processor.assert_called_once_with(participation_id=123)


class ReferralRewardCommitBoundaryTests(TransactionTestCase):
    def setUp(self):
        User = get_user_model()
        self.buyer = User.objects.create_user(telephone="13615139021", password="pass")
        self.referrer = User.objects.create_user(telephone="13615139022", password="pass")
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation",
            defaults={"name": "Exam preparation", "is_active": True},
        )
        self.offer = PurchaseOffer.objects.create(
            code="dispatch-commit-offer",
            title="Dispatch commit",
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("59.90"),
        )
        self.payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="dispatch-commit-order",
            subject="Dispatch commit",
            total_amount=Decimal("59.90"),
            status=AlipayWebsitePayment.Status.PAID,
        )
        self.task = PaymentGrantTask.objects.create(
            payment=self.payment,
            offer=self.offer,
            user=self.buyer,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
        )
        promotion = PromotionCodeRecord.objects.create(
            code="BK1-COMMIT001",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"),
        )
        referral = ReferralCode.objects.create(
            user=self.referrer,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix,
            promotion_code=promotion,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.buyer,
            referral_code=referral,
            status=ReferralParticipation.Status.REWARD_PENDING,
        )

    def test_dispatch_waits_for_outer_commit(self):
        with patch(
            "apps.accounts.services.payment_grant_service.mark_referral_reward_pending",
            return_value=self.participation,
        ), patch(
            "apps.accounts.services.payment_grant_service.ensure_referral_code"
        ), patch(
            "apps.accounts.tasks.process_referral_reward_pending_task.delay"
        ) as delay:
            with transaction.atomic():
                process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                delay.assert_not_called()
            delay.assert_called_once_with(self.participation.pk)

    def test_outer_rollback_discards_dispatch(self):
        with patch(
            "apps.accounts.services.payment_grant_service.mark_referral_reward_pending",
            return_value=self.participation,
        ), patch(
            "apps.accounts.services.payment_grant_service.ensure_referral_code"
        ), patch(
            "apps.accounts.tasks.process_referral_reward_pending_task.delay"
        ) as delay:
            with self.assertRaises(RuntimeError):
                with transaction.atomic():
                    process_payment_grant_task_by_id(payment_grant_task_id=self.task.pk)
                    delay.assert_not_called()
                    raise RuntimeError("rollback")
            delay.assert_not_called()
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, PaymentGrantTask.Status.PENDING)


class ReferralRewardReconciliationTests(TestCase):
    def setUp(self):
        self.users = [get_user_model().objects.create_user(telephone=f"1362013902{i}", password="pass") for i in range(5)]
        promotion = PromotionCodeRecord.objects.create(
            code="BK1-RECON01", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="reconcile", discount_amount=Decimal("5"), minimum_order_amount=Decimal("0"),
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        referral = ReferralCode.objects.create(user=self.users[0], campaign_tag="reconcile", code_prefix="BK1", promotion_code=promotion)
        self.rows = [ReferralParticipation.objects.create(campaign_tag="reconcile", referred_user=user, referral_code=referral, status=ReferralParticipation.Status.REWARD_PENDING) for user in self.users[1:]]
        base_time = timezone.now() - timezone.timedelta(minutes=1)
        for i, row in enumerate(self.rows):
            ReferralParticipation.objects.filter(pk=row.pk).update(
                updated_at=base_time + timezone.timedelta(seconds=i)
            )

    def test_counts_isolates_failures_orders_and_limits(self):
        from apps.accounts.services import referral_qualification
        seen = []
        def process(*, participation_id):
            seen.append(participation_id)
            if len(seen) == 2:
                raise RuntimeError("single failure")
            status = {
                1: ReferralParticipation.Status.QUALIFIED,
                3: ReferralParticipation.Status.DISQUALIFIED,
                4: ReferralParticipation.Status.REWARD_PENDING,
            }[len(seen)]
            ReferralParticipation.objects.filter(pk=participation_id).update(status=status)
        with patch.object(referral_qualification, "process_referral_reward_pending", side_effect=process):
            stats = reconcile_pending_referrals_now(limit=4)
        self.assertEqual(seen, [row.pk for row in self.rows])
        self.assertEqual(stats, {"referral_processed": 1, "referral_disqualified": 1, "referral_deferred": 1, "referral_failed": 1})

    def test_limit_preserves_oldest_first_order(self):
        from apps.accounts.services import referral_qualification

        seen = []

        def process(*, participation_id):
            seen.append(participation_id)

        with patch.object(
            referral_qualification,
            "process_referral_reward_pending",
            side_effect=process,
        ):
            stats = reconcile_pending_referrals_now(limit=2)
        self.assertEqual(seen, [row.pk for row in self.rows[:2]])
        self.assertEqual(stats["referral_deferred"], 2)

    def test_deferred_rows_rotate_so_later_rows_are_not_starved(self):
        from apps.accounts.services import referral_qualification

        seen = []

        def process(*, participation_id):
            seen.append(participation_id)

        with patch.object(
            referral_qualification,
            "process_referral_reward_pending",
            side_effect=process,
        ):
            first_stats = reconcile_pending_referrals_now(limit=2)
            second_stats = reconcile_pending_referrals_now(limit=2)
        self.assertEqual(seen[:2], [row.pk for row in self.rows[:2]])
        self.assertEqual(seen[2:], [row.pk for row in self.rows[2:]])
        self.assertEqual(first_stats["referral_deferred"], 2)
        self.assertEqual(second_stats["referral_deferred"], 2)

    def test_failed_rows_rotate_so_later_rows_are_not_starved(self):
        from apps.accounts.services import referral_qualification

        seen = []

        def fail(*, participation_id):
            seen.append(participation_id)
            raise RuntimeError("retry later")

        with patch.object(
            referral_qualification,
            "process_referral_reward_pending",
            side_effect=fail,
        ):
            first_stats = reconcile_pending_referrals_now(limit=2)
            second_stats = reconcile_pending_referrals_now(limit=2)
        self.assertEqual(seen[:2], [row.pk for row in self.rows[:2]])
        self.assertEqual(seen[2:], [row.pk for row in self.rows[2:]])
        self.assertEqual(first_stats["referral_failed"], 2)
        self.assertEqual(second_stats["referral_failed"], 2)

    def test_alipay_reconcile_merges_referral_stats(self):
        counters = {"referral_processed": 2, "referral_disqualified": 1, "referral_deferred": 0, "referral_failed": 0}
        with patch("apps.accounts.views.payment._query_and_sync_payment_status"), patch("apps.accounts.tasks.reconcile_pending_referrals_now", return_value=counters) as reconcile:
            stats = reconcile_alipay_payments_now(limit=7)
        reconcile.assert_called_once_with(limit=7)
        for key, value in counters.items():
            self.assertEqual(stats[key], value)

    def test_partially_refunded_pending_and_failed_grants_retry(self):
        module = Module.objects.get(key="exam_preparation")
        offer = PurchaseOffer.objects.create(code="partial-retry", title="Retry", module=module, plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("10"))
        payment = AlipayWebsitePayment.objects.create(merchant_order_no="partial-retry", subject="Retry", total_amount=Decimal("10"), status=AlipayWebsitePayment.Status.PARTIALLY_REFUNDED)
        tasks = [PaymentGrantTask.objects.create(payment=payment, offer=offer, user=user, module=module, plan=Entitlement.Plan.MONTH_1, status=status) for user, status in zip(self.users[:2], [PaymentGrantTask.Status.PENDING, PaymentGrantTask.Status.FAILED])]
        with patch("apps.accounts.views.payment._query_and_sync_payment_status"), patch("apps.accounts.tasks.process_payment_grant_task_by_id") as process, patch("apps.accounts.tasks.reconcile_pending_referrals_now", return_value={"referral_processed": 0, "referral_disqualified": 0, "referral_deferred": 0, "referral_failed": 0}):
            reconcile_alipay_payments_now()
        self.assertEqual(process.call_count, 2)
        self.assertEqual({call.kwargs["payment_grant_task_id"] for call in process.call_args_list}, {task.pk for task in tasks})
