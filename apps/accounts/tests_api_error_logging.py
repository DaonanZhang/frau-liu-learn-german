from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from rest_framework.settings import api_settings
from rest_framework.test import APIRequestFactory

from apps.accounts.api_exceptions import api_exception_handler


class APIExceptionLoggingTests(SimpleTestCase):
    def test_rest_framework_uses_custom_exception_handler(self):
        self.assertEqual(api_settings.EXCEPTION_HANDLER, api_exception_handler)

    def setUp(self):
        self.request = APIRequestFactory().get("/api/example/")

    def test_unhandled_exception_logs_authenticated_user_and_traceback(self):
        self.request.user = SimpleNamespace(pk=42)

        try:
            raise RuntimeError("unexpected failure")
        except RuntimeError as exc:
            with self.assertLogs("apps.accounts.api_exceptions", level="ERROR") as logs:
                response = api_exception_handler(exc, {"request": self.request})

        self.assertIsNone(response)
        self.assertIn("user_id=42", logs.output[0])
        self.assertIn("method=GET", logs.output[0])
        self.assertIn("path=/api/example/", logs.output[0])
        self.assertIn("exception=RuntimeError", logs.output[0])
        self.assertIn("Traceback (most recent call last)", logs.output[0])

    def test_unhandled_exception_logs_anonymous_user(self):
        self.request.user = SimpleNamespace(pk=None)

        try:
            raise RuntimeError("unexpected failure")
        except RuntimeError as exc:
            with self.assertLogs("apps.accounts.api_exceptions", level="ERROR") as logs:
                api_exception_handler(exc, {"request": self.request})

        self.assertIn("user_id=anonymous", logs.output[0])

    def test_handled_validation_error_returns_default_response_without_error_log(self):
        self.request.user = SimpleNamespace(pk=42)

        with patch("apps.accounts.api_exceptions.logger.exception") as log_exception:
            response = api_exception_handler(
                ValidationError({"detail": "invalid"}), {"request": self.request}
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"detail": "invalid"})
        log_exception.assert_not_called()
