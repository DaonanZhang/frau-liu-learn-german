from django.db import migrations
from django.db.models import Q


def backfill_blank_exam_type(apps, schema_editor):
    exercise_base = apps.get_model("exam_preparation", "ExerciseBase")
    exercise_base.objects.filter(Q(exam_type="") | Q(exam_type__isnull=True)).update(
        exam_type="telc"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0005_alter_exercisebase_exercise_type_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_blank_exam_type, migrations.RunPython.noop),
    ]
