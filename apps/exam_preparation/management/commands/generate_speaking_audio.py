"""Generate one Azure Speech MP3 for every Sprechen dialogue turn."""

from __future__ import annotations

import json
import os
import re

from django.core.management.base import BaseCommand, CommandError

from apps.exam_preparation.models import SpeakingTeilExercise
from apps.exam_preparation.speaking_audio import (
    DEFAULT_VOICE,
    SPEAKING_AUDIO_ROOT,
    SPEAKING_AUDIO_PUBLIC_PREFIX,
    ensure_speaking_turn_audio,
    speaking_turn_audio_path,
    speaking_turn_audio_url,
    synthesize_speaking_audio,
)


OUTPUT_DIR = SPEAKING_AUDIO_ROOT
PUBLIC_PREFIX = SPEAKING_AUDIO_PUBLIC_PREFIX
synthesize = synthesize_speaking_audio


def turn_key(exercise, turn):
    base = exercise.exercise_base
    return f"{base.exercise_type}|{base.level}|{base.external_id}|{turn['sequence']}"


class Command(BaseCommand):
    help = "Generate static Azure Speech MP3 files for each Sprechen dialogue turn; dry-run by default."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Actually call Azure and write MP3/manifest files")
        parser.add_argument("--voice", default=DEFAULT_VOICE)
        parser.add_argument("--limit", type=int, default=0, help="Generate at most this many new MP3 files")
        parser.add_argument("--overwrite", action="store_true", help="Regenerate existing files for the chosen voice")

    def handle(self, *args, **options):
        voice = options["voice"]
        if not re.fullmatch(r"de-[A-Za-z]{2}-[A-Za-z0-9]+Neural", voice):
            raise CommandError("--voice must be an Azure German Neural voice, e.g. de-DE-KatjaNeural")
        if options["limit"] < 0:
            raise CommandError("--limit must be zero or greater")
        exercises = SpeakingTeilExercise.objects.select_related("exercise_base").order_by("id")
        entries = {}
        target_paths = {}
        turns = []
        for exercise in exercises.iterator():
            for turn in (exercise.content or {}).get("dialogue", []):
                text = str(turn.get("text") or "").strip()
                if not text:
                    continue
                key = turn_key(exercise, turn)
                if key in entries and entries[key]["text"] != text:
                    raise CommandError(f"Conflicting speaking turn key: {key}")
                url = speaking_turn_audio_url(
                    exercise_type=exercise.exercise_base.exercise_type,
                    level=exercise.exercise_base.level,
                    external_id=exercise.exercise_base.external_id,
                    sequence=turn["sequence"],
                )
                entries[key] = {"text": text, "url": url}
                target_paths[key] = speaking_turn_audio_path(
                    exercise_type=exercise.exercise_base.exercise_type,
                    level=exercise.exercise_base.level,
                    external_id=exercise.exercise_base.external_id,
                    sequence=turn["sequence"],
                )
                turns.append((exercise, turn, text))

        existing = sum(
            speaking_turn_audio_path(
                exercise_type=exercise.exercise_base.exercise_type,
                level=exercise.exercise_base.level,
                external_id=exercise.exercise_base.external_id,
                sequence=turn["sequence"],
            ).is_file()
            for exercise, turn, _ in turns
        )
        missing = len(turns) - existing
        characters = sum(len(text) for _, _, text in turns)
        self.stdout.write(
            f"{len(entries)} dialogue turns, {len(turns)} turn files, "
            f"{characters} characters; {existing} files present, {missing} missing."
        )
        if not options["apply"]:
            self.stdout.write("Dry run only. Use --apply after configuring AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.")
            return

        azure_key = os.getenv("AZURE_SPEECH_KEY")
        region = os.getenv("AZURE_SPEECH_REGION", "").lower()
        if not azure_key or not re.fullmatch(r"[a-z0-9]+", region):
            raise CommandError("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the environment")

        generated = 0
        for exercise, turn, text in turns:
            target = speaking_turn_audio_path(
                exercise_type=exercise.exercise_base.exercise_type,
                level=exercise.exercise_base.level,
                external_id=exercise.exercise_base.external_id,
                sequence=turn["sequence"],
            )
            if target.is_file() and not options["overwrite"]:
                continue
            if options["limit"] and generated >= options["limit"]:
                break
            ensure_speaking_turn_audio(
                exercise_type=exercise.exercise_base.exercise_type,
                level=exercise.exercise_base.level,
                external_id=exercise.exercise_base.external_id,
                sequence=turn["sequence"],
                text=text,
                voice=voice,
                region=region,
                key=azure_key,
                overwrite=options["overwrite"],
                synthesizer=synthesize,
            )
            generated += 1
            if generated % 25 == 0:
                self.stdout.write(f"Generated {generated} MP3 files...")

        available = {
            key: item for key, item in entries.items()
            if target_paths[key].is_file()
        }
        manifest = OUTPUT_DIR / "manifest.json"
        temporary_manifest = OUTPUT_DIR / "manifest.json.part"
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        temporary_manifest.write_text(
            json.dumps({"voice": voice, "turns": available}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary_manifest.replace(manifest)
        self.stdout.write(f"Generated {generated} MP3 files; {len(available)} turn URLs in {manifest}.")
