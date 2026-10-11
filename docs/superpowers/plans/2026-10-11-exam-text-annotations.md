# Exam Preparation Temporary Text Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add temporary, reversible highlight and underline annotations to learning text on every concrete exam-preparation exercise page, with attempt-scoped/session-scoped cleanup and no backend changes.

**Architecture:** Keep the interval model, storage adapter, DOM offset conversion, and toolbar geometry in one frontend utility module. Mount one shared React controller around each concrete exercise, and mark eligible learning text with a semantic-preserving region wrapper. Render marks through two namespaced CSS Custom Highlight registries so React-owned DOM is never mutated. Integrate pages in small batches, then connect reset, mock-attempt, deletion, and logout cleanup to their existing lifecycle functions.

**Tech Stack:** React 19, JavaScript, CSS Custom Highlight API, Selection/Range APIs, `sessionStorage`, Vitest, React Testing Library, Vite, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-11-exam-text-annotations-design.md`

## Global Constraints

- Do not change Django models, migrations, serializers, APIs, or request payloads.
- Do not use `localStorage`; annotation persistence is `sessionStorage` only.
- Do not add a DOM-mutation fallback using `<mark>`/`<u>`; unsupported browsers retain native text selection and show no annotation toolbar.
- Do not annotate navigation, action controls, timers, badges, save messages, result summaries, favorite controls, or learner-authored inputs.
- Derive region IDs from stable exercise/question/option identities, never render-order indexes when a stable identity exists.
- Preserve current semantics, class names, option clicking, audio behavior, and Sprachbausteine drag/drop.
- Make only task-scoped edits. The worktree contains unrelated user changes; never stage or rewrite unrelated files.
- Do not open a browser. Verification is automated tests, lint, build, and `git diff --check` only.
- Each implementation task is assigned to `gpt-5.6-luna`. The implementer must not create sub-agents.
- Tasks are serial because later integrations depend on the shared controller and several pages share helpers.

## Shared State Contract

Persist this versioned shape per scope:

```js
{
  version: 1,
  regions: {
    "question:42": [
      { start: 3, end: 12, highlight: true, underline: false },
    ],
  },
}
```

Public utility contracts:

```js
normalizeAnnotationSegments(segments)
applyAnnotationStyle(segments, range, style)
removeAnnotationStyle(segments, range, style)
clearAnnotationStyles(segments, range)
getAnnotationStyleState(segments, range, style) // inactive | active | mixed
findAnnotationSegmentAtOffset(segments, offset)

exerciseAnnotationScope(exerciseType, exerciseId)
mockAnnotationScope(attemptId)
loadAnnotationState(scope)
saveAnnotationState(scope, state)
clearAnnotationScope(scope)
clearAllExamAnnotations()

selectionToAnnotationRange(selection)
domPointToTextOffset(root, node, offset)
textOffsetToDomPoint(root, offset)
getAnnotationToolbarPosition(selectionRect, toolbarRect, viewport, gutter = 8)
```

React contracts:

```jsx
<ExamTextAnnotationProvider scope={scope}>
  <AnnotatableTextRegion regionId="question:42" as="span" className="existing-class">
    ...existing learning text...
  </AnnotatableTextRegion>
