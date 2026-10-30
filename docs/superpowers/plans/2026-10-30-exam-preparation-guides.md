# Exam Preparation Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render level-filtered guide cards and a complete guide detail experience with view counts, likes, Markdown content, and responsive styling.

**Architecture:** A small API module wraps the existing DRF guide endpoints. The existing tips page becomes the list page, a new detail page owns retrieval and like state, and a focused Markdown component renders stored article content safely.

**Tech Stack:** React 19, React Router, Vitest, Testing Library, react-markdown, remark-gfm, Django REST Framework.

**Spec:** `docs/superpowers/specs/2026-10-30-exam-preparation-guides-design.md`

## Global Constraints

- Preserve nginx-proxied `/resources/...` media URLs.
- Support desktop, iPad/tablet, and mobile layouts.
- Use restrained functional copy and neutral loading, empty, and error states.
- Do not open a browser for verification.

## Review Focus

- Paginated and unpaginated guide responses must both render.
- A level route must never show guides from another level.
- Missing optional cover, badges, or summary must not break the card.
- A failed like request must roll back the optimistic count and state.
- Reduced-motion users must not receive the celebration movement.

---

### Task 1: Guide API and level filtering

**Files:**
- Create: `frontend/src/api/exam_preparation/guides.js`
- Test: `frontend/src/api/exam_preparation/guides.test.js`

**Interfaces:**
- Produces: `fetchGuides()`, `fetchGuideDetail(id)`, `setGuideLiked(id, liked)`, `guideMatchesLevel(guide, level)`.

- [ ] Write failing tests for endpoint methods, list normalization, and B1/B2/C1 badge filtering.
- [ ] Run the API test and confirm the missing module failure.
- [ ] Implement the four exports using `apiFetch`.
- [ ] Run the API test and confirm it passes.

### Task 2: Responsive guide list cards

**Files:**
- Modify: `frontend/src/pages/ExamPreparationTipsPage.jsx`
- Create: `frontend/src/pages/ExamPreparationTipsPage.css`
- Test: `frontend/src/pages/ExamPreparationTipsPage.test.jsx`

**Interfaces:**
- Consumes: `fetchGuides()` and `guideMatchesLevel()`.
- Produces: level-filtered links to `/modules/exam-preparation/:level/tips/:guideId`.

- [ ] Write failing page tests for loading, filtering, complete card fields, empty state, and absent optional fields.
- [ ] Run the page test and confirm failure against the placeholder page.
- [ ] Implement vertical cards and responsive CSS using `/images/icon.jpeg`.
- [ ] Run the page test and confirm it passes.

### Task 3: Guide detail, Markdown, and like interaction

**Files:**
- Create: `frontend/src/components/examPreparation/GuideMarkdown.jsx`
- Create: `frontend/src/pages/ExamPreparationGuideDetailPage.jsx`
- Create: `frontend/src/pages/ExamPreparationGuideDetailPage.css`
- Test: `frontend/src/pages/ExamPreparationGuideDetailPage.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/AppRoutes.test.jsx`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes: `fetchGuideDetail(id)` and `setGuideLiked(id, liked)`.
- Produces: detail route and accessible `aria-pressed` like control.

- [ ] Write failing detail tests for content, Markdown table rendering, retrieve-triggered count, like animation, unlike without animation, and request rollback.
- [ ] Write a failing route test for the level-aware detail route and C1 gate.
- [ ] Install `react-markdown` and `remark-gfm`.
- [ ] Implement the Markdown component, detail page, route, optimistic like state, and animation CSS.
- [ ] Run detail and route tests and confirm they pass.

### Task 4: Integrated verification

**Files:**
- Verify all files above.

- [ ] Run targeted guide frontend tests.
- [ ] Run the frontend build.
- [ ] Run changed-file lint checks.
- [ ] Run the full frontend test suite and report any unrelated failures by name.
- [ ] Run Django guide and exam-preparation tests plus migration checks.
- [ ] Verify all 15 local guides have `author="Frau Liu"` and the detail API fields remain present.
