import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

from apps.exam_preparation.models.mock_exam import generate_mock_exam_code


def create_papers_for_existing_attempts(apps, schema_editor):
    MockExamPaper = apps.get_model("exam_preparation", "MockExamPaper")
    SavedMockExam = apps.get_model("exam_preparation", "SavedMockExam")
    for attempt in SavedMockExam.objects.order_by("id").iterator():
        paper = MockExamPaper.objects.create(
            code=f"ME-{uuid.uuid4().hex[:8].upper()}",
            exam_type=attempt.exam_type,
            level=attempt.level,
            exercise_selection=attempt.exercise_selection,
            creation_method="random",
            created_by_id=attempt.user_id,
        )
        attempt.paper_id = paper.pk
        attempt.save(update_fields=["paper"])


def remove_migrated_papers(apps, schema_editor):
    SavedMockExam = apps.get_model("exam_preparation", "SavedMockExam")
    MockExamPaper = apps.get_model("exam_preparation", "MockExamPaper")
    SavedMockExam.objects.update(paper=None)
    MockExamPaper.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("exam_preparation", "0020_savedmockexam_is_favorite_savedmockexam_progress"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MockExamPaper",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(default=generate_mock_exam_code, editable=False, max_length=11, unique=True)),
                ("exam_type", models.CharField(default="telc", max_length=128)),
                ("level", models.CharField(default="B1", max_length=8)),
                ("exercise_selection", models.JSONField(default=dict)),
                ("creation_method", models.CharField(choices=[("random", "Random"), ("manual", "Manual")], default="random", max_length=16)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_mock_exam_papers", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.AddField(
            model_name="savedmockexam",
            name="paper",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name="attempts", to="exam_preparation.mockexampaper"),
        ),
        migrations.RunPython(create_papers_for_existing_attempts, remove_migrated_papers),
        migrations.AlterField(
            model_name="savedmockexam",
            name="paper",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="attempts", to="exam_preparation.mockexampaper"),
        ),
    ]
