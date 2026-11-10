# C1 Lesen Teil 2 B2 Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render C1 Lesen Teil 2 with the same Anzeigen-first layout and control placement as B2 Lesen Teil 3 while preserving C1 repeated answers.

**Architecture:** Keep the shared `ReadingAdMatchingWorkspace` and switch the C1 mock-exam caller from its `showAllAds` special presentation to the regular carousel presentation. Retain `allowRepeated={isC1(examLevel)}` as the sole C1 behavior difference.

**Tech Stack:** React 19, shared CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-11-09-c1-reading-teil2-b2-layout-design.md`

## Global Constraints

- Reuse the B2 workspace mode and add no dependency.
- Preserve C1 repeated Anzeige selection.
- Preserve B1 and B2 behavior.
- Support desktop, tablet, and mobile through the existing shared breakpoints.
- Do not commit or push changes.

## Review Focus

- Anzeigen and their carousel controls must precede the question controls in DOM order.
- The C1-only `reading-ad-workspace--c1` question-first mode must not be active.
- C1 question 2 must still accept an Anzeige already selected for question 1.
- Only one question may be visible at a time.
- Existing B1/B2 tests must remain unchanged and passing where not already failing.

---

### Task 1: Use the B2 Anzeigen-first workspace mode for C1 Teil 2

**Files:**
- Modify: `frontend/src/pages/mockExam/telc/TelcMockExamPage.jsx`
- Test: `frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

**Interfaces:**
- Consumes: `ReadingAdMatchingWorkspace` regular carousel mode and existing `allowRepeated` prop.
- Produces: B2-equivalent layout/control order for C1 Lesen Teil 2 with unchanged C1 answer reuse.

- [ ] **Step 1: Write a failing C1 layout test**

Extend the existing C1 Lesen ordering test to assert the workspace lacks `reading-ad-workspace--c1`, Anzeige carousel controls precede question pagination, only the current question is visible, and the same Anzeige remains selectable for two questions.

- [ ] **Step 2: Run the targeted test and confirm RED**

Run from `frontend/`: `npm test -- --run src/pages/mockExam/telc/TelcMockExamPage.test.jsx -t "uses the C1 reading order"`

Expected: FAIL because the C1 special workspace currently renders all Anzeigen and question controls before Anzeigen.

- [ ] **Step 3: Implement the minimal caller change**

Stop enabling `showAllAds` for the C1 `ReadingAdMatchingWorkspace` call. Keep `allowRepeated={isC1(examLevel)}` and all persistence, annotation, review, and numbering props unchanged.

- [ ] **Step 4: Verify**

Run the targeted test, the modified test file, changed-file lint, full frontend tests, and production build. Report unrelated pre-existing failures exactly.
