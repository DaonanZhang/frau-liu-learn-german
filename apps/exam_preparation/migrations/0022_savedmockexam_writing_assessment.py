from django.db import migrations, models


def migrate_legacy_writing_grades(apps, schema_editor):
    SavedMockExam = apps.get_model("exam_preparation", "SavedMockExam")
    for attempt in SavedMockExam.objects.exclude(writing_grade="").iterator():
        grade = attempt.writing_grade
        if grade not in {"A", "B", "C", "D"}:
            continue
        attempt.writing_assessment = {
            "topic_relevant": True,
            "task_completion": grade,
            "communicative_design": grade,
            "formal_accuracy": grade,
        }
        attempt.save(update_fields=["writing_assessment"])


class Migration(migrations.Migration):

    dependencies = [
        ("exam_preparation", "0021_mock_exam_papers"),
    ]

    operations = [
        migrations.AddField(
            model_name="savedmockexam",
            name="writing_assessment",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(migrate_legacy_writing_grades, migrations.RunPython.noop),
    ]