</ExamTextAnnotationProvider>
```

The provider exposes a scoped `clearAnnotations()` callback through `useExamTextAnnotations()` so an existing `Wiederholen` handler can clear marks without duplicating storage logic.

## Review Focus

- Interval operations must be order-independent and never retain empty/unmarked segments.
- Invalid stored offsets are removed, not clamped onto changed text.
- A selection must belong to exactly one registered region.
- Toolbar actions must capture offsets before native selection collapses.
- Dismissal, pointer leave, scroll, resize, and selection loss never modify marks.
- Custom highlight registry entries must be namespaced and deleted on unmount.
- Storage errors cannot interrupt answering, checking, audio, drag/drop, or submission.
- Desktop, tablet, and mobile positioning must stay within an 8 px viewport gutter.

---

### Task 1: Build the pure interval, storage, DOM-offset, and geometry layer

**Files:**

- Create: `frontend/src/utils/examTextAnnotations.js`
- Create: `frontend/src/utils/examTextAnnotations.test.js`

- [ ] **Step 1: Write failing interval-model tests**

Cover all of these exact behaviors:

```js
it("produces the same segments when highlight and underline are applied in either order")
it("splits a segment when one style is removed from its middle")
it("merges adjacent segments with identical style flags")
it("clears only the selected overlap and keeps the left and right pieces")
it("reports inactive, active, and mixed style state")
it("finds a segment at its start and inside it, but not at its exclusive end")
```

Use half-open ranges `[start, end)`. Reject non-finite, negative, reversed, empty, or style-less segments during normalization.

- [ ] **Step 2: Run the tests and confirm the expected failure**

Run:

```bash
cd frontend && npm test -- src/utils/examTextAnnotations.test.js
```

Expected: failure because the utility module does not exist.

- [ ] **Step 3: Implement the minimum interval model**

Implement the six public model functions from the shared contract. Use boundary partitioning: collect every existing and requested boundary, evaluate each adjacent slice, then merge adjacent slices whose two flags match. Do not add a general interval library or history stack.

- [ ] **Step 4: Add failing storage tests**

Assert exact keys:

```js
exerciseAnnotationScope("READING_UNDERSTANDING", 17)
// exam-annotations:v1:exercise:READING_UNDERSTANDING:17

