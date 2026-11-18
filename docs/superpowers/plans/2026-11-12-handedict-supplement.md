# HanDeDict Supplement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the repository's Superagent/Subagent workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned, filtered HanDeDict supplement to the local German-to-Chinese dictionary while keeping WikDict priority and source provenance.

**Architecture:** Extend the existing import command with a HanDeDict CEDICT parser that reverses accepted one-word German glosses into source-tagged entries, then runs the existing morphology association across both managed sources. Lookup sorting adds explicit source priority before importance.

**Tech Stack:** Django, PostgreSQL, CEDICT text, gzip morphology TSV.

**Spec:** `docs/superpowers/specs/2026-11-12-handedict-supplement-design.md`

## Global Constraints

- No new dependency, schema migration, commit, or push.
- Only managed sources `wikdict` and `handedict` may be replaced by the importer.
- License and pinned source metadata are required.

## Review Focus

- CEDICT history comments must never become entries.
- Multiword explanatory German prose must be rejected.
- Parenthetical POS removal must not delete lexical parentheses inside a word.
- Same German/Chinese pair from two sources must remain independently attributable.
- Re-import must not duplicate forms or delete unrelated future sources.

---

### Task 1: HanDeDict source and importer

**Files:**
- Modify: `.gitignore`
- Create: `apps/lexicon/data/external/handedict/SOURCE.md`
- Modify: `apps/lexicon/management/commands/import_local_dictionary.py`
- Modify: `apps/lexicon/tests_dictionary_import.py`
- Modify: `apps/lexicon/views/dictionary.py`
- Modify: `apps/lexicon/tests_dictionary_api.py`

**Interfaces:**
- Consumes: pinned `handedict.u8`, `forms.tsv.gz`, existing `DictionaryEntry` and `DictionaryForm`
- Produces: source-tagged HanDeDict entries and WikDict-first lookup ordering

- [ ] Add failing parser/import tests for accepted and rejected CEDICT lines, source separation, morphology expansion, and re-import.
- [ ] Add a failing API test proving WikDict sorts before HanDeDict.
- [ ] Parse only current non-comment CEDICT entries and recognized single-word German glosses.
- [ ] Import both managed sources atomically and attach morphology forms only to NFC-normalized, exact-case lemmas.
- [ ] Add source priority to lookup ordering.
- [ ] Run focused import/API tests and diff check.

### Task 2: Data import and acceptance

**Files:**
- No product-code modifications expected.

**Interfaces:**
- Consumes: Task 1 importer and pinned archive
- Produces: real PostgreSQL data and final coverage report

- [ ] Download the pinned archive, verify it contains `handedict.u8`, and record the source metadata.
- [ ] Run the importer twice and verify stable entry/form counts.
- [ ] Verify representative new matches through the authenticated API.
- [ ] Recalculate reading coverage and sample result quality.
- [ ] Run backend/frontend regression tests and production build.
