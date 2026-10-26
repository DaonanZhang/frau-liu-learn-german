from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import ActivationCodeRecord
from apps.accounts.services.activation_codes import (
    activation_code_exists,
    durable_activation_code_prefix_exists,
    legacy_activation_code_prefix_exists,
)


class DurableActivationCodePrefixScanTests(TestCase):
    def create_record(self, code, status=ActivationCodeRecord.Status.ACTIVE):
        return ActivationCodeRecord.objects.create(
            code=code,
            payload={},
            ttl_seconds=60,
            expires_at=timezone.now() + timedelta(seconds=60),
            status=status,
        )

    def test_blank_prefix_fails_before_model_io(self):
        with patch("apps.accounts.services.activation_codes.apps.get_model") as get_model:
            for prefix in ("", "  ", None):
                with self.subTest(prefix=prefix), self.assertRaisesMessage(
                    ValueError, "Activation code prefix cannot be empty"
                ):
                    durable_activation_code_prefix_exists(prefix)

            get_model.assert_not_called()

    def test_normalization_match_miss_boundary_and_exact_code_regression(self):
        self.create_record("BK10-ABC123")

        self.assertFalse(durable_activation_code_prefix_exists("BK1-"))
        self.create_record("BK1-ABC123")
        self.assertTrue(durable_activation_code_prefix_exists("  bk1- "))
        self.assertFalse(durable_activation_code_prefix_exists("BK2-"))
        self.assertTrue(activation_code_exists("  bk1-abc123  "))

    def test_prefix_scan_includes_every_status(self):
        statuses = (
            ActivationCodeRecord.Status.ACTIVE,
            ActivationCodeRecord.Status.CONSUMED,
            ActivationCodeRecord.Status.EXPIRED,
            ActivationCodeRecord.Status.REVOKED,
        )
        for index, status in enumerate(statuses):
            with self.subTest(status=status):
                self.create_record(f"STATUS-{index}", status=status)
                self.assertTrue(durable_activation_code_prefix_exists("status-"))
                ActivationCodeRecord.objects.filter(code=f"STATUS-{index}").delete()


class LegacyActivationCodePrefixScanTests(TestCase):
    def test_blank_prefix_fails_before_cache_access(self):
        cache = Mock()
        with patch("apps.accounts.services.activation_codes.cache", cache):
            for prefix in ("", "  ", None):
                with self.subTest(prefix=prefix), self.assertRaisesMessage(
                    ValueError, "Activation code prefix cannot be empty"
                ):
                    legacy_activation_code_prefix_exists(prefix)
        cache.iter_keys.assert_not_called()
        cache.keys.assert_not_called()

    def test_iter_keys_is_preferred_and_consumes_at_most_one_key(self):
        consumed = []

        def iter_keys(pattern):
            self.assertEqual(pattern, "activation_code:BK1-*")
            yield "activation_code:BK1-ABC123"
            consumed.append("second")
            yield "activation_code:BK1-DEF456"

        cache = type("Cache", (), {"iter_keys": staticmethod(iter_keys), "keys": lambda *_: self.fail("keys called")})()
        with patch("apps.accounts.services.activation_codes.cache", cache):
            self.assertTrue(legacy_activation_code_prefix_exists(" bk1- "))
        self.assertEqual(consumed, [])

    def test_iter_keys_miss_uses_exact_pattern(self):
        patterns = []
        cache = type("Cache", (), {"iter_keys": staticmethod(lambda pattern: patterns.append(pattern) or iter(()))})()
        with patch("apps.accounts.services.activation_codes.cache", cache):
            self.assertFalse(legacy_activation_code_prefix_exists("bk1-"))
        self.assertEqual(patterns, ["activation_code:BK1-*"])

    def test_keys_fallback_returns_boolean(self):
        for result, expected in ((["one"], True), ([], False)):
            keys = lambda pattern, result=result: result
            cache = type("Cache", (), {"iter_keys": None, "keys": staticmethod(keys)})()
            with patch("apps.accounts.services.activation_codes.cache", cache):
                self.assertIs(legacy_activation_code_prefix_exists("bk1-"), expected)

    def test_unsupported_backend_raises(self):
        cache = type("Cache", (), {})()
        with patch("apps.accounts.services.activation_codes.cache", cache):
            with self.assertRaisesMessage(
                RuntimeError, "Legacy activation code store does not support prefix scans"
            ):
                legacy_activation_code_prefix_exists("bk1-")

    def test_iter_keys_call_and_lazy_iteration_errors_are_wrapped(self):
        def fail_call(_pattern):
            raise ValueError("call failed")

        def fail_on_first_iteration(_pattern):
            raise LookupError("iteration failed")
            yield

        for iter_keys in (fail_call, fail_on_first_iteration):
            cache = type("Cache", (), {"iter_keys": staticmethod(iter_keys)})()
            with patch("apps.accounts.services.activation_codes.cache", cache):
                with self.assertRaisesRegex(RuntimeError, "^Could not scan legacy activation codes$") as raised:
                    legacy_activation_code_prefix_exists("bk1-")
                self.assertIsNotNone(raised.exception.__cause__)
                if iter_keys is fail_on_first_iteration:
                    self.assertIsInstance(raised.exception.__cause__, LookupError)

    def test_keys_error_is_wrapped_and_cause_preserved(self):
        def fail(_pattern):
            raise OSError("keys failed")

        cache = type("Cache", (), {"iter_keys": None, "keys": staticmethod(fail)})()
        with patch("apps.accounts.services.activation_codes.cache", cache):
            with self.assertRaisesRegex(RuntimeError, "^Could not scan legacy activation codes$") as raised:
                legacy_activation_code_prefix_exists("bk1-")
        self.assertIsInstance(raised.exception.__cause__, OSError)
