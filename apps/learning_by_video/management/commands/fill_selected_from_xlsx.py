from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.learning_by_video.management.commands.import_videos import (
    COL_CREATOR,
    COL_TITLE,
    COL_TITLE_ORIG,
    COL_TITLE_ZH,
    SHEET_NAME as SHEET_VIDEO_DESCRIPTION,
    _normalize_media_key,
)
from apps.learning_by_video.management.commands.import_words import (
    _parse_article,
    _parse_pos_and_flags,
)
from apps.learning_by_video.models import (
    Video,
    VideoExpressionOccurrence,
    VideoWordOccurrence,
)
from apps.lexicon.models import WordText


DEFAULT_XLSX_DIR = Path("apps/learning_by_video/data/raw")

# Fallback mappings for known content shifts between DB baseline and latest XLSX.
# These rules are applied only when normal ID+匹配内容 matching fails.
WORD_TEXT_FALLBACK_MAP: dict[str, str] = {
    "feld": "Erdbeerfelder",
    "Genossenschaft": "Genossenschaftswohnung",
    "Hochsicherheit": "Hochsicherheitszone",
    "spezialist": "Herzspezialist",
    "tauf": "tauft",
}


@dataclass(frozen=True)
class ExpressionFallbackRule:
    action: str  # "map" | "skip"
    target_sheet: str = "expression"  # "expression" | "word"
    target_sid: str = ""
    target_match: str = ""


# key: (video_id, subtitle_external_id, db_expression_text)
EXPRESSION_FALLBACK_RULES: dict[tuple[int, str, str], ExpressionFallbackRule] = {
    (4, "22", "anteilig"): ExpressionFallbackRule(
        action="map",
        target_sheet="expression",
        target_sid="23",
        target_match="anteilig",
    ),
    (4, "25", "spricht"): ExpressionFallbackRule(action="skip"),
    (4, "26", "automatisiert"): ExpressionFallbackRule(
        action="map",
        target_sheet="word",
        target_sid="28",
        target_match="automatisiert",
    ),
    (16, "21", "handeln"): ExpressionFallbackRule(
        action="map",
        target_sheet="expression",
        target_sid="22",
        target_match="handeln",
    ),
    (17, "21", "Angst"): ExpressionFallbackRule(
        action="map",
        target_sheet="expression",
        target_sid="20",
        target_match="Angst",
    ),
}


def _s(v: object) -> str:
    if pd.isna(v):
        return ""
    return str(v).strip()


def _norm_text(s: str) -> str:
    return " ".join(_s(s).split()).casefold()


def _norm_id(v: object) -> str:
    s = _s(v)
    if not s:
        return ""
    try:
        return str(int(float(s)))
    except ValueError:
        return s


def _word_note(article_raw: str, category_raw: str, lemma: str) -> str:
    if not (article_raw or category_raw or lemma):
        return ""
    return f"article={article_raw}; category={category_raw}; lemma={lemma}".strip()


def _sheet(path: Path, name: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=name, engine="openpyxl").fillna("")
    df.columns = [_s(c) for c in df.columns]
    for c in df.columns:
        df[c] = df[c].map(_s)
    return df


def _resolve_video(new_xlsx: Path) -> Video | None:
    df = _sheet(new_xlsx, SHEET_VIDEO_DESCRIPTION)
    if df.shape[0] < 1:
        return None

    row = df.iloc[0]
    creator = _s(row.get(COL_CREATOR, ""))
    candidates = []
    for col in (COL_TITLE_ZH, COL_TITLE_ORIG, COL_TITLE):
        t = _s(row.get(col, ""))
        if t and t not in candidates:
            candidates.append(t)
    if not creator or not candidates:
        return None

    for title in candidates:
        v = Video.objects.filter(creator=creator, title=title).first()
        if v:
            return v

    creator_videos = list(Video.objects.filter(creator=creator).only("id", "title"))
    candidate_keys = {_normalize_media_key(t) for t in candidates}
    for v in creator_videos:
        if _normalize_media_key(v.title) in candidate_keys:
            return v
    return None


@dataclass
class MatchResult:
    status: str
    selected_text: str = ""
    used_key: tuple[str, str] | None = None
    reason: str = ""


