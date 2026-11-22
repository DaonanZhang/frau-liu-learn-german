from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import APIException, NotFound, ValidationError
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

    def test_handled_validation_error_logs_authenticated_user_and_detail(self):
        request = APIRequestFactory().post(
            "/api/example/", {"password": "do-not-log"}, format="json"
        )
        request.user = SimpleNamespace(pk=42)

        with self.assertLogs("apps.accounts.api_exceptions", level="WARNING") as logs:
            response = api_exception_handler(
                ValidationError({"detail": "invalid"}), {"request": request}
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"detail": "invalid"})
        self.assertIn("user_id=42", logs.output[0])
        self.assertIn("method=POST", logs.output[0])
        self.assertIn("path=/api/example/", logs.output[0])
        self.assertIn("status=400", logs.output[0])
        self.assertIn("exception=ValidationError", logs.output[0])
        self.assertIn("invalid", logs.output[0])
        self.assertNotIn("do-not-log", logs.output[0])

    def test_handled_non_400_client_error_logs_anonymous_user(self):
        self.request.user = SimpleNamespace(pk=None)

        with self.assertLogs("apps.accounts.api_exceptions", level="WARNING") as logs:
            response = api_exception_handler(NotFound("missing"), {"request": self.request})

        self.assertEqual(response.status_code, 404)
        self.assertIn("user_id=anonymous", logs.output[0])
        self.assertIn("status=404", logs.output[0])
        self.assertIn("exception=NotFound", logs.output[0])
        self.assertIn("missing", logs.output[0])

    def test_handled_client_error_detail_is_bounded(self):
        detail = "x" * 3000

        with self.assertLogs("apps.accounts.api_exceptions", level="WARNING") as logs:
            api_exception_handler(ValidationError(detail), {"request": self.request})

        self.assertIn("x" * 100, logs.output[0])
        self.assertNotIn("x" * 2001, logs.output[0])

    def test_handled_non_client_error_does_not_log(self):
        class ServiceUnavailable(APIException):
            status_code = 503

        with patch("apps.accounts.api_exceptions.logger.warning") as log_warning:
            response = api_exception_handler(ServiceUnavailable(), {"request": self.request})

        self.assertEqual(response.status_code, 503)
        log_warning.assert_not_called()
