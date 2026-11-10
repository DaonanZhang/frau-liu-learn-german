# C1 Sprechen Teil 1B Complete Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Return and render C1 Teil 1B topic, outline, first TN1 presentation, and all subsequent dialogue turns in vertical order.

**Architecture:** Compose the paired Teil 1A data only in the C1 Teil 1B retrieve serializer, preserving the normalized database split. Render the composed fields with the existing C1 controls and normalize legacy `<br>` markers as plain-text newlines.

**Tech Stack:** Django REST Framework, React, Vitest, Django APITestCase

**Spec:** `docs/superpowers/specs/2026-11-10-c1-speaking-teil1b-complete-content-design.md`

## Global Constraints

- No database migration or data mutation.
- No importer, storage-path, dependency, browser, or commit changes.
- Preserve unrelated concurrent changes in shared files.
- Keep non-C1, list-response, tablet, and mobile behavior unchanged.

## Dependency Table

| task_id | depends_on | produces | consumes | write_scope | shared_state | status | owner | blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | none | composed Teil 1B detail API and API tests | paired existing exercises | serializer + API test | read-only DB query | ready | unassigned | none |
| T2 | T1 | vertical topic/outline/full dialogue UI and tests | composed API contract | speaking page JSX/CSS/test | React render state | blocked | unassigned | T1 contract |
| T3 | T1 | stable turn/recording identity and favorite-list resolution | composed dialogue | serializer/view/API tests | user speaking state | ready | unassigned | none |
| T4 | T3 | frontend consumption of stable state and recorder identity | stable identity fields | speaking page JSX/test | favorites + IndexedDB keys | blocked | unassigned | T3 contract |

## Review Focus

- The first TN1 turn must use its Teil 1A audio URL while later turns use Teil 1B audio URLs.
- Merged sequences must be unique and consecutive.
- Missing companion data must not crash an otherwise valid detail response.
- `<br>`, `<br/>`, and `<br />` must render as newlines without `dangerouslySetInnerHTML`.
- B1/B2 and C1 Teil 1A/Teil 2 must retain their current API and page behavior.

---

### Task 1: Compose paired Teil 1B detail content

**Files:**
- Modify: `apps/exam_preparation/serializers.py`
- Test: `apps/exam_preparation/test_speaking_audio_api.py`

- [ ] Add a failing API test with paired C1 TELC exercises asserting inherited topic/outline, complete ordered roles/text, consecutive sequences, and source-correct audio URLs.
- [ ] Run `.venv/bin/pytest apps/exam_preparation/test_speaking_audio_api.py -q` and confirm RED.
- [ ] Implement retrieve-only paired composition in `SpeakingTeilExerciseSerializer`; do not mutate model content.
- [ ] Re-run the API test and confirm GREEN.

### Task 2: Render vertical Vortrag content and complete dialogue

**Files:**
- Modify: `frontend/src/pages/SpeakingTeilExercisePage.jsx`
- Modify: `frontend/src/pages/SpeakingTeilExercisePage.css`
- Test: `frontend/src/pages/SpeakingTeilExercisePage.test.jsx`

- [ ] Add a failing C1 Teil 1B test asserting order: topic then outline then complete TN1/TN2/TN1 dialogue; assert outline control and legacy `<br>` newline display.
- [ ] Run `npm test -- --run src/pages/SpeakingTeilExercisePage.test.jsx` and confirm RED.
- [ ] Render `content.topic` and reuse the outline block for C1 Teil 1A/1B; normalize break tags to text newlines in dialogue content.
- [ ] Re-run the focused frontend test, then `npm run build`.
- [ ] Run `git diff --check` on all changed task files.

### Task 3: Preserve source identity through composition

**Files:**
- Modify: `apps/exam_preparation/serializers.py`
- Modify: `apps/exam_preparation/views.py`
- Test: `apps/exam_preparation/test_speaking_audio_api.py`
- Test: `apps/exam_preparation/tests.py`

- [ ] Add failing tests for stable `turn_key` and source identity fields on composed dialogue.
- [ ] Add a failing favorite-list test proving a companion TN1 favorite resolves to its real text and role.
- [ ] Return stable identity fields while keeping display sequences consecutive; preserve existing current-turn keys.
- [ ] Resolve only validated same-scope companion keys in the favorite list.
- [ ] Run focused Django test modules under SQLite settings.

### Task 4: Use stable identities for state and local recordings

**Files:**
- Modify: `frontend/src/pages/SpeakingTeilExercisePage.jsx`
- Test: `frontend/src/pages/SpeakingTeilExercisePage.test.jsx`

- [ ] Add failing tests that favorite calls use companion/current stable keys and recorder IDs use each source exercise/Teil/sequence.
- [ ] Make `turnKey` prefer API `turn_key`; make C1 recorder IDs prefer source fields while retaining the legacy format.
- [ ] Run focused frontend tests, production build, and diff check.
