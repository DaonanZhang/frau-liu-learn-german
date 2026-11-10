# C1 Lesen Teil 1 Beispiel Drag Guide Design

## Intent

Make the first interaction in TELC C1 HS Lesen Teil 1 discoverable without requiring the learner to click an empty blank first, then guide them from the completed example to question 1.

## Chosen approach

Use a persistent, visually floating callout attached to the `Beispiel` option rather than a blocking modal or a hover-only tooltip. The callout says `将 Beispiel 拖到标有 0 的空格中`, remains usable on touch devices, and disappears after blank 0 is filled. Once blank 0 is filled, blank 1 receives a green guidance state until it is answered.

## Behavior

- Blank 0 visibly renders the number `0` before it is answered.
- Before blank 0 is answered, the option area visibly explains that `Beispiel` should be dragged to blank 0.
- After blank 0 is answered, the callout disappears and unanswered blank 1 is highlighted green.
- The blank 1 guidance disappears after blank 1 is answered.
- Pool options and filled answer chips wrap long text within their containers on desktop, tablet, and mobile.

## Constraints

- Preserve the existing drag and click-to-select behavior.
- Apply the staged guidance only to the restricted C1 example flow.
- Add no dependency and do not refactor unrelated mock-exam code.

## Alternatives considered

- A real modal was rejected because it would obstruct the drag target.
- A hover-only tooltip was rejected because touch devices have no reliable hover state and it would not solve initial discoverability.
