from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import shutil
from typing import Any
import unicodedata
from urllib.parse import quote, urlparse

from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.management.commands.import_videos import _normalize_media_key
from apps.learning_by_video.management.commands.fill_selected_from_xlsx import _resolve_video as _resolve_video_from_xlsx
from apps.learning_by_video.management.commands.fill_selected_from_xlsx import _sheet as _xlsx_sheet
from apps.learning_by_video.management.commands.import_videos import (
    COL_TITLE,
    COL_TITLE_ORIG,
    COL_TITLE_ZH,
    SHEET_NAME as SHEET_VIDEO_DESCRIPTION,
)
from apps.learning_by_video.models import Video

SCIENCE_SEASON1_VIDEO_DIR_REL = Path("frontend/public/resources/ScienceSeason1/learning_by_video_video")
SCIENCE_SEASON1_COVER_DIR_REL = Path("frontend/public/resources/ScienceSeason1/learning_by_video_cover_letters")
SCIENCE_SEASON1_VIDEO_URL_PREFIX = "/resources/ScienceSeason1/learning_by_video_video"
SCIENCE_SEASON1_COVER_URL_PREFIX = "/resources/ScienceSeason1/learning_by_video_cover_letters"
XLSX_METADATA_DIRS_REL = [
    Path("apps/learning_by_video/data/raw"),
    Path("apps/learning_by_video/data/processed"),
]


def _project_root() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    # app path: <root>/apps/learning_by_video
    return Path(app_config.path).resolve().parents[1]