mockAnnotationScope(31)
// exam-annotations:v1:mock:31
```

Also cover valid round-trip, malformed JSON, wrong version, invalid `regions`, scoped removal, prefix-wide removal, and quota/serialization failure that leaves the caller able to continue.

- [ ] **Step 5: Implement the storage adapter**

Read/write only `sessionStorage`. `loadAnnotationState` returns `{ version: 1, regions: {} }` for missing or invalid data and removes malformed stored data when possible. `saveAnnotationState` returns a boolean instead of throwing. `clearAllExamAnnotations` removes only keys beginning with `exam-annotations:v1:`.

- [ ] **Step 6: Add failing DOM and geometry tests**

Build a jsdom region containing nested spans and assert offsets across text-node boundaries. Assert reverse offset mapping, invalid offset rejection, single-region selection extraction, cross-region rejection, toolbar placement above, flip below, and horizontal clamping.

- [ ] **Step 7: Implement DOM and geometry helpers**

Use a `TreeWalker` over text nodes. Preserve UTF-16 offsets by using JavaScript string lengths. `selectionToAnnotationRange` must return `null` unless both endpoints resolve inside the same closest `[data-exam-annotation-region]` root and selected text is non-empty.

- [ ] **Step 8: Verify Task 1**

Run:

```bash
cd frontend && npm test -- src/utils/examTextAnnotations.test.js
cd frontend && npx eslint src/utils/examTextAnnotations.js src/utils/examTextAnnotations.test.js
git diff --check -- frontend/src/utils/examTextAnnotations.js frontend/src/utils/examTextAnnotations.test.js
```

Acceptance: all utility tests pass; storage uses only `sessionStorage`; no DOM mutation is introduced.

- [ ] **Step 9: Commit only Task 1 files**

```bash
git add frontend/src/utils/examTextAnnotations.js frontend/src/utils/examTextAnnotations.test.js
git commit -m "feat: add exam text annotation utilities"
```

---

### Task 2: Build the shared React controller, region wrapper, and toolbar

**Depends on:** Task 1

**Files:**

- Create: `frontend/src/components/examPreparation/ExamTextAnnotations.jsx`
- Create: `frontend/src/components/examPreparation/ExamTextAnnotations.css`
- Create: `frontend/src/components/examPreparation/ExamTextAnnotations.test.jsx`

- [ ] **Step 1: Write failing provider and region tests**

Mock `window.Highlight` and `CSS.highlights`. Test:

- a region registers with its stable ID and chosen semantic element;
- a valid one-region selection opens buttons named `高亮`, `下划线`, and `清除`;
- collapsed, outside, and cross-region selections do not open it;
- pointer-down on a toolbar button preserves the selected offsets;
- `高亮` and `下划线` can coexist and set `aria-pressed` to `true`, `false`, or `mixed`;
- Escape and outside click dismiss without changing state;
- pointer leave and scroll do not delete marks;
- click-to-edit resolves an existing complete segment;
- highlight registry entries are deleted on unmount;
- absent Custom Highlight support leaves text selectable and renders no toolbar;
- `clearAnnotations()` clears memory, registry ranges, and the active scope key.

- [ ] **Step 2: Run the component test and confirm it fails**

```bash
cd frontend && npm test -- src/components/examPreparation/ExamTextAnnotations.test.jsx
```

- [ ] **Step 3: Implement provider state and region registration**

The provider loads once per `scope`, keeps the state in memory, and saves after mutations. Registered region roots are real elements with `data-exam-annotation-region={regionId}`. Rebuild DOM ranges when state changes, a region mounts/unmounts, or its text content changes. Drop only ranges that cannot map to current text.

Use provider-unique registry keys such as:

```js
const highlightKey = `exam-text-highlight-${providerId}`;
const underlineKey = `exam-text-underline-${providerId}`;
```

Set the underline registry highlight to a higher `priority` than the background highlight.

- [ ] **Step 4: Implement selection and existing-mark activation**

Observe `selectionchange` for keyboard/touch completion and `pointerup` for pointer selection. Do not open while pointer selection is still moving. On region activation without a non-collapsed selection, use `document.caretPositionFromPoint` with `caretRangeFromPoint` as the compatibility lookup, convert to a region offset, and open for the whole stored segment.

If selecting label text inside an interactive option creates a generated click, suppress that one click only. Do not prevent ordinary option clicks or drag/drop events.

- [ ] **Step 5: Implement the toolbar and responsive CSS**

Render the toolbar through React with `position: fixed`. Prefer above the selection, flip below, and clamp to an 8 px gutter. Recalculate immediately on scroll, resize, and valid selection changes. Style it as a compact popover, not a modal: no title, backdrop, or close button. Add the 140 ms opacity/scale entry and disable it under `prefers-reduced-motion`.

- [ ] **Step 6: Verify Task 2**

```bash
cd frontend && npm test -- src/components/examPreparation/ExamTextAnnotations.test.jsx src/utils/examTextAnnotations.test.js
cd frontend && npx eslint src/components/examPreparation/ExamTextAnnotations.jsx src/components/examPreparation/ExamTextAnnotations.test.jsx
git diff --check -- frontend/src/components/examPreparation/ExamTextAnnotations.jsx frontend/src/components/examPreparation/ExamTextAnnotations.css frontend/src/components/examPreparation/ExamTextAnnotations.test.jsx
```

Acceptance: the toolbar behavior, style coexistence, feature detection, cleanup, and non-destructive dismissal cases pass; the component does not insert `<mark>` or `<u>`.

- [ ] **Step 7: Commit only Task 2 files**

```bash
git add frontend/src/components/examPreparation/ExamTextAnnotations.jsx frontend/src/components/examPreparation/ExamTextAnnotations.css frontend/src/components/examPreparation/ExamTextAnnotations.test.jsx
git commit -m "feat: add shared exam annotation controller"
```

---

### Task 3: Integrate standalone reading exercises

**Depends on:** Task 2

**Files:**

- Modify: `frontend/src/pages/ReadingTitleMatchingPage.jsx`
- Modify: `frontend/src/pages/ReadingTitleMatchingPage.test.jsx`
- Modify: `frontend/src/pages/ReadingUnderstandingPage.jsx`
- Create: `frontend/src/pages/ReadingUnderstandingPage.test.jsx`
- Modify: `frontend/src/pages/ReadingAdMatchingPage.jsx`
- Create: `frontend/src/pages/ReadingAdMatchingPage.test.jsx`
- Modify: `frontend/src/components/examPreparation/ReadingAdMatchingWorkspace.jsx`
- Create: `frontend/src/components/examPreparation/ReadingAdMatchingWorkspace.test.jsx`

- [ ] **Step 1: Add failing integration assertions**

For each page, mock the exercise fetch, render it, and assert that the provider scope is `exerciseAnnotationScope(exercise.exercise_type, exercise.id)`. Assert registered regions for the task/passage or ads, every question/item, every answer option, and checked explanation. Assert the back control, `Prüfen`, `Wiederholen`, badges, and status text have no annotation-region ancestor.

For `ReadingAdMatchingWorkspace`, use stable item/ad IDs in region IDs and verify selection does not prevent its existing card-selection behavior.

- [ ] **Step 2: Run targeted tests and confirm failure**

```bash
cd frontend && npm test -- src/pages/ReadingTitleMatchingPage.test.jsx src/pages/ReadingUnderstandingPage.test.jsx src/pages/ReadingAdMatchingPage.test.jsx src/components/examPreparation/ReadingAdMatchingWorkspace.test.jsx
```

- [ ] **Step 3: Wrap reading learning content**

Mount one provider per page. Wrap only learning text, retaining existing block/inline tags and classes through the region component's `as` and `className` props. Pass a region-ID prefix or annotation wrapper capability into `ReadingAdMatchingWorkspace`; do not add a second provider inside it.

Use IDs shaped like:

```text
task
passage
item:{item.id}
question:{question.id}
option:{question.id}:{option.id-or-value}
ad:{ad.id}
explanation:{question-or-item.id}
```

- [ ] **Step 4: Connect each `Wiederholen` handler**

Move the existing inline reset body into a small local handler only where needed to call `clearAnnotations()`. `Prüfen` must preserve marks. Do not change answer state behavior.

- [ ] **Step 5: Verify Task 3**

```bash
cd frontend && npm test -- src/pages/ReadingTitleMatchingPage.test.jsx src/pages/ReadingUnderstandingPage.test.jsx src/pages/ReadingAdMatchingPage.test.jsx src/components/examPreparation/ReadingAdMatchingWorkspace.test.jsx src/components/examPreparation/ExamTextAnnotations.test.jsx
cd frontend && npx eslint src/pages/ReadingTitleMatchingPage.jsx src/pages/ReadingTitleMatchingPage.test.jsx src/pages/ReadingUnderstandingPage.jsx src/pages/ReadingUnderstandingPage.test.jsx src/pages/ReadingAdMatchingPage.jsx src/pages/ReadingAdMatchingPage.test.jsx src/components/examPreparation/ReadingAdMatchingWorkspace.jsx src/components/examPreparation/ReadingAdMatchingWorkspace.test.jsx
git diff --check
```

Acceptance: all three standalone reading types expose only learning-content regions, preserve ordinary answer interactions, and clear their annotation scope only on `Wiederholen`.

- [ ] **Step 6: Commit only Task 3 files**

Stage the eight listed files explicitly and commit:

```bash
git commit -m "feat: annotate standalone reading exercises"
```

---

### Task 4: Integrate listening, writing, and speaking exercises

**Depends on:** Task 3

**Files:**

- Modify: `frontend/src/pages/ListeningExercisePage.jsx`
- Modify: `frontend/src/pages/ListeningExercisePage.test.jsx`
- Modify: `frontend/src/components/examPreparation/ListeningTranscript.jsx`
- Create: `frontend/src/components/examPreparation/ListeningTranscript.test.jsx`
- Modify: `frontend/src/pages/ExamPreparationWritingDetailPage.jsx`
- Create: `frontend/src/pages/ExamPreparationWritingDetailPage.test.jsx`
- Modify: `frontend/src/pages/SpeakingTeilExercisePage.jsx`
- Create: `frontend/src/pages/SpeakingTeilExercisePage.test.jsx`

- [ ] **Step 1: Write failing integration tests**

Assert stable regions for listening instructions, question/option text, revealed transcript, and explanations; writing prompt/source/reference text; and speaking prompt/material/dialogue text. Assert audio controls, playback counters, textareas, recording/answer controls, favorites, and action buttons are excluded.

Add regression assertions that audio controls remain clickable, writing input accepts text, and speaking ordering/section actions still run.

- [ ] **Step 2: Run targeted tests and confirm failure**

```bash
cd frontend && npm test -- src/pages/ListeningExercisePage.test.jsx src/components/examPreparation/ListeningTranscript.test.jsx src/pages/ExamPreparationWritingDetailPage.test.jsx src/pages/SpeakingTeilExercisePage.test.jsx
```

- [ ] **Step 3: Integrate the shared provider and regions**

Mount one provider per page using the standalone scope. Let `ListeningTranscript` accept an optional annotation-region prefix or wrapper props so both standalone and Mock Exam callers can register transcript content without nesting providers. Preserve its current markup and CSS classes.

Speaking Teil 3 may reset one section at a time, but `Wiederholen` represents the current exercise annotation scope: clear all marks for that exercise when any visible Wiederholen action is used, matching the approved exercise-level storage key.

- [ ] **Step 4: Connect `Wiederholen` cleanup without changing existing resets**

Call `clearAnnotations()` alongside the exact existing answer/draft/timer reset operations. Do not clear on `Prüfen`, section navigation, transcript reveal, or writing self-check.

- [ ] **Step 5: Verify Task 4**

```bash
cd frontend && npm test -- src/pages/ListeningExercisePage.test.jsx src/components/examPreparation/ListeningTranscript.test.jsx src/pages/ExamPreparationWritingDetailPage.test.jsx src/pages/SpeakingTeilExercisePage.test.jsx src/components/examPreparation/ExamTextAnnotations.test.jsx
cd frontend && npx eslint src/pages/ListeningExercisePage.jsx src/components/examPreparation/ListeningTranscript.jsx src/pages/ExamPreparationWritingDetailPage.jsx src/pages/SpeakingTeilExercisePage.jsx
git diff --check
```

Acceptance: listening, writing, and speaking learning content is annotatable; excluded controls remain outside regions; existing audio/input/ordering behavior passes; Wiederholen clears only the current exercise's marks.

- [ ] **Step 6: Commit only Task 4 files**

Stage the eight listed files explicitly and commit:

```bash
git commit -m "feat: annotate listening writing and speaking exercises"
```

---

### Task 5: Integrate both Sprachbausteine exercise types

**Depends on:** Task 4

**Files:**

- Modify: `frontend/src/pages/ClozeChoicePage.jsx`
- Modify: `frontend/src/pages/ClozeMatchingPage.jsx`
- Modify: `frontend/src/pages/ClozeExercisePage.test.jsx`

- [ ] **Step 1: Add failing coverage for both cloze variants**

Assert regions for source text, each blank's surrounding learning text, option text, and checked explanation. Assert option containers, drag handles/drop behavior, action buttons, save-state notes, and navigation remain operational and are not turned into annotation regions as whole controls.

Add explicit regressions:

- ordinary choice-option click still selects an answer;
- selecting text in a choice label suppresses only the generated choice click;
- matching-option drag start/drop still assigns an answer;
- clicking a marked word opens annotation editing rather than opening the choice modal unless it was an ordinary non-selection click.

- [ ] **Step 2: Run the cloze test and confirm failure**

```bash
cd frontend && npm test -- src/pages/ClozeExercisePage.test.jsx
```

- [ ] **Step 3: Integrate provider and granular regions**

Use each page's existing exercise type/id scope. Wrap text spans inside interactive controls rather than the whole button/draggable container. Preserve all current classes and the recently implemented inline explanation layout; do not refactor `clozeAnnotationLayout.js` or unrelated modal sizing.

- [ ] **Step 4: Add `Wiederholen` cleanup**

Call the provider's `clearAnnotations()` in the existing answer reset path. Keep existing save-state/error cleanup unchanged.

- [ ] **Step 5: Verify Task 5**

```bash
cd frontend && npm test -- src/pages/ClozeExercisePage.test.jsx src/components/examPreparation/ExamTextAnnotations.test.jsx
cd frontend && npx eslint src/pages/ClozeChoicePage.jsx src/pages/ClozeMatchingPage.jsx src/pages/ClozeExercisePage.test.jsx
git diff --check -- frontend/src/pages/ClozeChoicePage.jsx frontend/src/pages/ClozeMatchingPage.jsx frontend/src/pages/ClozeExercisePage.test.jsx
```

Acceptance: both cloze pages annotate all intended text, reset annotations on Wiederholen, and retain choice modal, drag/drop, inline explanations, and save-state behavior.

- [ ] **Step 6: Commit only Task 5 files**

```bash
git add frontend/src/pages/ClozeChoicePage.jsx frontend/src/pages/ClozeMatchingPage.jsx frontend/src/pages/ClozeExercisePage.test.jsx
git commit -m "feat: annotate sprachbausteine exercises"
```

---

### Task 6: Integrate Mock Written Exam content and attempt lifecycle

**Depends on:** Task 5

**Files:**

- Modify: `frontend/src/pages/MockWrittenExamPage.jsx`
- Modify: `frontend/src/pages/MockWrittenExamPage.test.jsx`

- [ ] **Step 1: Add failing Mock Exam integration tests**

Extend existing fixtures and tests to assert:

- unfinished attempt `12` uses `exam-annotations:v1:mock:12`;
- moving between reading, listening, and writing parts preserves the same provider/state;
- all learning content and review explanations use stable part/exercise/question/option region IDs;
- timers, phase controls, result summary, favorites, save messages, audio controls, and writing textarea are excluded;
- completing/submitting attempt `12` removes only its annotation key;
- `newExam()` removes the old attempt key before loading a new attempt;
- `?saved=` completed review mounts with an empty annotation state and does not restore the submitted attempt key;
- annotation storage never appears in submit/update payloads.

- [ ] **Step 2: Run the Mock Exam test and confirm failure**

```bash
cd frontend && npm test -- src/pages/MockWrittenExamPage.test.jsx
```

- [ ] **Step 3: Mount one provider for an active attempt**

Use `mockAnnotationScope(attemptId)` only after a real unfinished `attemptId` exists. Keep the provider outside the active-part switch so changing parts does not unmount its state. For saved/completed review, use a non-persisting empty scope mode supported by the provider (for example `scope={null}`) so review text remains annotatable for the current mount but never restores the submitted attempt's cleared key.

Prefix all region IDs with the stable part key and exercise ID to avoid collisions:

```text
part:{partKey}:exercise:{exercise.id}:passage
part:{partKey}:question:{question.id}
part:{partKey}:option:{question.id}:{option.id-or-value}
part:{partKey}:explanation:{question.id}
```

Reuse the annotation-aware `ListeningTranscript` and `ReadingAdMatchingWorkspace` integration; do not create nested providers.

- [ ] **Step 4: Clear the attempt scope at terminal lifecycle points**

In `completeExam`, clear `mockAnnotationScope(attemptId)` only after the learner confirms completion/early submission and the local phase changes to results; storage cleanup must still occur if the network save fails. In `newExam`, clear the prior attempt scope before setting `attemptId` to `null`. Do not clear when moving between phases or when background progress PATCH fails.

- [ ] **Step 5: Verify Task 6**

```bash
cd frontend && npm test -- src/pages/MockWrittenExamPage.test.jsx src/components/examPreparation/ExamTextAnnotations.test.jsx
cd frontend && npx eslint src/pages/MockWrittenExamPage.jsx src/pages/MockWrittenExamPage.test.jsx
git diff --check -- frontend/src/pages/MockWrittenExamPage.jsx frontend/src/pages/MockWrittenExamPage.test.jsx
```

Acceptance: one unfinished attempt retains marks through parts and refresh, submission/new exam clears them, completed review starts empty, and no API payload changes.

- [ ] **Step 6: Commit only Task 6 files**

```bash
git add frontend/src/pages/MockWrittenExamPage.jsx frontend/src/pages/MockWrittenExamPage.test.jsx
git commit -m "feat: annotate mock exam content"
```

---

### Task 7: Connect attempt deletion and logout cleanup

**Depends on:** Task 6

**Files:**

- Modify: `frontend/src/pages/ExamPreparationModulePage.jsx`
- Modify: `frontend/src/pages/ExamPreparationModulePage.test.jsx`
- Modify: `frontend/src/pages/MockExamRecordsPage.jsx`
- Modify: `frontend/src/pages/MockExamRecordsPage.test.jsx`
- Modify: `frontend/src/api/auth/AuthProvider.jsx`
- Create: `frontend/src/api/auth/AuthProvider.test.jsx`

- [ ] **Step 1: Write failing lifecycle tests**

Assert that successful deletion of interrupted attempt `31` removes `mockAnnotationScope(31)` in both module-page and records-page flows. If deletion fails, retain the annotation key because the attempt still exists.

For `AuthProvider`, seed two annotation keys plus unrelated session data, call `logout()`, and assert every `exam-annotations:v1:` key is removed while unrelated session data remains. Existing token/user logout behavior must remain unchanged.

- [ ] **Step 2: Run lifecycle tests and confirm failure**

```bash
cd frontend && npm test -- src/pages/ExamPreparationModulePage.test.jsx src/pages/MockExamRecordsPage.test.jsx src/api/auth/AuthProvider.test.jsx
```

- [ ] **Step 3: Add narrow cleanup calls**

After `deleteSavedMockExam(record.id)` succeeds, call `clearAnnotationScope(mockAnnotationScope(record.id))` in each existing deletion flow. In `AuthProvider`'s existing `logout` function, call `clearAllExamAnnotations()` alongside token cleanup before clearing user state. Do not couple annotation cleanup into the backend auth function or modify network requests.

- [ ] **Step 4: Verify Task 7**

```bash
cd frontend && npm test -- src/pages/ExamPreparationModulePage.test.jsx src/pages/MockExamRecordsPage.test.jsx src/api/auth/AuthProvider.test.jsx
cd frontend && npx eslint src/pages/ExamPreparationModulePage.jsx src/pages/MockExamRecordsPage.jsx src/api/auth/AuthProvider.jsx src/api/auth/AuthProvider.test.jsx
git diff --check
```

Acceptance: successful deletion clears only that attempt, failed deletion preserves it, and logout clears only the annotation prefix in addition to existing auth state.

- [ ] **Step 5: Commit only Task 7 files**

Stage the six listed files explicitly and commit:

```bash
git commit -m "fix: clear temporary exam annotations on lifecycle end"
```

---

### Task 8: Full regression and acceptance verification

**Depends on:** Tasks 1-7

**Files:**

- Modify only if a failing acceptance check identifies a defect directly caused by Tasks 1-7.

- [ ] **Step 1: Run all focused annotation and page tests together**

```bash
cd frontend && npm test -- \
  src/utils/examTextAnnotations.test.js \
  src/components/examPreparation/ExamTextAnnotations.test.jsx \
  src/components/examPreparation/ReadingAdMatchingWorkspace.test.jsx \
  src/components/examPreparation/ListeningTranscript.test.jsx \
  src/pages/ReadingTitleMatchingPage.test.jsx \
  src/pages/ReadingUnderstandingPage.test.jsx \
  src/pages/ReadingAdMatchingPage.test.jsx \
  src/pages/ListeningExercisePage.test.jsx \
  src/pages/ExamPreparationWritingDetailPage.test.jsx \
  src/pages/SpeakingTeilExercisePage.test.jsx \
  src/pages/ClozeExercisePage.test.jsx \
  src/pages/MockWrittenExamPage.test.jsx \
  src/pages/ExamPreparationModulePage.test.jsx \
  src/pages/MockExamRecordsPage.test.jsx \
  src/api/auth/AuthProvider.test.jsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run the complete frontend checks**

```bash
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
git diff --check
```

Expected: tests, lint, build, and whitespace checks all pass. If an unrelated pre-existing failure appears, record its exact command and output separately; do not edit unrelated code.

- [ ] **Step 3: Inspect the final diff against the spec**

Check each concrete page from the spec for at least one positive region assertion and excluded-control assertion. Search for forbidden scope changes:

```bash
git diff --name-only
rg -n "localStorage|<mark|<u>|exam-annotations" frontend/src
```

Confirm:

- no backend file changed;
- annotations use `sessionStorage` only;
- no annotation data enters API payloads;
- all lifecycle cleanup paths are covered;
- highlight and underline remain independent;
- no browser was opened.

- [ ] **Step 4: Run the Superagent acceptance review**

The Superagent must inspect the actual diff and relevant files, rerun risk-appropriate focused tests independently, and compare every acceptance criterion in the design spec. Do not accept based only on Luna's report.

- [ ] **Step 5: Commit any narrowly scoped test-driven correction**

Only if Step 2 or Step 3 exposed a feature-caused defect, stage exactly the corrected files and commit:

```bash
git commit -m "fix: complete exam annotation integration"
```

Acceptance: every criterion in the approved design spec is backed by passing automated evidence, with no unrelated or backend changes.
