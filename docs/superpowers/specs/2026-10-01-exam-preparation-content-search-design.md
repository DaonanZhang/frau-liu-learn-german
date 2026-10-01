# Exam Preparation Content Search Design

## Purpose

Add an internal content-search tool to the exam-preparation landing page for the account whose telephone is exactly `110`. The tool lets that account locate text anywhere in the exam-preparation question bank, optionally narrowed by skill module and Teil, without exposing user data or technical storage metadata.

## Scope

The feature searches question-bank business content only:

- shared exercise metadata: title, exam type, difficulty, source name, and source reference;
- instructions, source articles, listening scripts, prompts, and task text;
- questions, matching items, blanks, advertisements, and answer options;
- correct-answer text and explanations;
- writing requests, example labels, example text, and notes;
- speaking instructions and every textual value nested in speaking JSON content.

The feature does not search:

- users, user answers, exercise state, favorites, or saved mock examinations;
- database primary keys or external exercise identifiers;
- timestamps, media URLs, imported filenames, or creation-method metadata.

The feature is read-only. It does not add a search-index model or alter existing exam-preparation records.

## Authorization

The frontend renders the search interface only when the authenticated user's `telephone` is exactly `"110"`.

The backend independently enforces the same exact telephone check on the search endpoint. An unauthenticated request receives `401`; any authenticated account with another telephone receives `403`. Staff or superuser status alone does not grant access.

## API

Add a read-only endpoint at:

`GET /api/exam_preparation/content-search/`

Supported query parameters:

- `q`: required, trimmed search text, maximum 200 characters;
- `skill`: optional skill key for Hören, Lesen, Sprachbausteine, Schreiben, or Sprechen;
- `teil`: optional positive Teil number valid for the selected skill;
- `page`: optional positive page number.

The endpoint returns `400` for a missing or blank `q`, an overlong query, an unknown skill, a Teil without a compatible skill, or an unsupported Teil value.

Responses use 20 exercises per page and include the total count, current page, total pages, and normalized result entries. Each result entry contains:

- the owning exercise identity needed by the frontend;
- display labels for skill, Teil, exercise type, and title;
- the existing frontend detail-page URL;
- total matching field count;
- matching field descriptors and contextual excerpts.

## Search Semantics

The backend trims the query and splits it on whitespace. Matching is Unicode case-insensitive. Every term must occur somewhere in the same exercise, but terms may occur in different business fields. Term order and adjacency do not matter.

For example, `Berlin Wohnung` matches an exercise when `Berlin` occurs in its source text and `Wohnung` occurs in one of its questions or answers.

Filtering happens before content matching:

- no skill and no Teil searches the complete exam-preparation question bank;
- a skill searches every exercise belonging to that skill;
- a compatible Teil narrows the selected skill to its corresponding exercise type;
- Schreiben has no Teil selector in the current data model.

Search results are grouped by owning `ExerciseBase`; an exercise appears once even when multiple related records match. Match details preserve useful location labels such as title, listening script, question number, answer option, correct answer, or explanation. Very numerous excerpts may be collapsed for display, but the response still reports the total matching field count.

## Content Projection

Implement a dedicated backend search service that converts each supported exercise and its prefetched related records into a normalized search document. A document has:

- exercise metadata and route information;
- a stable ordered list of labeled textual fields;
- enough source context to produce excerpts without exposing excluded metadata.

The service explicitly handles all current exercise families:

- listening Teil 1–3;
- reading Teil 1–3;
- Sprachbausteine Teil 1–2;
- writing;
- speaking Teil 1–3, including recursively flattened JSON strings.

The explicit projection is the single definition of searchable content. New question-bank models or business fields are not automatically searched; they must be intentionally added with tests so technical fields cannot leak into results.

## Frontend Interaction

Place a self-contained “题库搜索” section on the exam-preparation landing page after the introductory hero and before the normal module content. It contains:

- a keyword input;
- a module selector with “全部” plus the five skills;
- a Teil selector shown only when the selected skill supports Teil filtering;
- a `搜索` button.

Pressing Enter or clicking `搜索` runs the request. Typing and filter changes do not search automatically. A new search resets pagination to page 1.

Results remain within the landing-page search section. Each result card shows the skill and Teil, exercise title or a clear exercise-type fallback, labeled match excerpts with safe keyword highlighting, and an `打开题目` link to the existing exercise detail page. The component also provides concise loading, empty, error, and pagination states.

The layout keeps controls in a row where space allows and wraps or stacks them on tablet and mobile widths. Inputs and buttons remain usable without horizontal overflow.

## Routing

Every exercise type maps to its existing detail route. No new exercise-detail page is created. The backend owns this mapping so every search response carries a valid `href`; the frontend only renders that link.

## Error Handling

- Invalid parameters return a structured `400` response.
- Unauthorized accounts receive no search content.
- A frontend request failure leaves the rest of the exam-preparation page usable and displays a short retry-oriented message inside the search section.
- A query with no matches displays a neutral empty state.

## Verification

Backend tests must cover:

- exact telephone authorization for `110`, another authenticated account, and anonymous access;
- case-insensitive matching;
- multiple terms found across different fields of one exercise;
- all supported module and Teil filters, including invalid combinations;
- title, question, option, correct-answer, explanation, listening script, writing example, and nested speaking JSON content;
- exclusion of user data and technical metadata;
- grouping, pagination, excerpts, and route mapping.

Frontend tests must cover:

- visibility for telephone `110` and absence for another user;
- request construction, Enter/button submission, and page reset on a new search;
- conditional Teil choices;
- loading, results, empty, error, and pagination states;
- highlighted excerpts and existing-detail-page links;
- a narrow viewport layout assertion where practical without browser automation.

Per the project rule, implementation verification uses automated backend and frontend tests. Browser-based verification is not performed unless the user explicitly requests it.
