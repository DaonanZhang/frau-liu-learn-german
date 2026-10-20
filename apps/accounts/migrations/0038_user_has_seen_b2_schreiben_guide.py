from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0037_promotion_code_generation_audit"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="has_seen_b2_schreiben_guide",
            field=models.BooleanField(
                default=False,
                verbose_name="has seen B2 Schreiben guide",
            ),
        ),
    ]
