from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0008_speaking_gap_choice_structure"),
    ]

    operations = [
        migrations.AddField(
            model_name="userwritingexercisestate",
            name="time_spent_seconds",
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                verbose_name="time spent seconds",
            ),
        ),
    ]
