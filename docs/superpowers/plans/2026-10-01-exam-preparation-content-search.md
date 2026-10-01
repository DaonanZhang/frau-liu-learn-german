# Exam Preparation Content Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a telephone-`110`-only search tool that finds case-insensitive, all-term matches across every business-content field in the exam-preparation question bank and links each result to its existing exercise page.

**Architecture:** A dedicated Django service projects each supported exercise family into a normalized in-memory search document, then filters and paginates those documents through a protected read-only API. A focused React component on the existing exam-preparation landing page owns filters, request state, result excerpts, and responsive layout; the landing page only decides whether the component is visible.

**Tech Stack:** Django 5 / Django REST Framework, PostgreSQL in production and SQLite test settings, React 19, React Router, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-01-exam-preparation-content-search-design.md`

## Global Constraints

- Only an authenticated user whose `telephone` is exactly `"110"` may call the endpoint; staff or superuser status is insufficient.
- Search only exam-preparation business content; never search or return user data, technical identifiers, timestamps, media URLs, imported filenames, or creation metadata.
- Split the trimmed query on whitespace, ignore Unicode case, and require every term to occur somewhere in the same exercise.
- Support optional skill and compatible Teil filtering; Schreiben has no Teil filter.
- Return 20 exercises per page and route every result to an existing exercise detail page.
- Do not add a database model, migration, dependency, compatibility alias, or unrelated refactor.
- Preserve the user's existing unrelated working-tree changes.
- Keep desktop, tablet, and mobile layouts usable without horizontal overflow.
- Do not open a browser unless the user explicitly requests browser verification.

## Review Focus

- A query containing repeated or irregular whitespace must normalize to meaningful terms and must not create empty-term matches; pin this in Task 1 service tests.
- A result with one term in the title and another in a nested answer or speaking JSON value must satisfy all-term matching; pin this in Task 1 service tests.
- An authenticated staff/superuser account whose telephone is not `110` must receive `403`; pin this in Task 2 API tests.
- `teil` without a skill, an unsupported Teil, and a Teil supplied for Schreiben must each return `400`; pin this in Task 2 API tests.
- Search excerpts containing regex punctuation or HTML-like text must render as text and highlight safely; pin this in Task 3 component tests.

---

### Task 1: Question-bank content projection and matching service

**Files:**
- Create: `apps/exam_preparation/content_search.py`
- Create: `apps/exam_preparation/test_content_search.py`

**Interfaces:**
- Produces: `SearchQuery(query: str, terms: tuple[str, ...], skill: str | None, teil: int | None)`.
- Produces: `parse_search_query(*, query: str, skill: str | None = None, teil: str | int | None = None) -> SearchQuery`; raises Django `ValidationError` for invalid values.
- Produces: `search_exam_preparation_content(search_query: SearchQuery) -> list[dict[str, object]]`; results are ordered by `ExerciseBase`'s existing ordering and contain `exercise_base_id`, `title`, `skill`, `skill_label`, `teil`, `exercise_type`, `href`, `match_count`, and `matches` (`label`, `excerpt`).

Accepted filter and route mapping:

- `listening`: Teil 1 `/modules/exam-preparation/hoeren/short-text-prep/{id}`, Teil 2 `short-text-once/{id}`, Teil 3 `dialog-twice/{id}`;
- `reading`: Teil 1 `/modules/exam-preparation/lesen/title-matching/{id}`, Teil 2 `understanding/{id}`, Teil 3 `ad-matching/{id}`;
- `sprachbausteine`: Teil 1 `/modules/exam-preparation/sprachbausteine/cloze-choice/{id}`, Teil 2 `cloze-matching/{id}`;
- `writing`: `/modules/exam-preparation/schreiben/{id}` with no Teil;
- `speaking`: Teil 1–3 `/modules/exam-preparation/sprechen/teil-{teil}/{id}`.

- [ ] **Step 1: Write failing service tests for normalized all-term matching and explicit scope**

Create fixtures spanning title/base metadata, listening script/questions/options/answers/explanations, all three reading families, both Sprachbausteine families, writing examples, and recursively nested speaking JSON. Assert case-insensitive matching, terms split across fields, stable grouping by exercise, meaningful labels/excerpts, excluded external IDs/media/import filenames/user state, irregular whitespace, and safe handling of punctuation.

- [ ] **Step 2: Run the service tests and verify RED**

Run: `.venv/bin/python manage.py test apps.exam_preparation.test_content_search.ContentSearchServiceTests --settings=config.settings_sqlite_test -v 2`

Expected: FAIL because `apps.exam_preparation.content_search` does not exist.

- [ ] **Step 3: Implement the minimal explicit projection and matching service**

In `content_search.py`, define the interfaces above, the supported skill/Teil-to-`ExerciseType` mapping, existing-detail-route mapping, recursive JSON string flattening, stable field labels, excerpts of at most 240 characters centered around the first matched term, and prefetched retrieval for every current exercise family. Mark correct-option text with a correct-answer label while retaining ordinary option content. Use `str.casefold()` for matching and do not inspect models outside the explicit question-bank projection. Return every matched field entry; display folding belongs to the frontend.

- [ ] **Step 4: Run the service tests and verify GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the service slice**

```bash
git add apps/exam_preparation/content_search.py apps/exam_preparation/test_content_search.py
git commit -m "feat: add exam content search service"
```

### Task 2: Protected read-only search API

**Files:**
- Create: `apps/exam_preparation/views_content_search.py`
- Modify: `apps/exam_preparation/urls.py`
- Modify: `apps/exam_preparation/test_content_search.py`

**Interfaces:**
- Consumes: `parse_search_query(...)` and `search_exam_preparation_content(...)` from Task 1.
- Produces: `IsExamContentSearchUser.has_permission(request, view) -> bool`, allowing only exact telephone `110`.
- Produces: `ExamPreparationContentSearchAPIView.get(request) -> Response` at route name `exam-prep-content-search` and URL `/api/exam_preparation/content-search/`.
- Response shape: `{count, page, page_size, total_pages, results}` with `page_size` fixed at `20`.

- [ ] **Step 1: Write failing API authorization, validation, filtering, route, and pagination tests**

Test anonymous `401`; telephone `110` success without relying on staff flags or entitlements; ordinary and non-110 superuser `403`; blank/over-200 query `400`; invalid skill/Teil combinations `400`; module and Teil narrowing; 21 matches across two pages; and valid detail `href` values for all exercise types.

- [ ] **Step 2: Run the API tests and verify RED**

Run: `.venv/bin/python manage.py test apps.exam_preparation.test_content_search.ContentSearchApiTests --settings=config.settings_sqlite_test -v 2`

Expected: FAIL because the named URL and view do not exist.

- [ ] **Step 3: Implement the protected API and URL**

Use DRF `APIView` with `IsAuthenticated` followed by `IsExamContentSearchUser`. Parse only `q`, `skill`, `teil`, and `page`; convert service validation errors into a structured `400`; paginate the already-grouped exercise results with Django `Paginator`; return the fixed response shape; and register a literal `path("content-search/", ...)` before the router include.

- [ ] **Step 4: Run all content-search backend tests and verify GREEN**

Run: `.venv/bin/python manage.py test apps.exam_preparation.test_content_search --settings=config.settings_sqlite_test -v 2`

Expected: PASS.

- [ ] **Step 5: Commit the API slice**

```bash
git add apps/exam_preparation/views_content_search.py apps/exam_preparation/urls.py apps/exam_preparation/test_content_search.py
git commit -m "feat: expose protected exam content search api"
```

### Task 3: Search API client and responsive result component

**Files:**
- Create: `frontend/src/api/exam_preparation/contentSearch.js`
- Create: `frontend/src/api/exam_preparation/contentSearch.test.js`
- Create: `frontend/src/components/examPreparation/ExamPreparationContentSearch.jsx`
- Create: `frontend/src/components/examPreparation/ExamPreparationContentSearch.css`
- Create: `frontend/src/components/examPreparation/ExamPreparationContentSearch.test.jsx`

**Interfaces:**
- Produces: `fetchExamPreparationContentSearch({ query, skill = "", teil = "", page = 1 }) -> Promise<SearchResponse>`.
- Produces: default React component `ExamPreparationContentSearch`, with no props, which renders the complete search form and result state.
- Consumes backend fields from Task 2 without duplicating route construction.

- [ ] **Step 1: Write failing client and component tests**

Assert encoded request parameters and omission of empty filters. In component tests, mock only the API boundary and cover button/Enter submission, no request for blank input, skill-specific Teil choices, Schreiben hiding Teil, new-search page reset, loading, results, safe keyword highlighting (including `C++`, `a.b`, and `<script>` text), empty/error states, pagination, showing the first five matches with an `展开其余 N 条` action, and backend-provided `href` links.

- [ ] **Step 2: Run the focused frontend tests and verify RED**

Run from `frontend/`: `npm test -- src/api/exam_preparation/contentSearch.test.js src/components/examPreparation/ExamPreparationContentSearch.test.jsx`

Expected: FAIL because the client and component do not exist.

- [ ] **Step 3: Implement the minimal client and component**

Use a semantic `<form>` so Enter submits. Keep draft inputs separate from submitted search state; reset page only on a new form submission. Render highlights by splitting text into React text/`<mark>` nodes with an escaped regular expression, never `dangerouslySetInnerHTML`. Use short functional Chinese UI copy and accessible labels. Keep the result link exactly as supplied by the backend.

- [ ] **Step 4: Add responsive component styles**

Use a wrapping desktop control row; at tablet/mobile widths stack controls as needed, keep fields at `width: 100%`, preserve at least practical touch-target height, and prevent long excerpts from forcing horizontal overflow.

- [ ] **Step 5: Run the focused frontend tests and verify GREEN**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit the component slice**

```bash
git add frontend/src/api/exam_preparation/contentSearch.js frontend/src/api/exam_preparation/contentSearch.test.js frontend/src/components/examPreparation/ExamPreparationContentSearch.jsx frontend/src/components/examPreparation/ExamPreparationContentSearch.css frontend/src/components/examPreparation/ExamPreparationContentSearch.test.jsx
git commit -m "feat: build exam content search interface"
```

### Task 4: Telephone-110-only landing-page integration

**Files:**
- Modify: `frontend/src/pages/ExamPreparationModulePage.jsx`
- Modify: `frontend/src/pages/ExamPreparationModulePage.test.jsx`

**Interfaces:**
- Consumes: `ExamPreparationContentSearch` from Task 3 and existing `useAuth()` user data.
- Produces: a search section after the hero only when `String(user?.telephone || "").trim() === "110"`.

- [ ] **Step 1: Write failing page visibility tests**

Extend the existing `entitledUser` helper with an optional telephone. Assert the search heading is present for `110` and absent for another telephone, including a non-110 staff/superuser-shaped user. Keep existing mock-exam assertions unchanged.

- [ ] **Step 2: Run the page test and verify RED**

Run from `frontend/`: `npm test -- src/pages/ExamPreparationModulePage.test.jsx`

Expected: FAIL because the page does not render the search component.

- [ ] **Step 3: Add the minimal conditional integration**

Import the component and render it immediately after the hero only for the exact telephone match. Do not grant visibility based on release access, entitlement, staff, or superuser flags.

- [ ] **Step 4: Run the page and component tests and verify GREEN**

Run from `frontend/`: `npm test -- src/pages/ExamPreparationModulePage.test.jsx src/components/examPreparation/ExamPreparationContentSearch.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit the integration slice**

