from __future__ import annotations

import json
import re
import shutil
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
COL_COVER = "封面"
COL_TAGS = "tags"
COL_URL = "链接"
COL_DESC = "简介"
COL_DURATION = "时长"


def _get_learning_by_video_data_dir() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    return Path(app_config.path) / "data"


def _get_repo_root() -> Path:
    """
    Assumes repository structure:
      repo_root/
        manage.py
        apps/
          learning_by_video/
    """
    app_config = apps.get_app_config("learning_by_video")
    app_path = Path(app_config.path)  # .../repo_root/apps/learning_by_video
    return app_path.parents[1]        # .../repo_root


def _parse_duration_to_seconds(raw: str) -> int:
    """
    Examples:
    - "3min" -> 180
    - "3 min" -> 180
    - "03:20" -> 200
    - "3分钟" -> 180
    - "3" -> 180 (fallback: minutes)
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
    Supports:
    - JSON style: ["金融","投资"]
    - Chinese quotes: [“金融“，“投资”]
    - fallback: comma-split
    """
    s = (raw or "").strip()
    if not s:
        return []

    # normalize fancy quotes to standard JSON quotes
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
    Make a safe filename stem from title.
    """
    stem = re.sub(r"[^\w\-]+", "_", (text or "").strip(), flags=re.UNICODE).strip("_")
    stem = stem[:80] or "video"
    return stem


def _resolve_cover_source(cover_cell: str, xlsx_path: Path) -> Path | None:
    """
    The '封面' cell is assumed to contain a filename or a path.
    If it's relative, interpret it relative to the xlsx folder.
    """
    s = (cover_cell or "").strip()
    if not s:
        return None

    p = Path(s)
    if not p.is_absolute():
        p = xlsx_path.parent / p

    if p.exists() and p.is_file():
        return p
    return None


def _copy_cover_to_frontend_assets(*, cover_src: Path, title: str, repo_root: Path) -> str:
    """
    Copy cover into frontend assets folder and return frontend-relative path
    to store in Video.cover_url.

    Returned path example:
      /src/assets/learning_by_video_cover_letters/ETF_einfach_erklaert.png
    """
    target_dir = repo_root / "frontend" / "src" / "assets" / "learning_by_video_cover_letters"
    target_dir.mkdir(parents=True, exist_ok=True)

    ext = cover_src.suffix.lower() or ".png"
    filename = f"{_slugify_filename(title)}{ext}"
    dest = target_dir / filename

    # Avoid overwriting different files with same name
    if dest.exists() and dest.stat().st_size != cover_src.stat().st_size:
        i = 2
        while True:
            candidate = target_dir / f"{dest.stem}_{i}{ext}"
            if not candidate.exists():
                dest = candidate
                break
            i += 1

    shutil.copy2(cover_src, dest)

    # IMPORTANT: store a frontend-relative path, not an absolute file system path
    return f"/src/assets/learning_by_video_cover_letters/{dest.name}"


class Command(BaseCommand):
    help = "Import videos from XLSX sheet 'video description' and copy cover files into frontend assets."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--file",
            default="",
            help="Optional: import a single xlsx file. If omitted, imports all xlsx under learning_by_video/data/raw.",
        )

    def handle(self, *args, **options) -> None:
        data_dir = _get_learning_by_video_data_dir()
        raw_dir = data_dir / "raw"
        processed_dir = data_dir / "processed"
        processed_dir.mkdir(parents=True, exist_ok=True)

        file_arg = (options.get("file") or "").strip()
        xlsx_files = [Path(file_arg)] if file_arg else sorted(raw_dir.glob("*.xlsx"))

        if not xlsx_files:
            self.stdout.write(self.style.WARNING("No xlsx files found in data/raw."))
            return

        repo_root = _get_repo_root()

        for xlsx_path in xlsx_files:
            self.stdout.write(f"Importing videos from: {xlsx_path}")

            with transaction.atomic():
                df = pd.read_excel(xlsx_path, sheet_name=SHEET_NAME, engine="openpyxl").fillna("")

                required = {COL_TITLE, COL_CREATOR, COL_DIFFICULTY, COL_COVER, COL_TAGS, COL_URL, COL_DESC, COL_DURATION}
                missing = required - set(df.columns)
                if missing:
                    raise ValueError(f"{xlsx_path.name}: missing columns in sheet '{SHEET_NAME}': {sorted(missing)}")

                created = 0
                updated = 0

                for _, row in df.iterrows():
                    title = str(row[COL_TITLE]).strip()
                    if not title:
                        continue

                    creator = str(row[COL_CREATOR]).strip()
                    difficulty = str(row[COL_DIFFICULTY]).strip()
                    video_url = str(row[COL_URL]).strip()
                    description = str(row[COL_DESC]).strip()
                    duration_seconds = _parse_duration_to_seconds(str(row[COL_DURATION]).strip())
                    tags = _parse_tags(str(row[COL_TAGS]).strip())

                    cover_cell = str(row[COL_COVER]).strip()
                    cover_url = ""

                    cover_src = _resolve_cover_source(cover_cell, xlsx_path)
                    if cover_src is not None:
                        cover_url = _copy_cover_to_frontend_assets(
                            cover_src=cover_src,
                            title=title,
                            repo_root=repo_root,
                        )

                    obj, was_created = Video.objects.update_or_create(
                        title=title,
                        creator=creator,
                        defaults={
                            "difficulty": difficulty,
                            "video_url": video_url,
                            "description": description,
                            "duration_seconds": duration_seconds,
                            "tags": tags,
                            "cover_url": cover_url,
                        },
                    )

                    if was_created:
                        created += 1
                    else:
                        updated += 1

                def _move_after_commit() -> None:
                    target = processed_dir / xlsx_path.name
                    xlsx_path.rename(target)

                transaction.on_commit(_move_after_commit)

            self.stdout.write(self.style.SUCCESS(
                f"OK: {xlsx_path.name} | videos created={created}, updated={updated} -> moved to processed/"
            ))
