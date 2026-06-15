from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="listeningexercise",
            name="listening_type",
            field=models.CharField(
                choices=[
                    ("short_text_true_false_with_prep", "Short texts true/false with prep time"),
                    ("short_text_true_false_once", "Short texts true/false once"),
                    ("dialog_true_false_twice", "Dialog true/false twice"),
                ],
                db_index=True,
                default="short_text_true_false_with_prep",
                max_length=64,
                verbose_name="listening type",
            ),
        ),
    ]
