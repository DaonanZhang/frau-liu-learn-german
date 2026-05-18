from __future__ import annotations

from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandParser
from django.db import IntegrityError
from django.db import transaction

from apps.learning_by_video.models import Subtitle, Video, VideoExpressionOccurrence
from apps.lexicon.models import ExpressionText
from apps.lexicon.models.utils import normalize_de_text


SHEET_NAME_DEFAULT = "expression"

COL_TEXT = "匹配内容"
COL_PROTOTYPE = "原型"
COL_LINKED_SUBTITLE = "linked subtitle"
COL_TRANSLATION = "翻译"
COL_SUBTITLE_ID = "ID"
COL_SELECTED_TEXT = "原文选中"
COL_SELECTED_TEXT_ALT = "内容选中"
COL_NOTE = "附注"


class Command(BaseCommand):
    help = "Import ExpressionText + VideoExpressionOccurrence from an XLSX sheet."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", required=True, help="Path to the xlsx file")
        parser.add_argument("--video-id", type=int, required=True, help="Target Video PK")
        parser.add_argument("--sheet", default=SHEET_NAME_DEFAULT, help="Sheet name (default: expression)")
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

        required = {COL_TEXT, COL_PROTOTYPE, COL_LINKED_SUBTITLE, COL_TRANSLATION, COL_SUBTITLE_ID}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing columns in sheet {sheet!r}: {sorted(missing)}")

        if COL_SELECTED_TEXT in df.columns:
            df[COL_SELECTED_TEXT] = df[COL_SELECTED_TEXT].map(lambda x: str(x).strip())
        if COL_SELECTED_TEXT_ALT in df.columns:
            df[COL_SELECTED_TEXT_ALT] = df[COL_SELECTED_TEXT_ALT].map(lambda x: str(x).strip())
        if COL_NOTE in df.columns:
            df[COL_NOTE] = df[COL_NOTE].map(lambda x: str(x).strip())

        created_text = 0
        updated_text = 0
        created_occ = 0
        updated_occ = 0
        skipped = 0

        for idx, row in df.iterrows():
            text = str(row[COL_TEXT]).strip()
            prototype = str(row[COL_PROTOTYPE]).strip()
            linked_sub = str(row[COL_LINKED_SUBTITLE]).strip()
            translation = str(row[COL_TRANSLATION]).strip()
            subtitle_id_raw = str(row[COL_SUBTITLE_ID]).strip()
            selected_text = (
                str(row.get(COL_SELECTED_TEXT, "")).strip()
                or str(row.get(COL_SELECTED_TEXT_ALT, "")).strip()
            )
            note = str(row.get(COL_NOTE, "")).strip()

            if not text or not subtitle_id_raw:
                skipped += 1
                continue

            try:
                subtitle_external_id = int(float(subtitle_id_raw))  # handles "22" or "22.0"
            except ValueError as e:
                raise ValueError(f"Row {idx}: invalid subtitle ID: {subtitle_id_raw!r}") from e

            # Safety: ensure subtitle belongs to the given video
            subtitle = (
                Subtitle.objects.filter(external_id=subtitle_external_id, video=video)
                .only("id", "start", "end")
                .first()
            )
            if subtitle is None:
                raise ValueError(
                    f"Row {idx}: Subtitle external_id={subtitle_external_id} not found for video_id={video_id}. "
                    f"Import subtitles first or check IDs."
                )

            # 1) ExpressionText (anchor)
            normalized_text = normalize_de_text(text)
            expr_obj = ExpressionText.objects.filter(
                language="de",
                normalized_text=normalized_text,
            ).first()
            was_created = False
            if expr_obj is None:
                try:
                    expr_obj = ExpressionText.objects.create(
                        text=text,
                        prototype=prototype,
                    )
                    was_created = True
                except IntegrityError:
                    expr_obj = ExpressionText.objects.filter(
                        language="de",
                        normalized_text=normalized_text,
                    ).first()
                    if expr_obj is None:
                        raise
            if was_created:
                created_text += 1
            else:
                # Update prototype if provided and changed (optional but useful)
                if prototype and expr_obj.prototype != prototype:
                    expr_obj.prototype = prototype
                    expr_obj.save(update_fields=["prototype"])
                    updated_text += 1

            # 2) VideoExpressionOccurrence
            # Use a stable lookup key to make import idempotent:
            # same video + same subtitle + same expression + same time window = same occurrence
            occ_defaults = {
                "time_start": float(subtitle.start),
                "time_end": float(subtitle.end),
                "translation": translation,
                "example": linked_sub,  # "When could this expression be used"
                "meaning": "",          # not provided in this sheet
                "note": note,
                "selected_text": selected_text,
            }

            occ, occ_created = VideoExpressionOccurrence.objects.update_or_create(
                video=video,
                subtitle=subtitle,
                expression=expr_obj,
                time_start=occ_defaults["time_start"],
                defaults=occ_defaults,
            )
            if occ_created:
                created_occ += 1
            else:
                updated_occ += 1

        self.stdout.write(self.style.SUCCESS(
            "OK: expressions imported. "
            f"ExpressionText created={created_text}, updated={updated_text}; "
            f"Occurrences created={created_occ}, updated={updated_occ}; skipped={skipped}"
        ))
