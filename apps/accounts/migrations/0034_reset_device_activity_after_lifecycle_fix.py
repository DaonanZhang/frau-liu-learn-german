from django.db import migrations


def reset_device_activity(apps, schema_editor):
    AccountLoginSession = apps.get_model("accounts", "AccountLoginSession")
    AccountLoginSession.objects.update(
        active_until=None,
        activity_id=None,
        closed_activity_ids=[],
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0033_accountloginsession_activity_ids"),
    ]

    operations = [
        migrations.RunPython(
            reset_device_activity,
            migrations.RunPython.noop,
        ),
    ]
