"""Resolve and create generated Sprechen turn audio files."""

from __future__ import annotations

import hashlib
import os
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape

from django.conf import settings


SPEAKING_AUDIO_ROOT = (
    settings.BASE_DIR / "frontend" / "public" / "resources" / "ExamPreparation"
    / "exam_preparation_audio" / "telc_b1_speaking"
)
SPEAKING_AUDIO_PUBLIC_PREFIX = "/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking"
MANIFEST_PATH = SPEAKING_AUDIO_ROOT / "manifest.json"
# Kept for the one-time migration/audit command; runtime URL resolution never reads it.
DEFAULT_VOICE = "de-DE-KatjaNeural"


def speaking_teil_folder(exercise_type: str) -> str:
    match = re.search(r"SPEAKING_TEIL([123])$", str(exercise_type).upper())
    if not match:
        raise ValueError(f"Unsupported speaking exercise type: {exercise_type!r}")
    return f"teil{match.group(1)}"


def _safe_component(value: object) -> str:
    result = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value).strip())
    return result.strip("._") or "unknown"


def speaking_turn_filename(*, level: str, external_id: str, sequence: object) -> str:
    return f"{_safe_component(level)}_{_safe_component(external_id)}_{_safe_component(sequence)}.mp3"


def speaking_turn_audio_path(*, exercise_type: str, level: str, external_id: str, sequence: object) -> Path:
    return SPEAKING_AUDIO_ROOT / speaking_teil_folder(exercise_type) / speaking_turn_filename(
        level=level, external_id=external_id, sequence=sequence
    )


def speaking_turn_audio_url(*, exercise_type: str, level: str, external_id: str, sequence: object) -> str:
    return (
        f"{SPEAKING_AUDIO_PUBLIC_PREFIX}/{speaking_teil_folder(exercise_type)}/"
        f"{speaking_turn_filename(level=level, external_id=external_id, sequence=sequence)}"
    )


def audio_fingerprint(voice: str, text: str) -> str:
    return hashlib.sha256(f"{voice}\0{text}".encode("utf-8")).hexdigest()


def synthesize_speaking_audio(text: str, *, voice: str, region: str, key: str) -> bytes:
    ssml = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        'xml:lang="de-DE">'
        f'<voice name="{escape(voice)}">{escape(text)}</voice>'
        "</speak>"
    ).encode("utf-8")
    request = Request(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=ssml,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "frau-liu-speaking-audio/1.0",
        },
        method="POST",
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=45) as response:
                audio = response.read()
                if not audio:
                    raise RuntimeError("Azure returned an empty audio file")
                return audio
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f"Azure Speech failed with HTTP {error.code}") from error
        except URLError as error:
            if attempt == 2:
                raise RuntimeError(f"Azure Speech connection failed: {error.reason}") from error
        time.sleep(2**attempt)
    raise RuntimeError("Azure Speech did not return audio")


def ensure_speaking_turn_audio(
    *, exercise_type: str, level: str, external_id: str, sequence: object, text: str,
    voice: str = DEFAULT_VOICE, region: str | None = None, key: str | None = None,
    overwrite: bool = False, synthesizer=synthesize_speaking_audio,
) -> str:
    text = str(text or "").strip()
    if not text:
        return ""
    region = (region or os.getenv("AZURE_SPEECH_REGION", "")).lower()
    key = key or os.getenv("AZURE_SPEECH_KEY", "")
    if not key or not re.fullmatch(r"[a-z0-9]+", region):
        raise RuntimeError("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the environment")
    target = speaking_turn_audio_path(
        exercise_type=exercise_type, level=level, external_id=external_id, sequence=sequence
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.is_file() or overwrite:
        audio = synthesizer(text, voice=voice, region=region, key=key)
        temporary = target.with_suffix(".mp3.part")
        temporary.write_bytes(audio)
        temporary.replace(target)
    return speaking_turn_audio_url(
        exercise_type=exercise_type, level=level, external_id=external_id, sequence=sequence
    )


def _is_speaking_audio_url(url: object) -> bool:
    if not isinstance(url, str):
        return False
    parsed = urlsplit(url)
    return (
        parsed.scheme == "" and parsed.netloc == ""
        and parsed.path.startswith(f"{SPEAKING_AUDIO_PUBLIC_PREFIX}/")
        and parsed.path.endswith(".mp3")
    )


def get_speaking_turn_audio_url(exercise, turn):
    stored_url = turn.get("audio_url")
    if _is_speaking_audio_url(stored_url):
        return stored_url
    return ""
