from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pandas as pd
from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.models import Video


SHEET_NAME = "video description"

# Expected columns in the sheet (support old + new headers)
COL_TITLE = "标题"
COL_TITLE_ZH = "中文标题"
COL_TITLE_ORIG = "原标题"
COL_CREATOR = "创作者"
COL_DIFFICULTY = "难度"
COL_TAGS = "tags"
COL_DESC = "简介"
COL_DURATION = "时长"
COL_COVER = "封面"
COL_LINK = "链接"


def _get_learning_by_video_data_dir() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    return Path(app_config.path) / "data"


def _get_project_root() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    # app path: <root>/apps/learning_by_video
    return Path(app_config.path).resolve().parents[1]


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

    # formats like 2'44''30''' or 3'01'' or 4'11'266'''
    if "'" in s or "’" in s:
        parts = re.findall(r"\d+", s)
        if len(parts) >= 2:
            minutes = int(parts[0])
            seconds = int(parts[1])
            ms = int(parts[2]) if len(parts) >= 3 else 0
            return int(minutes * 60 + seconds + ms / 1000.0)

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

    # fallback: split by common separators
    s = s.strip().strip("[]")
    parts = [p.strip().strip('"').strip("'") for p in re.split(r"[;,，；、|]+", s)]
    return [p for p in parts if p]


def _slugify_filename(text: str) -> str:
    """
    Make a safe filename stem from a title (no underscores).

    Args:
        text: Title to slugify.

    Returns:
        A filesystem- and URL-friendly slug (max 80 chars).
    """
    s = (text or "").replace("_", " ").strip()
    stem = re.sub(r"[^\w\-]+", " ", s, flags=re.UNICODE)
    stem = re.sub(r"\s+", " ", stem).strip()
    stem = stem[:80] or "video"
    return stem


def _pick_title(row: pd.Series) -> str:
    """
    Prefer Chinese title if present, then original title, then legacy '标题'.
    """
    for col in (COL_TITLE_ZH, COL_TITLE_ORIG, COL_TITLE):
        if col in row:
            value = str(row[col]).strip()
            if value:
                return value
    return ""


def _normalize_media_key(text: str) -> str:
    """
    Normalize a title/filename to a matching key:
    - NFKC normalize
    - keep only alnum characters
    - lowercase
    """
    s = unicodedata.normalize("NFKC", text or "")
    return "".join(ch.lower() for ch in s if ch.isalnum())


def _build_cover_file_map() -> dict[str, str]:
    """
    Build a mapping from normalized filename stem -> actual filename.
    """
    cover_dir = _get_project_root() / "frontend" / "public" / "resources" / "learning_by_video_cover_letters"
    if not cover_dir.exists():
        return {}

    file_map: dict[str, str] = {}
    for path in cover_dir.iterdir():
        if not path.is_file():
            continue
        stem = path.stem
        key = _normalize_media_key(stem)
        # keep first match; avoid overwriting in case of collisions
        if key and key not in file_map:
            file_map[key] = path.name
    return file_map


def _build_video_file_map() -> dict[str, str]:
    """
    Build a mapping from normalized filename stem -> actual filename.
    """
    video_dir = _get_project_root() / "frontend" / "public" / "resources" / "learning_by_video_video"
    if not video_dir.exists():
        return {}

    file_map: dict[str, str] = {}
    for path in video_dir.iterdir():
        if not path.is_file():
            continue
        stem = path.stem
        key = _normalize_media_key(stem)
        if key and key not in file_map:
            file_map[key] = path.name
    return file_map


def _find_media_filename(title: str, file_map: dict[str, str]) -> str:
    """
    Find best matching filename by normalized title.
    - exact match preferred
    - fallback: partial match (either contains)
    """
    if not title or not file_map:
        return ""
    key = _normalize_media_key(title)
    if key in file_map:
        return file_map[key]

    best = ""
    best_len = 0
    for k, filename in file_map.items():
        if not k:
            continue
        if k in key or key in k:
            if len(k) > best_len:
                best = filename
                best_len = len(k)
    return best


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
        cover_file_map = _build_cover_file_map()
        video_file_map = _build_video_file_map()

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

                required = {COL_CREATOR, COL_DIFFICULTY, COL_TAGS, COL_DESC, COL_DURATION}
                missing = required - set(df.columns)
                has_title = any(col in df.columns for col in (COL_TITLE, COL_TITLE_ZH, COL_TITLE_ORIG))
                if missing or not has_title:
                    if not has_title:
                        missing = set(missing)
                        missing.add("标题/中文标题/原标题")
                    raise ValueError(
                        f"{xlsx_path.name}: missing columns in sheet '{SHEET_NAME}': {sorted(missing)}"
                    )

                created = 0
                updated = 0

                for _, row in df.iterrows():
                    title = _pick_title(row)
                    if not title:
                        continue

                    original_title = str(row.get(COL_TITLE_ORIG, "")).strip()
                    creator = str(row[COL_CREATOR]).strip()
                    difficulty = str(row[COL_DIFFICULTY]).strip()
                    description = str(row[COL_DESC]).strip()
                    duration_seconds = _parse_duration_to_seconds(str(row[COL_DURATION]).strip())
                    tags = _parse_tags(str(row[COL_TAGS]).strip())

                    title_slug = _slugify_filename(title)

                    # Prefer explicit link/cover if provided, otherwise derive from slug.
                    cover_raw = str(row.get(COL_COVER, "")).strip()
                    link_raw = str(row.get(COL_LINK, "")).strip()

                    # NOTE: no extension here, as requested (only slugified title)
                    if cover_raw:
                        if cover_raw.startswith(("http://", "https://", "/")):
                            cover_letter_url = cover_raw
                        else:
                            cover_letter_url = f"/resources/learning_by_video_cover_letters/{cover_raw}"
                    else:
                        cover_filename = ""
                        if original_title and cover_file_map:
                            key = _normalize_media_key(original_title)
                            cover_filename = cover_file_map.get(key, "")
                        if cover_filename:
                            cover_letter_url = f"/resources/learning_by_video_cover_letters/{cover_filename}"
                        else:
                            cover_letter_url = f"/resources/learning_by_video_cover_letters/{title_slug}"

                    video_filename = ""
                    if original_title and video_file_map:
                        video_filename = _find_media_filename(original_title, video_file_map)

                    # Prefer local file (assumed to exist with English original title)
                    if video_filename:
                        video_url = f"/resources/learning_by_video_video/{video_filename}"
                    elif link_raw:
                        if link_raw.startswith(("http://", "https://", "/")):
                            video_url = link_raw
                        else:
                            video_url = f"/resources/learning_by_video_video/{link_raw}"
                    else:
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
