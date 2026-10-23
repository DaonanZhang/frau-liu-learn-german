from decimal import Decimal
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import ActivationCodeRecord, Module, PromotionCodeRecord
from apps.accounts.services.activation_codes import (
    ActivationEntitlementItem,
    ActivationPayload,
    store_activation_code,
)
from apps.accounts.services.promotion_codes import store_promotion_code


RESERVED_CODE = "BK1-ABC123"
RESERVED_ERROR = "Code prefix is reserved for referral campaigns"


class ReferralPrefixStoreGuardTests(TestCase):
    def setUp(self):
        self.module = Module.objects.get(key="exam_preparation")
        self.payload = ActivationPayload(
            entitlements=[
                ActivationEntitlementItem(module_key=self.module.key, plan="m1")
            ]
        )

    def store_promotion(self, code):
        return store_promotion_code(
            code=code,
            campaign_name="Ordinary campaign",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            expires_at=timezone.now(),
        )

    def test_promotion_store_rejects_normalized_reserved_prefix_before_cross_store_lookup(self):
        initial_count = PromotionCodeRecord.objects.count()
        with patch("apps.accounts.services.promotion_codes.activation_code_exists") as exists:
            for code in ("bk1-abc123", "  bK1-AbC123  "):
                with self.subTest(code=code), self.assertRaisesMessage(ValueError, RESERVED_ERROR):
                    self.store_promotion(code)

            exists.assert_not_called()
        self.assertEqual(PromotionCodeRecord.objects.count(), initial_count)

    def test_activation_store_rejects_normalized_reserved_prefix_before_lookup_or_cache_schedule(self):
        initial_count = ActivationCodeRecord.objects.count()
        with patch("apps.accounts.services.activation_codes.transaction.on_commit") as on_commit:
            for code in ("bk1-abc123", "  bK1-AbC123  "):
                with self.subTest(code=code), self.assertRaisesMessage(ValueError, RESERVED_ERROR):
                    store_activation_code(code=code, payload=self.payload)

            on_commit.assert_not_called()
        self.assertEqual(ActivationCodeRecord.objects.count(), initial_count)

    def test_explicit_promotion_command_surfaces_reserved_prefix_error_without_row(self):
        initial_count = PromotionCodeRecord.objects.count()
        with self.assertRaisesMessage(CommandError, RESERVED_ERROR):
            call_command(
                "generate_promotion_codes",
                campaign_name="Ordinary campaign",
                code="  bk1-abc123  ",
            )
        self.assertEqual(PromotionCodeRecord.objects.count(), initial_count)

    def test_ordinary_promotion_and_activation_codes_remain_storable(self):
        promotion = self.store_promotion("ordinarypromo1")
        store_activation_code(code="ordinaryact1", payload=self.payload)

        self.assertEqual(promotion.code, "ORDINARYPROMO1")
        self.assertTrue(
            ActivationCodeRecord.objects.filter(code="ORDINARYACT1").exists()
        )
