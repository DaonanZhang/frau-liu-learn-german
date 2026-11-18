from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("lexicon", "0005_userexpressionmark_userexpressionoccurrencemark_and_more")]

    operations = [
        migrations.CreateModel(
            name="DictionaryEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source", models.CharField(max_length=32)),
                ("headword", models.CharField(max_length=255)),
                ("normalized_headword", models.CharField(db_index=True, max_length=255)),
                ("translation_zh", models.TextField()),
                ("part_of_speech", models.CharField(blank=True, default="", max_length=16)),
                ("importance", models.FloatField(blank=True, null=True)),
            ],
            options={
                "constraints": [models.UniqueConstraint(fields=("source", "headword", "translation_zh"), name="uniq_dictionary_entry_source_sense")],
            },
        ),
        migrations.CreateModel(
            name="DictionaryForm",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("form", models.CharField(max_length=255)),
                ("normalized_form", models.CharField(db_index=True, max_length=255)),
                ("morphology_tag", models.CharField(blank=True, default="", max_length=64)),
                ("entry", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="forms", to="lexicon.dictionaryentry")),
            ],
            options={
                "constraints": [models.UniqueConstraint(fields=("entry", "form", "morphology_tag"), name="uniq_dictionary_form_entry_form_tag")],
            },
        ),
    ]