```bash
git add frontend/src/pages/ExamPreparationModulePage.jsx frontend/src/pages/ExamPreparationModulePage.test.jsx
git commit -m "feat: show exam search only to user 110"
```

### Task 5: Full verification and surgical-change audit

**Files:**
- Verify only; modify feature files only if a test exposes a defect.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified feature with no unrelated files staged or committed.

- [ ] **Step 1: Run the complete backend test suite**

Run: `.venv/bin/python manage.py test --settings=config.settings_sqlite_test`

Expected: PASS. If pre-existing failures occur, record their exact names and confirm they reproduce without feature changes before proceeding.

- [ ] **Step 2: Run the complete frontend test suite**

Run from `frontend/`: `npm test`

Expected: PASS, including the user's pre-existing modified tests.

- [ ] **Step 3: Run frontend lint and production build**

Run from `frontend/`: `npm run lint`

Run from `frontend/`: `npm run build`

Expected: both commands succeed without new warnings or errors attributable to the feature.

- [ ] **Step 4: Audit the final diff and working tree**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; unrelated pre-existing changes remain unmodified and uncommitted.

- [ ] **Step 5: Commit only any verification-driven feature fixes**

Stage explicit feature paths only and use commit message `fix: harden exam content search` if fixes were necessary. Do not stage the user's unrelated files.
