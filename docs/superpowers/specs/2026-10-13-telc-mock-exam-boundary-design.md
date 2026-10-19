# TELC Mock Exam Boundary Design

## Goal

Separate the reusable mock-exam lifecycle from the current TELC-specific exam implementation so future exam families can add their own composition, timing, scoring, and UI without changing TELC behavior.

This is a structural refactor. Existing TELC B1/B2 question selection, timers, phase transitions, scoring, saving, favorites, retakes, sharing, visible copy, layout, and interactions must remain unchanged.

## Scope

### Included

- Keep papers, attempts, idempotency, history, favorites, retakes, and sharing generic.
- Treat `(exam_type, level)` as the question-bank and paper scope.
- Move TELC composition, timing, phase, scoring, answer-sheet, and exam-page behavior behind an explicit TELC implementation boundary.
- Rename TELC-specific frontend files, symbols, and CSS selectors with a `TelcMockExam` / `telc-mock-exam` identity.
- Introduce canonical URLs that contain the exam family.
- Update every internal link, route matcher, access gate, and test to use the new URLs.
- Keep generic mock-exam API routes and generic database model names.

### Excluded

- No new exam family implementation.
- No change to visible UI behavior or user-facing copy.
- No database schema change or data migration.
- No compatibility route or redirect for the old mock-exam URLs.
- No change to listening URLs, media filenames, storage directories, COS keys, or media synchronization.
- No unrelated cleanup or redesign.

## Canonical URLs

The only registered frontend routes for the current mock exam and its records are:

```text
/modules/exam-preparation/telc/b1/mock-exam
/modules/exam-preparation/telc/b2/mock-exam
/modules/exam-preparation/telc/b1/mock-exams
/modules/exam-preparation/telc/b2/mock-exams
```

The former `/modules/exam-preparation/b1|b2/mock-exam(s)` routes are removed without redirects. All repository-owned navigation is updated to the canonical URLs.

The level home pages remain at `/modules/exam-preparation/b1` and `/modules/exam-preparation/b2`. Returning from the TELC mock exam continues to use the corresponding level home page so the user-visible navigation flow does not change.

## Data Model

The existing generic models remain the source of truth:

- `MockExamPaper` identifies one reusable question combination through its database ID and `paper_code`.
- `SavedMockExam` identifies one user's attempt.
- `MockExamShare` supplies the external share credential.
- `request_id` remains an idempotency key, scoped by user, exam family, and level; it is not a paper identifier.

`MockExamPaper.exam_type` and `MockExamPaper.level` already identify the paper scope. Every selected exercise must resolve inside that same scope. No additional scope column or ruleset column is needed.

Historical TELC B1/B2 papers and attempts remain readable without modification.

## Backend Architecture

### Generic lifecycle

The following responsibilities stay generic:

- request validation and authentication;
- idempotent paper creation;
- paper and attempt persistence;
- progress and answer persistence;
- history and favorite filtering;
- retakes;
- share creation and shared-attempt creation;
- scope normalization and paper ownership checks.

Existing generic model and API names remain unchanged, including `MockExamPaper`, `SavedMockExam`, `MockExamShare`, `MockExamViewSet`, `SavedMockExamViewSet`, and `MockExamShareViewSet`.

### Rules registry

A small registry resolves an implementation from `(exam_type, level)`. Initially it contains exactly:

```text
(TELC, B1) -> TELC mock-exam rules
(TELC, B2) -> TELC mock-exam rules
```

Unsupported pairs return the existing explicit unsupported-scope error. The registry must not silently fall back to TELC.

### TELC implementation

TELC-specific behavior moves out of the generic view orchestration into focused modules under `apps/exam_preparation/mock_exam/telc/`:

- exercise-part definitions and scoped selection;
- payload metadata and durations;
- initial TELC progress state;
- correct-answer counting;
- TELC scoring, 225-point total, and 135-point pass threshold.

The refactor must preserve the exact JSON shape currently consumed by the frontend.

The TELC implementation may call existing serializers and models directly. It must not introduce a speculative base class or plugin framework beyond the minimal registry interface needed to select rules.

## Frontend Architecture

### Generic pieces

The following remain generic:

- `mockExams.js` API client;
- request and paper identifiers;
- record/history/favorite data handling;
- generic records page behavior;
- module access control;
- the route-level selection of an exam implementation.

