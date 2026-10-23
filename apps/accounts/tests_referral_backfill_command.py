import io
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError
from django.test import SimpleTestCase


class ReferralBackfillCommandTests(SimpleTestCase):
    @patch("apps.accounts.management.commands.backfill_exam_preparation_referral_codes.backfill_referral_codes")
    def test_default_apply_mode_prints_all_counters(self, backfill):
        backfill.return_value = SimpleNamespace(created=2, existing=3, skipped=4, failed=5)
        output = io.StringIO()

        call_command("backfill_exam_preparation_referral_codes", stdout=output)

        backfill.assert_called_once_with(dry_run=False)
        self.assertEqual(output.getvalue(), "mode=apply created=2 existing=3 skipped=4 failed=5\n")

    @patch("apps.accounts.management.commands.backfill_exam_preparation_referral_codes.backfill_referral_codes")
    def test_dry_run_prints_summary(self, backfill):
        backfill.return_value = SimpleNamespace(created=0, existing=1, skipped=2, failed=0)
        output = io.StringIO()

        call_command("backfill_exam_preparation_referral_codes", "--dry-run", stdout=output)

        backfill.assert_called_once_with(dry_run=True)
        self.assertEqual(output.getvalue(), "mode=dry-run created=0 existing=1 skipped=2 failed=0\n")

    @patch("apps.accounts.management.commands.backfill_exam_preparation_referral_codes.backfill_referral_codes")
    def test_expected_service_errors_become_command_errors(self, backfill):
        for error in (ValueError("value"), RuntimeError("runtime"), DatabaseError("database")):
            with self.subTest(error=type(error).__name__):
                backfill.side_effect = error
                output = io.StringIO()

                with self.assertRaises(CommandError) as raised:
                    call_command("backfill_exam_preparation_referral_codes", stdout=output)

                self.assertEqual(str(raised.exception), str(error))
                self.assertIs(raised.exception.__cause__, error)
                self.assertEqual(output.getvalue(), "")
                backfill.reset_mock()

    @patch("apps.accounts.management.commands.backfill_exam_preparation_referral_codes.backfill_referral_codes")
    def test_unexpected_service_error_propagates(self, backfill):
        error = TypeError("unexpected")
        backfill.side_effect = error
        output = io.StringIO()

        with self.assertRaises(TypeError) as raised:
            call_command("backfill_exam_preparation_referral_codes", stdout=output)

        self.assertIs(raised.exception, error)
        self.assertEqual(output.getvalue(), "")
