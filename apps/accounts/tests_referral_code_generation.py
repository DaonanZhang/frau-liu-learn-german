from unittest.mock import patch

from django.test import SimpleTestCase

from apps.accounts.services.referral_campaign import (
    ReferralCampaignConfig,
    generate_referral_code_candidate,
)


class ReferralCodeCandidateTests(SimpleTestCase):
    def test_default_candidate_has_the_registered_campaign_shape(self):
        with patch(
            "apps.accounts.services.referral_campaign.secrets.choice",
            side_effect=lambda alphabet: alphabet[0],
        ):
            candidate = generate_referral_code_candidate()

        self.assertRegex(candidate, r"^BK1-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{9}$")

    def test_samples_each_character_from_the_configured_alphabet(self):
        config = ReferralCampaignConfig(
            campaign_tag="test",
            campaign_name="测试",
            code_prefix="X7",
            module_key="test_module",
            suffix_length=4,
            alphabet="z3Q",
        )
        with patch(
            "apps.accounts.services.referral_campaign.secrets.choice",
            side_effect=["z", "3", "Q", "z"],
        ) as choice:
            candidate = generate_referral_code_candidate(config=config)

        self.assertEqual(candidate, "X7-z3Qz")
        self.assertEqual(choice.call_count, 4)
        self.assertEqual(choice.call_args_list, [(("z3Q",),)] * 4)

    def test_rejects_invalid_config_before_sampling(self):
        invalid_configs = (
            ReferralCampaignConfig("t", "n", " ", "m", 2, "ABC"),
            ReferralCampaignConfig("t", "n", "X", "m", 0, "ABC"),
            ReferralCampaignConfig("t", "n", "X", "m", -1, "ABC"),
            ReferralCampaignConfig("t", "n", "X", "m", 2, " "),
        )
        for config in invalid_configs:
            with self.subTest(config=config):
                with patch(
                    "apps.accounts.services.referral_campaign.secrets.choice"
                ) as choice:
                    with self.assertRaises(ValueError):
                        generate_referral_code_candidate(config=config)
                choice.assert_not_called()
