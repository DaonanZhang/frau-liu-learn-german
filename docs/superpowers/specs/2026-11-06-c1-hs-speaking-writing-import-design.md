# C1 HS Speaking and Writing Import Design

## Intent

Import the real TELC C1 Hochschule Schreiben and Sprechen workbooks into the existing exam-preparation models so the already-built C1 practice UI can display direct model answers, shadowing audio, two translated writing quotations, and paged vocabulary.

## Goals

- Treat each Schreiben workbook as one C1 writing exercise with 70 minutes, a 350-word minimum, two quotations with Chinese translations, one combined model answer with Chinese translation, and paged vocabulary.
- Treat each Sprechen Teil 1 workbook as two exercises: Teil 1A uses the presentation, outline, and first model turn; Teil 1B uses the remaining summary/follow-up dialogue.
- Treat each Sprechen Teil 2 workbook as one discussion exercise with a prominently displayed quotation and Chinese translation plus all model dialogue turns.
- Reuse `WritingExerciseWorkspace`, `SpeakingTeilExercisePage`, `SpeakingPracticeRecorder`, and the existing speaking-audio path/generator.
- Preserve the nginx-proxied `/resources/ExamPreparation/...` URL strategy; generated audio remains eligible for the existing resources-to-COS sync.

## Non-goals

- No new frontend exercise framework or recording component.
- No server connection, deployment, database import, or COS upload in this change.
- No redesign of B1/B2 screens.

## Approaches

1. Add C1-only frontend pages and models. Rejected because the existing models and components already express the required behavior.
2. Convert the source workbooks into the existing generic B1/B2 workbook contracts. Rejected because it would lose the meaningful 1A/1B split and the C1 writing vocabulary/quotation fields.
3. Add narrow C1 parsers to the existing C1 importer and emit the established model `content` shapes. Selected because it preserves source meaning with the smallest code change.

## Data Mapping

- Schreiben `meta` -> `ExerciseBase` and `WritingExercise`; `text` rows are joined into one `WritingExampleText`; `word` rows are divided into stable vocabulary pages.
- Sprechen Vortrag `meta` + `example` -> `SPEAKING_TEIL1` (1A) and `SPEAKING_TEIL2` (1B).
- Sprechen Zitat `meta` + `example` -> `SPEAKING_TEIL3` (Teil 2).
- Every source and child ID must match the numeric filename suffix after normalization.
- Audio generation is enabled by the normal import path and can be explicitly skipped for preflight/offline data checks.

## Constraints

- Reject blank exam type and any value other than TELC.
- Reject incomplete writing quotations, translations, model text, or vocabulary.
- Reject mismatched cross-sheet IDs and duplicate scoped keys.
- Keep the existing responsive frontend behavior across desktop, tablet, and mobile.
