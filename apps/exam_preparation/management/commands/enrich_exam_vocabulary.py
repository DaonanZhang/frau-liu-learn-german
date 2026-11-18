from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from http.client import HTTPException
from time import sleep
from urllib.error import HTTPError, URLError
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.core.management.base import BaseCommand, CommandError

from apps.exam_preparation.models import ExamVocabularyCard


API_URL = "https://de.wiktionary.org/w/api.php"
USER_AGENT = "FrauLiuExamVocabularyBot/1.0 (educational vocabulary enrichment)"
REQUEST_TIMEOUT = 20
BATCH_SIZE = 50
MAX_REQUEST_ATTEMPTS = 3
MAX_RETRY_AFTER_SECONDS = 30
BATCH_DELAY_SECONDS = 0.75
FIELDS = ("part_of_speech", "article", "plural", "verb_forms")


def _retry_delay(error: HTTPError, retry_number: int) -> float:
    retry_after = error.headers.get("Retry-After") if error.headers else None
    if retry_after:
        try:
            return min(MAX_RETRY_AFTER_SECONDS, max(0.0, float(retry_after)))
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(retry_after)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()
                return min(MAX_RETRY_AFTER_SECONDS, max(0.0, seconds))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(MAX_RETRY_AFTER_SECONDS, float(2 ** (retry_number - 1)))


