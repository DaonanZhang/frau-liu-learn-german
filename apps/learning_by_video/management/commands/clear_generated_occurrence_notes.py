from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.models import VideoExpressionOccurrence, VideoWordOccurrence


PREFIX = "article="


class Command(BaseCommand):
    help = (
        "Clear occurrence notes that were previously auto-generated in the "
        "'article=...; category=...; lemma=...' format."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--mode", choices=["validate", "apply"], default="validate")

    def handle(self, *args: Any, **options: Any) -> None:
        mode = str(options["mode"])

        word_qs = VideoWordOccurrence.objects.filter(note__startswith=PREFIX)
        expr_qs = VideoExpressionOccurrence.objects.filter(note__startswith=PREFIX)

        word_count = word_qs.count()
        expr_count = expr_qs.count()

        with transaction.atomic():
            if mode == "apply":
                word_qs.update(note="")
                expr_qs.update(note="")
            else:
                transaction.set_rollback(True)

        self.stdout.write(f"mode={mode}")
        self.stdout.write(f"word occurrences cleared/planned: {word_count}")
        self.stdout.write(f"expression occurrences cleared/planned: {expr_count}")
