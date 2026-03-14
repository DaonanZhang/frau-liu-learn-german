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

    # Prefer modern web-friendly formats when multiple files share a stem.
    ext_preference = {
        ".mp4": 0,
        ".m3u8": 1,
        ".m4v": 2,
        ".mov": 3,
        ".webm": 4,
    }

    file_map: dict[str, str] = {}
    for path in video_dir.iterdir():
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext not in ext_preference:
            continue
        stem = path.stem
        key = _normalize_media_key(stem)
        if not key:
            continue
        if key not in file_map:
            file_map[key] = path.name
            continue
        existing_ext = Path(file_map[key]).suffix.lower()
        if ext_preference.get(ext, 99) < ext_preference.get(existing_ext, 99):
            file_map[key] = path.name
    return file_map


def _get_target_season(*, module_key: str, season_number: int):
    Module = apps.get_model("accounts", "Module")
    ModuleSeason = apps.get_model("accounts", "ModuleSeason")

    module = Module.objects.filter(key=module_key, is_active=True).first()
    if not module:
        return None
    return ModuleSeason.objects.filter(module=module, season_number=season_number).first()


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
        "Media URLs (video_url / cover_letter_url) are intentionally ignored here."
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
        parser.add_argument(
            "--module-key",
            default="learning_by_video",
            help="Module key used to resolve target season (default: learning_by_video).",
        )
        parser.add_argument(
            "--season-number",
            type=int,
            default=1,
            help="Target season number for imported videos (default: 1).",
        )
        parser.add_argument(
            "--no-ensure-season",
            action="store_true",
            help="Do not set Video.season.",
        )
        parser.add_argument(
            "--force-season",
            action="store_true",
            help="Overwrite existing Video.season with target season.",
        )
        parser.add_argument(
            "--no-bind-access-season",
            action="store_true",
            help="Do not add target season to Video.access_seasons.",
        )

    def handle(self, *args, **options) -> None:
        data_dir = _get_learning_by_video_data_dir()
        raw_dir = data_dir / "raw"
        processed_dir = data_dir / "processed"
        processed_dir.mkdir(parents=True, exist_ok=True)
        module_key = str(options.get("module_key") or "learning_by_video")
        season_number = int(options.get("season_number") or 1)
        ensure_season = not bool(options.get("no_ensure_season"))
        force_season = bool(options.get("force_season"))
        bind_access_season = not bool(options.get("no_bind_access_season"))

        target_season = None
        if ensure_season or bind_access_season:
            target_season = _get_target_season(
                module_key=module_key,
                season_number=season_number,
            )
        if (ensure_season or bind_access_season) and target_season is None:
            self.stdout.write(
                self.style.WARNING(
                    f"⚠️ Target season not found (module={module_key}, season_number={season_number}). "
                    "Imported videos will keep existing season/access_seasons."
                )
            )

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
                season_assigned = 0
                season_overwritten = 0
                access_season_bound = 0

                for _, row in df.iterrows():
                    title = _pick_title(row)
                    if not title:
                        continue

                    creator = str(row[COL_CREATOR]).strip()
                    difficulty = str(row[COL_DIFFICULTY]).strip()
                    description = str(row[COL_DESC]).strip()
                    duration_seconds = _parse_duration_to_seconds(str(row[COL_DURATION]).strip())
                    tags = _parse_tags(str(row[COL_TAGS]).strip())

                    obj, was_created = Video.objects.update_or_create(
                        title=title,
                        creator=creator,
                        defaults={
                            "difficulty": difficulty,
                            "description": description,
                            "duration_seconds": duration_seconds,
                            "tags": tags,
                        },
                    )

                    if was_created:
                        created += 1
                    else:
                        updated += 1

                    if target_season and ensure_season and (force_season or obj.season_id is None):
                        if obj.season_id != target_season.id:
                            had_season = bool(obj.season_id)
                            obj.season = target_season
                            obj.save(update_fields=["season"])
                            if had_season:
                                season_overwritten += 1
                            else:
                                season_assigned += 1

                    if target_season and bind_access_season:
                        if not obj.access_seasons.filter(id=target_season.id).exists():
                            obj.access_seasons.add(target_season)
                            access_season_bound += 1

                def _move_after_commit() -> None:
                    target = processed_dir / xlsx_path.name
                    xlsx_path.rename(target)

                if not no_move:
                    transaction.on_commit(_move_after_commit)

            self.stdout.write(
                self.style.SUCCESS(
                    f"OK: {xlsx_path.name} | videos created={created}, updated={updated}; "
                    f"season assigned={season_assigned}, overwritten={season_overwritten}, "
                    f"access_season bound={access_season_bound} -> moved to processed/"
                )
            )
