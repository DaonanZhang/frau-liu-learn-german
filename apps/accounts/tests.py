from __future__ import annotations

import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.services.password_reset_codes import verify_password_reset_code


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_ENABLED=True,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "password-reset-tests",
        }
    },
)
class PasswordResetApiTests(APITestCase):
    @staticmethod
    def _extract_code_from_html(html: str) -> str:
        match = re.search(r"\b(\d{6})\b", html)
        if not match:
            raise AssertionError("No 6-digit reset code found in email HTML")
        return match.group(1)

    def setUp(self) -> None:
        super().setUp()
        cache.clear()
        self.user = get_user_model().objects.create_user(
            telephone="13800138000",
            country_code="+86",
            password="old-pass-123",
            email="learner@example.com",
            username="Liu",
        )

    def test_request_password_reset_sends_email_and_stores_code(self) -> None:
        response = self.client.post(
            "/api/accounts/auth/password-reset/request/",
            {"email": "learner@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("密码重置验证码", mail.outbox[0].subject)
        self.assertIn("learner@example.com", mail.outbox[0].to)

        html_body = mail.outbox[0].alternatives[0][0]
        self.assertIn("Frau Liu Learn German", html_body)

        code = self._extract_code_from_html(html_body)
        self.assertTrue(
            verify_password_reset_code(
                email="learner@example.com",
                code=code,
            )
        )

    def test_confirm_password_reset_updates_password(self) -> None:
        request_response = self.client.post(
            "/api/accounts/auth/password-reset/request/",
            {"email": "learner@example.com"},
            format="json",
        )
        self.assertEqual(request_response.status_code, status.HTTP_200_OK)

        html_body = mail.outbox[0].alternatives[0][0]
        code = self._extract_code_from_html(html_body)

        response = self.client.post(
            "/api/accounts/auth/password-reset/confirm/",
            {
                "email": "learner@example.com",
                "code": code,
                "new_password": "new-pass-456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-pass-456"))

    def test_request_password_reset_unknown_email_is_still_success(self) -> None:
        response = self.client.post(
            "/api/accounts/auth/password-reset/request/",
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)
