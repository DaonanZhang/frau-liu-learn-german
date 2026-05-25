from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.management.commands.import_words import (
    _parse_article,
    _parse_pos_and_flags,
)
from apps.learning_by_video.models import VideoWordOccurrence
from apps.lexicon.models import UserWordMark, WordText
from apps.lexicon.models.utils import normalize_de_text


SHEET_NAME_DEFAULT = "word"
COL_TEXT = "匹配内容"
COL_LEMMA = "Lemma"
COL_LEMMA_ALT = "lemma"
COL_ARTICLE = "词性"
COL_CATEGORY = "类别"


@dataclass(frozen=True)
class WordIdentity:
    normalized_text: str
    lemma: str
    article: str


@dataclass
class PosCandidate:
    pos_values: set[str]
    splittable: bool
    samples: list[str]


def _get_learning_by_video_data_dir() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    return Path(app_config.path) / "data"


def _iter_xlsx_paths(file_arg: str) -> Iterable[Path]:
    if file_arg:
        yield Path(file_arg)
        return

    data_dir = _get_learning_by_video_data_dir()
    for folder_name in ("raw", "processed"):
        folder = data_dir / folder_name
        if not folder.exists():
            continue
        for path in sorted(folder.glob("*.xlsx")):
            yield path


def _resolve_lemma(row: pd.Series) -> str:
    return str(row.get(COL_LEMMA, "") or row.get(COL_LEMMA_ALT, "")).strip()


def _load_pos_candidates(paths: Iterable[Path], *, words_filter: set[str]) -> tuple[dict[WordIdentity, PosCandidate], list[str]]:
    candidates: dict[WordIdentity, PosCandidate] = {}
    skipped_conflicts: list[str] = []

    for xlsx_path in paths:
        if not xlsx_path.exists():
            continue

        try:
            xls = pd.ExcelFile(xlsx_path, engine="openpyxl")
        except Exception as exc:
            skipped_conflicts.append(f"{xlsx_path.name}: failed to open xlsx ({exc})")
            continue

        sheet_name = next((name for name in xls.sheet_names if name.lower() == SHEET_NAME_DEFAULT), "")
        if not sheet_name:
            continue

        try:
            df = pd.read_excel(xlsx_path, sheet_name=sheet_name, engine="openpyxl").fillna("")
        except Exception as exc:
            skipped_conflicts.append(f"{xlsx_path.name}: failed to read word sheet ({exc})")
            continue

        if COL_TEXT not in df.columns:
            continue

        for _, row in df.iterrows():
            text = str(row.get(COL_TEXT, "")).strip()
            if not text or (words_filter and text not in words_filter):
                continue

            article_raw = str(row.get(COL_ARTICLE, "")).strip()
            category_raw = str(row.get(COL_CATEGORY, "")).strip()
            lemma = _resolve_lemma(row)
            article = _parse_article(article_raw)
            pos, splittable = _parse_pos_and_flags(category_raw, article_raw)
            if pos == WordText.POS.OTHER:
                continue

            identity = WordIdentity(
                normalized_text=normalize_de_text(text),
                lemma=lemma,
                article=article,
            )
            sample = f"{xlsx_path.name}:{text}:{category_raw or '-'}:{article_raw or '-'}->{pos}"
            existing = candidates.get(identity)
            if existing is None:
                candidates[identity] = PosCandidate(
                    pos_values={pos},
                    splittable=splittable,
                    samples=[sample],
                )
                continue

            existing.pos_values.add(pos)
            existing.splittable = existing.splittable or splittable
            if len(existing.samples) < 5:
                existing.samples.append(sample)

    for identity, candidate in list(candidates.items()):
        if len(candidate.pos_values) > 1:
            skipped_conflicts.append(
                "conflict for "
                f"{identity.normalized_text}/{identity.lemma}/{identity.article or '-'}: "
                f"pos={sorted(candidate.pos_values)} samples={candidate.samples}"
            )
            candidates.pop(identity, None)

    return candidates, skipped_conflicts


