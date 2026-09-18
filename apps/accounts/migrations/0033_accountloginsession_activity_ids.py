from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0032_reset_existing_device_activity"),
    ]

    operations = [
        migrations.AddField(
            model_name="accountloginsession",
            name="activity_id",
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="accountloginsession",
            name="closed_activity_ids",
            field=models.JSONField(default=list),
        ),
    ]
