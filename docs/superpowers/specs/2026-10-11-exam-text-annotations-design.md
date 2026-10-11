# Exam Preparation Temporary Text Annotations Design

## Purpose

Add temporary highlighting and underlining to learning content on every concrete exam-preparation exercise page. A learner selects text and uses a small toolbar anchored to the selection. The feature is a reading aid, not a durable note-taking system.

The implementation is frontend-only. It adds no Django model, migration, serializer, API endpoint, or cross-device synchronization.

## Product Principles

- Preserve reading flow: use a compact contextual toolbar, not a modal or confirmation sentence.
- Make every mark explicitly reversible. Pointer movement or toolbar dismissal must never delete a mark.
- Treat highlight and underline as independent attributes so their result does not depend on application order.
- Keep the interaction consistent across exercise types, mock-exam parts, desktop, tablet, and mobile.
- Limit the first version to temporary visual annotations. Do not add notes, colors, sharing, history, or backend persistence.

## Scope

The feature applies to concrete exercise pages:

- `ListeningExercisePage`;
- `ReadingTitleMatchingPage`;
- `ReadingUnderstandingPage`;
- `ReadingAdMatchingPage` and its reading workspace;
- `ClozeChoicePage`;
- `ClozeMatchingPage`;
- `ExamPreparationWritingDetailPage`;
- `SpeakingTeilExercisePage`;
- all learning-content parts rendered inside `MockWrittenExamPage`, including answer review.

Annotatable learning content includes:

- passages, advertisements, prompts, task descriptions, and source materials;
- question text and answer-option text;
- listening transcripts;
- writing and speaking materials;
- answer explanations shown after checking or in review mode.

The feature does not annotate application chrome:

- navigation and back links;
- action buttons such as `Prüfen` and `Wiederholen`;
- badges, counters, timers, save-state messages, and result summaries;
- favorite controls;
- user-authored input or textarea contents.

## Interaction Design

### Creating a mark

When a non-collapsed selection lies within one annotatable region, show a compact floating toolbar close to the selection:

`高亮` · `下划线` · `清除`

The toolbar is a popover, not a modal. It contains no title, explanatory sentence, close button, or backdrop.

- `高亮` applies or removes the highlight attribute for the selected range.
- `下划线` applies or removes the underline attribute for the selected range.
- `清除` removes both attributes from the selected range.
- Applying an action collapses the native selection and closes the toolbar.
- Clicking outside or pressing Escape closes the toolbar without changing marks.

Selections that are collapsed, contain no text, exist entirely outside an annotatable region, or cross multiple annotation regions do not open the toolbar. Cross-region selections are not partially applied; the learner must select within one region. This avoids surprising changes across cards or controls.

### Editing an existing mark

Clicking or tapping marked text resolves the caret position back to the region's character offset. If that offset belongs to a stored marked segment, reopen the same toolbar for that complete segment.

The toolbar reflects three states for each style:

- inactive when none of the selected characters have the style;
- active when all selected characters have the style;
- mixed when only part of the range has the style.

Clicking an inactive or mixed style applies it to the full selection. Clicking an active style removes it from the selection. This makes partially overlapping ranges predictable and prevents the first click from unexpectedly deleting existing work.

No destructive action occurs on hover, pointer leave, scroll, or selection loss.

### Visual treatment

- Highlight uses one restrained warm-yellow background with sufficient text contrast.
- Underline uses a distinct foreground line and does not change text color.
- When both styles apply, highlight paints behind the text and underline paints above the highlight.
- The toolbar appears from the selection-facing transform origin with an opacity and `scale(0.97 → 1)` transition of roughly 140 ms.
- Repositioning during scroll, resize, or selection-handle movement is immediate; the toolbar does not chase the pointer with an animation.
- Respect `prefers-reduced-motion` by removing the entry transition.

## Responsive and Accessible Behavior

