# C1 Lesen Teil 1 Next-Empty Guide and Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent filled answer cards from widening the C1 text column and continuously guide the first numerically unanswered blank.

**Architecture:** Derive a sorted next-empty blank from existing blank metadata and answers. Correct the full intrinsic-width chain in C1-scoped CSS rather than hiding overflow.

**Tech Stack:** React 19, CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-11-10-c1-reading-teil1-next-empty-and-wrap-design.md`

## Global Constraints

- Standalone C1 only; preserve B1/B2 and mock-exam behavior.
- Preserve all assignment, persistence, checking, annotation, and reset behavior.
- Support desktop, tablet, and mobile.
- Add no dependency, commit, or push.

## Review Focus

- `max-content` and flex-item automatic minimum width must not survive in the C1 selected-card chain.
- The inner text span must be allowed to shrink and wrap.
- Guidance ordering must use numeric blank numbers, not array position or a hardcoded blank 1.
- Filling blanks out of order must keep the earliest empty blank green.
- All answered and reset states must remove or restore guidance correctly.

---

### Task 1: Next-empty guidance and intrinsic-width containment

**Files:**
- Modify: `frontend/src/pages/ClozeMatchingPage.jsx`
- Modify: `frontend/src/pages/ClozeExercisePage.css`
- Test: `frontend/src/pages/ClozeExercisePage.test.jsx`

**Interfaces:**
- Consumes: existing `blankAnswers`, `answers`, `c1ExampleBlankKey`, and C1 layout classes.
- Produces: first-empty guidance class and a width-constrained filled answer card.

- [ ] **Step 1: Write failing behavior tests**

Extend the C1 fixture to at least blanks 0, 1, and 2. Assert guidance moves 1 → 2 → none when filled in order, and remains on 1 when blank 2 is filled first. Add CSS source assertions proving the C1 blank wrapper, selected slot, button, and inner span have shrink/wrap constraints that override `max-content` and `width:auto`.

- [ ] **Step 2: Confirm RED**

Run the targeted C1 test and confirm it fails because guidance is hardcoded to blank 1 and the selected-slot width chain is unconstrained.

- [ ] **Step 3: Implement minimal derived guidance and scoped CSS**

Sort normal blanks numerically and select the first unanswered one only after the example is answered. Add C1-scoped `max-width`, `min-width`, fit-content/full-width, and wrapping rules across the wrapper, slot, button, and inner span.

- [ ] **Step 4: Verify**

Run targeted and full cloze tests, changed-file lint, full frontend tests, and production build. Report unrelated failures exactly.
