from __future__ import annotations

from pathlib import Path

from django.apps import apps
from django.core.management.base import BaseCommand, CommandParser

from apps.learning_by_video.management.commands.fill_selected_from_xlsx import _resolve_video
from apps.learning_by_video.management.commands.import_videos import _get_target_season
from apps.learning_by_video.management.commands.import_videos import _get_source_value, _pick_title

import pandas as pd


SHEET_VIDEO_DESCRIPTION = "video description"


def _get_learning_by_video_data_dir() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    return Path(app_config.path) / "data"


def _sheet(path: Path, name: str) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name=name, engine="openpyxl").fillna("")


class Command(BaseCommand):
    help = (
        "Backfill Video.source from XLSX `video description` sheet by matching "
        "already-imported videos to existing XLSX files."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", default="", help="Optional single xlsx file to process.")
        parser.add_argument(
            "--mode",
            choices=("inspect", "apply"),
            default="inspect",
            help="Use inspect for dry-run output or apply to save changes (default: inspect).",
        )
        parser.add_argument(
            "--only-missing",
            action="store_true",
            help="Only fill Video.source when the DB field is currently empty.",
        )
        parser.add_argument(
            "--module-key",
            default="learning_by_video",
            help="Module key used to resolve target season (default: learning_by_video).",
        )
        parser.add_argument(
            "--season-number",
            type=int,
            default=0,
            help="Optional target season number filter. Use 4 for vlog season.",
        )

    def handle(self, *args, **options) -> None:
        data_dir = _get_learning_by_video_data_dir()
        raw_dir = data_dir / "raw"
        processed_dir = data_dir / "processed"
        file_arg = str(options.get("file") or "").strip()
        mode = str(options.get("mode") or "inspect")
        only_missing = bool(options.get("only_missing"))
        module_key = str(options.get("module_key") or "learning_by_video")
        season_number = int(options.get("season_number") or 0)

        target_season = None
        if season_number > 0:
            target_season = _get_target_season(
                module_key=module_key,
                season_number=season_number,
            )
            if target_season is None:
                self.stdout.write(
                    self.style.WARNING(
                        f"Target season not found (module={module_key}, season_number={season_number})."
                    )
                )
                return

        if file_arg:
            xlsx_files = [Path(file_arg)]
        else:
            seen: set[Path] = set()
            xlsx_files: list[Path] = []
            for base_dir in (raw_dir, processed_dir):
                if not base_dir.exists():
                    continue
                for path in sorted(base_dir.glob("*.xlsx")):
                    resolved = path.resolve()
                    if resolved in seen:
                        continue
                    seen.add(resolved)
                    xlsx_files.append(path)

        if not xlsx_files:
            self.stdout.write(self.style.WARNING("No xlsx files found to inspect."))
            return

        matched = 0
        changed = 0
        skipped_empty_source = 0
        skipped_missing_video = 0
        skipped_existing_source = 0

        for xlsx_path in xlsx_files:
            if not xlsx_path.exists():
                self.stdout.write(self.style.WARNING(f"Skip missing file: {xlsx_path}"))
                continue

            df = _sheet(xlsx_path, SHEET_VIDEO_DESCRIPTION)
            if df.shape[0] < 1:
                self.stdout.write(self.style.WARNING(f"Skip empty sheet: {xlsx_path.name}"))
                continue

            row0 = df.iloc[0]
            source = _get_source_value(row0)
            title = _pick_title(row0)
            video = _resolve_video(xlsx_path)

            if not video:
                skipped_missing_video += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"[unmatched] {xlsx_path.name} | title={title or '<empty>'}"
                    )
                )
                continue

            if target_season is not None and video.season_id != target_season.id:
                skipped_missing_video += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"[skip:season-mismatch] {xlsx_path.name} | video_id={video.id} | "
                        f"title={video.title} | video.season_id={video.season_id} expected={target_season.id}"
                    )
                )
                continue

            matched += 1

            if not source:
                skipped_empty_source += 1
                self.stdout.write(
                    f"[skip:no-source] {xlsx_path.name} | video_id={video.id} | title={video.title}"
                )
                continue

            if only_missing and (video.source or "").strip():
                skipped_existing_source += 1
                self.stdout.write(
                    f"[skip:has-source] {xlsx_path.name} | video_id={video.id} | title={video.title}"
                )
                continue

            if video.source == source:
                self.stdout.write(
                    f"[ok] {xlsx_path.name} | video_id={video.id} | source unchanged"
                )
                continue

            old_source = video.source
            self.stdout.write(
                f"[update] {xlsx_path.name} | video_id={video.id} | "
                f"title={video.title} | source: {old_source!r} -> {source!r}"
            )
            if mode == "apply":
                video.source = source
                video.save(update_fields=["source"])
            changed += 1

        self.stdout.write("")
        self.stdout.write(f"mode={mode}")
        self.stdout.write(f"season filter={season_number or 'none'}")
        self.stdout.write(f"xlsx scanned={len(xlsx_files)}")
        self.stdout.write(f"videos matched={matched}")
        self.stdout.write(f"source changed={changed}")
        self.stdout.write(f"skipped missing video={skipped_missing_video}")
        self.stdout.write(f"skipped empty source={skipped_empty_source}")
        self.stdout.write(f"skipped existing source={skipped_existing_source}")
