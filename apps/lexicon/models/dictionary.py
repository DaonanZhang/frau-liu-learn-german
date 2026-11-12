from django.db import models


def normalize_dictionary_form(value):
    return value.strip().casefold()


class DictionaryEntry(models.Model):
    source = models.CharField(max_length=32)
    headword = models.CharField(max_length=255)
    normalized_headword = models.CharField(max_length=255, db_index=True)
    translation_zh = models.TextField()
    part_of_speech = models.CharField(max_length=16, blank=True, default="")
    importance = models.FloatField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("source", "headword", "translation_zh"),
                name="uniq_dictionary_entry_source_sense",
            )
        ]


class DictionaryForm(models.Model):
    entry = models.ForeignKey(DictionaryEntry, on_delete=models.CASCADE, related_name="forms")
    form = models.CharField(max_length=255)
    normalized_form = models.CharField(max_length=255, db_index=True)
    morphology_tag = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("entry", "form", "morphology_tag"),
                name="uniq_dictionary_form_entry_form_tag",
            )
        ]
