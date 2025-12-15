from __future__ import annotations

from django.db import models

from .utils import normalize_de_text


class BaseLexiconText(models.Model):
    """
    Abstract base model for platform-level aggregation anchors (text-based).

    Notes:
    - Stores both raw text and a normalized_text for de-duplication / grouping.
    - Does NOT store context-specific meanings (those belong to Occurrence/Sense models).
    """
    language = models.CharField(max_length=8, default="de", db_index=True)
    text = models.TextField()  # keep flexible; subclasses may override with CharField if desired
    normalized_text = models.TextField(db_index=True, editable=False)

    level = models.CharField(max_length=16, blank=True, default="", null=True)  # A1/A2/B1...
    similar_expressions = models.TextField(blank=True, default="", null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs) -> None:
        self.normalized_text = normalize_de_text(self.text)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return (self.text or "")[:60]
