from django.conf import settings
from django.db import models


class BugReport(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="bug_reports",
    )
    report = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    page_url = models.TextField(blank=True)
    user_agent = models.TextField(blank=True)
    browser_info = models.JSONField(default=dict, blank=True)
    console_errors = models.JSONField(default=list, blank=True)
    consented_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"BugReport<{self.pk}:{self.user_id}>"
