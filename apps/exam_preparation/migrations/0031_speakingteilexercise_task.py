from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exam_preparation", "0030_listeningquestion_child_answers"),
    ]

    operations = [
        migrations.AddField(
            model_name="speakingteilexercise",
            name="task",
            field=models.TextField(blank=True, default="", verbose_name="task"),
        ),
    ]
