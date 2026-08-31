from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("exam_preparation", "0011_speaking_teil_exercise")]

    operations = [
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
                    ("SPEAKING_TEIL1", "Speaking Teil 1"),
                    ("SPEAKING_TEIL2", "Speaking Teil 2"),
                    ("SPEAKING_TEIL3", "Speaking Teil 3"),
                    ("SPEAKING_GAP_MATCHING", "Speaking gap matching"),
                    ("SPEAKING_PROMPT_SEGMENTED", "Speaking prompt segmented"),
                ],
                db_index=True,
                max_length=64,
                verbose_name="exercise type",
            ),
        ),
    ]
