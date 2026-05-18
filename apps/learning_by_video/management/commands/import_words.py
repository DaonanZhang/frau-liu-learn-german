from __future__ import annotations

import re
from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandParser
from django.db import IntegrityError
from django.db import transaction

from apps.learning_by_video.models import Subtitle, Video, VideoWordOccurrence
from apps.lexicon.models import WordText
from apps.lexicon.models.utils import normalize_de_text


SHEET_NAME_DEFAULT = "word"

COL_TEXT = "匹配内容"
COL_LEMMA = "Lemma"
COL_LEMMA_ALT = "lemma"
COL_LINKED_SUBTITLE = "linked subtitle"
COL_LINKED_SUBTITLE_ALT = "linked sub"
COL_TRANSLATION = "翻译"
COL_ARTICLE = "词性"
COL_CATEGORY = "类别"
COL_SUBTITLE_ID = "ID"
COL_SELECTED_TEXT = "原文选中"
COL_SELECTED_TEXT_ALT = "内容选中"
COL_NOTE = "附注"


def _to_str(v: object) -> str:
    return str(v).strip()


def _parse_article(raw: str) -> str:
    """
    Map CSV '词性' column (der/die/das/pl./empty) to WordText.Article values.
    """
    s = (raw or "").strip().lower()
    if s == "der":
        return WordText.Article.DER
    if s == "die":
        return WordText.Article.DIE
    if s == "das":
        return WordText.Article.DAS
    if s in {"pl.", "pl", "plural"}:
        return WordText.Article.PLURAL
    return WordText.Article.NONE


def _parse_pos_and_flags(category_raw: str) -> tuple[str, bool]:
    """
    Map CSV '类别' to WordText.POS and splittable.
    Examples:
      - "n." -> NOUN
      - "adj." -> ADJ
      - "adv." -> ADV
      - "vt." / "vi." -> VERB
      - "vt.,trennbar" -> VERB + splittable True
    """
    s = (category_raw or "").strip().lower()

    splittable = "trennbar" in s

    # normalize separators
    parts = [p.strip() for p in re.split(r"[,\s]+", s) if p.strip()]

    # prioritize noun/adj/adv
    if any(p == "n." or p == "n" for p in parts):
        return WordText.POS.NOUN, splittable
    if any(p in {"adj.", "adj"} for p in parts):
        return WordText.POS.ADJ, splittable
    if any(p in {"adv.", "adv"} for p in parts):
        return WordText.POS.ADV, splittable

    # verbs
    if any(p in {"v.", "v", "vt.", "vt", "vi.", "vi"} for p in parts):
        return WordText.POS.VERB, splittable

    # fallback: if contains typical verb markers
    if "vt" in parts or "vi" in parts:
        return WordText.POS.VERB, splittable

    return WordText.POS.OTHER, splittable


def _parse_int_like(value: object) -> int:
    """
    Accepts '12', '12.0', 12
    """
    s = str(value).strip()
    if not s:
        raise ValueError("empty id")
    try:
        return int(float(s))
    except ValueError as e:
        raise ValueError(f"invalid integer-like value: {value!r}") from e


def _get_or_create_wordtext(
    *,
    text: str,
    lemma: str,
    pos: str,
    article: str,
    splittable: bool,
) -> tuple[WordText, bool]:
    """
    Resolve/create WordText by the same identity as DB unique constraint:
    (language, normalized_text, lemma, pos, article).
    """
    normalized_text = normalize_de_text(text)
    qs = WordText.objects.filter(
        language="de",
        normalized_text=normalized_text,
        lemma=lemma,
        pos=pos,
        article=article,
    )
    existing = qs.first()
    if existing is not None:
        return existing, False

    try:
        created = WordText.objects.create(
            language="de",
            text=text,
            lemma=lemma,
            pos=pos,
            article=article,
            splittable=splittable,
        )
        return created, True
    except IntegrityError:
        # Concurrent/competing create in same normalized key.
        existing = qs.first()
        if existing is None:
            raise
        return existing, False


