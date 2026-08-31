from django.db import migrations, models


LISTENING_EXERCISE_TYPE_BY_LISTENING_TYPE = {
    "short_text_true_false_with_prep": "LISTENING_TEIL1",
    "short_text_true_false_once": "LISTENING_TEIL2",
    "dialog_true_false_twice": "LISTENING_TEIL3",
}


def split_existing_listening_types(apps, schema_editor):
    exercise_base = apps.get_model("exam_preparation", "ExerciseBase")
    listening_exercise = apps.get_model("exam_preparation", "ListeningExercise")

    for listening in listening_exercise.objects.select_related("exercise_base").all():
        new_type = LISTENING_EXERCISE_TYPE_BY_LISTENING_TYPE.get(listening.listening_type)
        if new_type and listening.exercise_base.exercise_type == "LISTENING_CHOICE":
            listening.exercise_base.exercise_type = new_type
            listening.exercise_base.save(update_fields=["exercise_type"])


def merge_listening_types(apps, schema_editor):
    exercise_base = apps.get_model("exam_preparation", "ExerciseBase")
    exercise_base.objects.filter(
        exercise_type__in=["LISTENING_TEIL1", "LISTENING_TEIL2", "LISTENING_TEIL3"]
    ).update(exercise_type="LISTENING_CHOICE")


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0009_userwritingexercisestate_time_spent_seconds"),
    ]

    operations = [
        migrations.RunPython(split_existing_listening_types, merge_listening_types),
        migrations.AlterField(
            model_name="exercisebase",
            name="exercise_type",
            field=models.CharField(
                choices=[
                    ("LISTENING_TEIL1", "Listening Teil 1"),
                    ("LISTENING_TEIL2", "Listening Teil 2"),
                    ("LISTENING_TEIL3", "Listening Teil 3"),
                    ("READING_TITLE_MATCHING", "Reading title matching"),
                    ("READING_UNDERSTANDING", "Reading understanding"),
                    ("READING_AD_MATCHING", "Reading ad matching"),
                    ("CLOZE_CHOICE", "Cloze choice"),
                    ("CLOZE_MATCHING", "Cloze matching"),
                    ("WRITING_PROMPT", "Writing prompt"),
                    ("SPEAKING_GAP_MATCHING", "Speaking gap matching"),
                    ("SPEAKING_PROMPT_SEGMENTED", "Speaking prompt segmented"),
                ],
                db_index=True,
                max_length=64,
                verbose_name="exercise type",
            ),
        ),
    ]
