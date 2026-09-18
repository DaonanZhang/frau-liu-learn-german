from django.db import migrations


def reset_existing_device_activity(apps, schema_editor):
    AccountLoginSession = apps.get_model("accounts", "AccountLoginSession")
    AccountLoginSession.objects.update(active_until=None)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0031_accountloginsession_active_until"),
    ]

    operations = [
        migrations.RunPython(
            reset_existing_device_activity,
            migrations.RunPython.noop,
        ),
    ]
