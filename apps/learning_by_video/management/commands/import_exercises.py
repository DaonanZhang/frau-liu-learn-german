from __future__ import annotations

from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.models import Video, VideoExerciseOption, VideoExerciseQuestion


SHEET_NAME_DEFAULT = "exercise"
QUESTION_CATEGORY_COLUMN = "question_kat"

TYPE_MAP: dict[str, str] = {
    "Richtig oder Falsch": VideoExerciseQuestion.QuestionType.TRUE_FALSE,
    "Wählen Sie aus": VideoExerciseQuestion.QuestionType.CHOICE,
}

CATEGORY_MAP: dict[str, str] = {
    "listening": VideoExerciseQuestion.Category.LISTENING,
    "grammar": VideoExerciseQuestion.Category.GRAMMAR,
    "grammer": VideoExerciseQuestion.Category.GRAMMAR,
}


def _parse_bool(value: object) -> bool:
    s = str(value).strip().upper()
    return s in {"TRUE", "1", "YES", "Y"}


def _to_str(v: object) -> str:
    return str(v).strip()


def _normalize_category(value: object) -> str:
    raw = _to_str(value).lower()
    if not raw:
        return VideoExerciseQuestion.Category.LISTENING
    mapped = CATEGORY_MAP.get(raw)
    if not mapped:
        raise ValueError(f"Unknown question_kat {value!r}")
    return mapped


class Command(BaseCommand):
    help = "Import exercises (questions + options) from XLSX sheet 'exercise'."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", required=True, help="Path to xlsx file")
        parser.add_argument("--video-id", type=int, required=True, help="Target Video PK")
        parser.add_argument("--sheet", default=SHEET_NAME_DEFAULT, help="Sheet name (default: exercise)")
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

        if QUESTION_CATEGORY_COLUMN not in df.columns:
            df[QUESTION_CATEGORY_COLUMN] = VideoExerciseQuestion.Category.LISTENING

        required = {
            "question_type",
            "question_id",
            "question",
            "answer",
            "is_correct",
            "explanation",
        }
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing columns in sheet {sheet!r}: {sorted(missing)}")

        # Normalize strings
        for col in [
            QUESTION_CATEGORY_COLUMN,
            "question_type",
            "question_id",
            "question",
            "answer",
            "is_correct",
            "explanation",
        ]:
            df[col] = df[col].map(_to_str)

        df[QUESTION_CATEGORY_COLUMN] = df[QUESTION_CATEGORY_COLUMN].map(_normalize_category)

        # Stable ordering
        df = df.sort_values(by=[QUESTION_CATEGORY_COLUMN, "question_id", "answer"])

        # Cache to avoid repeated DB hits (this is the "aggregation" you guessed)
        question_cache: dict[str, VideoExerciseQuestion] = {}

        created_q = 0
        updated_q = 0
        created_o = 0
        updated_o = 0
        skipped = 0

        for idx, row in df.iterrows():
            raw_type = row["question_type"]
            category = row[QUESTION_CATEGORY_COLUMN]
            external_id = row["question_id"]
            prompt = row["question"]
            answer_text = row["answer"]
            is_correct = _parse_bool(row["is_correct"])
            explanation = row["explanation"]

            if not external_id or not prompt or not answer_text:
                skipped += 1
                continue

            mapped_type = TYPE_MAP.get(raw_type)
            if not mapped_type:
                raise ValueError(f"Row {idx}: unknown question_type {raw_type!r}")

            # --- Question (one per (video, category, external_id)) ---
            q_key = f"{category}:{external_id}"
            question = question_cache.get(q_key)

            if question is None:
                # Create/update once, then cache
                order = int(external_id) if external_id.isdigit() else 0

                question_explanation = (
                    explanation
                    if category == VideoExerciseQuestion.Category.GRAMMAR
                    else ""
                )

                question, q_created = VideoExerciseQuestion.objects.update_or_create(
                    video=video,
                    category=category,
                    external_id=external_id,
                    defaults={
                        "question_type": mapped_type,
                        "prompt": prompt,
                        "explanation": question_explanation,
                        "order": order,
                    },
                )
                question_cache[q_key] = question
                if q_created:
                    created_q += 1
                else:
                    updated_q += 1
            else:
                # Optional: if prompt/type changed across rows, keep DB in sync
                # (Usually they are identical within same question_id.)
                changed = False
                if question.prompt != prompt:
                    question.prompt = prompt
                    changed = True
                if question.question_type != mapped_type:
                    question.question_type = mapped_type
                    changed = True
                if question.category != category:
                    question.category = category
                    changed = True
                if (
                    category == VideoExerciseQuestion.Category.GRAMMAR
                    and explanation
                    and question.explanation != explanation
                ):
                    question.explanation = explanation
                    changed = True
                if changed:
                    update_fields = ["prompt", "question_type", "category"]
                    if category == VideoExerciseQuestion.Category.GRAMMAR and explanation:
                        update_fields.append("explanation")
                    question.save(update_fields=update_fields)
                    updated_q += 1

            # --- Option (one per (question, text)) ---
            # Order: assign per question based on first time we see this answer
            # We'll compute it by counting existing cached options order in memory.
            # (Simpler: set 0 and let frontend sort by text; but having order is nicer.)
            # We'll do a stable order by current loop sequence.
            option_order = 0
            # You can refine order later; keep minimal now.

            opt, opt_created = VideoExerciseOption.objects.update_or_create(
                question=question,
                text=answer_text,
                defaults={
                    "is_correct": is_correct,
                    "explanation": (
                        explanation
                        if category == VideoExerciseQuestion.Category.LISTENING
                        else ""
                    ),
                    "order": option_order,
                },
            )
            if opt_created:
                created_o += 1
            else:
                updated_o += 1

        self.stdout.write(self.style.SUCCESS(
            "OK: exercises imported. "
            f"Questions created={created_q}, updated={updated_q}; "
            f"Options created={created_o}, updated={updated_o}; skipped={skipped}"
        ))
