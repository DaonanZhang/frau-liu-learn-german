from __future__ import annotations

import shutil
import tempfile
import re
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
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


class HomepageSettingApiTests(APITestCase):
    def setUp(self) -> None:
        super().setUp()
        self.temp_dir = tempfile.mkdtemp()
        self.qr_path = Path(self.temp_dir) / "wechat-qr.png"
        self.qr_path.write_bytes(b"old-image")
        self.override = override_settings(HOMEPAGE_WECHAT_QR_IMAGE_PATH=str(self.qr_path))
        self.override.enable()
        self.admin_user = get_user_model().objects.create_user(
            telephone="13900139000",
            country_code="+86",
            password="pass-123456",
            is_superuser=True,
            is_staff=True,
        )
        self.normal_user = get_user_model().objects.create_user(
            telephone="13800138000",
            country_code="+86",
            password="pass-123456",
        )

    def tearDown(self) -> None:
        self.override.disable()
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        super().tearDown()

    def test_get_wechat_qr_returns_default_state(self) -> None:
        self.client.force_authenticate(user=self.normal_user)

        response = self.client.get("/api/accounts/homepage-settings/wechat-qr/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("/images/wechat-qr.png?v=", response.data["wechat_qr_image_url"])
        self.assertFalse(response.data["can_manage"])

    def test_non_superuser_cannot_upload_wechat_qr(self) -> None:
        self.client.force_authenticate(user=self.normal_user)

        response = self.client.post(
            "/api/accounts/homepage-settings/wechat-qr/",
            {
                "wechat_qr_image": SimpleUploadedFile(
                    "qr.png",
                    b"fake-image-content",
                    content_type="image/png",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_upload_wechat_qr(self) -> None:
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            "/api/accounts/homepage-settings/wechat-qr/",
            {
                "wechat_qr_image": SimpleUploadedFile(
                    "qr.png",
                    b"new-image-content",
                    content_type="image/png",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_manage"])
        self.assertEqual(self.qr_path.read_bytes(), b"new-image-content")
        self.assertIn("/images/wechat-qr.png?v=", response.data["wechat_qr_image_url"])
