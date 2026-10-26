from types import SimpleNamespace
from unittest.mock import patch

from django.contrib import admin
from django.test import RequestFactory, SimpleTestCase, override_settings

from apps.accounts import feature_flags
from apps.accounts.models import (
    ReferralCode,
    ReferralNotice,
    ReferralParticipation,
    ReferralReward,
)


class ReferralFeatureFlagTests(SimpleTestCase):
    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    def test_referral_flag_is_disabled_when_setting_is_false(self):
        self.assertFalse(feature_flags.exam_preparation_referral_enabled())

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=True)
    def test_referral_flag_is_enabled_when_setting_is_true(self):
        self.assertTrue(feature_flags.exam_preparation_referral_enabled())

    def test_referral_flag_defaults_to_disabled_when_setting_is_absent(self):
        with patch.object(feature_flags, "settings", SimpleNamespace()):
            self.assertFalse(feature_flags.exam_preparation_referral_enabled())


class ReferralAdminConfigurationTests(SimpleTestCase):
    models = (ReferralCode, ReferralParticipation, ReferralReward, ReferralNotice)

    def test_all_referral_models_are_registered_read_only(self):
        request = RequestFactory().get("/admin/")

        for model in self.models:
            with self.subTest(model=model.__name__):
                model_admin = admin.site._registry[model]
                self.assertEqual(
                    set(model_admin.get_readonly_fields(request)),
                    {field.name for field in model._meta.fields},
                )
                self.assertFalse(model_admin.has_change_permission(request))
                self.assertFalse(model_admin.has_add_permission(request))
                self.assertFalse(model_admin.has_delete_permission(request))
                self.assertEqual(model_admin.get_actions(request), {})
