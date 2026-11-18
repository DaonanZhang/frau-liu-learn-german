from django.db import migrations, models


def backfill_collection_keys(apps, schema_editor):
    Card = apps.get_model("exam_preparation", "ExamVocabularyCard")
    for card in Card.objects.all().only("pk", "exam_type", "level").iterator():
        Card.objects.filter(pk=card.pk).update(
            collection_key=f"exam:{card.exam_type}:{card.level}"
        )


class Migration(migrations.Migration):
    dependencies = [("exam_preparation", "0033_normalize_vocabulary_unicode")]

    operations = [
        migrations.AddField(
            model_name="examvocabularycard",
            name="collection_key",
            field=models.CharField(default="", max_length=255),
        ),
        migrations.RunPython(backfill_collection_keys, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="examvocabularycard",
            name="exam_vocab_card_identity_uq",
        ),
        migrations.AddConstraint(
            model_name="examvocabularycard",
            constraint=models.UniqueConstraint(
                fields=("collection_key", "normalized_term", "translation_zh"),
                name="exam_vocab_card_identity_uq",
            ),
        ),
        migrations.AlterField(
            model_name="examvocabularycard",
            name="collection_key",
            field=models.CharField(max_length=255),
        ),
    ]