class SheetSelectedIndex:
    """
    Index xlsx rows by (subtitle_id, 匹配内容) for selected_text lookup.
    """

    def __init__(self, df: pd.DataFrame) -> None:
        self.exact: dict[tuple[str, str], list[str]] = defaultdict(list)
        self.norm: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
        self.payload: dict[tuple[str, str], dict[str, str]] = {}
        self.all_exact_keys: set[tuple[str, str]] = set()
        self.matched_exact_keys: set[tuple[str, str]] = set()

        for _, row in df.iterrows():
            sid = _norm_id(row.get("ID", ""))
            match = _s(row.get("匹配内容", ""))
            sel = _s(row.get("原文选中", ""))
            if not sid or not match:
                continue
            exact_key = (sid, match)
            norm_key = (sid, _norm_text(match))
            self.exact[exact_key].append(sel)
            self.norm[norm_key].append((match, sel))
            self.all_exact_keys.add(exact_key)
            if exact_key not in self.payload:
                self.payload[exact_key] = {
                    "selected_text": sel,
                    "translation": _s(row.get("翻译", "")),
                    "article_raw": _s(row.get("词性", "")),
                    "category_raw": _s(row.get("类别", "")),
                    "lemma": _s(row.get("lemma", "") or row.get("Lemma", "")),
                }

    def lookup(self, sid: str, match: str) -> MatchResult:
        sid = _norm_id(sid)
        match = _s(match)
        if not sid or not match:
            return MatchResult(status="unmatched", reason="missing sid or match")

        exact_key = (sid, match)
        vals = self.exact.get(exact_key, [])
        if vals:
            non_empty = sorted({v for v in vals if v})
            if len(non_empty) > 1:
                return MatchResult(status="ambiguous", reason=f"multiple selected_text values: {non_empty}")
            selected = non_empty[0] if non_empty else ""
            self.matched_exact_keys.add(exact_key)
            return MatchResult(status="matched", selected_text=selected, used_key=exact_key)

        norm_key = (sid, _norm_text(match))
        cands = self.norm.get(norm_key, [])
        if not cands:
            return MatchResult(status="unmatched", reason="no xlsx row by ID+匹配内容")

        match_forms = sorted({m for m, _ in cands})
        if len(match_forms) > 1:
            return MatchResult(status="ambiguous", reason=f"normalized collision: {match_forms}")

        non_empty = sorted({sel for _, sel in cands if sel})
        if len(non_empty) > 1:
            return MatchResult(status="ambiguous", reason=f"multiple selected_text values: {non_empty}")

        selected = non_empty[0] if non_empty else ""
        used_match = match_forms[0]
        used_key = (sid, used_match)
        self.matched_exact_keys.add(used_key)
        return MatchResult(status="matched", selected_text=selected, used_key=used_key)

    def unmatched_xlsx_keys(self) -> list[tuple[str, str]]:
        return sorted(self.all_exact_keys - self.matched_exact_keys, key=lambda x: (x[0], x[1]))

    def payload_for(self, key: tuple[str, str] | None) -> dict[str, str]:
        if not key:
            return {}
        return self.payload.get(key, {})


