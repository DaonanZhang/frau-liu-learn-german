from __future__ import annotations

from django.db import models

from .base import BaseLexiconText


class WordText(BaseLexiconText):
    """
    Aggregation anchor for a word token.
    """
    class Article(models.TextChoices):
        DER = "der", "der"
        DIE = "die", "die"
        DAS = "das", "das"
        PLURAL = "plural", "plural"
        NONE = "", ""

    # 'gehen' is the lemma of 'geht' and 'ging'
    lemma = models.CharField(max_length=128, blank=True, default="")
    # der/die/das (grammatical gender/article)
    article = models.CharField(max_length=10, choices=Article.choices, blank=True, default="", db_index=True, null=True)

    # optional: part of speech (keep minimal; you can expand later)
    class POS(models.TextChoices):
        NOUN = "NOUN", "Noun"
        VERB = "VERB", "Verb"
        ADJ = "ADJ", "Adjective"
        ADV = "ADV", "Adverb"
        PRON = "PRON", "Pronoun"
        PREP = "PREP", "Preposition"
        CONJ = "CONJ", "Conjunction"
        DET = "DET", "Determiner"
        PART = "PART", "Particle"
        INTJ = "INTJ", "Interjection"
        OTHER = "OTHER", "Other"

    pos = models.CharField(max_length=16, choices=POS.choices, blank=True, default="", db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["language", "normalized_text", "lemma", "pos", "article"],
                name="uniq_wordtext",
            )
        ]


class SentenceText(BaseLexiconText):
    """
    Aggregation anchor for a sentence text.
    """
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["language", "normalized_text"],
                name="uniq_sentencetext",
            )
        ]


class ExpressionText(BaseLexiconText):
    """
    Aggregation anchor for an authentic expression / phrase.
    Expressions are usually shorter than sentences, but still fine with TextField.
    """

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["language", "normalized_text"],
                name="uniq_expressiontext",
            )
        ]
