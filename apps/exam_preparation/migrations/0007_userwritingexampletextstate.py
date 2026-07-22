from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0006_backfill_blank_exam_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserWritingExampleTextState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_favorited", models.BooleanField(db_index=True, default=False, verbose_name="is favorited")),
                ("answer_payload", models.JSONField(blank=True, default=dict, verbose_name="answer payload")),
                ("is_correct", models.BooleanField(blank=True, db_index=True, null=True, verbose_name="is correct")),
                ("last_answered_at", models.DateTimeField(blank=True, null=True, verbose_name="last answered at")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="created at")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="updated at")),
                (
                    "example_text",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_states",
                        to="exam_preparation.writingexampletext",
                        verbose_name="writing example text",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="exam_preparation_writing_example_text_states",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="user",
                    ),
                ),
            ],
            options={
                "verbose_name": "user writing example text state",
                "verbose_name_plural": "user writing example text states",
                "ordering": ["-updated_at", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="userwritingexampletextstate",
            constraint=models.UniqueConstraint(
                fields=("user", "example_text"),
                name="exam_prep_user_write_example_state_uq",
            ),
        ),
    ]