class Command(BaseCommand):
    help = (
        "Fill selected_text in DB from latest XLSX (raw) based on current DB occurrences. "
        "Matches by subtitle ID + 匹配内容 for word/expression and prints unmatched cases."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--mode", choices=["validate", "apply"], default="validate")
        parser.add_argument("--xlsx-dir", type=Path, default=DEFAULT_XLSX_DIR)
        parser.add_argument(
            "--file",
            default="",
            help="Optional single xlsx filename or full path under --xlsx-dir.",
        )

    def _collect_files(self, xlsx_dir: Path, file_arg: str) -> list[Path]:
        if file_arg:
            p = Path(file_arg)
            if p.exists():
                return [p]
            q = xlsx_dir / file_arg
            if q.exists():
                return [q]
            raise FileNotFoundError(str(q))
        return sorted(xlsx_dir.glob("*.xlsx"))

    def handle(self, *args: Any, **options: Any) -> None:
        mode = str(options["mode"])
        xlsx_dir: Path = options["xlsx_dir"]
        file_arg = str(options.get("file") or "").strip()

        xlsx_files = self._collect_files(xlsx_dir, file_arg)
        if not xlsx_files:
            self.stdout.write(self.style.WARNING("No xlsx files found."))
            return

        # Resolve xlsx -> video, and build per-video indexes
        video_map: dict[int, tuple[str, SheetSelectedIndex, SheetSelectedIndex]] = {}
        unresolved_xlsx: list[str] = []

        for xlsx_path in xlsx_files:
            try:
                video = _resolve_video(xlsx_path)
            except Exception as e:
                unresolved_xlsx.append(f"{xlsx_path.name} | resolve error: {e}")
                continue

            if video is None:
                unresolved_xlsx.append(f"{xlsx_path.name} | video not found")
                continue

            try:
                word_df = _sheet(xlsx_path, "word")
                expr_df = _sheet(xlsx_path, "expression")
            except Exception as e:
                unresolved_xlsx.append(f"{xlsx_path.name} | read sheet error: {e}")
                continue

            if video.id in video_map:
                unresolved_xlsx.append(f"{xlsx_path.name} | duplicated video mapping (video_id={video.id})")
                continue

            video_map[video.id] = (
                xlsx_path.name,
                SheetSelectedIndex(word_df),
                SheetSelectedIndex(expr_df),
            )

        updated_word_selected = 0
        updated_expr_selected = 0
        updated_word_category = 0
        unmatched_db: list[str] = []
        xlsx_leftovers: list[str] = []

        with transaction.atomic():
            # WORD
            for occ in VideoWordOccurrence.objects.select_related("video", "subtitle", "word").all():
                bundle = video_map.get(occ.video_id)
                if bundle is None:
                    continue
                file_name, widx, _ = bundle
                sid = _norm_id(occ.subtitle.external_id if occ.subtitle_id else "")
                text = _s(occ.word.text if occ.word_id else "")

                if not sid:
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
                    unmatched_db.append(
                        f"[DB][word] video={occ.video_id} file={file_name} occ_id={occ.id} "
                        f"ID={sid} 匹配内容={text} | reason={mr.reason}"
                    )
                    continue

                changed_fields: list[str] = []
                if mr.selected_text and occ.selected_text != mr.selected_text:
                    occ.selected_text = mr.selected_text
                    changed_fields.append("selected_text")
                    updated_word_selected += 1

                row = widx.payload_for(mr.used_key)
                if row:
                    article_raw = row.get("article_raw", "")
                    category_raw = row.get("category_raw", "")
                    lemma = row.get("lemma", "")
                    target_text = mr.used_key[1] if mr.used_key else text

                    article = _parse_article(article_raw)
                    pos, splittable = _parse_pos_and_flags(category_raw)
                    target_word, _ = WordText.objects.get_or_create(
                        language="de",
                        text=target_text,
                        lemma=lemma,
                        pos=pos,
                        article=article,
                        defaults={"splittable": splittable},
                    )
                    if target_word.splittable != splittable:
                        target_word.splittable = splittable
                        target_word.save(update_fields=["splittable"])

                    before_word_id = occ.word_id
                    before_note = occ.note

                    if occ.word_id != target_word.id:
                        occ.word = target_word
                        changed_fields.append("word")
                    new_note = _word_note(article_raw, category_raw, lemma)
                    if occ.note != new_note:
                        occ.note = new_note
                        changed_fields.append("note")

                    if before_word_id != occ.word_id or before_note != occ.note:
                        updated_word_category += 1

                if changed_fields:
                    unique_fields = sorted(set(changed_fields))
                    occ.save(update_fields=unique_fields)

            # EXPRESSION
            for occ in VideoExpressionOccurrence.objects.select_related("video", "subtitle", "expression").all():
                bundle = video_map.get(occ.video_id)
                if bundle is None:
                    continue
                file_name, widx, eidx = bundle
                sid = _norm_id(occ.subtitle.external_id if occ.subtitle_id else "")
                text = _s(occ.expression.text if occ.expression_id else "")

                if not sid:
                    unmatched_db.append(
                        f"[DB][expression] video={occ.video_id} file={file_name} occ_id={occ.id} "
                        f"text={text} | reason=no subtitle external_id"
                    )
                    continue

                mr = eidx.lookup(sid, text)
                if mr.status != "matched":
                    rule = EXPRESSION_FALLBACK_RULES.get((occ.video_id, sid, text))
                    if rule and rule.action == "skip":
                        continue
                    if rule and rule.action == "map":
                        target_idx = eidx if rule.target_sheet == "expression" else widx
                        mr = target_idx.lookup(rule.target_sid, rule.target_match)
                        if mr.status != "matched" and not mr.reason:
                            mr = MatchResult(status="unmatched", reason="fallback mapping target missing")

                if mr.status != "matched":
                    unmatched_db.append(
                        f"[DB][expression] video={occ.video_id} file={file_name} occ_id={occ.id} "
                        f"ID={sid} 匹配内容={text} | reason={mr.reason}"
                    )
                    continue

                if mr.selected_text and occ.selected_text != mr.selected_text:
                    occ.selected_text = mr.selected_text
                    occ.save(update_fields=["selected_text"])
                    updated_expr_selected += 1

            # XLSX rows that never matched any DB occurrence
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
            f"selected_text updates planned/executed: word={updated_word_selected}, expression={updated_expr_selected}"
        )
        self.stdout.write(f"word category sync planned/executed: {updated_word_category}")

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

        if mode == "validate":
            self.stdout.write(self.style.WARNING("\nvalidate mode: rolled back"))
        else:
            self.stdout.write(self.style.SUCCESS("\napply mode: committed"))
