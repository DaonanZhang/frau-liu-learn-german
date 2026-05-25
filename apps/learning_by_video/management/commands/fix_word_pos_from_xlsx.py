from __future__ import annotations

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
from apps.learning_by_video.management.commands.import_xlsx_all import _resolve_video_id_from_xlsx
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


# These entries are intentionally file-scoped, not global by word,
# because the same lemma legitimately appears with different POS in
# different learning videos.
HARD_CODED_POS_BY_FILE_AND_TEXT: dict[tuple[str, str], str] = {
    ("Folge_12.xlsx", "gleichzeitig"): WordText.POS.ADJ,
    ("【008】功能性合租.xlsx", "gleichzeitig"): WordText.POS.ADV,
    ("【015】毛线是怎么变成彩色的？.xlsx", "gleichzeitig"): WordText.POS.ADV,
    ("【030】社交媒体的改变（1）.xlsx", "gleichzeitig"): WordText.POS.ADV,
    ("Folge_17.xlsx", "gründlich"): WordText.POS.ADJ,
    ("【015】毛线是怎么变成彩色的？.xlsx", "gründlich"): WordText.POS.ADV,
    ("Folge_5.xlsx", "ständig"): WordText.POS.ADV,
    ("【017】Dropbox兴衰史 (1).xlsx", "ständig"): WordText.POS.ADJ,
    ("【041】小孩应该被允许用手机吗（1）.xlsx", "ständig"): WordText.POS.ADV,
    ("【049】大众汽车 - 军工技术取代汽车？.xlsx", "ständig"): WordText.POS.ADV,
    ("Folge_5.xlsx", "gestresst"): WordText.POS.ADJ,
    ("【043】德国双元制引进印度学生.xlsx", "gestresst"): WordText.POS.VERB,
    ("Folge_6.xlsx", "persönlich"): WordText.POS.ADV,
    ("【008】功能性合租.xlsx", "persönlich"): WordText.POS.ADJ,
    ("Folge_8.xlsx", "offensichtlich"): WordText.POS.ADJ,
    ("【038】晚育：在生育想法与偏见之间（2）.xlsx", "offensichtlich"): WordText.POS.ADV,
    ("Folge_8.xlsx", "pünktlich"): WordText.POS.ADV,
    ("【043】德国双元制引进印度学生.xlsx", "pünktlich"): WordText.POS.ADJ,
    ("【011】ETF是什么？.xlsx", "vertreten"): WordText.POS.VERB,
    ("德语资料符号刘000.xlsx", "vertreten"): WordText.POS.ADJ,
    ("【019】为什么Bettina一直坚持做书籍装订.xlsx", "wahnsinnig"): WordText.POS.ADJ,
    ("【027】我们的饮食习惯是怎么来的？（2）.xlsx", "wahnsinnig"): WordText.POS.ADV,
    ("【020】在慕尼黑生活不起：为什么它这么贵（1）.xlsx", "emotional"): WordText.POS.ADJ,
    ("【029】人工智能动物园.xlsx", "emotional"): WordText.POS.ADV,
    ("【028】求职简历该怎么写.xlsx", "ehrlich"): WordText.POS.ADJ,
    ("【035】器官捐献后：这是莎拉移植后的恢复情况（2）.xlsx", "ehrlich"): WordText.POS.ADV,
}
HARD_CODED_CONFLICT_NORMALIZED_TEXTS = {
    normalize_de_text(text)
    for (_file_name, text) in HARD_CODED_POS_BY_FILE_AND_TEXT
}


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


def _load_pos_candidates(
    paths: Iterable[Path],
    *,
    words_filter: set[str],
) -> tuple[
    dict[WordIdentity, PosCandidate],
    dict[tuple[WordIdentity, int], PosCandidate],
    list[str],
]:
    candidates: dict[WordIdentity, PosCandidate] = {}
    candidates_by_video: dict[tuple[WordIdentity, int], PosCandidate] = {}
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

        video_id: int | None = None
        try:
            video_id = _resolve_video_id_from_xlsx(xlsx_path)
        except Exception:
            video_id = None

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
            override_pos = HARD_CODED_POS_BY_FILE_AND_TEXT.get((xlsx_path.name, text))
            if override_pos:
                pos = override_pos
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
            else:
                existing.pos_values.add(pos)
                existing.splittable = existing.splittable or splittable
                if len(existing.samples) < 5:
                    existing.samples.append(sample)

            if video_id is not None:
                video_key = (identity, video_id)
                video_existing = candidates_by_video.get(video_key)
                if video_existing is None:
                    candidates_by_video[video_key] = PosCandidate(
                        pos_values={pos},
                        splittable=splittable,
                        samples=[sample],
                    )
                else:
                    video_existing.pos_values.add(pos)
                    video_existing.splittable = video_existing.splittable or splittable
                    if len(video_existing.samples) < 5:
                        video_existing.samples.append(sample)

    for identity, candidate in list(candidates.items()):
        if len(candidate.pos_values) > 1:
            if identity.normalized_text not in HARD_CODED_CONFLICT_NORMALIZED_TEXTS:
                skipped_conflicts.append(
                    "conflict for "
                    f"{identity.normalized_text}/{identity.lemma}/{identity.article or '-'}: "
                    f"pos={sorted(candidate.pos_values)} samples={candidate.samples}"
                )
            candidates.pop(identity, None)

    for video_key, candidate in list(candidates_by_video.items()):
        if len(candidate.pos_values) > 1:
            skipped_conflicts.append(
                "video-conflict for "
                f"{video_key[0].normalized_text}/video={video_key[1]}: "
                f"pos={sorted(candidate.pos_values)} samples={candidate.samples}"
            )
            candidates_by_video.pop(video_key, None)

    return candidates, candidates_by_video, skipped_conflicts


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

        candidate_map, candidate_map_by_video, skipped_conflicts = _load_pos_candidates(
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
            candidate = None
            occ_video_ids = list(
                VideoWordOccurrence.objects.filter(word=word)
                .values_list("video_id", flat=True)
                .distinct()
            )
            if occ_video_ids:
                matched_video_candidates = [
                    candidate_map_by_video[(identity, video_id)]
                    for video_id in occ_video_ids
                    if (identity, video_id) in candidate_map_by_video
                ]
                matched_pos_values = {
                    next(iter(item.pos_values))
                    for item in matched_video_candidates
                    if len(item.pos_values) == 1
                }
                if len(matched_pos_values) == 1:
                    candidate = matched_video_candidates[0]

            if candidate is None:
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
