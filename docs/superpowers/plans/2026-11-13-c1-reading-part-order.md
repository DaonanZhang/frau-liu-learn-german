# C1 HS Reading Part Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct only TELC C1 HS Lesen so Teil 2 is A–E paragraph matching and Teil 3 is long-text comprehension, without changing B1 or B2.

**Architecture:** Keep the existing semantic exercise keys and routes. Change only C1-scoped presentation order and labels in the reading entry, exercise selection, mock-exam navigation, and answer sheet; the backend already emits the correct C1 order.

**Tech Stack:** React, React Router, Vitest, Testing Library

**Spec:** Approved inline design in the 2026-11-13 user conversation.

## Global Constraints

- Do not change B1 or B2 behavior, labels, routes, or ordering.
- Do not change backend models, serializers, mock-exam generation, or import logic.
- Do not add dependencies, compatibility aliases, commits, or unrelated cleanup.
- Use test-driven development: establish failing C1 behavior tests before production edits.

## Review Focus

- C1 reading landing cards show Teil 2 as paragraph matching and Teil 3 as comprehension.
- C1 exercise-selection headings use the corrected part numbers while B1/B2 retain their current headings.
- C1 mock-exam navigation and progression order paragraph matching before comprehension.
- C1 answer-sheet labels and row order match the corrected navigation.
- Legacy C1 payload keys still resolve by exercise type without changing B1/B2 payload handling.

---

### Task 1: Correct C1 reading presentation order

**Files:**
- Modify: `frontend/src/pages/examPreparationTypeContent.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/mockExam/telc/TelcMockExamPage.jsx`
- Test: `frontend/src/pages/examPreparationTypeContent.test.js`
- Test: `frontend/src/pages/ExamPreparationReadingPage.test.jsx`
- Test: `frontend/src/pages/ExerciseSelectionPage.test.jsx`
- Test: `frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

**Interfaces:**
- Consumes: existing `examPreparationTypesForLevel`, scope-aware `ExerciseSelectionPage` props, and C1 mock-exam semantic part keys.
- Produces: C1-only order `cloze_matching`, `reading_ad_matching`, `reading_understanding`, `cloze_choice`, with labels Lesen Teil 1, Teil 2, Teil 3, Sprachbausteine Teil 1.

- [ ] **Step 1: Update C1 behavior tests first**

Assert literal C1 card keys/routes/descriptions, scope-aware selection headings, mock-exam navigation content, answer-sheet labels, and legacy-payload behavior. Preserve explicit B1/B2 assertions.

- [ ] **Step 2: Run focused tests and verify RED**

Run the affected Vitest files. Expected: failures show the current C1 Teil 2/3 reversal while existing B1/B2 assertions remain green.

- [ ] **Step 3: Implement the minimum C1-scoped mapping changes**

Swap only C1 card order/labels, use scope functions for the two selection-page titles/descriptions where needed, and restore the C1 mock-exam part/navigation/answer-sheet order. Keep semantic keys, API calls, and routes unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the affected Vitest files. Expected: all focused tests pass.

- [ ] **Step 5: Run broader frontend verification**

Run the project frontend test suite and report any failures by name. Do not create a commit.
