from datetime import timedelta

from django.db import migrations, models
from django.utils import timezone


def activate_existing_sessions(apps, schema_editor):
    AccountLoginSession = apps.get_model("accounts", "AccountLoginSession")
    now = timezone.now()
    AccountLoginSession.objects.filter(
        revoked_at__isnull=True,
        expires_at__gt=now,
    ).update(active_until=now + timedelta(minutes=10))


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0030_accountloginsession"),
    ]

    operations = [
        migrations.AddField(
            model_name="accountloginsession",
            name="active_until",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(activate_existing_sessions, migrations.RunPython.noop),
    ]