def fetch_wiktionary_pages(titles: list[str]) -> dict[str, str]:
    """Fetch a batch of German Wiktionary pages, keyed by requested title."""
    params = urlencode({
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
        "formatversion": 2,
        "redirects": 1,
        "titles": "|".join(titles),
    })
    request = Request(
        f"{API_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    for attempt in range(1, MAX_REQUEST_ATTEMPTS + 1):
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except HTTPError as exc:
            if exc.code not in {429, 502, 503, 504} or attempt == MAX_REQUEST_ATTEMPTS:
                raise
            sleep(_retry_delay(exc, attempt))

    if not isinstance(payload, dict) or payload.get("error") or not isinstance(payload.get("query"), dict):
        raise ValueError(f"unexpected MediaWiki response: {payload.get('error', 'missing query') if isinstance(payload, dict) else 'invalid JSON object'}")
    query = payload.get("query") or {}
    title_aliases = {title: title for title in titles}
    for item in query.get("normalized", []) + query.get("converted", []) + query.get("redirects", []):
        source = item.get("from", "")
        target = item.get("to", "")
        if source and target:
            title_aliases[target] = title_aliases.get(source, source)
    pages = {}
    for page in query.get("pages", []):
        revisions = page.get("revisions") or []
        if not revisions or page.get("missing"):
            continue
        slots = revisions[0].get("slots") or {}
        main = slots.get("main") or {}
        content = main.get("content", main.get("*", revisions[0].get("content", revisions[0].get("*", ""))))
        if not isinstance(content, str):
            continue
        returned_title = page.get("title", "")
        requested_title = title_aliases.get(returned_title, returned_title)
        pages[requested_title] = content
    return pages


def _german_section(wikitext: str) -> str | None:
    headings = list(re.finditer(r"(?m)^==(?!=)[^\n]*?(?<!\=)==[ \t]*$", wikitext))
    for index, match in enumerate(headings):
        heading = match.group(0)
        if re.search(r"\(\s*\{\{\s*Sprache\s*\|\s*Deutsch\s*\}\}\s*\)", heading, re.I):
            end = headings[index + 1].start() if index + 1 < len(headings) else len(wikitext)
            return wikitext[match.end():end]
    return None


def _templates_named(section: str, name: str):
    pattern = re.compile(
        r"\{\{\s*" + re.escape(name) + r"\s*(?=(?:\||\}\}))([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}",
        re.I | re.S,
    )
    return [match.group(1) for match in pattern.finditer(section)]


def _template_parameters(body: str) -> dict[str, list[str]]:
    parameters = {}
    segments = []
    current = []
    template_depth = 0
    link_depth = 0
    index = 0
    while index < len(body):
        pair = body[index:index + 2]
        if pair == "{{":
            template_depth += 1
            current.append(pair)
            index += 2
            continue
        if pair == "}}" and template_depth:
            template_depth -= 1
            current.append(pair)
            index += 2
            continue
        if pair == "[[":
            link_depth += 1
            current.append(pair)
            index += 2
            continue
        if pair == "]]" and link_depth:
            link_depth -= 1
            current.append(pair)
            index += 2
            continue
        if body[index] == "|" and not template_depth and not link_depth:
            segments.append("".join(current))
            current = []
        else:
            current.append(body[index])
        index += 1
    segments.append("".join(current))
    for segment in segments:
        match = re.match(r"\s*([^=]+?)\s*=\s*(.*?)\s*$", segment, flags=re.S)
        if match:
            parameters.setdefault(match.group(1).strip(), []).append(match.group(2).strip())
    return parameters


def _clean_value(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.S)
    value = re.sub(r"<ref\b[^>]*>.*?</ref\s*>|<ref\b[^/]*/\s*>", "", value, flags=re.I | re.S)
    value = re.sub(r"\[\[([^\]|]+\|([^\]]+))\]\]", r"\2", value)
    value = re.sub(r"\[\[([^\]]+)\]\]", r"\1", value)
    value = re.sub(r"\[https?://[^ ]+\s+([^\]]+)\]", r"\1", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"'{2,5}", "", value)
    value = re.sub(r"\{\{[^{}]*\}\}", "", value)
    value = re.sub(r"\s+", " ", value).strip(" \t\r\n,;:")
    if not value or value.casefold() in {"—", "–", "-", "kein plural", "kpl", "n/a", "?"}:
        return ""
    return value


def parse_german_vocabulary(wikitext: str) -> dict:
    section = _german_section(wikitext)
    if section is None:
        return {}
    result = {}

    wortart = _templates_named(section, "Wortart")
    if wortart:
        parts = [part.strip() for part in wortart[0].split("|") if part.strip()]
        if parts and parts[0] and parts[0].casefold() != "deutsch":
            result["part_of_speech"] = _clean_value(parts[0])

    overview_templates = _templates_named(section, "Deutsch Substantiv Übersicht")
    if overview_templates:
        parameters = _template_parameters(overview_templates[0])
        genus = next((_clean_value(value) for value in parameters.get("Genus", []) if _clean_value(value)), "")
        if not genus:
            genus = next((value for value in ("m", "f", "n") if re.search(r"\{\{\s*" + value + r"\s*\}\}", section, re.I)), "")
        article = {"m": "der", "f": "die", "n": "das"}.get(genus.casefold())
        if article:
            result["article"] = article
        plural_keys = [key for key in parameters if re.fullmatch(r"Nominativ Plural(?:\s*\d+)?", key, re.I)]
        plural = next((_clean_value(value) for key in plural_keys for value in parameters[key] if _clean_value(value)), "")
        if plural:
            result["plural"] = plural

    verb_templates = _templates_named(section, "Deutsch Verb Übersicht")
    if verb_templates:
        parameters = _template_parameters(verb_templates[0])
        mapping = {
            "Präsens_ich": "Präsens ich",
            "Präteritum_ich": "Präteritum ich",
            "Partizip II": "Partizip II",
        }
        forms = {}
        for source, display in mapping.items():
            value = next((_clean_value(item) for item in parameters.get(source, []) if _clean_value(item)), "")
            if value:
                forms[display] = value
        if forms:
            result["verb_forms"] = forms
    return result


def _query_title(term: str) -> str:
    title = term.strip()
    title = re.sub(r"^(?:der|die|das)\s+", "", title, flags=re.I)
    title = re.sub(r"^sich\s+", "", title, flags=re.I)
    return title.strip()


class Command(BaseCommand):
    help = "Enrich TELC C1 exam vocabulary cards from German Wiktionary."

    def add_arguments(self, parser):
        parser.add_argument("--exam-type", default="TELC")
        parser.add_argument("--level", default="C1")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--overwrite", action="store_true")
        parser.add_argument("--limit", type=int)

    def handle(self, *args, **options):
        queryset = ExamVocabularyCard.objects.filter(
            exam_type=options["exam_type"], level=options["level"]
        ).order_by("id")
        if options["limit"] is not None:
            queryset = queryset[:max(0, options["limit"])]
        cards = list(queryset)
        titles = list(dict.fromkeys(title for card in cards if (title := _query_title(card.term))))
        batches = [titles[index:index + BATCH_SIZE] for index in range(0, len(titles), BATCH_SIZE)]
        pages = {}
        for batch_number, batch in enumerate(batches, start=1):
            try:
                pages.update(fetch_wiktionary_pages(batch))
            except (URLError, HTTPException, TimeoutError, OSError, ValueError, KeyError, TypeError) as exc:
                raise CommandError(
                    f"Wiktionary batch {batch_number}/{len(batches)} ({', '.join(batch[:3])}) failed: {exc}"
                ) from exc
            if batch_number < len(batches):
                sleep(BATCH_DELAY_SECONDS)

        stats = {"scanned": len(cards), "matched": 0, "updated": 0, "missing": 0}
        for card in cards:
            title = _query_title(card.term)
            wikitext = pages.get(title)
            parsed = parse_german_vocabulary(wikitext) if wikitext else {}
            if not parsed:
                stats["missing"] += 1
                continue
            stats["matched"] += 1
            changed = []
            for field in FIELDS:
                value = parsed.get(field)
                if not value:
                    continue
                current = getattr(card, field)
                if options["overwrite"] or not current:
                    if current != value:
                        setattr(card, field, value)
                        changed.append(field)
            if changed:
                stats["updated"] += 1
                if not options["dry_run"]:
                    card.save(update_fields=[*changed, "updated_at"])

        self.stdout.write(
            f"scanned={stats['scanned']} matched={stats['matched']} updated={stats['updated']} missing={stats['missing']}"
            + (" dry_run=true" if options["dry_run"] else "")
        )
