from django.db import migrations


def update_writing_word_limit(apps, schema_editor):
    writing_exercise = apps.get_model("exam_preparation", "WritingExercise")
    writing_exercise.objects.filter(words_limit=120).update(words_limit=80)


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0016_add_question_level_explanations"),
    ]

    operations = [
        migrations.RunPython(update_writing_word_limit, migrations.RunPython.noop),
    ]
