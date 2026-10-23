from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from apps.accounts.models import Entitlement, Module, PromotionCodeRecord, ReferralCode
from apps.accounts.services import referral_campaign


class ReferralCodeCollisionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13600138888", password="pass"
        )
        self.module = Module.objects.get(key="exam_preparation")
        Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1
        )
        self.promotion_count = PromotionCodeRecord.objects.count()
        self.referral_count = ReferralCode.objects.count()

    def create_promotion(self, code):
        return PromotionCodeRecord.objects.create(
            code=code,
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="existing",
            discount_amount=Decimal("5.00"),
        )

    def test_activation_collision_retries_then_succeeds(self):
        with (
            patch.object(referral_campaign, "generate_referral_code_candidate", side_effect=["BK1-A", "BK1-B"]) as generate,
            patch("apps.accounts.services.activation_codes.activation_code_exists", side_effect=[True, False]) as exists,
        ):
            result = referral_campaign.ensure_referral_code(user=self.user)
        self.assertEqual(result.promotion_code.code, "BK1-B")
        self.assertEqual(generate.call_count, 2)
        self.assertEqual(exists.call_args_list[0].args, ("BK1-A",))

    def test_promotion_code_collision_retries_then_succeeds(self):
        self.create_promotion("BK1-TAKEN")
        with (
            patch.object(referral_campaign, "generate_referral_code_candidate", side_effect=["BK1-TAKEN", "BK1-FREE"]) as generate,
            patch("apps.accounts.services.activation_codes.activation_code_exists", return_value=False),
        ):
            result = referral_campaign.ensure_referral_code(user=self.user)
        self.assertEqual(result.promotion_code.code, "BK1-FREE")
        self.assertEqual(generate.call_count, 2)

    def test_referral_insert_integrity_error_rolls_back_promotion_and_outer_transaction_recovers(self):
        real_create = ReferralCode.objects.create
        attempts = 0

        def create_referral(**kwargs):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise IntegrityError("injected uniqueness race")
            return real_create(**kwargs)

        with (
            patch.object(referral_campaign, "generate_referral_code_candidate", side_effect=["BK1-FAIL", "BK1-OK"]),
            patch("apps.accounts.services.activation_codes.activation_code_exists", return_value=False),
            patch.object(ReferralCode.objects, "create", side_effect=create_referral),
        ):
            result = referral_campaign.ensure_referral_code(user=self.user)
            self.assertTrue(PromotionCodeRecord.objects.filter(code="BK1-OK").exists())
        self.assertEqual(result.promotion_code.code, "BK1-OK")
        self.assertFalse(PromotionCodeRecord.objects.filter(code="BK1-FAIL").exists())

    def test_visible_referral_after_integrity_race_returns_existing_unchanged(self):
        promotion = self.create_promotion("BK1-EXISTING")
        existing = ReferralCode(
            user=self.user, campaign_tag=referral_campaign.CAMPAIGN_TAG,
            code_prefix="OLD", promotion_code=promotion, is_active=False,
        )
        original_filter = ReferralCode.objects.filter
        calls = 0

        class ExistingAfterRace:
            def first(self):
                nonlocal calls
                calls += 1
                return None if calls == 1 else existing

        with (
            patch.object(referral_campaign, "generate_referral_code_candidate", return_value="BK1-RACE"),
            patch("apps.accounts.services.activation_codes.activation_code_exists", return_value=False),
            patch.object(ReferralCode.objects, "filter", side_effect=lambda **kwargs: ExistingAfterRace() if kwargs.get("campaign_tag") else original_filter(**kwargs)),
            patch.object(ReferralCode.objects, "create", side_effect=IntegrityError("race")),
        ):
            result = referral_campaign.ensure_referral_code(user=self.user)
        self.assertIs(result, existing)
        self.assertFalse(result.is_active)
        self.assertEqual(result.code_prefix, "OLD")

    def test_100_activation_collisions_exhaust_without_writes(self):
        with (
            patch.object(referral_campaign, "generate_referral_code_candidate", return_value="BK1-ACT") as generate,
            patch("apps.accounts.services.activation_codes.activation_code_exists", return_value=True) as exists,
        ):
            with self.assertRaisesRegex(RuntimeError, "^Failed to generate a unique referral code$"):
                referral_campaign.ensure_referral_code(user=self.user)
        self.assertEqual(generate.call_count, 100)
        self.assertEqual(exists.call_count, 100)
        self.assertEqual(PromotionCodeRecord.objects.count(), self.promotion_count)
        self.assertEqual(ReferralCode.objects.count(), self.referral_count)

    def test_100_database_collisions_exhaust_without_writes(self):
        self.create_promotion("BK1-TAKEN")
        base_count = PromotionCodeRecord.objects.count()
        with (
            patch.object(referral_campaign, "generate_referral_code_candidate", return_value="BK1-TAKEN") as generate,
            patch("apps.accounts.services.activation_codes.activation_code_exists", return_value=False) as exists,
        ):
            with self.assertRaisesRegex(RuntimeError, "^Failed to generate a unique referral code$"):
                referral_campaign.ensure_referral_code(user=self.user)
        self.assertEqual(generate.call_count, 100)
        self.assertEqual(exists.call_count, 100)
        self.assertEqual(PromotionCodeRecord.objects.count(), base_count)
        self.assertEqual(ReferralCode.objects.count(), self.referral_count)
