from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment, Entitlement, Module, ModuleSeason, PaymentDiscountApplication,
    PromotionCodeRecord, PurchaseOffer, ReferralCode, ReferralParticipation,
    ReferralNotice, ReferralReward, UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.promotion_codes import sync_payment_discount_status
from apps.accounts.services.referral_milestones import (
    reconcile_referral_milestones, resolve_pending_milestone_revocation,
)
from apps.accounts.tasks import reconcile_referral_terminal_states_now


class ReferralMilestoneTerminalResolutionTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(telephone="13600201091", password="pass")
        module = Module.objects.create(key="learning_by_video", name="Learning")
        ModuleSeason.objects.create(module=module, season_number=1)
        ModuleSeason.objects.create(module=module, season_number=4)
        Entitlement.objects.create(user=self.owner, plan=Entitlement.Plan.LIFETIME,
                                   status=Entitlement.Status.ACTIVE, starts_at=timezone.now())
        offer = PurchaseOffer.objects.create(code="terminal-offer", title="Fixture", module=module,
                                             plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("20"))
        promo = PromotionCodeRecord.objects.create(code="TERMINAL-REF", campaign_name="fixture",
                                                   discount_amount=Decimal("1"))
        self.referral_code = ReferralCode.objects.create(
            user=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="TR1", promotion_code=promo,
        )
        for index in range(3):
            referred = get_user_model().objects.create_user(
                telephone=f"1360020110{index}", password="pass",
            )
            ReferralParticipation.objects.create(
                campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referred_user=referred,
                referral_code=self.referral_code, status=ReferralParticipation.Status.QUALIFIED,
            )
        self.reward = reconcile_referral_milestones(
            referrer=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )[0]
        self.coupon = self.reward.coupon
        self.offer = offer

    def make_application(self, payment_status, app_status, coupon_status):
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"terminal-{payment_status}", subject="Fixture", total_amount=Decimal("10"),
            status=payment_status,
        )
        fields = dict(payment=payment, coupon=self.coupon, promotion_code=self.coupon.promotion_code,
                      user=self.owner, offer=self.offer, original_amount=Decimal("20"),
                      promotion_discount_amount=Decimal("10"), final_amount=Decimal("10"),
                      status=app_status)
        application = PaymentDiscountApplication.objects.create(**fields)
        now = timezone.now()
        if app_status in {PaymentDiscountApplication.Status.APPLIED,
                          PaymentDiscountApplication.Status.REFUNDED}:
            application.applied_at = now
        if app_status == PaymentDiscountApplication.Status.REFUNDED:
            application.refunded_at = now
        if app_status == PaymentDiscountApplication.Status.RELEASED:
            application.released_at = now
        if application.applied_at or application.refunded_at or application.released_at:
            application.save(update_fields=["applied_at", "refunded_at", "released_at", "updated_at"])
        if coupon_status == UserCoupon.Status.RESERVED:
            self.coupon.status = coupon_status
            self.coupon.reserved_payment = payment
            self.coupon.reserved_at = now
            self.reward.status = ReferralReward.Status.REVOCATION_PENDING
            self.reward.revocation_pending_at = now
            self.reward.save(update_fields=["status", "revocation_pending_at", "updated_at"])
            self.coupon.save(update_fields=["status", "reserved_payment", "reserved_at", "updated_at"])
        elif coupon_status == UserCoupon.Status.USED:
            self.coupon.status = coupon_status
            self.coupon.used_payment = payment
            self.coupon.used_at = now
            self.coupon.save(update_fields=["status", "used_payment", "used_at", "updated_at"])
            if payment_status == AlipayWebsitePayment.Status.REFUNDED:
                application.status = PaymentDiscountApplication.Status.REFUNDED
                application.save(update_fields=["status", "updated_at"])
        else:
            self.coupon.status = coupon_status
            self.coupon.save(update_fields=["status", "updated_at"])
            self.reward.status = ReferralReward.Status.REVOCATION_PENDING
            self.reward.revocation_pending_at = now
            self.reward.save(update_fields=["status", "revocation_pending_at", "updated_at"])
        return payment, application

    def test_open_reservation_is_unchanged_and_locator_survives_coupon_link_clear(self):
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.PENDING, PaymentDiscountApplication.Status.RESERVED,
            UserCoupon.Status.RESERVED,
        )
        # The application is the durable payment-to-coupon locator even if the
        # coupon's payment reservation pointer has already been cleared.
        self.coupon.reserved_payment = None
        self.coupon.save(update_fields=["reserved_payment", "updated_at"])
        # This is now an invalid open reservation and must fail closed.
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.coupon.reserved_payment = payment
        self.coupon.save(update_fields=["reserved_payment", "updated_at"])
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOCATION_PENDING)
        self.assertEqual(self.coupon.status, UserCoupon.Status.RESERVED)

    def test_paid_used_coupon_becomes_non_reversible_once(self):
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.PAID, PaymentDiscountApplication.Status.APPLIED,
            UserCoupon.Status.USED,
        )
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        settled = self.reward.settled_at
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)
        self.assertIsNotNone(settled)
        self.assertEqual(self.reward.settled_at, settled)

    def test_paid_after_recrossed_grant_is_non_reversible_and_leaves_ledgers_alone(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.PAID, PaymentDiscountApplication.Status.APPLIED,
            UserCoupon.Status.USED,
        )
        reconcile_referral_milestones(
            referrer=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
        month = ReferralReward.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag, referrer=self.owner,
            kind=ReferralReward.Kind.REFERRAL_MONTH, status=ReferralReward.Status.GRANTED,
            amount_days=1, generation=1, idempotency_key="terminal-month-reward",
        )
        participations = list(ReferralParticipation.objects.order_by("pk").values_list("pk", "status"))
        payment_before = (payment.status, payment.updated_at)
        app_before = (app.status, app.applied_at, app.updated_at)
        month_before = (month.status, month.updated_at)
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        payment.refresh_from_db()
        app.refresh_from_db()
        month.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)
        self.assertEqual((payment.status, payment.updated_at), payment_before)
        self.assertEqual((app.status, app.applied_at, app.updated_at), app_before)
        self.assertEqual((month.status, month.updated_at), month_before)
        self.assertEqual(list(ReferralParticipation.objects.order_by("pk").values_list("pk", "status")),
                         participations)

    def test_released_recross_then_fall_below_revokes_same_coupon(self):
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(self.reward.coupon_id, self.coupon.pk)
        ReferralParticipation.objects.filter(referral_code=self.referral_code).update(
            status=ReferralParticipation.Status.OPEN,
        )
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(self.coupon.status, UserCoupon.Status.REVOKED)

    def test_paid_partially_refunded_used_chain_settles(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.PARTIALLY_REFUNDED,
            PaymentDiscountApplication.Status.APPLIED, UserCoupon.Status.USED,
        )
        before = (app.status, payment.status)
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)
        self.assertEqual((app.status, payment.status), before)

    def test_refunded_used_chain_settles(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.REFUNDED,
            PaymentDiscountApplication.Status.REFUNDED, UserCoupon.Status.USED,
        )
        before = (app.status, payment.status)
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)
        self.assertEqual((app.status, payment.status), before)

    def test_real_refund_sync_normalizes_reserved_chain_before_resolution(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.REFUNDED,
            PaymentDiscountApplication.Status.RESERVED, UserCoupon.Status.RESERVED,
        )
        self.assertEqual(self.coupon.reserved_payment_id, payment.pk)
        sync_payment_discount_status(payment_id=payment.pk)
        app.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual(app.status, PaymentDiscountApplication.Status.REFUNDED)
        self.assertIsNotNone(app.applied_at)
        self.assertIsNotNone(app.refunded_at)
        self.assertEqual(self.coupon.status, UserCoupon.Status.USED)
        self.assertIsNone(self.coupon.reserved_payment_id)
        self.assertIsNone(self.coupon.reserved_at)
        self.assertEqual(self.coupon.used_payment_id, payment.pk)
        self.assertIsNotNone(self.coupon.used_at)
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)

    def test_scheduled_repair_resolves_lost_failed_callback_and_is_idempotent(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.CREATED,
            PaymentDiscountApplication.Status.RESERVED,
            UserCoupon.Status.RESERVED,
        )
        ReferralParticipation.objects.filter(referral_code=self.referral_code).update(
            status=ReferralParticipation.Status.OPEN,
        )
        payment.status = AlipayWebsitePayment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])
        with patch("apps.accounts.services.promotion_codes.transaction.on_commit") as on_commit:
            sync_payment_discount_status(payment_id=payment.pk)
        on_commit.assert_called_once()
        app.refresh_from_db()
        self.coupon.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(app.status, PaymentDiscountApplication.Status.RELEASED)
        self.assertEqual(self.coupon.status, UserCoupon.Status.AVAILABLE)
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOCATION_PENDING)

        first = reconcile_referral_terminal_states_now()
        second = reconcile_referral_terminal_states_now()
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual(first, {
            "referral_terminal_processed": 1,
            "referral_terminal_failed": 0,
        })
        self.assertEqual(second, {
            "referral_terminal_processed": 0,
            "referral_terminal_failed": 0,
        })
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(self.coupon.status, UserCoupon.Status.REVOKED)

    def test_scheduled_repair_retries_lost_paid_callback_with_real_resolver(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.CREATED,
            PaymentDiscountApplication.Status.RESERVED,
            UserCoupon.Status.RESERVED,
        )
        payment.status = AlipayWebsitePayment.Status.PAID
        payment.paid_at = timezone.now()
        payment.save(update_fields=["status", "paid_at", "updated_at"])
        with patch("apps.accounts.services.promotion_codes.transaction.on_commit") as on_commit:
            sync_payment_discount_status(payment_id=payment.pk)
        on_commit.assert_called_once()
        app.refresh_from_db()
        self.coupon.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(app.status, PaymentDiscountApplication.Status.APPLIED)
        self.assertEqual(self.coupon.status, UserCoupon.Status.USED)
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOCATION_PENDING)

        with patch(
            "apps.accounts.services.promotion_codes._reconcile_terminal_discount",
            side_effect=RuntimeError("temporary"),
        ), self.assertLogs("apps.accounts.tasks", level="ERROR"):
            failed = reconcile_referral_terminal_states_now()
        retried = reconcile_referral_terminal_states_now()
        settled = reconcile_referral_terminal_states_now()
        self.reward.refresh_from_db()
        self.assertEqual(failed, {
            "referral_terminal_processed": 0,
            "referral_terminal_failed": 1,
        })
        self.assertEqual(retried, {
            "referral_terminal_processed": 1,
            "referral_terminal_failed": 0,
        })
        self.assertEqual(settled, {
            "referral_terminal_processed": 0,
            "referral_terminal_failed": 0,
        })
        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)

    def test_scheduled_repair_resolves_lost_refund_callback(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.CREATED,
            PaymentDiscountApplication.Status.RESERVED,
            UserCoupon.Status.RESERVED,
        )
        payment.status = AlipayWebsitePayment.Status.REFUNDED
        payment.paid_at = timezone.now()
        payment.refunded_at = timezone.now()
        payment.refunded_amount = payment.total_amount
        payment.save(update_fields=[
            "status", "paid_at", "refunded_at", "refunded_amount", "updated_at",
        ])
        with patch("apps.accounts.services.promotion_codes.transaction.on_commit") as on_commit:
            sync_payment_discount_status(payment_id=payment.pk)
        on_commit.assert_called_once()
        app.refresh_from_db()
        self.reward.refresh_from_db()
        self.assertEqual(app.status, PaymentDiscountApplication.Status.REFUNDED)
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOCATION_PENDING)

        first = reconcile_referral_terminal_states_now()
        second = reconcile_referral_terminal_states_now()
        self.reward.refresh_from_db()
        self.assertEqual(first["referral_terminal_processed"], 1)
        self.assertEqual(first["referral_terminal_failed"], 0)
        self.assertEqual(second["referral_terminal_processed"], 0)
        self.assertEqual(self.reward.status, ReferralReward.Status.NON_REVERSIBLE)

    def test_corrupt_reward_timestamps_fail_closed(self):
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.PAID, PaymentDiscountApplication.Status.APPLIED,
            UserCoupon.Status.USED,
        )
        mutations = (
            {"status": ReferralReward.Status.GRANTED, "revocation_pending_at": None,
             "revoked_at": timezone.now(), "settled_at": None},
            {"status": ReferralReward.Status.REVOCATION_PENDING, "revocation_pending_at": None,
             "revoked_at": None, "settled_at": None},
            {"status": ReferralReward.Status.REVOKED, "revocation_pending_at": None,
             "revoked_at": None, "settled_at": None},
            {"status": ReferralReward.Status.NON_REVERSIBLE, "revocation_pending_at": None,
             "revoked_at": None, "settled_at": None},
            {"status": ReferralReward.Status.REVOCATION_PENDING, "revocation_pending_at": timezone.now(),
             "revoked_at": None, "settled_at": timezone.now()},
            {"status": ReferralReward.Status.REVOKED, "revocation_pending_at": None,
             "revoked_at": timezone.now(), "settled_at": timezone.now()},
            {"status": ReferralReward.Status.NON_REVERSIBLE, "revocation_pending_at": None,
             "revoked_at": timezone.now(), "settled_at": timezone.now()},
        )
        for values in mutations:
            ReferralReward.objects.filter(pk=self.reward.pk).update(**values)
            before = (
                ReferralReward.objects.get(pk=self.reward.pk).status,
                UserCoupon.objects.get(pk=self.coupon.pk).status,
                Entitlement.objects.count(),
                ReferralNotice.objects.count(),
            )
            with self.assertRaises(ValueError):
                resolve_pending_milestone_revocation(payment_id=payment.pk)
            self.assertEqual(before, (
                ReferralReward.objects.get(pk=self.reward.pk).status,
                UserCoupon.objects.get(pk=self.coupon.pk).status,
                Entitlement.objects.count(),
                ReferralNotice.objects.count(),
            ))

    def _make_second_generation(self):
        self.old_reward_id = self.reward.pk
        self.old_coupon_id = self.coupon.pk
        self.coupon.status = UserCoupon.Status.REVOKED
        self.coupon.revoked_at = timezone.now()
        self.coupon.revocation_reason = "referral_milestone_count_below_threshold"
        self.coupon.save(update_fields=["status", "revoked_at", "revocation_reason", "updated_at"])
        self.reward.status = ReferralReward.Status.REVOKED
        self.reward.revoked_at = timezone.now()
        self.reward.save(update_fields=["status", "revoked_at", "updated_at"])
        latest = reconcile_referral_milestones(
            referrer=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        )[0]
        self.reward = latest
        self.coupon = latest.coupon
        return latest

    def test_corrupt_old_generation_identity_blocks_latest_resolution(self):
        self._make_second_generation()
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        ReferralReward.objects.filter(pk=self.old_reward_id).update(idempotency_key="broken-old-generation")
        before = (self.reward.status, self.coupon.status, ReferralNotice.objects.count())
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual((self.reward.status, self.coupon.status, ReferralNotice.objects.count()), before)

    def test_corrupt_old_generation_artifact_blocks_latest_resolution(self):
        self._make_second_generation()
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        UserCoupon.objects.filter(pk=self.old_coupon_id).update(discount_amount=Decimal("9"))
        before = (self.reward.status, self.coupon.status, ReferralNotice.objects.count())
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual((self.reward.status, self.coupon.status, ReferralNotice.objects.count()), before)

    def test_old_coupon_shared_with_out_of_scope_reward_blocks_latest_resolution(self):
        self._make_second_generation()
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        ReferralReward.objects.create(
            campaign_tag=self.reward.campaign_tag, referrer=self.owner,
            kind=ReferralReward.Kind.REFERRAL_MONTH, status=ReferralReward.Status.GRANTED,
            amount_days=1, generation=1, coupon_id=self.old_coupon_id,
            idempotency_key="terminal-shared-old-coupon",
        )
        before = (self.reward.status, self.coupon.status, ReferralNotice.objects.count())
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual((self.reward.status, self.coupon.status, ReferralNotice.objects.count()), before)

    def test_old_revoked_coupon_fields_must_be_exact(self):
        self._make_second_generation()
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        for changes in (
            {"revocation_reason": ""},
            {"revocation_reason": "wrong"},
            {"used_at": timezone.now()},
        ):
            UserCoupon.objects.filter(pk=self.old_coupon_id).update(**changes)
            before = (self.reward.status, self.coupon.status, ReferralNotice.objects.count())
            with self.assertRaises(ValueError):
                resolve_pending_milestone_revocation(payment_id=payment.pk)
            self.reward.refresh_from_db()
            self.coupon.refresh_from_db()
            self.assertEqual((self.reward.status, self.coupon.status, ReferralNotice.objects.count()), before)
            UserCoupon.objects.filter(pk=self.old_coupon_id).update(
                revocation_reason="referral_milestone_count_below_threshold", used_at=None,
            )

    def test_old_non_reversible_coupon_rejects_reservation_or_revocation_residue(self):
        self._make_second_generation()
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        used_payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="terminal-old-used", subject="Fixture", total_amount=Decimal("10"),
            status=AlipayWebsitePayment.Status.PAID,
        )
        used_application = PaymentDiscountApplication.objects.create(
            payment=used_payment, coupon_id=self.old_coupon_id,
            promotion_code_id=UserCoupon.objects.get(pk=self.old_coupon_id).promotion_code_id,
            user=self.owner, offer=self.offer, original_amount=Decimal("20"),
            promotion_discount_amount=Decimal("10"), final_amount=Decimal("10"),
            status=PaymentDiscountApplication.Status.APPLIED, applied_at=timezone.now(),
        )
        UserCoupon.objects.filter(pk=self.old_coupon_id).update(
            status=UserCoupon.Status.USED, revoked_at=None, revocation_reason="",
            reserved_payment=None, reserved_at=None, used_payment=used_payment,
            used_at=timezone.now(),
        )
        ReferralReward.objects.filter(pk=self.old_reward_id).update(
            status=ReferralReward.Status.NON_REVERSIBLE, revoked_at=None,
            revocation_pending_at=None, settled_at=timezone.now(),
        )
        for corrupt_timestamps in (
            {"applied_at": None},
            {"released_at": timezone.now()},
            {"refunded_at": timezone.now()},
        ):
            PaymentDiscountApplication.objects.filter(pk=used_application.pk).update(
                **corrupt_timestamps
            )
            before = (self.reward.status, self.coupon.status, ReferralNotice.objects.count())
            with self.assertRaises(ValueError):
                resolve_pending_milestone_revocation(payment_id=payment.pk)
            self.reward.refresh_from_db()
            self.coupon.refresh_from_db()
            self.assertEqual(
                (self.reward.status, self.coupon.status, ReferralNotice.objects.count()), before
            )
            PaymentDiscountApplication.objects.filter(pk=used_application.pk).update(
                applied_at=timezone.now(), released_at=None, refunded_at=None,
            )
        for residue in ({"reserved_at": timezone.now()}, {"revoked_at": timezone.now()}):
            UserCoupon.objects.filter(pk=self.old_coupon_id).update(**residue)
            before = (self.reward.status, self.coupon.status, ReferralNotice.objects.count())
            with self.assertRaises(ValueError):
                resolve_pending_milestone_revocation(payment_id=payment.pk)
            self.reward.refresh_from_db()
            self.coupon.refresh_from_db()
            self.assertEqual((self.reward.status, self.coupon.status, ReferralNotice.objects.count()), before)
            UserCoupon.objects.filter(pk=self.old_coupon_id).update(reserved_at=None, revoked_at=None)

    def test_generation_gap_blocks_latest_resolution(self):
        latest = self._make_second_generation()
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        ReferralReward.objects.filter(pk=self.old_reward_id).delete()
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)

    def test_closed_released_and_recrossed_count_preserves_grant(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.CREATED, PaymentDiscountApplication.Status.RESERVED,
            UserCoupon.Status.RESERVED,
        )
        reward_id, coupon_id = self.reward.pk, self.coupon.pk
        ReferralParticipation.objects.filter(referral_code=self.referral_code).update(
            status=ReferralParticipation.Status.OPEN,
        )
        self.assertEqual(reconcile_referral_milestones(
            referrer=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        ), [])
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOCATION_PENDING)
        payment.status = AlipayWebsitePayment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])
        sync_payment_discount_status(payment_id=payment.pk)
        app.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual(app.status, PaymentDiscountApplication.Status.RELEASED)
        self.assertEqual(self.coupon.status, UserCoupon.Status.AVAILABLE)
        ReferralParticipation.objects.filter(referral_code=self.referral_code).update(
            status=ReferralParticipation.Status.QUALIFIED,
        )
        reward_count = ReferralReward.objects.count()
        notice_count = ReferralNotice.objects.count()
        self.assertEqual(reconcile_referral_milestones(
            referrer=self.owner, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
        ), [])
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
        self.assertEqual(self.reward.pk, reward_id)
        self.assertEqual(self.reward.coupon_id, coupon_id)
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.status, ReferralReward.Status.GRANTED)
        self.assertIsNone(self.reward.revocation_pending_at)
        self.assertEqual(ReferralReward.objects.count(), reward_count)
        self.assertEqual(ReferralNotice.objects.count(), notice_count)

    def test_bad_used_chain_fails_closed_without_mutating_application_or_payment(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.PAID, PaymentDiscountApplication.Status.APPLIED,
            UserCoupon.Status.USED,
        )
        self.coupon.used_payment = None
        self.coupon.save(update_fields=["used_payment", "updated_at"])
        before = (payment.status, app.status, self.reward.status, self.reward.settled_at)
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(before, (payment.status, app.status, self.reward.status, self.reward.settled_at))

    def test_wrong_application_discount_fails_closed(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.PAID, PaymentDiscountApplication.Status.APPLIED,
            UserCoupon.Status.USED,
        )
        PaymentDiscountApplication.objects.filter(pk=app.pk).update(promotion_discount_amount=Decimal("9"))
        before = (self.reward.status, self.coupon.status, payment.status)
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        self.assertEqual((self.reward.status, self.coupon.status, payment.status), before)

    def test_wrong_application_coupon_user_promotion_and_status_fail_closed(self):
        payment, app = self.make_application(
            AlipayWebsitePayment.Status.PAID, PaymentDiscountApplication.Status.APPLIED,
            UserCoupon.Status.USED,
        )
        other_promotion = PromotionCodeRecord.objects.create(
            code="TERMINAL-WRONG-PROMO", campaign_name="fixture", discount_amount=Decimal("1"),
        )
        other_user = get_user_model().objects.create_user(telephone="13600201999", password="pass")
        wrong_coupon = UserCoupon.objects.create(
            user=self.owner, promotion_code=other_promotion, discount_amount=Decimal("10"),
        )
        mutations = (
            {"coupon_id": wrong_coupon.pk, "promotion_code_id": other_promotion.pk},
            {"user_id": other_user.pk},
            {"promotion_code_id": other_promotion.pk},
            {"status": PaymentDiscountApplication.Status.RELEASED},
        )
        for changes in mutations:
            PaymentDiscountApplication.objects.filter(pk=app.pk).update(**changes)
            with self.assertRaises(ValueError):
                resolve_pending_milestone_revocation(payment_id=payment.pk)
            PaymentDiscountApplication.objects.filter(pk=app.pk).update(
                coupon_id=self.coupon.pk, promotion_code_id=self.coupon.promotion_code_id,
                user_id=self.owner.pk, status=PaymentDiscountApplication.Status.APPLIED,
            )

    def test_latest_generation_and_shared_coupon_are_checked(self):
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.CLOSED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        newer = ReferralReward.objects.create(
            campaign_tag=self.reward.campaign_tag, referrer=self.owner,
            kind=self.reward.kind, status=ReferralReward.Status.GRANTED,
            amount_days=0, threshold=self.reward.threshold, generation=2,
            coupon=self.coupon, idempotency_key="terminal-new-generation",
        )
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        newer.delete()
        ReferralReward.objects.create(
            campaign_tag=self.reward.campaign_tag, referrer=self.owner,
            kind=ReferralReward.Kind.VLOG_5, status=ReferralReward.Status.GRANTED,
            amount_days=0, threshold=5, generation=1,
            coupon=self.coupon, idempotency_key="terminal-shared-coupon",
        )
        with self.assertRaises(ValueError):
            resolve_pending_milestone_revocation(payment_id=payment.pk)

    def test_lock_order_is_referrer_payment_application_coupon_reward(self):
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.PAID, PaymentDiscountApplication.Status.APPLIED,
            UserCoupon.Status.USED,
        )
        from django.db.models.query import QuerySet
        original = QuerySet.select_for_update
        order = []

        def track(queryset, *args, **kwargs):
            order.append(queryset.model.__name__)
            return original(queryset, *args, **kwargs)

        with patch.object(QuerySet, "select_for_update", track):
            resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.assertEqual(order[:5], [
            get_user_model().__name__, "AlipayWebsitePayment", "PaymentDiscountApplication",
            "UserCoupon", "ReferralReward",
        ])

    def test_failed_released_coupon_revokes_once_below_threshold(self):
        payment, _app = self.make_application(
            AlipayWebsitePayment.Status.FAILED, PaymentDiscountApplication.Status.RELEASED,
            UserCoupon.Status.AVAILABLE,
        )
        ReferralParticipation.objects.filter(referral_code=self.referral_code).update(
            status=ReferralParticipation.Status.OPEN,
        )
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.coupon.refresh_from_db()
        revoked_at = self.reward.revoked_at
        self.assertEqual(self.reward.status, ReferralReward.Status.REVOKED)
        self.assertEqual(self.coupon.status, UserCoupon.Status.REVOKED)
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        self.reward.refresh_from_db()
        self.assertEqual(self.reward.revoked_at, revoked_at)

    def test_unknown_payment_is_noop(self):
        resolve_pending_milestone_revocation(payment_id=999999)

    def test_ordinary_coupon_payment_is_noop(self):
        promotion = PromotionCodeRecord.objects.create(
            code="TERMINAL-ORDINARY", campaign_name="ordinary", discount_amount=Decimal("1"),
        )
        coupon = UserCoupon.objects.create(
            user=self.owner, promotion_code=promotion, discount_amount=Decimal("10"),
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="terminal-ordinary", subject="Fixture", total_amount=Decimal("10"),
        )
        PaymentDiscountApplication.objects.create(
            payment=payment, coupon=coupon, promotion_code=promotion, user=self.owner,
            offer=self.offer, original_amount=Decimal("20"), promotion_discount_amount=Decimal("10"),
            final_amount=Decimal("10"), status=PaymentDiscountApplication.Status.RESERVED,
        )
        resolve_pending_milestone_revocation(payment_id=payment.pk)
        coupon.refresh_from_db()
        self.assertEqual(coupon.status, UserCoupon.Status.AVAILABLE)
