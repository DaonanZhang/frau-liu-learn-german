# C1 Listening Child IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and score every TELC C1 HS listening answer through a fixed relational child-question ID.

**Architecture:** Normalize Teil 1 and Teil 3 into the existing `ListeningQuestion`/`ListeningAnswerOption` structure and preserve IDs on reimport. Practice and mock exam consume the same serialized questions and use `UserListeningQuestionState` or saved-exam answers keyed by question ID.

**Tech Stack:** Django, Django REST Framework, pandas/openpyxl importer, React, Vitest

**Spec:** `docs/superpowers/specs/2026-11-09-c1-dynamic-listening-state-design.md`

## Global Constraints

- No new dependencies and no server connection.
- Preserve unrelated dirty-worktree changes.
- Do not commit.
- Repeated imports must preserve child database IDs.
- Existing C1 listening explanations and `<or>`/semicolon/parenthesis answer semantics must remain available.

## Review Focus

- A repeated import must not change any listening question ID.
- Teil 1 must create eight statement questions with `Sprecher/in 1–8` options and omit the two source distractors that have no correct speaker.
- Teil 3 blanks must restore text answers through question-state rows.
- Mock scoring must reject generated legacy keys and use relational IDs.
- Removing the abandoned exercise-state API must not remove the earlier explanation UI fix.

---

### Task 1: Relational model and stable importer

**Files:**
- Modify: `apps/exam_preparation/models/listening.py`
- Modify: `apps/exam_preparation/models/user_activity.py`
- Modify: `apps/exam_preparation/models/__init__.py`
- Modify: `apps/exam_preparation/serializers.py`
- Modify: `apps/exam_preparation/views.py`
- Modify: `apps/exam_preparation/urls.py`
- Modify: `apps/exam_preparation/admin.py`
- Replace: `apps/exam_preparation/migrations/0030_userlisteningexercisestate.py`
- Modify: `scripts/exam_preparation_importer_telc_c1_hs.py`
- Test: `apps/exam_preparation/tests.py`
- Test: `scripts/tests/test_exam_preparation_importer_telc_c1_hs.py`

**Interfaces:**
- Produces: serialized listening questions with `id`, `question_key`, `question_type`, `correct_answer`, and answer options.
- Produces: stable question primary keys across repeated C1 imports.

- [x] Write importer/model/API tests that fail with the current JSON-only Teil 1/3 data.
- [x] Add `question_key`, `correct_answer`, and `TEXT_INPUT`; replace migration 0030 accordingly.
- [x] Remove the unshipped exercise-level state model/API.
- [x] Upsert Teil 1/2/3 questions and options without deleting existing rows.
- [x] Run targeted backend/importer tests and migration checks.

### Task 2: Practice page question-state persistence

**Files:**
- Modify: `frontend/src/api/exam_preparation/userExerciseStates.js`
- Modify: `frontend/src/pages/ListeningExercisePage.jsx`
- Test: `frontend/src/pages/ListeningExercisePage.test.jsx`

**Interfaces:**
- Consumes: Task 1 question payload and existing question-state endpoints.
- Produces: choice or `answer_text` state saved under each real question ID.

- [x] Replace dynamic JSON-state tests with failing relational Teil 1/3 save-and-restore tests.
- [x] Render Teil 1 from speaker questions and map Teil 3 blanks by `question_key`.
- [x] Save and restore all three parts through `UserListeningQuestionState`.
- [x] Preserve explanation rendering and run targeted frontend tests.

### Task 3: Mock-exam relational rendering and scoring

**Files:**
- Modify: `frontend/src/pages/mockExam/telc/TelcMockExamPage.jsx`
- Test: `frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`
- Modify: `apps/exam_preparation/mock_exam/telc/scoring.py`
- Test: matching mock-exam backend test files.

**Interfaces:**
- Consumes: Task 1 question payload and relational correct answers/options.
- Produces: saved mock answers keyed by real question IDs and matching server scores.

- [x] Add failing tests that expose legacy generated keys.
- [x] Render and save Teil 1/3 by relational question ID.
- [x] Score all C1 listening parts from relational rows.
- [x] Run targeted frontend/backend mock-exam tests.

### Task 4: Local migration, reimport and verification

- [x] Apply migrations and reimport the local C1 HS workbooks.
- [x] Snapshot IDs, repeat the import, and assert the IDs are unchanged.
- [x] Verify per-exercise counts and answer constraints for all three listening parts.
- [x] Run all relevant backend/importer/frontend suites and report unrelated failures separately.

### Task 5: Correct Teil 1 question direction

**Files:**
- Modify: `scripts/exam_preparation_importer_telc_c1_hs.py`
- Test: `scripts/tests/test_exam_preparation_importer_telc_c1_hs.py`
- Modify: `frontend/src/pages/ListeningExercisePage.jsx`
- Test: `frontend/src/pages/ListeningExercisePage.test.jsx`
- Test: `frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`
- Test: `apps/exam_preparation/test_mock_exam_registry.py`

- [x] Import each mapped Aussage as a question with eight Sprecher options.
- [x] Omit the two unmapped source distractors and preserve statement explanations.
- [x] Update practice and mock-exam fixtures, instructions, persistence and scoring assertions.
- [x] Reimport all Teil 1 workbooks twice and verify stable child IDs.
