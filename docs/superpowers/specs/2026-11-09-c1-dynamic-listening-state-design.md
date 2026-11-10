# C1 Listening Child-ID Design

## Goal

All TELC C1 HS listening answers are attached to persistent `ListeningQuestion` rows. Practice and mock-exam code must use those real database IDs; no C1 listening answer may use a generated `statement-*` or `note-*` key, and no exercise-level JSON answer state is needed.

## Data model

- Every listening question has a stable source `question_key` in addition to its database primary key.
- `ListeningQuestion.QuestionType.TEXT_INPUT` represents Teil 3 note blanks.
- `ListeningQuestion.correct_answer` stores Teil 3 answer semantics, including `<or>`, semicolon and parenthesized alternatives.
- Existing `(listening_exercise, question_number)` uniqueness remains the import upsert identity, so a repeated import preserves `ListeningQuestion.id`.

## Import mapping

- Teil 1: create eight questions from the statements that have a declared speaker. The statement is the question text and `Sprecher/in 1–8` are its answer options; exactly one speaker option is correct. The two statements without a speaker were distractors in the source format and are not imported as questions. Statement explanations stay on their questions.
- Teil 2: keep ten choice questions, add a stable `question_key`, and upsert questions/options instead of deleting them.
- Teil 3: create one `TEXT_INPUT` question per `blank_ID`; copy its answer into `correct_answer`. Presentation slides remain in exercise content only for layout.

## Persistence and scoring

- Practice uses `UserListeningQuestionState` for all three parts. Teil 3 writes text to `answer_payload.answer_text`.
- Mock exam answer objects remain part of the saved exam, but their keys are real `ListeningQuestion.id` values.
- Scoring reads correct options or `correct_answer` from relational questions.
- The unshipped `UserListeningExerciseState` model/API/migration is removed.

## Scope

Other C1 objective modules already use relational child rows. Writing is one authored response, and speaking follow-along is keyed by stable turn keys rather than objective questions; neither is converted.