The records page continues displaying the persisted `exam_type` and `level`, and filtering by the route scope.

### TELC pieces

The current concrete exam experience is explicitly renamed and colocated:

```text
frontend/src/pages/mockExam/telc/
├── TelcMockExamPage.jsx
├── TelcMockExamPage.css
├── TelcMockExamAnswerSheet.jsx
└── telcMockExamRules.js
```

TELC-specific constants and behavior include:

- reading, language-module, listening, and writing part definitions;
- phase order and phase labels;
- reading/listening/writing timers and collection pause;
- audio sequence and replay rules;
- answer-sheet grouping and option display;
- writing self-assessment dimensions;
- TELC result display and score thresholds.

TELC-specific component names use `TelcMockExam...`; CSS selectors use `telc-mock-exam-*`. Generic API functions, paper records, and share concepts keep generic names.

A thin route component validates the `examType` URL parameter and selects the TELC page. It must reject unsupported families rather than rendering TELC under a different exam name.

## Navigation and Local State

Every repository-owned mock-exam navigation target includes the normalized lowercase exam family and level:

```text
/modules/exam-preparation/{examTypeLower}/{levelLower}/mock-exam
/modules/exam-preparation/{examTypeLower}/{levelLower}/mock-exams
```

This includes:

- level-page start and continue actions;
- interrupted-exam cards;
- records-page view, continue, and retake actions;
- navigator records link;
- internal new-exam navigation;
- module-access path matching.

Local/session storage keys remain scoped by exam family, level, and user. Existing key contents and resume semantics do not change.

## API and Data Flow

```text
TELC B1/B2 entry
  -> canonical TELC URL
  -> generic route dispatcher
  -> TelcMockExamPage
  -> generic API request with exam_type=TELC and level=B1|B2
  -> backend registry resolves TELC rules
  -> TELC rules select every part from the same scope
  -> generic service persists MockExamPaper and SavedMockExam
  -> generic history, retake, favorite, and sharing flows
```

Retrieving an existing attempt uses the persisted paper scope as the authority. Records-page links are built from that persisted scope, preventing B1/B2 or future exam-family cross-navigation.

## Compatibility and Safety

- Old frontend mock-exam URLs are intentionally unsupported.
- Existing generic backend API URLs remain unchanged.
- Existing API response fields remain unchanged.
- Existing database rows remain unchanged.
- Existing TELC B1/B2 public behavior remains unchanged.
- No listening or speaking media URL is rewritten as part of this work.
- No import contract or media synchronization script is modified unless a test proves an accidental dependency; any such dependency requires separate user approval.

## Testing Strategy

### Characterization before movement

Before moving TELC logic, preserve current behavior with tests covering:

- B1 and B2 part keys and response shape;
- durations and initial phase/deadline semantics;
- exact TELC scoring and pass threshold;
- listening play sequence and phase transitions;
- writing self-assessment scoring;
- idempotent creation per `(user, exam_type, level, request_id)`;
- history, favorites, retake, and sharing;
- mixed-scope question rejection.

### Route and naming tests

- Canonical TELC B1/B2 exam and records routes render the same pages as before.
- Every internal mock-exam link uses the canonical URL.
- Old URLs are not registered and resolve through the existing invalid-route behavior.
- Unsupported exam-family URLs do not render the TELC exam.
- Navigation and module-access recognition work for canonical routes.

### Regression verification

- Full `apps.exam_preparation` backend suite.
- Exam-preparation import tests.
- Full frontend test suite.
- Frontend production build.
- Django system and migration consistency checks.
- Existing speaking dual-COS script tests, as a guard that the refactor did not touch media behavior.
- No browser verification unless explicitly requested.

## Acceptance Criteria

1. Current TELC B1/B2 users observe no change other than the browser URL.
2. Canonical mock-exam URLs include `telc` and old URLs are absent.
3. Generic lifecycle code contains no TELC timing, part, or scoring constants.
4. Concrete TELC frontend code and selectors carry an explicit TELC identity.
5. Every paper and selected exercise is confined to one `(exam_type, level)` scope.
6. Existing papers, attempts, favorites, retakes, and shares remain functional.
7. No media URL, filename, directory, or COS key changes.
8. All specified regression checks pass.
