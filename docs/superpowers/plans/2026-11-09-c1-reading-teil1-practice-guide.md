# C1 Lesen Teil 1 Practice Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved Beispiel-to-blank-0 and blank-1 guidance to the standalone C1 Lesen Teil 1 exercise page and contain long option text.

**Architecture:** Derive guidance from existing answer state in `ClozeMatchingPage`; introduce no new persisted state. Add C1-scoped wrapper, guide, green-slot, and wrapping styles in the existing shared cloze stylesheet.

**Tech Stack:** React 19, CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-11-09-c1-reading-teil1-practice-guide-design.md`

## Global Constraints

- Apply new staged guidance only to C1.
- Preserve all assignment, checking, saving, annotation, and reset behavior.
- Support desktop, tablet, and mobile.
- Add no dependency, commit, or push.

## Review Focus

- Numeric zero must survive rendering and accessible labels.
- The guide must be attached to the Beispiel option and disappear after blank 0 is answered.
- Only unanswered blank 1 is green after blank 0 completion.
- Reset must restore the initial guide and remove blank-1 guidance.
- Long pool and filled-answer text must wrap within the C1 container.

---

### Task 1: Standalone C1 Beispiel guidance

**Files:**
- Modify: `frontend/src/pages/ClozeMatchingPage.jsx`
- Modify: `frontend/src/pages/ClozeExercisePage.css`
- Test: `frontend/src/pages/ClozeExercisePage.test.jsx`

**Interfaces:**
- Consumes: existing `scope`, `answers`, `c1ExampleBlank`, `visiblePoolOptions`, and blank metadata.
- Produces: attached initial callout, visible zero, transient blank-1 green guidance, and container-safe option wrapping.

- [ ] **Step 1: Extend the existing C1 test and confirm RED**

Assert initial attached guide and visible zero; after assigning Beispiel assert guide removal and blank-1 green class; after answering blank 1 assert green class removal; after Wiederholen assert initial guide returns. Add CSS source assertions for pool/chip wrapping.

- [ ] **Step 2: Implement minimal derived UI states**

Use nullish fallback for `blank_number`, derive example/blank-1 answer state, attach the guide only to the C1 Beispiel option, and add the green class only to the unanswered blank numbered 1.

- [ ] **Step 3: Add C1-scoped responsive styles**

Add max-width, min-width, white-space, and overflow-wrap rules for pool options and filled chips, plus the positioned callout and green guidance state.

- [ ] **Step 4: Verify**

Run the targeted C1 test, full `ClozeExercisePage.test.jsx`, changed-file lint, full frontend tests, and production build. Report unrelated failures exactly.
