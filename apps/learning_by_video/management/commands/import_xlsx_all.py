from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from django.apps import apps
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.models import Video

# =========================
# Constants (sheet names)
# =========================
SHEET_VIDEO_DESCRIPTION: str = "video description"
SHEET_SUBTITLES_DEFAULT: str = "subtitle"
SHEET_EXERCISE_DEFAULT: str = "exercise"
SHEET_EXPRESSION_DEFAULT: str = "expression"
SHEET_WORD_DEFAULT: str = "word"


def _get_learning_by_video_data_dir() -> Path:
    app_config = apps.get_app_config("learning_by_video")
    return Path(app_config.path) / "data"


def _resolve_video_id_from_xlsx(xlsx_path: Path) -> int:
    """
    Resolve Video.id for downstream imports.

    Assumption:
    - One xlsx file corresponds to one video.
    - The sheet `SHEET_VIDEO_DESCRIPTION` contains at least the columns:
      - 标题
      - 创作者

    We look up the Video row that `import_videos` has created/updated
    by matching (title, creator). This keeps the pipeline simple without
    introducing an external_id field for Video at this stage.
    """
    df = pd.read_excel(
        xlsx_path,
        sheet_name=SHEET_VIDEO_DESCRIPTION,
        engine="openpyxl",
    ).fillna("")

    required = {"标题", "创作者"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"{xlsx_path.name}: missing columns in sheet {SHEET_VIDEO_DESCRIPTION!r}: {sorted(missing)}"
        )

    if df.shape[0] < 1:
        raise ValueError(f"{xlsx_path.name}: sheet {SHEET_VIDEO_DESCRIPTION!r} has no rows")

    title = str(df.iloc[0]["标题"]).strip()
    creator = str(df.iloc[0]["创作者"]).strip()

    if not title:
        raise ValueError(f"{xlsx_path.name}: empty 标题 in sheet {SHEET_VIDEO_DESCRIPTION!r}")

    video = Video.objects.filter(title=title, creator=creator).only("id").first()
    if not video:
        raise ValueError(
            f"{xlsx_path.name}: Video not found after import_videos "
            f"(title={title!r}, creator={creator!r})."
        )
    return int(video.id)


class Command(BaseCommand):
    help = (
        "Full XLSX import pipeline (atomic per file): "
        "videos -> subtitles -> exercises -> expressions -> words. "
        "Moves XLSX from data/raw to data/processed only after success."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--file",
            default="",
            help=(
                "Optional: import a single xlsx file. "
                "If omitted, processes all *.xlsx under learning_by_video/data/raw."
            ),
        )

        parser.add_argument(
            "--subtitles-sheet",
            default=SHEET_SUBTITLES_DEFAULT,
            help=f"Sheet name for subtitles (default: {SHEET_SUBTITLES_DEFAULT}).",
        )
        parser.add_argument(
            "--exercise-sheet",
            default=SHEET_EXERCISE_DEFAULT,
            help=f"Sheet name for exercises (default: {SHEET_EXERCISE_DEFAULT}).",
        )
        parser.add_argument(
            "--expression-sheet",
            default=SHEET_EXPRESSION_DEFAULT,
            help=f"Sheet name for expressions (default: {SHEET_EXPRESSION_DEFAULT}).",
        )
        parser.add_argument(
            "--word-sheet",
            default=SHEET_WORD_DEFAULT,
            help=f"Sheet name for words (default: {SHEET_WORD_DEFAULT}).",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        data_dir = _get_learning_by_video_data_dir()
        raw_dir = data_dir / "raw"
        processed_dir = data_dir / "processed"
        processed_dir.mkdir(parents=True, exist_ok=True)

        file_arg = str(options.get("file") or "").strip()
        xlsx_files = [Path(file_arg)] if file_arg else sorted(raw_dir.glob("*.xlsx"))

        if not xlsx_files:
            self.stdout.write(self.style.WARNING("No xlsx files found to import."))
            return

        subtitles_sheet = str(options["subtitles_sheet"])
        exercise_sheet = str(options["exercise_sheet"])
        expression_sheet = str(options["expression_sheet"])
        word_sheet = str(options["word_sheet"])

        for xlsx_path in xlsx_files:
            if not xlsx_path.exists():
                raise FileNotFoundError(str(xlsx_path))

            self.stdout.write(f"=== Import pipeline start: {xlsx_path.name} ===")

            # One file = one atomic transaction
            with transaction.atomic():
                # 1) Import video description (do NOT move file inside sub-command)
                call_command("import_videos", file=str(xlsx_path), no_move=True)

                # 2) Resolve video id based on the imported video row
                video_id = _resolve_video_id_from_xlsx(xlsx_path)

                # 3) Import subtitles
                call_command(
                    "import_subtitles",
                    file=str(xlsx_path),
                    video_id=video_id,
                    sheet=subtitles_sheet,
                    no_move=True,
                )

                # 4) Import exercises
                call_command(
                    "import_exercises",
                    file=str(xlsx_path),
                    video_id=video_id,
                    sheet=exercise_sheet,
                    no_move=True,
                )

                # 5) Import expressions
                call_command(
                    "import_expressions",
                    file=str(xlsx_path),
                    video_id=video_id,
                    sheet=expression_sheet,
                    no_move=True,
                )

                # 6) Import words
                call_command(
                    "import_words",
                    file=str(xlsx_path),
                    video_id=video_id,
                    sheet=word_sheet,
                    no_move=True,
                )

                # Move only after successful commit
                def _move_after_commit() -> None:
                    target = processed_dir / xlsx_path.name
                    xlsx_path.rename(target)

                transaction.on_commit(_move_after_commit)

            self.stdout.write(self.style.SUCCESS(
                f"OK: {xlsx_path.name} imported successfully -> moved to processed/"
            ))
            self.stdout.write(f"=== Import pipeline end: {xlsx_path.name} ===")
