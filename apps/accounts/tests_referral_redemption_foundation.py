from dataclasses import FrozenInstanceError
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import PromotionCodeRecord, ReferralCode
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN
from apps.accounts.services.referral_redemption import (
    ReferralRedemptionError,
    ReferralRedemptionResult,
    _assert_referral_campaign_enabled,
    _resolve_referral_code,
)


class ReferralRedemptionFoundationTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            telephone="13600137771", password="pass"
        )
        self.promotion = PromotionCodeRecord.objects.create(
            code="BK1-ABCDEFGH2",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="备考季推广",
            discount_amount=Decimal("5.00"),
        )
        self.referral = ReferralCode.objects.create(
            user=self.owner,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1",
            promotion_code=self.promotion,
        )

    def snapshot(self):
        return (
            list(PromotionCodeRecord.objects.order_by("pk").values()),
            list(ReferralCode.objects.order_by("pk").values()),
        )

    def assert_invalid_without_writes(self, code, *, at=None, expected_code=None):
        before = self.snapshot()
        with self.assertRaises(ReferralRedemptionError) as raised:
            _resolve_referral_code(code, at=at)
        self.assertEqual(raised.exception.outcome, "invalid_code")
        self.assertEqual(raised.exception.code, expected_code if expected_code is not None else str(code or "").strip().upper())
        self.assertEqual(str(raised.exception), "推广码无效。")
        self.assertEqual(self.snapshot(), before)

    def test_result_is_frozen_and_has_referral_type_and_optional_defaults(self):
        result = ReferralRedemptionResult(outcome="issued", code="BK1-X", message="ok")
        self.assertEqual((result.coupon, result.replacement, result.type), (None, None, "referral"))
        with self.assertRaises(FrozenInstanceError):
            result.outcome = "invalid_code"

    def test_error_carries_stable_attributes(self):
        error = ReferralRedemptionError("invalid_code", "BK1-X", "推广码无效。")
        self.assertEqual((error.outcome, error.code, str(error)), ("invalid_code", "BK1-X", "推广码无效。"))

    def test_resolution_normalizes_code_and_derives_campaign_and_owner_from_link(self):
        config, referral = _resolve_referral_code("  bk1-abcdefgh2  ")
        self.assertEqual(config, FIRST_REFERRAL_CAMPAIGN)
        self.assertEqual(referral.pk, self.referral.pk)
        self.assertEqual(referral.user_id, self.owner.pk)
        self.assertEqual(referral.promotion_code_id, self.promotion.pk)

    def test_campaign_flag_gates_registered_campaign(self):
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=False):
            with self.assertRaises(ReferralRedemptionError) as raised:
                _assert_referral_campaign_enabled(FIRST_REFERRAL_CAMPAIGN, code="BK1-X")
        self.assertEqual((raised.exception.outcome, raised.exception.code, str(raised.exception)),
                         ("campaign_disabled", "BK1-X", "备考季推广活动暂未开放。"))
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=True):
            self.assertIsNone(_assert_referral_campaign_enabled(FIRST_REFERRAL_CAMPAIGN, code="BK1-X"))

    def test_campaign_gate_does_not_write(self):
        before = self.snapshot()
        with patch("apps.accounts.feature_flags.exam_preparation_referral_enabled", return_value=False):
            with self.assertRaises(ReferralRedemptionError):
                _assert_referral_campaign_enabled(FIRST_REFERRAL_CAMPAIGN, code="BK1-X")
        self.assertEqual(self.snapshot(), before)

    def test_empty_unknown_and_non_reserved_codes_are_invalid_without_writes(self):
        self.assert_invalid_without_writes("")
        self.assert_invalid_without_writes(" unknown ")
        self.assert_invalid_without_writes("BK1-UNKNOWN")

    def test_unlinked_ordinary_and_internal_promotions_are_invalid_without_writes(self):
        for source_kind in (
            PromotionCodeRecord.SourceKind.OPERATIONAL,
            PromotionCodeRecord.SourceKind.INTERNAL_REWARD,
        ):
            with self.subTest(source_kind=source_kind):
                code = f"BK1-{source_kind.upper()}"
                promotion = PromotionCodeRecord.objects.create(
                    code=code,
                    source_kind=source_kind,
                    campaign_name="Unlinked promotion",
                    discount_amount=Decimal("5.00"),
                )
                self.assert_invalid_without_writes(code)
                promotion.delete()

    def test_invalid_linkage_activity_source_status_and_expiry_are_rejected_read_only(self):
        cases = (
            ("ordinary source", {"source_kind": PromotionCodeRecord.SourceKind.OPERATIONAL}, {}),
            ("inactive referral", {}, {"is_active": False}),
            ("unknown campaign", {}, {"campaign_tag": "future_unknown_campaign"}),
            ("non-active promotion", {"status": PromotionCodeRecord.Status.CONSUMED}, {}),
            ("expired promotion", {"expires_at": timezone.now() - timedelta(seconds=1)}, {}),
        )
        for label, promotion_changes, referral_changes in cases:
            with self.subTest(label=label):
                self.promotion.refresh_from_db()
                self.referral.refresh_from_db()
                for field, value in promotion_changes.items():
                    setattr(self.promotion, field, value)
                self.promotion.save()
                for field, value in referral_changes.items():
                    setattr(self.referral, field, value)
                self.referral.save()
                self.assert_invalid_without_writes("BK1-ABCDEFGH2")
                self.promotion.source_kind = PromotionCodeRecord.SourceKind.REFERRAL
                self.promotion.status = PromotionCodeRecord.Status.ACTIVE
                self.promotion.expires_at = None
                self.promotion.save()
                self.referral.is_active = True
                self.referral.campaign_tag = FIRST_REFERRAL_CAMPAIGN.campaign_tag
                self.referral.save()
