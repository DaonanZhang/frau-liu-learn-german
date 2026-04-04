from django.db import migrations


def backfill_question_category(apps, schema_editor):
    VideoExerciseQuestion = apps.get_model("learning_by_video", "VideoExerciseQuestion")
    VideoExerciseQuestion.objects.update(category="listening")


class Migration(migrations.Migration):

    dependencies = [
        ("learning_by_video", "0012_videoexercisequestion_category_and_explanation"),
    ]

    operations = [
        migrations.RunPython(
            backfill_question_category,
            migrations.RunPython.noop,
        ),
    ]