- Desktop opens the toolbar after a completed pointer selection (`pointerup`/`selectionchange`), not while the selection is still changing.
- Touch devices keep the browser's native long-press selection and selection handles. The application toolbar appears only after a valid native selection exists.
- The toolbar prefers the space above the selection, flips below when necessary, and clamps horizontally within an 8 px viewport gutter.
- Toolbar `pointerdown` must preserve the native selection until the requested action has captured its offsets.
- Buttons expose literal accessible names and `aria-pressed` state, including `mixed` where supported.
- Escape dismisses the toolbar and returns focus without modifying annotations.
- Keyboard-created selections can invoke the same toolbar without requiring a pointer.

## Annotation Model

Each annotatable region has a stable page-local identifier such as:

- `reading-passage`;
- `question:42`;
- `option:42:B`;
- `explanation:42`;
- `listening-transcript`.

Identifiers must be derived from stable exercise/question/option identities where available, not array indexes that change after sorting.

Stored annotations use character offsets in the region's canonical `textContent`, not DOM node references:

```js
{
  regionId: "reading-passage",
  start: 128,
  end: 164,
  highlight: true,
  underline: false
}
```

Offsets use JavaScript/DOM UTF-16 code units so they map directly to `Range` boundary offsets. Empty ranges are never stored.

The state for each region is normalized into ordered, non-overlapping segments. Adjacent segments with identical style flags merge automatically. Applying or removing a style may split an existing segment into left, selected, and right pieces.

For example, highlighting `A–C` and underlining `B–D` produces:

- `A`: highlight;
- `B–C`: highlight and underline;
- `D`: underline.

Application order does not affect the normalized result.

## Frontend Architecture

### Shared controller

Add one exam-annotation controller mounted around concrete exam content. It owns:

- native selection observation;
- selection-to-region offset conversion;
- mark interval operations;
- toolbar visibility, state, and position;
- rendering registration with the browser highlight registry;
- session storage for the current scope;
- cleanup on unmount and lifecycle events.

Individual exercise pages do not implement Selection API logic. They only identify annotatable regions and provide the storage scope.

### Region wrapper

Add a small `AnnotatableTextRegion` component or equivalent hook that renders a real child element with a stable region ID and registers its root element with the controller. A real child element avoids relying on anonymous flex/grid text boxes.

The wrapper must preserve the existing element semantics and class names. It must not introduce block layout where the current content is inline, alter button sizing, or swallow existing click/drag handlers.

Interactive answer options may expose their label text as a nested annotatable span. If a pointer gesture creates a non-collapsed selection, suppress only the click generated by that selection gesture; ordinary clicks and drag/drop remain unchanged.

### Rendering

Use the CSS Custom Highlight API to render two document-level highlight sets:

- one for background highlights;
- one for underlines with higher paint priority.

The controller reconstructs DOM `Range` objects from normalized character offsets whenever a region mounts or its rendered text changes. It never inserts nested `<mark>` or `<u>` elements and never mutates React-owned DOM.

Feature-detect `CSS.highlights` and `window.Highlight`. When unavailable, leave native text selection untouched and do not show a nonfunctional annotation toolbar. The first version does not add a second DOM-mutation renderer.

Every provider instance uses namespaced registry keys and removes them on unmount so exercise navigation cannot leak marks into another page.

### Clicking rendered highlights

Custom highlights do not become ordinary DOM elements. On pointer activation inside a registered region, convert the pointer/caret location to a region offset and look up the normalized segment containing that offset. This opens the toolbar for the segment without requiring the learner to reproduce the original selection exactly.

## Temporary Storage

Use `sessionStorage`, not `localStorage` and not the backend.

### Mock Exam

Mock-exam annotations use one key per attempt:

`exam-annotations:v1:mock:{attemptId}`

- Marks survive movement between parts of the same attempt.
- Marks survive an accidental refresh in the same tab.
- Leaving and resuming the same unfinished attempt in the same tab restores them.
- Submitting, deleting, or explicitly abandoning the attempt deletes the key.
- A new attempt receives a different key and never inherits marks.
- Completed/saved review starts without annotations because submission clears the attempt key.

