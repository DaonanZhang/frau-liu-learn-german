from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.management.commands.fill_selected_from_xlsx import (
    EXPRESSION_FALLBACK_RULES,
    WORD_TEXT_FALLBACK_MAP,
    _norm_id,
    _norm_text,
    _resolve_video,
    _s,
    _sheet,
)
from apps.learning_by_video.models import VideoExpressionOccurrence, VideoWordOccurrence


DEFAULT_RAW_XLSX_DIR = Path("apps/learning_by_video/data/raw")
DEFAULT_PROCESSED_XLSX_DIR = Path("apps/learning_by_video/data/processed")
COL_NOTE = "附注"


@dataclass
class NoteMatchResult:
    status: str
    note: str = ""
    used_key: tuple[str, str] | None = None
    reason: str = ""


class XlsxNoteIndex:
    """
    Index xlsx note rows by (subtitle_id, 匹配内容).
    """

    def __init__(self, df) -> None:
        self.exact: dict[tuple[str, str], list[str]] = defaultdict(list)
        self.norm: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
        self.all_exact_keys: set[tuple[str, str]] = set()
        self.matched_exact_keys: set[tuple[str, str]] = set()

        for _, row in df.iterrows():
            sid = _norm_id(row.get("ID", ""))
            match = _s(row.get("匹配内容", ""))
            note = _s(row.get(COL_NOTE, ""))
            if not sid or not match:
                continue

            exact_key = (sid, match)
            norm_key = (sid, _norm_text(match))
            self.exact[exact_key].append(note)
            self.norm[norm_key].append((match, note))
            self.all_exact_keys.add(exact_key)

    def lookup(self, sid: str, match: str) -> NoteMatchResult:
        sid = _norm_id(sid)
        match = _s(match)
        if not sid or not match:
            return NoteMatchResult(status="unmatched", reason="missing sid or match")

        exact_key = (sid, match)
        values = self.exact.get(exact_key, [])
        if values:
            distinct = sorted(set(values))
            if len(distinct) > 1:
                return NoteMatchResult(status="ambiguous", reason=f"multiple note values: {distinct}")
            self.matched_exact_keys.add(exact_key)
            return NoteMatchResult(status="matched", note=distinct[0] if distinct else "", used_key=exact_key)

        norm_key = (sid, _norm_text(match))
        candidates = self.norm.get(norm_key, [])
        if not candidates:
            return NoteMatchResult(status="unmatched", reason="no xlsx row by ID+匹配内容")

        match_forms = sorted({m for m, _ in candidates})
        if len(match_forms) > 1:
            return NoteMatchResult(status="ambiguous", reason=f"normalized collision: {match_forms}")

        note_values = sorted({note for _, note in candidates})
        if len(note_values) > 1:
            return NoteMatchResult(status="ambiguous", reason=f"multiple note values: {note_values}")

        used_key = (sid, match_forms[0])
        self.matched_exact_keys.add(used_key)
        return NoteMatchResult(
            status="matched",
            note=note_values[0] if note_values else "",
            used_key=used_key,
        )

    def unmatched_xlsx_keys(self) -> list[tuple[str, str]]:
        return sorted(self.all_exact_keys - self.matched_exact_keys, key=lambda x: (x[0], x[1]))


