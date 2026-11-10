# C1 Reading Example Drag Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-step visual guide for the C1 Lesen Teil 1 example and keep long option text inside its container.

**Architecture:** Derive both guidance states from existing answers in `MockClozeMatching`, so no new persistent state is introduced. Render an accessible callout beside the example option, add a conditional class to blank 1, and use scoped responsive CSS for wrapping.

**Tech Stack:** React 19, CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-11-09-c1-reading-example-drag-guide-design.md`

## Global Constraints

- Preserve the existing drag and click-to-select behavior.
- Apply staged guidance only when `restrictExample` is true.
- Support desktop, iPad/tablet, and mobile widths.
- Add no dependency and do not modify unrelated files.
- Do not commit or push changes.

## Review Focus

- Numeric blank number `0` must not be lost through a falsy fallback.
- The example callout must be visible before interaction and absent after blank 0 is answered.
- Blank 1 must be green only after blank 0 is answered and while blank 1 remains unanswered.
- Long unbroken or multi-word option text must wrap in both the pool and a filled blank.
- Non-C1 matching exercises must not receive the staged example guidance.

---

### Task 1: C1 example guidance and option wrapping

**Files:**
- Modify: `frontend/src/pages/mockExam/telc/TelcMockExamPage.jsx`
- Modify: `frontend/src/pages/mockExam/telc/TelcMockExamPage.css`
- Test: `frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx`

**Interfaces:**
- Consumes: existing `restrictExample`, `answers`, blank metadata, and `option_key === "beispiel"` convention.
- Produces: visible initial callout, `0` blank label, transient blank-1 guidance class, and container-safe text wrapping.

- [ ] **Step 1: Write failing behavior tests**

Extend the existing TELC C1 test to assert the initial text `将 Beispiel 拖到标有 0 的空格中`, visible `0` in `blank_0`, callout removal and blank-1 guidance after answering blank 0, and guidance removal after answering blank 1. Add scoped CSS assertions for wrapping rules on pool options and filled chips.

- [ ] **Step 2: Verify the tests fail for the missing guide and wrapping behavior**

Run: `npm test -- --run frontend/src/pages/mockExam/telc/TelcMockExamPage.test.jsx` from `frontend/` using the repository-relative test path accepted by Vitest.

Expected: FAIL because the callout, guidance class, and wrapping rules are absent.

- [ ] **Step 3: Implement the minimal derived guidance and wrapping styles**

Use nullish fallback for blank numbers, derive example completion and question-1 completion from `answers`, render the callout only for the restricted example flow, conditionally add the guidance class to blank 1, and add scoped wrapping/width rules without changing assignment logic.

- [ ] **Step 4: Verify focused and frontend tests**

Run the focused Vitest file, then `npm test`, `npm run lint`, and `npm run build` from `frontend/`.

Expected: all commands exit 0; any unrelated pre-existing failure must be reported verbatim.
