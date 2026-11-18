# TELC B1 Sprechen Teil 3 — 003 Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TELC B1 Sprechen Teil 3 exercise 3 with `Eine Schiffsreise planen` and its 43 matching audio files, with a repeatable server/COS deployment path.

**Architecture:** Extend the existing parser for the new workbook shape, retain the existing importer/database identity, add precise generator filtering, and add opt-in COS overwrite behavior. Operational application then uses those tested paths against only exercise 3.

**Tech Stack:** Django, pandas/openpyxl, Azure Speech, Tencent COS Python SDK, unittest/pytest.

**Spec:** `docs/superpowers/specs/2026-11-13-telc-b1-speaking-teil3-003-replacement-design.md`

## Global Constraints

- Do not import or store the workbook `task` field in this change.
- Modify only TELC B1 Sprechen Teil 3 external ID 3 data and `B1_3_*.mp3` media.
- Preserve old Teil 3 workbook compatibility.
- Preserve default missing-only COS sync behavior unless overwrite is explicitly requested.
- Do not commit or push.
- Do not modify unrelated dirty worktree files.

## Review Focus

- New two-sheet workbook metadata consistency and numeric ID normalization.
- Old single-sheet workbook behavior remains unchanged.
- Generator filters cannot select another exam family, level, Teil, or external ID.
- Filtered generation does not truncate unrelated manifest entries.
- COS overwrite is opt-in and does not change default skip-existing behavior.

---

### Task 1: Support the new Teil 3 workbook layout

**Files:**
- Modify: `scripts/exam_preparation_importer.py`
- Create or modify: `scripts/tests/test_exam_preparation_importer_speaking.py`

**Interfaces:**
- Consumes: existing `parse_speaking_gemeinsam_etwas_planen_workbook(Path) -> dict[str, object]`.
- Produces: the same return shape for both legacy `meta` dialogue rows and new `meta(ID, task) + example` dialogue rows.

- [ ] Write a failing test using a temporary two-sheet workbook with ID `003`, title `Eine Schiffsreise planen`, 43 dialogue turns, and repeated TELC B1 metadata. Assert 43 turns, alternating roles, ordered sections, normalized external ID `3`, and no `task` key.
- [ ] Run the focused test and confirm it fails because the parser requires dialogue columns in `meta`.
- [ ] Implement the smallest branch that reads dialogue rows from `example` when `meta` has only `ID` and `task`; validate workbook/example IDs consistently and keep the legacy path unchanged.
- [ ] Add a legacy-shape regression test and run both tests green.
- [ ] Run the relevant importer test module.

### Task 2: Filter speaking audio generation to one exercise

**Files:**
- Modify: `apps/exam_preparation/management/commands/generate_speaking_audio.py`
- Modify: `apps/exam_preparation/test_generate_speaking_audio.py`

**Interfaces:**
- Produces optional exact filters `--exam-type`, `--level`, `--exercise-type`, and `--external-id` for generation selection.

- [ ] Write failing tests proving the exact scope generates/overwrites only the selected exercise and unrelated manifest entries remain present.
- [ ] Run the focused tests and confirm the expected failure.
- [ ] Apply queryset/generation selection with the minimum filtering logic while keeping the manifest complete.
- [ ] Run the focused tests and the existing speaking-audio test module green.

### Task 3: Allow explicit COS object replacement

**Files:**
- Modify: `scripts/sync_vlog_to_frankfurt_cos.py`
- Modify: `scripts/tests/test_sync_vlog_to_frankfurt_cos.py`

**Interfaces:**
- Produces optional `--overwrite-existing`; existing-key objects upload only when this flag is present.

- [ ] Write a failing test that an existing remote key uploads with `overwrite_existing=True`, plus a regression assertion that default mode skips it.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Implement the opt-in branch without changing ETag dedupe or default behavior.
- [ ] Run the full sync-helper test module green.

### Task 4: Replace the local workbook

**Files/Data:**
- Replace ignored local file: `apps/exam_preparation/data/imports/speaking_gemeinsam_etwas_planen/processed/b1_speaking_planen_003.xlsm`
- **Dependencies:** Task 1 complete and accepted.

- [ ] Copy the current destination workbook to `/private/tmp/b1_speaking_planen_003.before-replacement.xlsm` and record its SHA-256 as the rollback point.
- [ ] Replace the processed workbook with the verified Drive download.
- [ ] Verify its SHA-256 and parsed title/turn count without database writes.

### Task 5: Replace the local text data

**Files/Data:**
- Update local database only for `TELC/B1/SPEAKING_TEIL3/3`.

**Dependencies:** Task 4 complete and accepted.

- [ ] Record exercise 2 and 3 database snapshots.
- [ ] Import only exercise 3 text without generating audio; confirm exercise 2 is unchanged.
- [ ] Verify title, 43 turns, section order, absence of `task`, and unchanged exercise 2.

### Task 6: Generate and attach the replacement audio

**Files/Data:**
- Replace/create ignored media: `frontend/public/resources/ExamPreparation/exam_preparation_audio/telc_b1_speaking/teil3/B1_3_1.mp3` through `B1_3_43.mp3`
- Update local database only for `TELC/B1/SPEAKING_TEIL3/3` audio URLs.

**Dependencies:** Tasks 2 and 5 complete and accepted.

- [ ] Record hashes/sizes of existing `B1_3_*.mp3` files.
- [ ] Load Azure credentials from `.env` without printing them and run the filtered generator with `--apply --overwrite` for the exact exercise scope.
- [ ] Re-import the same workbook with speaking audio enabled so all deterministic URLs are written to both dialogue representations.
- [ ] Verify title, 43 turns, section order, URL parity, file count, non-empty MP3s, and unchanged exercise 2.
- [ ] Run proportional Django/importer tests and record evidence for the server runbook.
