# C1 Lesen Teil 1 Next-Empty Guide and Wrapping Design

## Intent

Keep filled answer cards inside the standalone C1 Lesen Teil 1 text column and make the green guidance follow the first unanswered normal blank regardless of the learner's drag order.

## Behavior

- A filled answer card wraps within the text panel and never creates horizontal expansion or scrolling because of its text.
- After example blank 0 is answered, the green state marks the numerically earliest unanswered blank with `blank_number >= 1`.
- Filling blank 1 moves green guidance to blank 2; filling blank 2 before blank 1 leaves blank 1 green.
- Clearing an earlier blank moves guidance back to that blank.
- When all normal blanks are answered, no blank is green.
- The existing Beispiel callout remains the initial guide before blank 0 is answered.

## Approach

Replace the fixed blank-1 derived state with a numerically ordered next-empty blank derived from existing answers. For layout, constrain the C1 inline blank wrapper, selected slot, answer button, and its inner span; override the generic `max-content`/`auto` widths with C1-scoped fit-content and full-width wrapping rules.

## Constraints

- Apply only to the standalone C1 page.
- Preserve drag, touch, click assignment, review, saving, reset, and annotation behavior.
- Add no dependency and do not modify mock-exam code.
