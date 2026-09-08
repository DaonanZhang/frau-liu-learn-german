import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0024_optional_coupon_expiry"),
    ]

    operations = [
        migrations.CreateModel(
            name="BugReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("report", models.TextField()),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("page_url", models.TextField(blank=True)),
                ("user_agent", models.TextField(blank=True)),
                ("browser_info", models.JSONField(blank=True, default=dict)),
                ("console_errors", models.JSONField(blank=True, default=list)),
                ("consented_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="bug_reports", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
