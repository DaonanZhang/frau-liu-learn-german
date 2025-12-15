from __future__ import annotations

from django.db import models


class AbstractLexiconItem(models.Model):
    """
    Base model for lexicon items that can be linked to a subtitle.
    """
    content = models.TextField()
    translation = models.TextField(blank=True, default="")

    linked_subtitle = models.ForeignKey(
        "learning.Subtitle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_items",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True

    def __str__(self) -> str:
        return self.content[:9999]


class Word(AbstractLexiconItem):
    lemma = models.CharField(max_length=128, blank=True, default="")
    level = models.CharField(max_length=16, blank=True, default="")
    text = models.CharField(max_length=128, db_index=True)

    def save(self, *args, **kwargs) -> None:
        if not self.content:
            self.content = self.text
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.text


class Sentence(AbstractLexiconItem):
    level = models.CharField(max_length=16, blank=True, default="")


class AuthenticExpression(AbstractLexiconItem):
    meaning = models.TextField(blank=True, default="")
    example = models.TextField(blank=True, default="")
