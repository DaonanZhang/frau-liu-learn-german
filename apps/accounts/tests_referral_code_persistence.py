from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import Entitlement, Module, PromotionCodeRecord, ReferralCode
from apps.accounts.services import referral_campaign
from apps.accounts.services.referral_campaign import CAMPAIGN_TAG


class EnsureReferralCodeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13600139901", password="pass"
        )
        self.module = Module.objects.get(key="exam_preparation")
        self.promotion_count = PromotionCodeRecord.objects.count()
        self.referral_count = ReferralCode.objects.count()

    def grant_historical_access(self):
        return Entitlement.objects.create(
            user=self.user,
            module=self.module,
            plan=Entitlement.Plan.MONTH_1,
        )

    def test_unknown_campaign_creates_no_rows(self):
        with self.assertRaises(ValueError):
            referral_campaign.ensure_referral_code(user=self.user, campaign_tag="unknown")

        self.assertEqual(PromotionCodeRecord.objects.count(), self.promotion_count)
        self.assertEqual(ReferralCode.objects.count(), self.referral_count)

    def test_ineligible_user_creates_no_rows(self):
        with self.assertRaises(ValueError):
            referral_campaign.ensure_referral_code(user=self.user)

        self.assertEqual(PromotionCodeRecord.objects.count(), self.promotion_count)
        self.assertEqual(ReferralCode.objects.count(), self.referral_count)

    def test_creates_exact_linked_promotion_and_referral_rows(self):
        self.grant_historical_access()
        with patch.object(
            referral_campaign,
            "generate_referral_code_candidate",
            return_value="BK1-ABCDEFGH2",
        ) as generate:
            referral = referral_campaign.ensure_referral_code(user=self.user)

        promotion = referral.promotion_code
        self.assertEqual(generate.call_count, 1)
        self.assertEqual(referral.user_id, self.user.pk)
        self.assertEqual(referral.campaign_tag, CAMPAIGN_TAG)
        self.assertEqual(referral.code_prefix, "BK1")
        self.assertTrue(referral.is_active)
        self.assertEqual(promotion.code, "BK1-ABCDEFGH2")
        self.assertEqual(promotion.source_kind, PromotionCodeRecord.SourceKind.REFERRAL)
        self.assertEqual(promotion.operator_name, "system")
        self.assertEqual(promotion.campaign_name, "备考季推广")
        self.assertEqual(promotion.organization_name, "")
        self.assertEqual(promotion.remark, "")
        self.assertEqual(promotion.discount_amount, Decimal("5.00"))
        self.assertEqual(promotion.minimum_order_amount, Decimal("0.00"))
        self.assertEqual(promotion.applicable_module_id, self.module.pk)
        self.assertIsNone(promotion.applicable_season_id)
        self.assertIsNone(promotion.applicable_offer_id)
        self.assertIsNone(promotion.coupon_valid_days)
        self.assertEqual(promotion.redemption_mode, PromotionCodeRecord.RedemptionMode.REUSABLE)
        self.assertEqual(promotion.stacking_policy, PromotionCodeRecord.StackingPolicy.STACK)
        self.assertEqual(promotion.status, PromotionCodeRecord.Status.ACTIVE)
        self.assertIsNone(promotion.expires_at)
        self.assertIsNone(promotion.consumed_by_user_id)
        self.assertIsNone(promotion.consumed_at)

    def test_inactive_existing_referral_returns_unchanged_without_eligibility_or_generation(self):
        promotion = PromotionCodeRecord.objects.create(
            code="BK1-INACTIVE01",
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="Original campaign",
            discount_amount=Decimal("5.00"),
        )
        existing = ReferralCode.objects.create(
            user=self.user,
            campaign_tag=CAMPAIGN_TAG,
            code_prefix="OLD",
            promotion_code=promotion,
            is_active=False,
        )
        with (
            patch.object(referral_campaign, "has_historical_exam_preparation_access") as eligible,
            patch.object(referral_campaign, "generate_referral_code_candidate") as generate,
        ):
            result = referral_campaign.ensure_referral_code(user=self.user)

        self.assertEqual(result.pk, existing.pk)
        self.assertFalse(result.is_active)
        self.assertEqual(result.code_prefix, "OLD")
        eligible.assert_not_called()
        generate.assert_not_called()

    def test_serial_second_call_returns_same_rows_without_adding_more(self):
        self.grant_historical_access()
        with patch.object(
            referral_campaign,
            "generate_referral_code_candidate",
            return_value="BK1-SERIAL001",
        ) as generate:
            first = referral_campaign.ensure_referral_code(user=self.user)
            second = referral_campaign.ensure_referral_code(user=self.user)

        self.assertEqual((second.pk, second.promotion_code_id), (first.pk, first.promotion_code_id))
        self.assertEqual(generate.call_count, 1)
        self.assertEqual(ReferralCode.objects.count(), self.referral_count + 1)
        self.assertEqual(PromotionCodeRecord.objects.count(), self.promotion_count + 1)

    def test_locks_user_before_eligibility_and_candidate_generation(self):
        self.grant_historical_access()
        user_manager = get_user_model().objects
        with (
            patch.object(user_manager, "select_for_update", wraps=user_manager.select_for_update) as lock,
            patch.object(
                referral_campaign,
                "has_historical_exam_preparation_access",
                side_effect=lambda **kwargs: self.assertEqual(lock.call_count, 1) or True,
            ),
            patch.object(
                referral_campaign,
                "generate_referral_code_candidate",
                side_effect=lambda **kwargs: (
                    self.assertEqual(lock.call_count, 1) or "BK1-LOCKED001"
                ),
            ),
        ):
            result = referral_campaign.ensure_referral_code(user=self.user)

        self.assertEqual(result.user_id, self.user.pk)
        self.assertEqual(lock.call_count, 1)