class Command(BaseCommand):
    help = (
        "Sync VideoWordOccurrence/VideoExpressionOccurrence.note from xlsx '附注' column. "
        "Matches by resolved video + subtitle ID + 匹配内容. Empty xlsx note clears DB note."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--mode", choices=["validate", "apply"], default="validate")
        parser.add_argument("--xlsx-dir", type=Path, default=DEFAULT_RAW_XLSX_DIR)
        parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_XLSX_DIR)
        parser.add_argument(
            "--file",
            default="",
            help="Optional single xlsx filename or full path under --xlsx-dir/--processed-dir.",
        )

    def _collect_files(self, xlsx_dir: Path, processed_dir: Path, file_arg: str) -> list[Path]:
        if file_arg:
            p = Path(file_arg)
            if p.exists():
                return [p]

            candidates = [xlsx_dir / file_arg, processed_dir / file_arg]
            found = [candidate for candidate in candidates if candidate.exists()]
            if found:
                return found[:1]
            raise FileNotFoundError(str(candidates[0]))

        files: list[Path] = []
        seen: set[Path] = set()
        for root in (xlsx_dir, processed_dir):
            if not root.exists():
                continue
            for path in sorted(root.glob("*.xlsx")):
                if path in seen:
                    continue
                seen.add(path)
                files.append(path)
        return files

    def handle(self, *args: Any, **options: Any) -> None:
        mode = str(options["mode"])
        xlsx_dir: Path = options["xlsx_dir"]
        processed_dir: Path = options["processed_dir"]
        file_arg = str(options.get("file") or "").strip()

        xlsx_files = self._collect_files(xlsx_dir, processed_dir, file_arg)
        if not xlsx_files:
            self.stdout.write(self.style.WARNING("No xlsx files found."))
            return

        video_map: dict[int, tuple[str, XlsxNoteIndex, XlsxNoteIndex]] = {}
        unresolved_xlsx: list[str] = []
        unmatched_db: list[str] = []
        xlsx_leftovers: list[str] = []

        for xlsx_path in xlsx_files:
            try:
                video = _resolve_video(xlsx_path)
            except Exception as exc:
                unresolved_xlsx.append(f"{xlsx_path.name} | resolve error: {exc}")
                continue

            if video is None:
                unresolved_xlsx.append(f"{xlsx_path.name} | video not found")
                continue

            try:
                word_df = _sheet(xlsx_path, "word")
                expr_df = _sheet(xlsx_path, "expression")
            except Exception as exc:
                unresolved_xlsx.append(f"{xlsx_path.name} | read sheet error: {exc}")
                continue

            if video.id in video_map:
                unresolved_xlsx.append(f"{xlsx_path.name} | duplicated video mapping (video_id={video.id})")
                continue

            video_map[video.id] = (
                xlsx_path.name,
                XlsxNoteIndex(word_df),
                XlsxNoteIndex(expr_df),
            )

        updated_word_notes = 0
        updated_expression_notes = 0

        with transaction.atomic():
            for occ in VideoWordOccurrence.objects.select_related("subtitle", "word").all():
                bundle = video_map.get(occ.video_id)
                if bundle is None:
                    continue

                file_name, widx, _ = bundle
                sid = _norm_id(occ.subtitle.external_id if occ.subtitle_id else "")
                text = _s(occ.word.text if occ.word_id else "")

                if not sid:
                    current_note = occ.note or ""
                    if current_note != "":
                        occ.note = ""
                        occ.save(update_fields=["note"])
                        updated_word_notes += 1
                    unmatched_db.append(
                        f"[DB][word] video={occ.video_id} file={file_name} occ_id={occ.id} "
                        f"text={text} | reason=no subtitle external_id"
                    )
                    continue

                mr = widx.lookup(sid, text)
                if mr.status != "matched":
                    mapped_text = WORD_TEXT_FALLBACK_MAP.get(text)
                    if mapped_text:
                        mr = widx.lookup(sid, mapped_text)

                if mr.status != "matched":
                    current_note = occ.note or ""
                    if current_note != "":
                        occ.note = ""
                        occ.save(update_fields=["note"])
                        updated_word_notes += 1
                    unmatched_db.append(
                        f"[DB][word] video={occ.video_id} file={file_name} occ_id={occ.id} "
                        f"ID={sid} 匹配内容={text} | reason={mr.reason}"
                    )
                    continue

                next_note = mr.note
                current_note = occ.note or ""
                if current_note != next_note:
                    occ.note = next_note
                    occ.save(update_fields=["note"])
                    updated_word_notes += 1

            for occ in VideoExpressionOccurrence.objects.select_related("subtitle", "expression").all():
                bundle = video_map.get(occ.video_id)
                if bundle is None:
                    continue

                file_name, widx, eidx = bundle
                sid = _norm_id(occ.subtitle.external_id if occ.subtitle_id else "")
                text = _s(occ.expression.text if occ.expression_id else "")

                if not sid:
                    current_note = occ.note or ""
                    if current_note != "":
                        occ.note = ""
                        occ.save(update_fields=["note"])
                        updated_expression_notes += 1
                    unmatched_db.append(
                        f"[DB][expression] video={occ.video_id} file={file_name} occ_id={occ.id} "
                        f"text={text} | reason=no subtitle external_id"
                    )
                    continue

                mr = eidx.lookup(sid, text)
                if mr.status != "matched":
                    rule = EXPRESSION_FALLBACK_RULES.get((occ.video_id, sid, text))
                    if rule and rule.action == "skip":
                        current_note = occ.note or ""
                        if current_note != "":
                            occ.note = ""
                            occ.save(update_fields=["note"])
                            updated_expression_notes += 1
                        unmatched_db.append(
                            f"[DB][expression] video={occ.video_id} file={file_name} occ_id={occ.id} "
                            f"ID={sid} 匹配内容={text} | reason=fallback skip"
                        )
                        continue
                    if rule and rule.action == "map":
                        target_idx = eidx if rule.target_sheet == "expression" else widx
                        mr = target_idx.lookup(rule.target_sid, rule.target_match)
                        if mr.status != "matched" and not mr.reason:
                            mr = NoteMatchResult(status="unmatched", reason="fallback mapping target missing")

                if mr.status != "matched":
                    current_note = occ.note or ""
                    if current_note != "":
                        occ.note = ""
                        occ.save(update_fields=["note"])
                        updated_expression_notes += 1
                    unmatched_db.append(
                        f"[DB][expression] video={occ.video_id} file={file_name} occ_id={occ.id} "
                        f"ID={sid} 匹配内容={text} | reason={mr.reason}"
                    )
                    continue

                next_note = mr.note
                current_note = occ.note or ""
                if current_note != next_note:
                    occ.note = next_note
                    occ.save(update_fields=["note"])
                    updated_expression_notes += 1

            for vid, (file_name, widx, eidx) in video_map.items():
                for sid, match in widx.unmatched_xlsx_keys():
                    xlsx_leftovers.append(
                        f"[XLSX][word] video={vid} file={file_name} ID={sid} 匹配内容={match} | reason=no DB match"
                    )
                for sid, match in eidx.unmatched_xlsx_keys():
                    xlsx_leftovers.append(
                        f"[XLSX][expression] video={vid} file={file_name} ID={sid} 匹配内容={match} | reason=no DB match"
                    )

            if mode == "validate":
                transaction.set_rollback(True)

        self.stdout.write(f"mode={mode}")
        self.stdout.write(f"videos mapped from xlsx: {len(video_map)}")
        self.stdout.write(
            f"note updates planned/executed: word={updated_word_notes}, expression={updated_expression_notes}"
        )

        self.stdout.write("\n=== unresolved xlsx ===")
        if not unresolved_xlsx:
            self.stdout.write("none")
        else:
            for line in unresolved_xlsx:
                self.stdout.write(line)

        self.stdout.write("\n=== unmatched DB occurrences ===")
        if not unmatched_db:
            self.stdout.write("none")
        else:
            for line in unmatched_db:
                self.stdout.write(line)

        self.stdout.write("\n=== xlsx rows without DB match ===")
        if not xlsx_leftovers:
            self.stdout.write("none")
        else:
            for line in xlsx_leftovers:
                self.stdout.write(line)