def _merge_user_word_marks(*, source_word: WordText, target_word: WordText) -> int:
    merged_count = 0

    for source_mark in source_word.user_marks.select_related("user").prefetch_related("occurrence_marks"):
        target_mark, _ = UserWordMark.objects.get_or_create(
            user=source_mark.user,
            word=target_word,
        )

        if source_mark.is_favorite and not target_mark.is_favorite:
            target_mark.is_favorite = True
            target_mark.save(update_fields=["is_favorite", "updated_at"])

        source_mark.occurrence_marks.update(user_word_mark=target_mark)
        target_mark.recompute_global_state()
        target_mark.save(update_fields=["global_state", "updated_at"])
        source_mark.delete()
        merged_count += 1

    return merged_count


class Command(BaseCommand):
    help = (
        "Repair WordText.pos values currently stored as OTHER by re-reading "
        "learning_by_video word sheets from raw/processed xlsx files."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--file",
            default="",
            help="Optional: read only one xlsx file instead of scanning data/raw and data/processed.",
        )
        parser.add_argument(
            "--word",
            action="append",
            default=[],
            help="Optional: limit the repair to specific 匹配内容 values. Repeatable.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without writing to the database.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        file_arg = str(options.get("file") or "").strip()
        words_filter = {str(word).strip() for word in options.get("word", []) if str(word).strip()}
        dry_run = bool(options.get("dry_run"))

        candidate_map, skipped_conflicts = _load_pos_candidates(
            _iter_xlsx_paths(file_arg),
            words_filter=words_filter,
        )

        other_qs = WordText.objects.filter(language="de", pos=WordText.POS.OTHER)
        if words_filter:
            other_qs = other_qs.filter(text__in=sorted(words_filter))

        updated_count = 0
        merged_word_count = 0
        merged_mark_count = 0
        unresolved_count = 0

        for word in other_qs.select_related(None):
            identity = WordIdentity(
                normalized_text=word.normalized_text,
                lemma=word.lemma,
                article=word.article or "",
            )
            candidate = candidate_map.get(identity)
            if candidate is None:
                unresolved_count += 1
                continue

            target_pos = next(iter(candidate.pos_values))
            if target_pos == WordText.POS.OTHER:
                unresolved_count += 1
                continue

            target_word = WordText.objects.filter(
                language=word.language,
                normalized_text=word.normalized_text,
                lemma=word.lemma,
                article=word.article,
                pos=target_pos,
            ).exclude(id=word.id).first()

            if target_word is None:
                self.stdout.write(
                    f"{'DRY-RUN ' if dry_run else ''}UPDATE word_id={word.id} text={word.text!r} "
                    f"{word.pos} -> {target_pos}"
                )
                updated_count += 1
                if not dry_run:
                    word.pos = target_pos
                    word.splittable = candidate.splittable
                    word.save(update_fields=["pos", "splittable"])
                continue

            self.stdout.write(
                f"{'DRY-RUN ' if dry_run else ''}MERGE source_word_id={word.id} target_word_id={target_word.id} "
                f"text={word.text!r} target_pos={target_pos}"
            )
            merged_word_count += 1
            if dry_run:
                continue

            VideoWordOccurrence.objects.filter(word=word).update(word=target_word)
            merged_mark_count += _merge_user_word_marks(source_word=word, target_word=target_word)
            if target_word.splittable != candidate.splittable:
                target_word.splittable = candidate.splittable
                target_word.save(update_fields=["splittable"])
            word.delete()

        if dry_run:
            transaction.set_rollback(True)

        for line in skipped_conflicts:
            self.stdout.write(self.style.WARNING(f"SKIP: {line}"))

        self.stdout.write(self.style.SUCCESS(
            "OK: WordText OTHER repair finished. "
            f"updated={updated_count}, merged_words={merged_word_count}, "
            f"merged_user_marks={merged_mark_count}, unresolved={unresolved_count}, "
            f"mapping_keys={len(candidate_map)}, skipped_conflicts={len(skipped_conflicts)}"
        ))
