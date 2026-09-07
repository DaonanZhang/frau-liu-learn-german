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
