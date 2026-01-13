from __future__ import annotations

import re
from pathlib import Path

import pandas as pd
from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.models import Subtitle, Video


def _get_learning_by_video_data_dir() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    return Path(app_config.path) / "data"


_TIME_RE = re.compile(
    r"^\s*(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?\s*$"
)


def _parse_srt_time_to_seconds(value: str) -> float:
    """
    Parse times like:
      00:00:00,366
      00:00:03,466
      00:00:11.500
      0:01:02,5

    Returns seconds as float.
    """
    s = (value or "").strip()
    m = _TIME_RE.match(s)
    if not m:
        raise ValueError(f"Invalid time format: {value!r}")

    hh = int(m.group(1))
    mm = int(m.group(2))
    ss = int(m.group(3))
    ms_raw = m.group(4) or "0"

    # normalize milliseconds to 3 digits
    if len(ms_raw) == 1:
        ms = int(ms_raw) * 100
    elif len(ms_raw) == 2:
        ms = int(ms_raw) * 10
    else:
        ms = int(ms_raw[:3])

    total = hh * 3600 + mm * 60 + ss + ms / 1000.0
    # avoid float noise
    return round(total, 3)


class Command(BaseCommand):
    help = "Import subtitles from an XLSX sheet into learning_by_video.Subtitle."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--file",
            required=True,
            help="Path to xlsx file (usually under apps/learning_by_video/data/raw/).",
        )
        parser.add_argument(
            "--video-id",
            type=int,
            required=True,
            help="Target Video PK to attach subtitle to.",
        )
        parser.add_argument(
            "--sheet",
            default="subtitle",
            help="Sheet name containing subtitle (default: subtitle).",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        path = Path(options["file"])
        video_id: int = options["video_id"]
        sheet_name: str = options["sheet"]

        if not path.exists():
            raise FileNotFoundError(str(path))

        video = Video.objects.get(pk=video_id)

        df = pd.read_excel(path, sheet_name=sheet_name, engine="openpyxl").fillna("")

        # Your columns:
        # 开始时间 结束时间 德文 中文 ID
        required = {"开始时间", "结束时间", "德文", "中文"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"{path.name}: Missing columns in sheet {sheet_name!r}: {sorted(missing)}")

        created = 0
        updated = 0
        skipped = 0

        # If you want stable ordering, you can sort by ID if present
        if "ID" in df.columns:
            try:
                df = df.sort_values(by=["ID"])
            except Exception:
                pass

        for idx, row in df.iterrows():
            start_raw = str(row["开始时间"]).strip()
            end_raw = str(row["结束时间"]).strip()
            de = str(row["德文"]).strip()
            zh = str(row["中文"]).strip()

            if not start_raw or not end_raw or not de:
                skipped += 1
                continue

            start = _parse_srt_time_to_seconds(start_raw)
            end = _parse_srt_time_to_seconds(end_raw)

            if end < start:
                raise ValueError(f"Row {idx}: end < start ({end_raw} < {start_raw})")

            obj, was_created = Subtitle.objects.update_or_create(
                video=video,
                start=start,
                end=end,
                defaults={
                    "content": de,
                    "translation": zh,
                },
            )

            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"OK: subtitles imported for video={video_id} | created={created}, updated={updated}, skipped={skipped}"
        ))
