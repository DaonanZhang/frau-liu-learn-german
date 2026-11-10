from django.db import migrations


def fix_telc_c1_listening_types(apps, schema_editor):
    ListeningExercise = apps.get_model("exam_preparation", "ListeningExercise")
    mappings = {
        "LISTENING_TEIL1": "short_text_true_false_with_prep",
        "LISTENING_TEIL2": "short_text_true_false_once",
        "LISTENING_TEIL3": "dialog_true_false_twice",
    }
    for exercise_type, listening_type in mappings.items():
        ListeningExercise.objects.filter(
            exercise_base__exam_type="TELC",
            exercise_base__level="C1",
            exercise_base__exercise_type=exercise_type,
        ).update(listening_type=listening_type)


class Migration(migrations.Migration):

    dependencies = [
        ("exam_preparation", "0028_merge_20261107"),
    ]

    operations = [
        # The old value loses the original classification, so reversing could overwrite correct data.
        migrations.RunPython(fix_telc_c1_listening_types, migrations.RunPython.noop),
    ]
