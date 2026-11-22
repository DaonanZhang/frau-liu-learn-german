from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import BugReport


class BugReportApiTests(APITestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            telephone="13800138199",
            country_code="+86",
            password="pass-123456",
        )

    def test_authenticated_user_can_submit_bug_report_with_diagnostics(self) -> None:
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/accounts/bug-reports/",
            {
                "report": "点击 Prüfen 后页面没有反应。",
                "page_url": "https://example.com/modules/exam-preparation/lesen",
                "browser_info": {"browser": "Chrome", "language": "zh-CN"},
                "console_errors": [{"type": "console.error", "message": "Request failed"}],
                "consent": True,
            },
            format="json",
            HTTP_X_FORWARDED_FOR="203.0.113.10, 10.0.0.2",
            HTTP_USER_AGENT="Example Browser/1.0",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        report = BugReport.objects.get(pk=response.data["id"])
        self.assertEqual(report.user, self.user)
        self.assertEqual(report.ip_address, "203.0.113.10")
        self.assertEqual(report.user_agent, "Example Browser/1.0")
        self.assertEqual(report.browser_info["browser"], "Chrome")
        self.assertEqual(report.console_errors[0]["message"], "Request failed")
        self.assertIsNotNone(report.consented_at)

    def test_consent_is_required(self) -> None:
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/accounts/bug-reports/",
            {"report": "页面错误", "consent": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BugReport.objects.count(), 0)

    def test_authentication_is_required(self) -> None:
        response = self.client.post(
            "/api/accounts/bug-reports/",
            {"report": "页面错误", "consent": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(BugReport.objects.count(), 0)


class AudioLoadErrorApiTests(APITestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            telephone="13800138200",
            country_code="+86",
            password="pass-123456",
        )

    def test_authenticated_user_can_report_audio_load_failure(self) -> None:
        self.client.force_authenticate(user=self.user)

        with patch("apps.accounts.views.bug_report.logger.warning") as warning:
            response = self.client.post(
                "/api/accounts/audio-load-errors/",
                {
                    "audio_url": "https://example.com/resources/audio.mp3?token=secret#part",
                    "page_url": "https://example.com/listening/7?access_token=secret",
                    "entry_point": "listening_exercise",
                    "backup_status": 503,
                    "backup_error": "Audio request failed: 503\nretry exhausted",
                    "media_error_code": 4,
                    "media_error_message": "MEDIA_ERR_SRC_NOT_SUPPORTED",
                    "authorization": "Bearer must-not-log",
                    "answers": {"1": "A"},
                    "recording": "must-not-log",
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message, *arguments = warning.call_args.args
        rendered_log = message % tuple(arguments)
        self.assertIn("user_id=", rendered_log)
        self.assertIn(str(self.user.pk), rendered_log)
        self.assertIn("listening_exercise", rendered_log)
        self.assertIn("https://example.com/resources/audio.mp3", rendered_log)
        self.assertIn("https://example.com/listening/7", rendered_log)
        self.assertIn("Audio request failed: 503", rendered_log)
        self.assertNotIn("token=secret", rendered_log)
        self.assertNotIn("access_token=secret", rendered_log)
        self.assertNotIn("must-not-log", rendered_log)
        self.assertNotIn("\n", rendered_log)

    def test_audio_load_failure_requires_authentication(self) -> None:
        response = self.client.post(
            "/api/accounts/audio-load-errors/",
            {
                "audio_url": "/resources/audio.mp3",
                "entry_point": "telc_mock_exam",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_audio_load_failure_rejects_invalid_diagnostics(self) -> None:
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/accounts/audio-load-errors/",
            {
                "audio_url": "/resources/audio.mp3",
                "entry_point": "unknown",
                "backup_error": "x" * 501,
                "backup_status": 99,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
