from __future__ import annotations

from django.db import migrations, models


def set_default_country_code(apps, schema_editor) -> None:
    User = apps.get_model("accounts", "User")
    User.objects.filter(country_code__isnull=True).update(country_code="+86")
    User.objects.filter(country_code="").update(country_code="+86")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_useractiveday"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="country_code",
            field=models.CharField(default="+86", max_length=8),
        ),
        migrations.RunPython(set_default_country_code, migrations.RunPython.noop),
    ]
