# C1 HS Speaking and Writing Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import real C1 HS Schreiben and Sprechen workbooks into the existing practice UI data structures, including generated speaking audio URLs.

**Architecture:** Extend only the isolated C1 importer. Parse each source shape directly, reuse shared model save/audio helpers, and leave the existing frontend components unchanged unless a failing behavior test proves a gap.

**Tech Stack:** Python, pandas/openpyxl for importer reads, Django models, existing Azure speaking-audio helper, Django TestCase.

**Spec:** `docs/superpowers/specs/2026-11-06-c1-hs-speaking-writing-import-design.md`

## Global Constraints

- Do not connect to the project server, deploy, upload to COS, commit, or push.
- Keep TELC C1 HS data isolated under `apps/exam_preparation/data/imports/telc/c1_hs/`.
- Every imported exercise needs non-empty `exam_type=TELC`, `level=C1`, and a unique scoped external ID.
- Reuse existing writing, speaking, recorder, and audio-path components; add no dependencies.

## Review Focus

- Numeric IDs with leading zeroes still match filename suffixes and child rows.
- A Vortrag workbook creates two independent scoped records without audio filename collisions.
- A one-row or malformed Vortrag dialogue is rejected rather than producing an empty 1B exercise.
- Writing workbooks missing either quotation translation, model text, or vocabulary fail preflight/import.
- Re-importing the same workbook updates the exercises and replaces dependent model text without duplicates.

---

### Task 1: C1 Schreiben and Sprechen import adapters

**Files:**
- Modify: `scripts/exam_preparation_importer_telc_c1_hs.py`
- Test: `scripts/tests/test_exam_preparation_importer_telc_c1_hs.py`
- Modify: `local-docs/exam-preparation-xlsx-contract.md`

**Interfaces:**
- Consumes: existing `shared.save_speaking_exercise`, `WritingExercise`, `WritingExampleText`, and C1 `stage/preflight/import_workbook` dispatch.
- Produces: `import_writing(path, meta, identifier) -> int`, `import_speaking_teil1(path, meta, identifier, generate_speaking_audio=False) -> int`, and `import_speaking_teil2(...) -> int`.

- [ ] Write failing tests for writing field mapping, vocabulary pagination, 1A/1B splitting, Teil 2 quote translation, scoped duplicate detection, and cross-sheet ID mismatch.
- [ ] Run the targeted C1 importer tests and confirm the new tests fail for missing support.
- [ ] Add the minimum parsers, validation, dispatch, staging, and CLI audio flag needed to pass the tests.
- [ ] Run the targeted C1 importer tests, then the full importer test file.
- [ ] Document the accepted C1 workbook tabs and mappings in the XLSX contract.

### Task 2: Existing UI contract verification

**Files:**
- Test: `frontend/src/pages/SpeakingTeilExercisePage.test.jsx`
- Test: `frontend/src/pages/ExamPreparationWritingDetailPage.test.jsx`

**Interfaces:**
- Consumes: the importer `content` fields defined by Task 1.
- Produces: regression coverage proving the current C1 UI shows outline beside the 1A answer, model audio/recording controls for 1A/1B/Teil 2, translated quotations, 70/350 limits, and paged vocabulary.

- [ ] Run the existing focused C1 speaking and writing tests.
- [ ] Add only a missing behavior test when the current suite does not pin a stated requirement.
- [ ] Change production frontend code only if that new test fails for a real UI gap.
- [ ] Run the focused frontend tests and responsive CSS checks already present in the suite.
