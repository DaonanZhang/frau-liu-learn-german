# Local Dictionary Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the repository's Superagent/Subagent workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local dictionary lookup Unicode-correct, validate the complete real-user flow, and decide from measured evidence whether a second open dictionary is necessary.

**Architecture:** Keep the current `DictionaryEntry`/`DictionaryForm` schema and normalize dictionary comparison keys to NFC before `casefold()`. Measure remaining gaps separately; any future source remains source-tagged and is merged by the existing entry identity rather than overwriting WikDict.

**Tech Stack:** Django, PostgreSQL, React/Vite, Vitest, local WikDict SQLite, Morfologik-derived TSV.

**Spec:** `docs/superpowers/specs/2026-11-12-dictionary-validation-design.md`

## Global Constraints

- Keep lookup local and entitlement-protected.
- Preserve German case distinctions.
- Do not add dependencies or commit/push changes.
- Do not import a second source until incremental coverage and licensing are measured.

## Review Focus

- NFC versus NFD umlauts must resolve to the same entries.
- Case-sensitive lemma mapping must distinguish `Gehen` from `gehen` and `Dürfen` from `dürfen`, without a cross-case fallback.
- Re-importing normalized data must remain idempotent.
- Favorite creation must reuse the existing card identity.
- Unmatched contractions and compounds must be classified as data gaps, not silently guessed.

---

### Task 1: Unicode-correct dictionary keys

**Files:**
- Modify: `apps/lexicon/models/dictionary.py`
- Modify: `apps/lexicon/tests_dictionary_import.py`
- Modify: `apps/lexicon/tests_dictionary_api.py`

**Interfaces:**
- Consumes: `normalize_dictionary_form(value: str) -> str`
- Produces: NFC-normalized, trimmed, case-folded lookup keys

- [ ] Add failing model/import and API tests proving `dürfen` and `du\u0308rfen` return the same entry.
- [ ] Add a regression assertion that `Gehen` and `gehen` remain separate headwords during morphology import.
- [ ] Change `normalize_dictionary_form` to apply `unicodedata.normalize("NFC", value)` before `strip().casefold()`.
- [ ] Run `apps.lexicon.tests_dictionary_import` and `apps.lexicon.tests_dictionary_api` with SQLite test settings.
- [ ] Re-import the local dictionary into PostgreSQL and query both Unicode representations.

### Task 2: Real-user and coverage acceptance

**Files:**
- No product-code changes expected.

**Interfaces:**
- Consumes: dictionary lookup/favorite API and real exam text
- Produces: verified UI result, card row, and coverage report

- [ ] Verify account `+86 / 110` can open an exam reading text.
- [ ] Verify mobile-width point lookup and favorite toggling.
- [ ] Verify the resulting `ExamVocabularyCard` fields and favorite ownership.
- [ ] Measure occurrence and unique-form coverage over all reading-understanding text.
- [ ] Run backend dictionary/vocabulary tests, frontend focused tests, migration check, and production build.

### Task 2A: Mobile vocabulary-card controls

**Files:**
- Modify: `frontend/src/pages/LexiconPage/LexiconPage.jsx`
- Modify: `frontend/src/pages/LexiconPage/LexiconPage.test.jsx`

**Interfaces:**
- Consumes: mobile carousel pointer handlers and Previous/Next buttons
- Produces: buttons that remain clickable while non-interactive card surfaces retain swipe navigation

- [ ] Add a failing mobile test with two exam word cards showing that Next changes `1/2` to `2/2` and displays the second card.
- [ ] Make carousel drag capture ignore interactive descendants without changing non-interactive swipe behavior.
- [ ] Run the LexiconPage test file and relevant lint check.

### Task 3: Conditional second-source evaluation

**Files:**
- No import implementation in this plan.

**Interfaces:**
- Consumes: Task 2 unmatched-word report
- Produces: candidate comparison and a go/no-go decision

- [ ] Compare HanDeDict inversion, PanLex/ACoLi, and other primary sources for German-to-Chinese incremental coverage.
- [ ] Reject same-source Wiktionary mirrors and sources without redistribution-compatible licenses.
- [ ] Measure candidate overlap, new definitions, and sample quality before proposing a separate import plan.