def _build_file_map(
    folder: Path,
    allowed_exts: set[str] | None = None,
    ext_preference: dict[str, int] | None = None,
) -> dict[str, str]:
    out: dict[str, str] = {}
    if not folder.exists():
        return out

    for p in sorted(folder.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_file():
            continue
        if allowed_exts is not None and p.suffix.lower() not in allowed_exts:
            continue
        key = _normalize_media_key(p.stem)
        if not key:
            continue
        if key not in out:
            out[key] = p.name
            continue
        if ext_preference is not None:
            new_ext = p.suffix.lower()
            old_ext = Path(out[key]).suffix.lower()
            if ext_preference.get(new_ext, 99) < ext_preference.get(old_ext, 99):
                out[key] = p.name
    return out


def _find_filename(title: str, file_map: dict[str, str]) -> str:
    key = _normalize_media_key(title)
    if not key:
        return ""
    if key in file_map:
        return file_map[key]

    best = ""
    best_len = 0
    for k, filename in file_map.items():
        if k in key or key in k:
            if len(k) > best_len:
                best = filename
                best_len = len(k)
    return best


def _collect_title_hints_from_xlsx(root: Path) -> dict[int, list[str]]:
    """
    Build video_id -> title hints from xlsx metadata (raw + processed).
    Includes 中文标题 / 原标题 / 标题.
    """
    hints: dict[int, list[str]] = {}
    seen_files: set[Path] = set()

    def _add_hint(video_id: int, value: str) -> None:
        text = str(value or "").strip()
        if not text:
            return
        arr = hints.setdefault(video_id, [])
        if text not in arr:
            arr.append(text)

    for rel in XLSX_METADATA_DIRS_REL:
        d = root / rel
        if not d.exists():
            continue
        for p in sorted(d.glob("*.xlsx")):
            rp = p.resolve()
            if rp in seen_files:
                continue
            seen_files.add(rp)
            try:
                video = _resolve_video_from_xlsx(p)
            except Exception:
                continue
            if video is None:
                continue
            try:
                df = _xlsx_sheet(p, SHEET_VIDEO_DESCRIPTION)
            except Exception:
                continue
            if df.shape[0] < 1:
                continue
            row = df.iloc[0]
            for col in (COL_TITLE_ORIG, COL_TITLE_ZH, COL_TITLE):
                _add_hint(video.id, row.get(col, ""))

    return hints


def _url_bucket(raw_url: str) -> str:
    s = (raw_url or "").strip()
    if not s:
        return "empty"
    if s.startswith(("http://", "https://")):
        parsed = urlparse(s)
        host = parsed.netloc or "unknown-host"
        return f"remote:{host}"
    if s.startswith("/"):
        parts = [x for x in s.split("/") if x]
        if len(parts) >= 2:
            return f"local:/{parts[0]}/{parts[1]}"
        return "local:/"
    return "relative"


def _build_media_url(prefix: str, filename: str) -> str:
    # Encode path segment so reserved chars like '?' don't break URLs.
    return f"{prefix}/{quote(filename, safe='')}"


def _has_unsafe_filename_chars(url: str) -> bool:
    s = (url or "").strip()
    if not s:
        return False
    if not s.startswith("/"):
        return False
    name = s.rsplit("/", 1)[-1]
    # If raw reserved chars are present, browser/server may parse URL incorrectly.
    return any(ch in name for ch in ("?", "#", " "))


def _has_unsafe_hls_name(filename: str) -> bool:
    """
    HLS playlist/segment URI handling is fragile when stem contains '?' or '#'.
    """
    s = (filename or "").strip()
    return ("?" in s) or ("#" in s)


def _sanitize_stem_for_alias(stem: str) -> str:
    s = unicodedata.normalize("NFKD", stem or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("?", "_").replace("#", "_")
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("._")
    return s or "media"


def _ensure_safe_alias_filename(*, folder: Path, filename: str, mode: str) -> str:
    """
    Return a safe filename for URL usage.
    If source filename has unsafe URL chars, create/calc an ASCII alias in the same folder.
    """
    src_name = (filename or "").strip()
    if not src_name:
        return src_name

    # If file name has no problematic URL chars, keep as is.
    if "?" not in src_name and "#" not in src_name:
        return src_name

    src = folder / src_name
    stem = _sanitize_stem_for_alias(Path(src_name).stem)
    suffix = Path(src_name).suffix
    alias_name = f"{stem}{suffix}"
    alias = folder / alias_name

    if mode == "apply" and src.exists() and not alias.exists():
        shutil.copy2(src, alias)

    return alias_name


def _get_season(module_key: str, season_number: int):
    Module = apps.get_model("accounts", "Module")
    ModuleSeason = apps.get_model("accounts", "ModuleSeason")
    module = Module.objects.filter(key=module_key, is_active=True).first()
    if not module:
        return None
    return ModuleSeason.objects.filter(module=module, season_number=season_number).first()


class Command(BaseCommand):
    help = (
        "Inspect current video_url/cover_letter_url patterns, and set local resource URLs for videos "
        "based on title->filename matching. Supports validate/apply. Can also ensure Season 1 restriction."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--mode", choices=["validate", "apply"], default="validate")
        parser.add_argument(
            "--only-missing",
            action="store_true",
            default=True,
            help="Only fill when video_url/cover_letter_url is empty (default).",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Process all videos (override --only-missing).",
        )
        parser.add_argument(
            "--video-id",
            type=int,
            action="append",
            default=[],
            help="Optional specific video IDs (can be repeated).",
        )
        parser.add_argument(
            "--exclude-video-id",
            type=int,
            action="append",
            default=[],
            help="Optional video IDs to skip (can be repeated).",
        )
        parser.add_argument("--module-key", default="learning_by_video")
        parser.add_argument("--season-number", type=int, default=1)
        parser.add_argument(
            "--ensure-season",
            action="store_true",
            default=True,
            help="Ensure videos have season set (default: on).",
        )
        parser.add_argument(
            "--no-ensure-season",
            action="store_true",
            help="Do not change season.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        mode = str(options["mode"])
        only_missing = bool(options.get("only_missing", True))
        if options.get("all"):
            only_missing = False

        ensure_season = bool(options.get("ensure_season", True))
        if options.get("no_ensure_season"):
            ensure_season = False

        video_ids: list[int] = list(options.get("video_id") or [])
        exclude_video_ids: set[int] = set(options.get("exclude_video_id") or [])
        module_key = str(options.get("module_key") or "learning_by_video")
        season_number = int(options.get("season_number") or 1)

        root = _project_root()
        cover_dir = root / SCIENCE_SEASON1_COVER_DIR_REL
        video_dir = root / SCIENCE_SEASON1_VIDEO_DIR_REL

        cover_map = _build_file_map(cover_dir, allowed_exts=None)
        video_map = _build_file_map(
            video_dir,
            allowed_exts={".mp4", ".m3u8", ".m4v", ".mov", ".webm"},
            # Keep URLs in HLS format by default when both m3u8 and mp4 exist.
            ext_preference={".m3u8": 0, ".mp4": 1, ".m4v": 2, ".mov": 3, ".webm": 4},
        )
        video_map_mp4 = _build_file_map(
            video_dir,
            allowed_exts={".mp4"},
            ext_preference={".mp4": 0},
        )

        qs = Video.objects.all().order_by("id")
        if video_ids:
            qs = qs.filter(id__in=video_ids)
        if exclude_video_ids:
            qs = qs.exclude(id__in=exclude_video_ids)
        videos = list(qs)
        title_hints = _collect_title_hints_from_xlsx(root)

        url_stats = Counter(_url_bucket(v.video_url) for v in videos)
        cover_stats = Counter(_url_bucket(v.cover_letter_url) for v in videos)

        target_season = _get_season(module_key=module_key, season_number=season_number)

        updated = 0
        season_updated = 0
        unresolved: list[str] = []

        with transaction.atomic():
            for v in videos:
                changed_fields: list[str] = []
                picked_video_filename = ""

                need_video_url = (
                    (not only_missing)
                    or (not (v.video_url or "").strip())
                    or _has_unsafe_filename_chars(v.video_url)
                )
                need_cover_url = (
                    (not only_missing)
                    or (not (v.cover_letter_url or "").strip())
                    or _has_unsafe_filename_chars(v.cover_letter_url)
                )

                if need_video_url:
                    video_filename = ""
                    candidate_titles = [v.title] + title_hints.get(v.id, [])
                    for t in candidate_titles:
                        video_filename = _find_filename(t, video_map)
                        if video_filename:
                            break
                    # If chosen HLS filename is unsafe (e.g. contains '?'),
                    # prefer a safe-named HLS alias when present;
                    # otherwise fallback to MP4 to avoid broken segment URI parsing.
                    if video_filename and Path(video_filename).suffix.lower() == ".m3u8" and _has_unsafe_hls_name(video_filename):
                        safe_hls_alias = f"{_sanitize_stem_for_alias(Path(video_filename).stem)}.m3u8"
                        if (video_dir / safe_hls_alias).exists():
                            video_filename = safe_hls_alias
                        else:
                            key = _normalize_media_key(Path(video_filename).stem)
                            mp4_filename = video_map_mp4.get(key, "")
                            if mp4_filename:
                                video_filename = mp4_filename
                    if video_filename:
                        video_filename = _ensure_safe_alias_filename(
                            folder=video_dir,
                            filename=video_filename,
                            mode=mode,
                        )
                        picked_video_filename = video_filename
                        new_video_url = _build_media_url(
                            SCIENCE_SEASON1_VIDEO_URL_PREFIX,
                            video_filename,
                        )
                        if v.video_url != new_video_url:
                            v.video_url = new_video_url
                            changed_fields.append("video_url")
                    else:
                        unresolved.append(
                            f"[video_url] id={v.id} title={v.title} | no matching file in {video_dir}"
                        )

                if need_cover_url:
                    # Prefer exact same stem as picked video file.
                    cover_filename = ""
                    if picked_video_filename:
                        same_stem_key = _normalize_media_key(Path(picked_video_filename).stem)
                        cover_filename = cover_map.get(same_stem_key, "")
                    if not cover_filename:
                        candidate_titles = [v.title] + title_hints.get(v.id, [])
                        for t in candidate_titles:
                            cover_filename = _find_filename(t, cover_map)
                            if cover_filename:
                                break
                    if cover_filename:
                        cover_filename = _ensure_safe_alias_filename(
                            folder=cover_dir,
                            filename=cover_filename,
                            mode=mode,
                        )
                        new_cover_url = _build_media_url(
                            SCIENCE_SEASON1_COVER_URL_PREFIX,
                            cover_filename,
                        )
                        if v.cover_letter_url != new_cover_url:
                            v.cover_letter_url = new_cover_url
                            changed_fields.append("cover_letter_url")
                    else:
                        unresolved.append(
                            f"[cover_letter_url] id={v.id} title={v.title} | no matching file in {cover_dir}"
                        )

                if ensure_season and target_season and v.season_id is None:
                    # For this batch, add season restriction only when missing.
                    v.season = target_season
                    changed_fields.append("season")
                    season_updated += 1

                if changed_fields:
                    v.save(update_fields=sorted(set(changed_fields)))
                    updated += 1

            if mode == "validate":
                transaction.set_rollback(True)

        self.stdout.write(f"mode={mode}")
        self.stdout.write(f"videos scanned: {len(videos)}")
        self.stdout.write(f"resource dir video exists: {video_dir.exists()} | files indexed={len(video_map)}")
        self.stdout.write(f"resource dir cover exists: {cover_dir.exists()} | files indexed={len(cover_map)}")
        self.stdout.write(f"videos updated: {updated}")
        self.stdout.write(f"season updated: {season_updated}")

        self.stdout.write("\n=== video_url location stats ===")
        for k, c in sorted(url_stats.items(), key=lambda x: (-x[1], x[0])):
            self.stdout.write(f"{k}: {c}")

        self.stdout.write("\n=== cover_letter_url location stats ===")
        for k, c in sorted(cover_stats.items(), key=lambda x: (-x[1], x[0])):
            self.stdout.write(f"{k}: {c}")

        self.stdout.write("\n=== unresolved (manual check) ===")
        if not unresolved:
            self.stdout.write("none")
        else:
            for line in unresolved:
                self.stdout.write(line)

        if mode == "validate":
            self.stdout.write(self.style.WARNING("\nvalidate mode: rolled back"))
        else:
            self.stdout.write(self.style.SUCCESS("\napply mode: committed"))
