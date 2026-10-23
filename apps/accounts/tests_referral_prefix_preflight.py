from unittest.mock import call, patch

from django.test import TestCase

from apps.accounts.models import ActivationCodeRecord, PromotionCodeRecord
from apps.accounts.services.referral_campaign import (
    FIRST_REFERRAL_CAMPAIGN,
    ReferralCampaignConfig,
    assert_referral_code_prefix_available,
)


class ReferralCodePrefixPreflightTests(TestCase):
    def test_clear_prefix_checks_in_order_with_exact_default_arguments(self):
        sequence = []

        def record(name):
            def side_effect(*args, **kwargs):
                sequence.append(name)
                return False

            return side_effect

        with (
            patch(
                "apps.accounts.services.referral_campaign.promotion_code_prefix_collision_exists",
                side_effect=record("promotion"),
            ) as promotion_check,
            patch(
                "apps.accounts.services.activation_codes.durable_activation_code_prefix_exists",
                side_effect=record("durable"),
            ) as durable_check,
            patch(
                "apps.accounts.services.activation_codes.legacy_activation_code_prefix_exists",
                side_effect=record("legacy"),
            ) as legacy_check,
        ):
            self.assertIsNone(assert_referral_code_prefix_available())

        self.assertEqual(sequence, ["promotion", "durable", "legacy"])
        self.assertEqual(promotion_check.call_args_list, [call(config=FIRST_REFERRAL_CAMPAIGN)])
        self.assertEqual(durable_check.call_args_list, [call("BK1-")])
        self.assertEqual(legacy_check.call_args_list, [call("BK1-")])

    def test_collisions_raise_exact_error_and_short_circuit(self):
        cases = (
            (True, False, False, (1, 0, 0)),
            (False, True, False, (1, 1, 0)),
            (False, False, True, (1, 1, 1)),
        )
        for promotion, durable, legacy, counts in cases:
            with self.subTest(promotion=promotion, durable=durable, legacy=legacy):
                with (
                    patch(
                        "apps.accounts.services.referral_campaign.promotion_code_prefix_collision_exists",
                        return_value=promotion,
                    ) as promotion_check,
                    patch(
                        "apps.accounts.services.activation_codes.durable_activation_code_prefix_exists",
                        return_value=durable,
                    ) as durable_check,
                    patch(
                        "apps.accounts.services.activation_codes.legacy_activation_code_prefix_exists",
                        return_value=legacy,
                    ) as legacy_check,
                ):
                    with self.assertRaisesRegex(
                        ValueError, "^Referral code prefix is already in use$"
                    ):
                        assert_referral_code_prefix_available()

                self.assertEqual(
                    (promotion_check.call_count, durable_check.call_count, legacy_check.call_count),
                    counts,
                )

    def test_custom_frozen_config_and_legacy_runtime_error_identity(self):
        config = ReferralCampaignConfig(
            campaign_tag="custom_tag",
            campaign_name="Custom",
            code_prefix="ZX9",
            module_key="exam_preparation",
            suffix_length=4,
            alphabet="ABCD",
        )
        sentinel = RuntimeError("legacy unavailable")
        with (
            patch(
                "apps.accounts.services.referral_campaign.promotion_code_prefix_collision_exists",
                return_value=False,
            ) as promotion_check,
            patch(
                "apps.accounts.services.activation_codes.durable_activation_code_prefix_exists",
                return_value=False,
            ) as durable_check,
            patch(
                "apps.accounts.services.activation_codes.legacy_activation_code_prefix_exists",
                side_effect=sentinel,
            ) as legacy_check,
        ):
            with self.assertRaises(RuntimeError) as raised:
                assert_referral_code_prefix_available(config=config)

        self.assertIs(raised.exception, sentinel)
        promotion_check.assert_called_once_with(config=config)
        durable_check.assert_called_once_with("ZX9-")
        legacy_check.assert_called_once_with("ZX9-")
        with self.assertRaises((AttributeError, TypeError)):
            config.code_prefix = "MUTATED"

    def test_real_empty_database_helpers_do_not_mutate_snapshots(self):
        before_promotions = list(
            PromotionCodeRecord.objects.order_by("pk").values_list("pk", "code", "status")
        )
        before_activation_codes = list(
            ActivationCodeRecord.objects.order_by("pk").values_list("pk", "code", "status")
        )
        with patch(
            "apps.accounts.services.activation_codes.legacy_activation_code_prefix_exists",
            return_value=False,
        ):
            self.assertIsNone(assert_referral_code_prefix_available())
        self.assertEqual(
            list(PromotionCodeRecord.objects.order_by("pk").values_list("pk", "code", "status")),
            before_promotions,
        )
        self.assertEqual(
            list(ActivationCodeRecord.objects.order_by("pk").values_list("pk", "code", "status")),
            before_activation_codes,
        )