### Standalone exercises

Standalone pages use:

`exam-annotations:v1:exercise:{exerciseType}:{exerciseId}`

- Returning to the same exercise in the same tab restores marks.
- `Prüfen` does not clear marks.
- `Wiederholen` clears that exercise's marks together with its answers.
- Closing the tab clears them with the browser session.

### Authentication lifecycle

Logout clears every key with the `exam-annotations:v1:` prefix. No annotation data is sent to the server or included in existing answer/mock-exam payloads.

Storage parsing accepts only the current versioned shape. Invalid data is discarded silently because annotations are temporary and recoverable.

## Integration Strategy

Implement in stages to reduce regression risk:

1. Build and test the pure interval model, storage adapter, selection-offset mapping, and toolbar-position calculation.
2. Add the shared controller, region wrapper, rendering registry, and toolbar.
3. Integrate standalone reading pages and verify nested formatted text and interactive options.
4. Integrate listening, writing, speaking, and both Sprachbausteine pages.
5. Integrate `MockWrittenExamPage` using its current attempt identity and cleanup lifecycle.

Each stage reuses the same shared behavior. Pages may not create page-specific highlight implementations.

## Error Handling

- Invalid or stale offsets for a mounted region are dropped rather than clamped onto unrelated text.
- A storage quota or serialization failure keeps marks in memory for the current render and must not break the exercise.
- If a region's text changes so a stored range is no longer valid, discard only that range.
- A missing browser highlight API leaves ordinary text selection functional.
- Annotation failures never block answering, checking, saving, favoriting, audio playback, or mock-exam submission.

## Testing and Verification

Pure unit tests must cover:

- disjoint, adjacent, overlapping, and fully contained ranges;
- applying highlight and underline in both orders;
- partial style removal and complete clearing;
- segment splitting and adjacent identical-segment merging;
- inactive, active, and mixed toolbar states;
- DOM selection offsets across nested text nodes;
- pointer/caret lookup of an existing marked segment;
- toolbar flip and viewport clamping;
- session key construction, malformed storage, and scoped clearing.

Component tests must cover:

- toolbar visibility only for valid single-region selections;
- preserving the selection when toolbar buttons are pressed;
- click-to-edit for an existing mark;
- no deletion on dismissal, pointer leave, or scrolling;
- underline/highlight coexistence and rendering priority;
- cleanup of browser highlight registry entries on unmount;
- feature-detection behavior when the API is unavailable;
- `Wiederholen` clearing a standalone exercise's marks;
- Mock Exam part changes preserving one attempt's marks;
- submission, deletion, abandonment, and logout clearing the appropriate keys;
- ordinary option clicks and Sprachbausteine drag/drop remaining usable.

Every concrete exercise page must have an integration assertion that its intended learning-content regions are registered and that navigation/action controls are excluded.

Run the complete frontend test suite, lint, production build, and `git diff --check`. Per the repository rule, do not open a browser or perform browser-based verification unless the user explicitly requests it.

## Acceptance Criteria

- A learner can select learning text and apply highlight or underline from a small anchored toolbar.
- Highlight and underline overlap deterministically and can be removed from all or part of a range.
- Existing marks can be edited by clicking/tapping them; hover and pointer movement never delete marks.
- The toolbar remains usable and within the viewport on desktop, tablet, and mobile.
- All concrete exercise types and Mock Exam learning content use the same interaction and interval model.
- Mock Exam marks are scoped to one attempt; standalone marks are scoped to one exercise.
- Refresh in the same tab preserves marks, while the defined reset/submit/logout lifecycle clears them.
- No backend file, database schema, API contract, or server payload changes.
- Existing answering, checking, reset, favorite, audio, drag/drop, and mock-exam workflows continue to pass their tests.
