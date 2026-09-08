from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0013_user_has_seen_schreiben_teil_1_guide"),
    ]

    operations = [
        migrations.RenameField(
            model_name="user",
            old_name="has_seen_schreiben_teil_1_guide",
            new_name="has_seen_schreiben_guide",
        ),
        migrations.AlterField(
            model_name="user",
            name="has_seen_schreiben_guide",
            field=models.BooleanField(
                default=False,
                verbose_name="has seen Schreiben guide",
            ),
        ),
    ]
