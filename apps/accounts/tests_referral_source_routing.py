from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import PromotionCodeRecord, UserCoupon
from apps.accounts.services.promotion_codes import redeem_promotion_code


class ReferralSourceRoutingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13600136999", password="pass-123456"
        )

    def make_record(self, code, *, source_kind="operational", redemption_mode="single_use"):
        return PromotionCodeRecord.objects.create(
            code=code,
            source_kind=source_kind,
            campaign_name="Test campaign",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            redemption_mode=redemption_mode,
            expires_at=None,
        )

    def test_non_operational_records_are_rejected_without_mutation_or_coupon(self):
        for source_kind, code in (
            (PromotionCodeRecord.SourceKind.REFERRAL, "REFERRAL001"),
            (PromotionCodeRecord.SourceKind.INTERNAL_REWARD, "REWARD0001"),
        ):
            with self.subTest(source_kind=source_kind):
                record = self.make_record(code, source_kind=source_kind)
                with self.assertRaisesMessage(ValueError, "推广码无效"):
                    redeem_promotion_code(user=self.user, code=code)

                record.refresh_from_db()
                self.assertEqual(record.status, PromotionCodeRecord.Status.ACTIVE)
                self.assertIsNone(record.consumed_by_user)
                self.assertIsNone(record.consumed_at)
                self.assertFalse(UserCoupon.objects.filter(promotion_code=record).exists())

    def test_operational_single_use_code_still_creates_coupon_and_consumes(self):
        record = self.make_record("OPERATE001")

        coupon = redeem_promotion_code(user=self.user, code=record.code)

        record.refresh_from_db()
        self.assertEqual(coupon.promotion_code, record)
        self.assertEqual(record.status, PromotionCodeRecord.Status.CONSUMED)
        self.assertEqual(record.consumed_by_user, self.user)
        self.assertIsNotNone(record.consumed_at)

    def test_operational_reusable_code_still_issues_multiple_coupons(self):
        record = self.make_record("OPERATE002", redemption_mode="reusable")

        first = redeem_promotion_code(user=self.user, code=record.code)
        second = redeem_promotion_code(user=self.user, code=record.code)

        record.refresh_from_db()
        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(UserCoupon.objects.filter(promotion_code=record).count(), 2)
        self.assertEqual(record.status, PromotionCodeRecord.Status.ACTIVE)
        self.assertIsNone(record.consumed_by_user)
        self.assertIsNone(record.consumed_at)
