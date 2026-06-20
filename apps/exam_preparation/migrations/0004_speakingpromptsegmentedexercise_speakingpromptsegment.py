import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0003_exercisebase_exam_type_remove_title_zh"),
    ]

    operations = [
        migrations.CreateModel(
            name="SpeakingPromptSegmentedExercise",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("prompt_text", models.TextField(verbose_name="prompt text")),
                ("segment_delimiter", models.CharField(default="<分段>", max_length=32, verbose_name="segment delimiter")),
                ("example_text_raw", models.TextField(blank=True, default="", verbose_name="raw example text")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="created at")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="updated at")),
                (
                    "exercise_base",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="speaking_prompt_segmented_exercise",
                        to="exam_preparation.exercisebase",
                        verbose_name="exercise base",
                    ),
                ),
            ],
            options={
                "verbose_name": "speaking prompt segmented exercise",
                "verbose_name_plural": "speaking prompt segmented exercises",
            },
        ),
        migrations.CreateModel(
            name="SpeakingPromptSegment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("segment_order", models.PositiveIntegerField(verbose_name="segment order")),
                ("segment_text", models.TextField(verbose_name="segment text")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="created at")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="updated at")),
                (
                    "exercise",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="segments",
                        to="exam_preparation.speakingpromptsegmentedexercise",
                        verbose_name="exercise",
                    ),
                ),
            ],
            options={
                "verbose_name": "speaking prompt segment",
                "verbose_name_plural": "speaking prompt segments",
                "ordering": ["exercise_id", "segment_order", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="speakingpromptsegment",
            constraint=models.UniqueConstraint(fields=("exercise", "segment_order"), name="exam_prep_sps_segment_order_uq"),
        ),
    ]
