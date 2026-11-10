# C1 Sprechen Outline and Answer Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix C1 Sprechen outline line breaks, add independent icon-only visibility controls for outline and answer, and remove meaningless C1 check/reset actions.

**Architecture:** Keep visibility as two local booleans in `SpeakingTeilExercisePage`, reset them when a new exercise loads, and conditionally render only each section's body while retaining its header. Reuse the existing `EyeIcon`; add narrowly scoped CSS for the header, touch target, focus state, and `white-space: pre-line`.

**Tech Stack:** React, React Router, CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-11-10-c1-speaking-outline-visibility-design.md`

## Global Constraints

- Page behavior modifies only `frontend/src/pages/SpeakingTeilExercisePage.jsx`, `frontend/src/pages/SpeakingTeilExercisePage.css`, and `frontend/src/pages/SpeakingTeilExercisePage.test.jsx`; recording-cancellation safety may additionally modify `frontend/src/components/examPreparation/SpeakingPracticeRecorder.jsx` and its focused test.
- Do not add dependencies, open a browser, create a commit, or modify B1/B2 behavior.
- Keep desktop, tablet, and mobile layouts usable.
- Use icon-only buttons with stateful Chinese `aria-label` and `title`; do not add visible helper copy.

## Review Focus

- An outline item containing `\n` must preserve that line break visually via `white-space: pre-line`.
- A non-array outline string containing `\n` must use the same line-break mechanism.
- Hiding outline must not hide or change the answer.
- Hiding answer must remove its answer, recorder, and favorite controls while leaving the outline available.
- C1 must have no `Prüfen`/`Wiederholen`, while existing non-C1 tests must continue to pass.

---

### Task 1: C1 Sprechen visibility and line breaks

**Files:**
- Modify: `frontend/src/pages/SpeakingTeilExercisePage.jsx`
- Modify: `frontend/src/pages/SpeakingTeilExercisePage.css`
- Test: `frontend/src/pages/SpeakingTeilExercisePage.test.jsx`

**Interfaces:**
- Consumes: existing `EyeIcon({ isHidden })`, C1 exercise detection, `AnnotatableTextRegion`, and current responsive C1 layout.
- Produces: independent `showC1Outline` and `showC1Answer` UI behavior; `.speaking-detail-c1-outline__content` newline styling; no C1 action controls.

- [ ] **Step 1: Write focused failing tests**

Update the C1 cases to assert stateful `隐藏提纲`/`显示提纲` and `隐藏答案`/`显示答案` icon-only buttons, independent hide/show behavior, removal of recorder/favorite controls while the answer is hidden, preservation of an internal outline newline, and absence of C1 `Prüfen`/`Wiederholen`. Add coverage for a non-array multiline outline and keep non-C1 assertions unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/pages/SpeakingTeilExercisePage.test.jsx`

Expected: FAIL because the visibility buttons and newline class do not exist and C1 still renders `Prüfen`.

- [ ] **Step 3: Implement the minimal React behavior**

Import the existing `EyeIcon`; replace `c1Checked` with two default-true visibility states reset on exercise load. Add retained section headers with icon-only buttons and conditionally render each body. Apply `speaking-detail-c1-outline__content` to the annotated outline body, remove the duplicate fallback answer heading, and delete only the C1 action block.

- [ ] **Step 4: Add narrowly scoped responsive styles**

Style the C1 section header, a round minimum `2.5rem` visibility button with hover and `:focus-visible`, and the outline content with `white-space: pre-line` plus safe wrapping. Preserve the existing two-column and mobile one-column rules.

- [ ] **Step 5: Run focused verification**

Run: `npm test -- --run src/pages/SpeakingTeilExercisePage.test.jsx`

Expected: all tests in the file PASS with no new warnings.

- [ ] **Step 6: Run static verification**

Run: `npm run build`

Expected: build exits successfully.

Run: `git diff --check -- frontend/src/pages/SpeakingTeilExercisePage.jsx frontend/src/pages/SpeakingTeilExercisePage.css frontend/src/pages/SpeakingTeilExercisePage.test.jsx`

Expected: no whitespace errors.

### Task 2: Discard interrupted recordings safely

**Files:**
- Modify: `frontend/src/components/examPreparation/SpeakingPracticeRecorder.jsx`
- Test: `frontend/src/components/examPreparation/SpeakingPracticeRecorder.test.jsx`

**Interfaces:**
- Consumes: existing `claimSpeakingAudio()` session lifecycle and `saveRecordingBlob()` persistence.
- Produces: cancelled/unmounted recordings stop the microphone without persisting a truncated blob; explicit user stop still persists normally.

- [ ] **Step 1: Write focused failing lifecycle tests**

Mock `MediaRecorder`, microphone tracks, and storage. Assert that unmount while recording stops the recorder but does not call `saveRecordingBlob`; assert that clicking the visible stop control still calls `saveRecordingBlob` once.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/components/examPreparation/SpeakingPracticeRecorder.test.jsx`

Expected: the cancellation case FAILS because the current `onstop` always saves.

- [ ] **Step 3: Implement cancellation-aware persistence**

At `MediaRecorder.onstop`, capture whether the session is still active before finishing it. Always stop tracks and clear recorder ownership, but return without saving when the session was already cancelled by unmount or another audio owner. Keep explicit stop behavior unchanged.

- [ ] **Step 4: Run verification**

Run the new focused recorder test and `src/pages/SpeakingTeilExercisePage.test.jsx`; both must pass. Run `npm run build` and `git diff --check` for all task files.

