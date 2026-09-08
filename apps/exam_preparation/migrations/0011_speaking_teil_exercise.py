from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0010_split_listening_exercise_types"),
    ]

    operations = [
        migrations.CreateModel(
            name="SpeakingTeilExercise",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("instruction", models.TextField(blank=True, default="", verbose_name="instruction")),
                ("content", models.JSONField(default=dict, verbose_name="task content")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="created at")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="updated at")),
                (
                    "exercise_base",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="speaking_teil_exercise",
                        to="exam_preparation.exercisebase",
                        verbose_name="exercise base",
                    ),
                ),
            ],
            options={
                "verbose_name": "speaking Teil exercise",
                "verbose_name_plural": "speaking Teil exercises",
            },
        ),
    ]
