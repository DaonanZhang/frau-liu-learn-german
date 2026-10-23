from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db.models import QuerySet
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    Module,
    PromotionCodeRecord,
    ReferralCode,
    ReferralParticipation,
    UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_redemption import (
    ALREADY_ISSUED,
    REPLACEMENT_REQUIRED,
    redeem_referral_code,
)


class ReferralRedemptionReplacementTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(telephone="13600137211", password="pass")
        self.other_owner = User.objects.create_user(telephone="13600137212", password="pass")
        self.user = User.objects.create_user(telephone="13600137213", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.old_referral, self.old_promotion = self.make_referral(self.owner, "BK1-ABCDEFGH2")
        self.new_referral, self.new_promotion = self.make_referral(self.other_owner, "BK1-BCDEFGH2")
        self.old_coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=self.old_promotion,
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
        )
        self.participation = ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.user,
            referral_code=self.old_referral,
            current_coupon=self.old_coupon,
            status=ReferralParticipation.Status.OPEN,
        )

    def make_referral(self, owner, code):
        promotion = PromotionCodeRecord.objects.create(
            code=code,
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="备考季推广",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        referral = ReferralCode.objects.create(
            user=owner,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1",
            promotion_code=promotion,
        )
        return referral, promotion

    def redeem(self, code="BK1-BCDEFGH2", **kwargs):
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=True):
            return redeem_referral_code(user=self.user, code=code, **kwargs)

    def snapshot(self):
        return (
            list(UserCoupon.objects.order_by("pk").values()),
            list(ReferralParticipation.objects.order_by("pk").values()),
        )

    def test_confirmed_replacement_revokes_old_coupon_and_updates_participation(self):
        now = max(self.old_coupon.updated_at, self.participation.updated_at) + timedelta(seconds=1)
        with patch("apps.accounts.services.referral_redemption.timezone.now", return_value=now):
            result = self.redeem(confirm_replace=True)

        self.old_coupon.refresh_from_db()
        self.participation.refresh_from_db()
        new_coupon = result.coupon
        self.assertEqual(
            (result.outcome, result.code, result.message),
            ("issued", "BK1-BCDEFGH2", "已更换并领取新的 ¥5 备考季专用优惠券。"),
        )
        self.assertEqual(
            result.replacement,
            {
                "old_code": "BK1-ABCDEFGH2",
                "new_code": "BK1-BCDEFGH2",
                "old_coupon_id": self.old_coupon.pk,
                "new_coupon_id": new_coupon.pk,
            },
        )
        self.assertEqual(
            (self.old_coupon.status, self.old_coupon.revoked_at, self.old_coupon.revocation_reason),
            (UserCoupon.Status.REVOKED, now, "referral_code_replaced"),
        )
        self.assertEqual(self.old_coupon.updated_at, now)
        self.assertEqual(
            (new_coupon.user_id, new_coupon.promotion_code_id, new_coupon.discount_amount,
             new_coupon.minimum_order_amount, new_coupon.applicable_module_id,
             new_coupon.applicable_season_id, new_coupon.applicable_offer_id,
             new_coupon.status, new_coupon.expires_at),
            (self.user.pk, self.new_promotion.pk, Decimal("5.00"), Decimal("0.00"),
             self.module.pk, None, None, UserCoupon.Status.AVAILABLE, None),
        )
        self.assertEqual(
            (self.participation.referral_code_id, self.participation.current_coupon_id,
             self.participation.status, self.participation.eligibility_checked_at,
             self.participation.status_changed_at, self.participation.updated_at),
            (self.new_referral.pk, new_coupon.pk, ReferralParticipation.Status.OPEN, now, now, now),
        )
        self.assertEqual(UserCoupon.objects.count(), 2)

    def test_unconfirmed_replacement_is_write_free_and_keeps_metadata_shape(self):
        before = self.snapshot()
        result = self.redeem(confirm_replace=False)
        self.assertEqual(result.outcome, REPLACEMENT_REQUIRED)
        self.assertEqual(
            result.replacement,
            {"old_code": "BK1-ABCDEFGH2", "new_code": "BK1-BCDEFGH2", "old_coupon_id": self.old_coupon.pk},
        )
        self.assertEqual(self.snapshot(), before)

    def test_replacement_then_retry_with_new_code_is_idempotent(self):
        result = self.redeem(confirm_replace=True)
        for confirm_replace in (False, True):
            with self.subTest(confirm_replace=confirm_replace):
                before = self.snapshot()
                retry = self.redeem(confirm_replace=confirm_replace)
                self.assertEqual((retry.outcome, retry.coupon.pk), (ALREADY_ISSUED, result.coupon.pk))
                self.assertEqual(self.snapshot(), before)
        self.assertEqual(UserCoupon.objects.count(), 2)

    def test_locked_user_referral_and_promotion_objects_are_used_for_replacement(self):
        original_get = QuerySet.get
        locked = {}

        def capture(queryset, *args, **kwargs):
            row = original_get(queryset, *args, **kwargs)
            if queryset.query.select_for_update:
                locked[queryset.model] = row
            return row

        original_create = UserCoupon.objects.create

        def create_coupon(*args, **kwargs):
            self.assertIs(kwargs["user"], locked[get_user_model()])
            self.assertIs(kwargs["promotion_code"], locked[PromotionCodeRecord])
            return original_create(*args, **kwargs)

        original_save = ReferralParticipation.save

        def save_participation(instance, *args, **kwargs):
            if instance.pk == self.participation.pk and kwargs.get("update_fields"):
                self.assertIs(instance.referral_code, locked[ReferralCode])
            return original_save(instance, *args, **kwargs)

        with patch.object(QuerySet, "get", capture), \
             patch.object(UserCoupon.objects, "create", side_effect=create_coupon), \
             patch.object(ReferralParticipation, "save", save_participation):
            self.redeem(confirm_replace=True)

    def assert_rollback(self, failure_patch):
        old_coupon_updated_at = self.old_coupon.updated_at
        participation_updated_at = self.participation.updated_at
        with failure_patch, self.assertRaises(RuntimeError):
            self.redeem(confirm_replace=True)
        self.old_coupon.refresh_from_db()
        self.participation.refresh_from_db()
        self.assertEqual(
            (self.old_coupon.status, self.old_coupon.revoked_at, self.old_coupon.revocation_reason),
            (UserCoupon.Status.AVAILABLE, None, ""),
        )
        self.assertEqual(self.old_coupon.updated_at, old_coupon_updated_at)
        self.assertEqual(
            (self.participation.referral_code_id, self.participation.current_coupon_id),
            (self.old_referral.pk, self.old_coupon.pk),
        )
        self.assertEqual(self.participation.updated_at, participation_updated_at)
        self.assertEqual(UserCoupon.objects.count(), 1)

    def test_new_coupon_creation_failure_rolls_back_old_coupon_revocation(self):
        original_create = UserCoupon.objects.create

        def fail_replacement(*args, **kwargs):
            if kwargs.get("promotion_code") == self.new_promotion:
                raise RuntimeError("create failed")
            return original_create(*args, **kwargs)

        self.assert_rollback(patch.object(UserCoupon.objects, "create", side_effect=fail_replacement))

    def test_participation_save_failure_rolls_back_coupon_changes(self):
        original_save = ReferralParticipation.save

        def fail_update(instance, *args, **kwargs):
            if instance.pk == self.participation.pk and kwargs.get("update_fields"):
                raise RuntimeError("save failed")
            return original_save(instance, *args, **kwargs)

        self.assert_rollback(patch.object(ReferralParticipation, "save", fail_update))