class Command(BaseCommand):
    help = "Import WordText + VideoWordOccurrence from an XLSX sheet."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", required=True, help="Path to xlsx file")
        parser.add_argument("--video-id", type=int, required=True, help="Target Video PK")
        parser.add_argument("--sheet", default=SHEET_NAME_DEFAULT, help="Sheet name (default: word)")
        parser.add_argument(
            "--no-move",
            action="store_true",
            help="Do not move the xlsx file (used by import_xlsx_all).",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        xlsx_path = Path(options["file"])
        video_id: int = options["video_id"]
        sheet: str = options["sheet"]

        if not xlsx_path.exists():
            raise FileNotFoundError(str(xlsx_path))

        video = Video.objects.get(pk=video_id)

        df = pd.read_excel(xlsx_path, sheet_name=sheet, engine="openpyxl").fillna("")

        required = {
            COL_TEXT,
            COL_TRANSLATION,
            COL_ARTICLE,
            COL_CATEGORY,
            COL_SUBTITLE_ID,
        }
        missing = required - set(df.columns)
        has_linked_sub = any(col in df.columns for col in (COL_LINKED_SUBTITLE, COL_LINKED_SUBTITLE_ALT))
        has_lemma = any(col in df.columns for col in (COL_LEMMA, COL_LEMMA_ALT))
        if missing or not has_lemma or not has_linked_sub:
            if not has_lemma:
                missing = set(missing)
                missing.add("Lemma/lemma")
            if not has_linked_sub:
                missing = set(missing)
                missing.add("linked subtitle/linked sub")
            raise ValueError(f"Missing columns in sheet {sheet!r}: {sorted(missing)}")

        # Normalize columns to strings
        for col in required:
            df[col] = df[col].map(_to_str)
        if COL_SELECTED_TEXT in df.columns:
            df[COL_SELECTED_TEXT] = df[COL_SELECTED_TEXT].map(_to_str)
        if COL_SELECTED_TEXT_ALT in df.columns:
            df[COL_SELECTED_TEXT_ALT] = df[COL_SELECTED_TEXT_ALT].map(_to_str)
        if COL_NOTE in df.columns:
            df[COL_NOTE] = df[COL_NOTE].map(_to_str)
        # Normalize lemma column (support both "Lemma" and "lemma")
        if COL_LEMMA in df.columns:
            df[COL_LEMMA] = df[COL_LEMMA].map(_to_str)
        if COL_LEMMA_ALT in df.columns:
            df[COL_LEMMA_ALT] = df[COL_LEMMA_ALT].map(_to_str)

        # Sort by subtitle id then by text for stable runs
        df = df.sort_values(by=[COL_SUBTITLE_ID, COL_TEXT])

        # Preload subtitles for this video by external_id (sheet "ID")
        subtitles_by_external_id: dict[int, Subtitle] = {
            int(s.external_id): s
            for s in Subtitle.objects.filter(video=video, external_id__isnull=False)
            .only("id", "external_id", "start", "end", "content")
        }
        subtitles_by_content: dict[str, Subtitle] = {}
        for s in subtitles_by_external_id.values():
            # content is assumed unique enough per video for fallback; if duplicates exist, ID is the source of truth
            subtitles_by_content[s.content.strip()] = s

        created_words = 0
        updated_words = 0
        created_occ = 0
        updated_occ = 0
        skipped = 0

        for idx, row in df.iterrows():
            text = row[COL_TEXT]
            lemma = row.get(COL_LEMMA, "") or row.get(COL_LEMMA_ALT, "")
            linked_subtitle_text = row.get(COL_LINKED_SUBTITLE, "") or row.get(COL_LINKED_SUBTITLE_ALT, "")
            translation = row[COL_TRANSLATION]
            article_raw = row[COL_ARTICLE]
            category_raw = row[COL_CATEGORY]
            subtitle_id_raw = row[COL_SUBTITLE_ID]
            selected_text = row.get(COL_SELECTED_TEXT, "") or row.get(COL_SELECTED_TEXT_ALT, "")
            note = row.get(COL_NOTE, "")

            if not text or not subtitle_id_raw:
                skipped += 1
                continue

            subtitle_external_id = _parse_int_like(subtitle_id_raw)

            subtitle = subtitles_by_external_id.get(subtitle_external_id)
            if subtitle is None:
                # fallback: try matching by content string
                subtitle = subtitles_by_content.get(linked_subtitle_text.strip())

            if subtitle is None:
                raise ValueError(
                    f"Row {idx}: subtitle not found. "
                    f"external_id={subtitle_external_id!r}, linked subtitle={linked_subtitle_text!r}. "
                    f"Import subtitles first and ensure IDs match."
                )

            article = _parse_article(article_raw)
            pos, splittable = _parse_pos_and_flags(category_raw)

            # WordText: aggregation anchor
            # We use get_or_create by its unique fields.
            word_obj, was_created = _get_or_create_wordtext(
                text=text,
                lemma=lemma,
                pos=pos,
                article=article,
                splittable=splittable,
            )
            if was_created:
                created_words += 1
            else:
                # Keep splittable in sync if needed
                if word_obj.splittable != splittable:
                    word_obj.splittable = splittable
                    word_obj.save(update_fields=["splittable"])
                    updated_words += 1

            # Occurrence: attach to video+subtitle timeline.
            # Idempotency key: (video, subtitle, word, time_start)
            time_start = float(subtitle.start)
            time_end = float(subtitle.end)

            occ, occ_created = VideoWordOccurrence.objects.update_or_create(
                video=video,
                subtitle=subtitle,
                word=word_obj,
                time_start=time_start,
                defaults={
                    "time_end": time_end,
                    "translation": translation,
                    "note": note,
                    "selected_text": selected_text,
                },
            )

            if occ_created:
                created_occ += 1
            else:
                updated_occ += 1

        self.stdout.write(self.style.SUCCESS(
            "OK: words imported. "
            f"WordText created={created_words}, updated={updated_words}; "
            f"VideoWordOccurrence created={created_occ}, updated={updated_occ}; "
            f"skipped={skipped}"
        ))
