from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0027_update_exam_preparation_pricing"),
    ]

    operations = [
        migrations.AlterField(
            model_name="promotioncoderecord",
            name="expires_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
