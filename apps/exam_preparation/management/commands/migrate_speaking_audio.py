"""Move legacy flat Speaking MP3s into per-Teil turn files and store their URLs."""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

from django.core.management.base import BaseCommand, CommandError

from apps.exam_preparation.models import SpeakingTeilExercise
from apps.exam_preparation.speaking_audio import (
    DEFAULT_VOICE,
    MANIFEST_PATH,
    SPEAKING_AUDIO_PUBLIC_PREFIX,
    SPEAKING_AUDIO_ROOT,
    audio_fingerprint,
    ensure_speaking_turn_audio,
    speaking_teil_folder,
    speaking_turn_audio_url,
    speaking_turn_filename,
)


LEGACY_SPEAKING_AUDIO_PUBLIC_PREFIX = "/resources/ExamPreparation/exam_preparation_audio/speaking"
LEGACY_SPEAKING_AUDIO_ROOT = SPEAKING_AUDIO_ROOT.parent / "speaking"
LEGACY_MANIFEST_PATH = LEGACY_SPEAKING_AUDIO_ROOT / "manifest.json"


def _target_path(root: Path, exercise, turn) -> Path:
    base = exercise.exercise_base
    return root / speaking_teil_folder(base.exercise_type) / speaking_turn_filename(
        level=base.level, external_id=base.external_id, sequence=turn["sequence"]
    )


def _path_from_url(root: Path, url: object) -> Path | None:
    if not isinstance(url, str):
        return None
    path = urlsplit(url).path
    prefixes = (
        (f"{SPEAKING_AUDIO_PUBLIC_PREFIX}/", root),
        (f"{LEGACY_SPEAKING_AUDIO_PUBLIC_PREFIX}/", LEGACY_SPEAKING_AUDIO_ROOT),
    )
    for prefix, source_root in prefixes:
        if path.startswith(prefix):
            relative = Path(path[len(prefix):])
            break
    else:
        return None
    if not relative.parts or any(part in {"", ".", ".."} for part in relative.parts):
        return None
    return source_root.joinpath(*relative.parts)


