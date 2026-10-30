from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exam_preparation", "0026_exampreparationguide_exampreparationguidelike"),
    ]

    operations = [
        migrations.AddField(
            model_name="exampreparationguide",
            name="author",
            field=models.CharField(default="Frau Liu", max_length=100, verbose_name="author"),
        ),
    ]
