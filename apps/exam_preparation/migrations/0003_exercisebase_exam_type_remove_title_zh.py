from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0002_listeningexercise_listening_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="exercisebase",
            name="exam_type",
            field=models.CharField(
                blank=True,
                db_index=True,
                default="",
                help_text="Exam family or certificate type, for example Goethe-Zertifikat B1 or telc B1.",
                max_length=128,
                verbose_name="exam type",
            ),
        ),
        migrations.RemoveField(
            model_name="exercisebase",
            name="title_zh",
        ),
        migrations.AddIndex(
            model_name="exercisebase",
            index=models.Index(fields=["exam_type"], name="exam_prep_base_exam_type_idx"),
        ),
    ]
