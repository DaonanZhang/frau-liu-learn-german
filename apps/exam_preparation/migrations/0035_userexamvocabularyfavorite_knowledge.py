from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0034_examvocabularycard_collection_key"),
    ]

    operations = [
        migrations.AddField(
            model_name="userexamvocabularyfavorite",
            name="knowledge",
            field=models.CharField(
                choices=[("UNMARKED", "Unmarked"), ("KNOWN", "Known"), ("UNKNOWN", "Unknown")],
                default="UNMARKED",
                max_length=8,
            ),
        ),
    ]
