from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd
from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.models import Video


SHEET_NAME = "video description"

# Expected columns in the sheet
COL_TITLE = "标题"
COL_CREATOR = "创作者"
COL_DIFFICULTY = "难度"
COL_TAGS = "tags"
COL_DESC = "简介"
COL_DURATION = "时长"


def _get_learning_by_video_data_dir() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    return Path(app_config.path) / "data"


def _parse_duration_to_seconds(raw: str) -> int:
    """
    Parse a duration string into seconds.

    Supported inputs:
    - "3min" / "3 min" -> 180
    - "03:20" -> 200
    - "3分钟" / "3分" -> 180
    - "3" -> 180 (fallback: minutes)

    Args:
        raw: Duration string from the sheet.

    Returns:
        Duration in seconds. Returns 0 if empty or unparseable.
    """
    s = (raw or "").strip()
    if not s:
        return 0

    # mm:ss
    m = re.match(r"^\s*(\d{1,3})\s*:\s*(\d{1,2})\s*$", s)
    if m:
        minutes = int(m.group(1))
        seconds = int(m.group(2))
        return minutes * 60 + seconds

    # 3min / 3 min
    m = re.match(r"^\s*(\d+)\s*min\s*$", s, flags=re.IGNORECASE)
    if m:
        return int(m.group(1)) * 60

    # 3分钟 / 3分
    m = re.match(r"^\s*(\d+)\s*分(钟)?\s*$", s)
    if m:
        return int(m.group(1)) * 60

    # fallback: first integer -> minutes
    m = re.search(r"(\d+)", s)
    if m:
        return int(m.group(1)) * 60

    return 0


def _parse_tags(raw: str) -> list[str]:
    """
    Parse tags from a sheet cell.

    Supported inputs:
    - JSON list: ["金融","投资"]
    - Fancy quotes JSON-like: [“金融“，“投资”]
    - Fallback: comma-separated list

    Args:
        raw: Tags cell string.

    Returns:
        A list of tags (strings). Returns an empty list if no tags found.
    """
    s = (raw or "").strip()
    if not s:
        return []

    # Normalize fancy quotes to standard JSON quotes
    s = (
        s.replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
    )

    try:
        data = json.loads(s)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except json.JSONDecodeError:
        pass

    # fallback: split by commas
    s = s.strip().strip("[]")
    parts = [p.strip().strip('"').strip("'") for p in s.split(",")]
    return [p for p in parts if p]


def _slugify_filename(text: str) -> str:
    """
    Make a safe filename stem from a title.

    Args:
        text: Title to slugify.

    Returns:
        A filesystem- and URL-friendly slug (max 80 chars).
    """
    stem = re.sub(r"[^\w\-]+", "_", (text or "").strip(), flags=re.UNICODE).strip("_")
    stem = stem[:80] or "video"
    return stem


class Command(BaseCommand):
    help = (
        "Import videos from XLSX sheet 'video description'. "
        "The cover_letter_url and video_url are derived ONLY from a slugified title."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--file",
            default="",
            help=(
                "Optional: import a single xlsx file. "
                "If omitted, imports all xlsx under learning_by_video/data/raw/."
            ),
        )
        parser.add_argument(
            "--no-move",
            action="store_true",
            help="Do not move the xlsx file (used by import_xlsx_all).",
        )

    def handle(self, *args, **options) -> None:
        data_dir = _get_learning_by_video_data_dir()
        raw_dir = data_dir / "raw"
        processed_dir = data_dir / "processed"
        processed_dir.mkdir(parents=True, exist_ok=True)

        no_move: bool = bool(options.get("no_move"))
        file_arg = (options.get("file") or "").strip()
        xlsx_files = [Path(file_arg)] if file_arg else sorted(raw_dir.glob("*.xlsx"))

        if not xlsx_files:
            self.stdout.write(self.style.WARNING("No xlsx files found in data/raw."))
            return

        for xlsx_path in xlsx_files:
            self.stdout.write(f"Importing videos from: {xlsx_path}")

            with transaction.atomic():
                df = pd.read_excel(
                    xlsx_path,
                    sheet_name=SHEET_NAME,
                    engine="openpyxl",
                ).fillna("")

                required = {COL_TITLE, COL_CREATOR, COL_DIFFICULTY, COL_TAGS, COL_DESC, COL_DURATION}
                missing = required - set(df.columns)
                if missing:
                    raise ValueError(
                        f"{xlsx_path.name}: missing columns in sheet '{SHEET_NAME}': {sorted(missing)}"
                    )

                created = 0
                updated = 0

                for _, row in df.iterrows():
                    title = str(row[COL_TITLE]).strip()
                    if not title:
                        continue

                    creator = str(row[COL_CREATOR]).strip()
                    difficulty = str(row[COL_DIFFICULTY]).strip()
                    description = str(row[COL_DESC]).strip()
                    duration_seconds = _parse_duration_to_seconds(str(row[COL_DURATION]).strip())
                    tags = _parse_tags(str(row[COL_TAGS]).strip())

                    title_slug = _slugify_filename(title)

                    # NOTE: no extension here, as requested (only slugified title)
                    cover_letter_url = f"/resources/learning_by_video_cover_letters/{title_slug}"
                    video_url = f"/resources/learning_by_video_video/{title_slug}"

                    obj, was_created = Video.objects.update_or_create(
                        title=title,
                        creator=creator,
                        defaults={
                            "difficulty": difficulty,
                            "video_url": video_url,
                            "description": description,
                            "duration_seconds": duration_seconds,
                            "tags": tags,
                            "cover_letter_url": cover_letter_url,
                        },
                    )

                    if was_created:
                        created += 1
                    else:
                        updated += 1

                def _move_after_commit() -> None:
                    target = processed_dir / xlsx_path.name
                    xlsx_path.rename(target)

                if not no_move:
                    transaction.on_commit(_move_after_commit)

            self.stdout.write(
                self.style.SUCCESS(
                    f"OK: {xlsx_path.name} | videos created={created}, updated={updated} -> moved to processed/"
                )
            )
