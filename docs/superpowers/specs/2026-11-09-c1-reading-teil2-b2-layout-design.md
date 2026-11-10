# C1 Lesen Teil 2 B2 Layout Design

## Intent

Make TELC C1 HS Lesen Teil 2 follow the established B2 Lesen Teil 3 interaction order so learners see the Anzeigen before the question they must answer.

## Chosen approach

Use the existing regular `ReadingAdMatchingWorkspace` presentation already used by B2: Anzeigen and their carousel controls first, followed by the question-number controls and the current question with its options. Keep C1's `allowRepeated` behavior so the same Anzeige may answer multiple questions.

## Behavior

- The Anzeigen section renders above the question section.
- Anzeige page controls render directly below the Anzeigen.
- Question-number controls render above the current question and options.
- Only one current question is shown at a time.
- Desktop shows four Anzeigen per page, tablet two, and mobile one, using the existing shared responsive rules.
- C1 continues to allow the same Anzeige to be selected for multiple questions.

## Constraints

- Reuse the B2 workspace mode; do not create a duplicate C1 component.
- Do not change data import, scoring, answer persistence, review, or annotation behavior.
- Do not change B1 or B2 layouts.

## Alternatives considered

- Reordering the C1-only CSS while retaining all Anzeigen and extra arrow controls was rejected because it would still differ from the requested B2 control placement.
- A new C1-specific workspace was rejected as unnecessary duplication.
