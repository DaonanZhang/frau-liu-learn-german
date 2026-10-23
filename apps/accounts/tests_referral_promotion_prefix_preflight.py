from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import PromotionCodeRecord, ReferralCode
from apps.accounts.services.referral_campaign import (
    CAMPAIGN_TAG,
    FIRST_REFERRAL_CAMPAIGN,
    ReferralCampaignConfig,
    promotion_code_prefix_collision_exists,
)


class PromotionCodePrefixCollisionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13600137771", password="pass"
        )

    def create_promotion(
        self,
        code,
        *,
        source_kind=PromotionCodeRecord.SourceKind.OPERATIONAL,
        status=PromotionCodeRecord.Status.ACTIVE,
    ):
        return PromotionCodeRecord.objects.create(
            code=code,
            source_kind=source_kind,
            campaign_name="Prefix test",
            discount_amount=Decimal("5.00"),
            status=status,
        )

    def snapshot(self):
        return (
            list(
                PromotionCodeRecord.objects.order_by("pk").values_list(
                    "pk", "code", "source_kind", "status"
                )
            ),
            list(
                ReferralCode.objects.order_by("pk").values_list(
                    "pk", "campaign_tag", "promotion_code_id"
                )
            ),
        )

    def assert_safe_without_mutation(self):
        before = self.snapshot()
        self.assertFalse(promotion_code_prefix_collision_exists())
        self.assertEqual(self.snapshot(), before)

    def assert_collision_without_mutation(self):
        before = self.snapshot()
        self.assertTrue(promotion_code_prefix_collision_exists())
        self.assertEqual(self.snapshot(), before)

    def test_empty_boundary_and_correctly_linked_referral_are_safe(self):
        self.assert_safe_without_mutation()

        self.create_promotion("BK10-BOUNDARY")
        self.assert_safe_without_mutation()
        PromotionCodeRecord.objects.all().delete()

        promotion = self.create_promotion(
            "BK1-LINKED", source_kind=PromotionCodeRecord.SourceKind.REFERRAL
        )
        ReferralCode.objects.create(
            user=self.user,
            campaign_tag=CAMPAIGN_TAG,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix,
            promotion_code=promotion,
        )
        self.assert_safe_without_mutation()

    def test_unlinked_and_mismatched_referral_prefixes_collide_independently(self):
        cases = (
            ("BK1-OPERATIONAL", PromotionCodeRecord.SourceKind.OPERATIONAL, None),
            ("BK1-INTERNAL", PromotionCodeRecord.SourceKind.INTERNAL_REWARD, None),
            ("BK1-ORPHAN", PromotionCodeRecord.SourceKind.REFERRAL, None),
            ("BK1-OTHER-CAMPAIGN", PromotionCodeRecord.SourceKind.REFERRAL, "other_campaign"),
        )
        for code, source_kind, campaign_tag in cases:
            with self.subTest(code=code):
                promotion = self.create_promotion(code, source_kind=source_kind)
                if campaign_tag is not None:
                    ReferralCode.objects.create(
                        user=self.user,
                        campaign_tag=campaign_tag,
                        code_prefix="BK1",
                        promotion_code=promotion,
                    )
                self.assert_collision_without_mutation()
                ReferralCode.objects.all().delete()
                PromotionCodeRecord.objects.all().delete()

    def test_every_status_collides_and_custom_config_uses_its_prefix_and_tag(self):
        for status in PromotionCodeRecord.Status.values:
            with self.subTest(status=status):
                self.create_promotion("BK1-STATUS", status=status)
                self.assert_collision_without_mutation()
                PromotionCodeRecord.objects.all().delete()

        custom_config = ReferralCampaignConfig(
            campaign_tag="custom_campaign",
            campaign_name="Custom",
            code_prefix="ZX9",
            module_key="exam_preparation",
            suffix_length=4,
            alphabet="ABCD",
        )
        self.create_promotion("ZX9-OTHER-TAG", source_kind=PromotionCodeRecord.SourceKind.REFERRAL)
        ReferralCode.objects.create(
            user=self.user,
            campaign_tag="different_campaign",
            code_prefix="ZX9",
            promotion_code=PromotionCodeRecord.objects.get(code="ZX9-OTHER-TAG"),
        )
        before = self.snapshot()
        self.assertTrue(promotion_code_prefix_collision_exists(config=custom_config))
        self.assertEqual(self.snapshot(), before)
        ReferralCode.objects.all().delete()
        PromotionCodeRecord.objects.all().delete()

        custom_promotion = self.create_promotion(
            "ZX9-SAFE", source_kind=PromotionCodeRecord.SourceKind.REFERRAL
        )
        ReferralCode.objects.create(
            user=self.user,
            campaign_tag="custom_campaign",
            code_prefix="ZX9",
            promotion_code=custom_promotion,
        )
        before = self.snapshot()
        self.assertFalse(promotion_code_prefix_collision_exists(config=custom_config))
        self.assertEqual(self.snapshot(), before)
