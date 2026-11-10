# C1 Lesen Teil 1 Practice Guide Design

## Intent

Bring the standalone TELC C1 HS Lesen Teil 1 exercise page in line with the already-approved mock-exam guidance.

## Behavior

- Before blank 0 is answered, the Beispiel option has a persistent non-blocking callout: `将 Beispiel 拖到标有 0 的空格中`.
- Blank 0 visibly displays `0`.
- After blank 0 is answered, the callout disappears and unanswered blank 1 is highlighted green.
- After blank 1 is answered, the green guidance disappears.
- Pool options and filled answer chips wrap long text inside their containers on desktop, tablet, and mobile.

## Constraints

- Apply the staged guidance only to C1.
- Preserve existing drag, touch-drag, click-to-fill, checking, saving, annotation, and reset behavior.
- Add no dependency and do not change the mock-exam implementation.

## Approach

Derive the guide state from the existing `answers`, `c1ExampleBlank`, and blank-number data. Wrap only the Beispiel pool button with a positioned callout container, use nullish fallback for zero, and add narrowly scoped C1 CSS classes.
