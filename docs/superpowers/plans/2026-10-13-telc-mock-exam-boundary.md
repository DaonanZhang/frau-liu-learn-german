# TELC Mock Exam Boundary Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with test-first changes. This repository forbids commits unless the user explicitly requests them; do not commit.

**Goal:** Separate generic mock-exam lifecycle code from the current TELC-specific rules and UI without changing TELC B1/B2 behavior.

**Architecture:** Generic models, API endpoints, persistence, history, retakes, and sharing remain generic. A backend registry resolves TELC B1/B2 rules, while a thin frontend route dispatcher renders an explicitly named TELC mock-exam implementation at URLs containing `telc`.

**Tech Stack:** Django, Django REST Framework, React, React Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-telc-mock-exam-boundary-design.md`

## Global Constraints

- Preserve all current TELC B1/B2 question selection, timing, phase, scoring, persistence, retake, favorite, share, copy, layout, and interaction behavior.
- Do not change any media URL, filename, directory, COS key, importer, or sync script.
- Do not add a database migration.
- Remove old mock-exam frontend routes without redirects.
- Do not add dependencies, commits, or agent/Jev workflow.

## Review Focus

- A saved B1 attempt opened from records must link to the TELC B1 canonical URL even while viewing B2 records.
- Unsupported exam-family URLs must not render TELC UI or silently fall back to TELC.
- Same-scope idempotency and cross-level request-ID isolation must remain unchanged after backend extraction.
- Existing TELC timing and score constants must occur only in the TELC implementation, with unchanged response values.
- No diff may alter `audio_file_url`, media paths, importers, or COS scripts.

---

### Task 1: Lock TELC backend behavior and extract rules

**Files:**
- Create: `apps/exam_preparation/mock_exam/__init__.py`
- Create: `apps/exam_preparation/mock_exam/registry.py`
- Create: `apps/exam_preparation/mock_exam/telc/__init__.py`
- Create: `apps/exam_preparation/mock_exam/telc/rules.py`
- Create: `apps/exam_preparation/mock_exam/telc/scoring.py`
- Modify: `apps/exam_preparation/views.py`
- Modify/Test: `apps/exam_preparation/tests.py`

**Interfaces:**
- Produces: `get_mock_exam_rules(exam_type: str, level: str)` returning TELC rules for exactly `TELC/B1` and `TELC/B2`, otherwise `None`.
- Produces: TELC rule functions for definitions, payload metadata, progress, correct counts, and scoring with the existing response shapes.
- Consumes: existing models, serializers, `ExamScope`, and request serializer context.

- [ ] Add characterization assertions for part keys, durations, initial progress, total score/pass threshold, idempotency, sharing, and mixed-scope rejection.
- [ ] Run the targeted backend tests and confirm the new characterization assertions pass before movement.
- [ ] Extract TELC exercise definitions, selection, payload metadata, progress, and scoring into TELC modules without changing values.
- [ ] Add the minimal registry and replace hard-coded TELC support checks in both create paths with registry lookup.
- [ ] Keep viewsets responsible for generic persistence, ownership, idempotency, history, retake, and sharing.
- [ ] Run all `apps.exam_preparation` tests.

### Task 2: Give the concrete frontend an explicit TELC identity

**Files:**
- Create: `frontend/src/pages/mockExam/MockExamPage.jsx`
- Rename: `frontend/src/pages/MockWrittenExamPage.jsx` → `frontend/src/pages/mockExam/telc/TelcMockExamPage.jsx`
- Rename: `frontend/src/pages/MockWrittenExamPage.css` → `frontend/src/pages/mockExam/telc/TelcMockExamPage.css`
- Rename: `frontend/src/components/examPreparation/MockExamAnswerSheet.jsx` → `frontend/src/pages/mockExam/telc/TelcMockExamAnswerSheet.jsx`
- Rename/Test: `frontend/src/pages/MockWrittenExamPage.test.jsx` → `frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`
- Create: `frontend/src/pages/mockExam/telc/telcMockExamRules.js`

**Interfaces:**
- Produces: `MockExamPage` route dispatcher consuming `examType` and rendering TELC only for `telc`.
- Produces: `TelcMockExamPage`, `TelcMockExamAnswerSheet`, and TELC rule constants.
- Consumes: unchanged generic mock-exam API functions and generic scope payloads.

- [ ] Update tests to import TELC-specific components and assert unsupported families do not render TELC.
- [ ] Run the focused test and confirm it fails before the new paths/components exist.
- [ ] Move the concrete page and answer sheet, then extract static TELC part/timing/assessment constants into `telcMockExamRules.js`.
- [ ] Mechanically rename TELC-specific component symbols and CSS selectors to `TelcMockExam` / `telc-mock-exam` without changing declarations or values.
- [ ] Implement the thin dispatcher with no fallback to TELC for unsupported exam types.
- [ ] Run TELC page tests and verify behavior is unchanged.

### Task 3: Switch routes and every internal navigation target

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/ExamPreparationModulePage.jsx`
- Modify: `frontend/src/pages/MockExamRecordsPage.jsx`
- Modify: `frontend/src/components/Navigator.jsx`
- Modify: `frontend/src/components/ModuleAccessGate.jsx`
- Modify tests beside each file plus `frontend/src/pages/AppRoutes.test.jsx`

**Interfaces:**
- Produces canonical routes `/modules/exam-preparation/:examType/:level/mock-exam` and `/mock-exams`.
- Consumes persisted `exam_type` and `level` when constructing record/retake links.

- [ ] Change route tests first to require TELC canonical URLs and absence of old routes.
- [ ] Run focused route/navigation tests and confirm expected failures.
- [ ] Register only the canonical exam-family routes and update route guards.
- [ ] Update level-page, interrupted-attempt, records, retake, navigator, and internal new-exam links to include `telc` or persisted `exam_type`.
- [ ] Preserve return navigation to `/modules/exam-preparation/b1|b2`.
- [ ] Run all focused route, access, navigator, module-page, records-page, and TELC page tests.

### Task 4: Regression and boundary verification

**Files:**
- Modify documentation only if paths or names documented by the repository changed.

**Interfaces:**
- Consumes all prior task outputs.
- Produces verification evidence; no new runtime interface.

- [ ] Search the diff and confirm no media/import/COS path changed.
- [ ] Run the full exam-preparation backend suite.
- [ ] Run exam-preparation import tests.
- [ ] Run the full frontend suite.
- [ ] Run the frontend production build.
- [ ] Run Django `check` and `makemigrations --check --dry-run` using SQLite test settings.
- [ ] Run speaking dual-COS script tests without real network access.
- [ ] Run `git diff --check` and review the complete task diff for behavior changes.