def _load_manifest(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


_ROLE_LABEL = r"(?:TN\s*([12])|Prüfer(?:in)?|Pruefer(?:in)?)"


def _turns_from_tagged_dialogue(value: str) -> list[dict] | None:
    matches = list(re.finditer(r"<(TN[12])>\s*(.*?)\s*</\1>", value, flags=re.DOTALL | re.IGNORECASE))
    if not matches:
        return None
    unmatched = re.sub(r"<(TN[12])>\s*(.*?)\s*</\1>", "", value, flags=re.DOTALL | re.IGNORECASE)
    if unmatched.strip():
        raise CommandError("Tagged Speaking dialogue contains text outside TN1/TN2 tags")
    return [
        {"sequence": index, "role": match.group(1).upper(), "text": match.group(2).strip()}
        for index, match in enumerate(matches, start=1)
    ]


def _turns_from_labeled_dialogue(value: str) -> list[dict] | None:
    pattern = re.compile(
        rf"(?im)^\s*(?P<label>{_ROLE_LABEL})\s*[:：]\s*(?P<text>.*?)(?=^\s*{_ROLE_LABEL}\s*[:：]|\Z)",
        flags=re.DOTALL,
    )
    matches = list(pattern.finditer(value))
    if not matches:
        return None
    prefix = value[: matches[0].start()].strip()
    if prefix:
        raise CommandError("Labeled Speaking dialogue contains text before the first speaker label")
    turns = []
    for sequence, match in enumerate(matches, start=1):
        label = re.sub(r"\s+", "", match.group("label")).lower()
        role = "TN1" if label == "tn1" else "TN2" if label == "tn2" else match.group("label").strip()
        text = match.group("text").strip()
        if text:
            turns.append({"sequence": sequence, "role": role, "text": text})
    return turns or None


def _normalize_legacy_dialogue(value: object) -> list[dict]:
    """Convert safely recognizable legacy dialogue payloads to turn objects."""
    if isinstance(value, list):
        if all(isinstance(turn, dict) for turn in value):
            return value
        if all(isinstance(turn, str) and turn.strip() for turn in value):
            return [
                {"sequence": sequence, "role": "TN1" if sequence % 2 else "TN2", "text": turn.strip()}
                for sequence, turn in enumerate(value, start=1)
            ]
        raise CommandError("Speaking dialogue list contains unsupported turn values")
    if isinstance(value, str) and value.strip():
        turns = _turns_from_tagged_dialogue(value) or _turns_from_labeled_dialogue(value)
        if turns:
            return turns
        raise CommandError(
            "Speaking dialogue is one undivided string without recognizable TN1/TN2 speaker labels; "
            "the migration cannot infer safe turn boundaries"
        )
    if value in (None, ""):
        return []
    raise CommandError("Speaking dialogue is neither a turn list nor a recognizable legacy string")


class Command(BaseCommand):
    help = (
        "Migrate legacy Speaking dialogue/audio into per-Teil, per-turn MP3 files. "
        "Explicit TN labels/tags are normalized; unlabeled plain text is rejected."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Copy files and update database content")
        parser.add_argument("--delete-legacy", action="store_true", help="Delete legacy source files after a successful copy")
        parser.add_argument("--voice", default=DEFAULT_VOICE, help="Voice used for hash fallback when no manifest entry exists")
        parser.add_argument(
            "--no-generate-missing",
            action="store_true",
            help="Fail instead of generating an Azure MP3 when a legacy file cannot be matched.",
        )

    def handle(self, *args, **options):
        root = SPEAKING_AUDIO_ROOT
        voice = options["voice"]
        manifest_path = MANIFEST_PATH if MANIFEST_PATH.is_file() else LEGACY_MANIFEST_PATH
        manifest_payload = _load_manifest(manifest_path)
        manifest = manifest_payload.get("turns", {})
        operations = []
        missing = []
        seen = set()

        for exercise in SpeakingTeilExercise.objects.select_related("exercise_base").order_by("id"):
            content = exercise.content or {}
            if not isinstance(content, dict):
                raise CommandError(f"Speaking exercise {exercise.pk} content is not an object; cannot split it safely")
            dialogue = _normalize_legacy_dialogue(content.get("dialogue"))
            content["dialogue"] = dialogue
            sections = content.get("sections") or []
            if not isinstance(sections, list):
                raise CommandError(f"Speaking exercise {exercise.pk} sections is not a list")
            canonical = {str(turn.get("sequence")): turn for turn in dialogue}
            references = list(dialogue)
            for section in sections:
                if not isinstance(section, dict) or not isinstance(section.get("turns") or [], list):
                    raise CommandError(f"Speaking exercise {exercise.pk} contains an invalid section turn list")
                for turn in section.get("turns") or []:
                    sequence = str(turn.get("sequence"))
                    if sequence in canonical and str(turn.get("text") or "").strip() != str(canonical[sequence].get("text") or "").strip():
                        raise CommandError(
                            f"Conflicting Speaking text for {exercise.pk} turn {sequence}"
                        )
                    if sequence not in canonical:
                        canonical[sequence] = turn
                        references.append(turn)

            base = exercise.exercise_base
            for turn in references:
                text = str(turn.get("text") or "").strip()
                if not text:
                    continue
                sequence = str(turn.get("sequence"))
                operation_key = (exercise.pk, sequence)
                if operation_key in seen:
                    continue
                seen.add(operation_key)
                target = _target_path(root, exercise, turn)
                turn_key = f"{base.exercise_type}|{base.level}|{base.external_id}|{turn['sequence']}"
                entry = manifest.get(turn_key) if isinstance(manifest, dict) else None
                source = _path_from_url(root, turn.get("audio_url"))
                if not source or not source.is_file():
                    source = _path_from_url(root, entry.get("url")) if isinstance(entry, dict) else None
                if not source or not source.is_file():
                    fingerprint_name = f"{audio_fingerprint(voice, text)}.mp3"
                    source = next(
                        (
                            candidate
                            for candidate in (
                                root / fingerprint_name,
                                LEGACY_SPEAKING_AUDIO_ROOT / fingerprint_name,
                            )
                            if candidate.is_file()
                        ),
                        None,
                    )
                if source is None and target.is_file():
                    source = target
                if source is None:
                    missing.append(turn_key)
                new_url = speaking_turn_audio_url(
                    exercise_type=base.exercise_type,
                    level=base.level,
                    external_id=base.external_id,
                    sequence=turn["sequence"],
                )
                operations.append({
                    "exercise": exercise,
                    "turn": turn,
                    "turn_key": turn_key,
                    "text": text,
                    "target": target,
                    "source": source,
                    "url": new_url,
                })

        if missing and (not options["apply"] or options["no_generate_missing"]):
            raise CommandError(
                f"Could not match {len(missing)} Speaking turn audio files: {', '.join(missing[:10])}"
            )

        if missing:
            if not os.getenv("AZURE_SPEECH_KEY") or not os.getenv("AZURE_SPEECH_REGION"):
                raise CommandError(
                    f"{len(missing)} Speaking turn files are missing; set AZURE_SPEECH_KEY and "
                    "AZURE_SPEECH_REGION or pass --no-generate-missing only for a hard failure"
                )

        self.stdout.write(f"Planned {len(operations)} Speaking turn audio migrations.")
        if not options["apply"]:
            self.stdout.write("Dry run only. Use --apply to copy files and update database URLs.")
            return

        changed_exercises = set()
        for operation in operations:
            target = operation["target"]
            source = operation["source"]
            target.parent.mkdir(parents=True, exist_ok=True)
            if source is None:
                base = operation["exercise"].exercise_base
                operation["url"] = ensure_speaking_turn_audio(
                    exercise_type=base.exercise_type,
                    level=base.level,
                    external_id=base.external_id,
                    sequence=operation["turn"]["sequence"],
                    text=operation["text"],
                )
            elif source.resolve() != target.resolve():
                shutil.copy2(source, target)
            operation["turn"]["audio_url"] = operation["url"]
            changed_exercises.add(operation["exercise"])

        for exercise in changed_exercises:
            content = exercise.content or {}
            by_sequence = {
                str(turn.get("sequence")): turn.get("audio_url", "")
                for turn in content.get("dialogue") or []
            }
            for section in content.get("sections") or []:
                for turn in section.get("turns") or []:
                    url = by_sequence.get(str(turn.get("sequence")))
                    if url:
                        turn["audio_url"] = url
            exercise.content = content
            exercise.save(update_fields=["content", "updated_at"])

        manifest_payload["turns"] = {
            operation["turn_key"]: {"text": operation["text"], "url": operation["url"]}
            for operation in operations
        }
        manifest_path = root / "manifest.json"
        temporary_manifest = root / "manifest.json.part"
        temporary_manifest.write_text(
            json.dumps(manifest_payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary_manifest.replace(manifest_path)

        if options["delete_legacy"]:
            for legacy_root in (root, LEGACY_SPEAKING_AUDIO_ROOT):
                for legacy_file in legacy_root.glob("*.mp3"):
                    legacy_file.unlink(missing_ok=True)
            if LEGACY_MANIFEST_PATH != manifest_path:
                LEGACY_MANIFEST_PATH.unlink(missing_ok=True)
            for legacy_root in (LEGACY_SPEAKING_AUDIO_ROOT,):
                if legacy_root.is_dir():
                    for child in sorted(legacy_root.rglob("*"), reverse=True):
                        if child.is_dir():
                            child.rmdir()
                    legacy_root.rmdir()
        self.stdout.write(f"Migrated {len(operations)} Speaking turn audio files and database URLs.")
