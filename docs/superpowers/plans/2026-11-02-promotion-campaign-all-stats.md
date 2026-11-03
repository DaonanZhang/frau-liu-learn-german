# Promotion Campaign All Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an “全部统计” mode to the telephone `110` superuser campaign report, returning and displaying one merged report card per `organization_name` for the selected month or all time.

**Architecture:** Extend the existing report endpoint with an `all_campaigns=true` query mode. The backend aggregates redemptions and paid orders by exact `organization_name`, returns each organization’s participating `campaign_names` and existing report fields, and the frontend reuses one report-card renderer for single and multi-report responses.

**Tech Stack:** Django, Django REST Framework, React 19, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-promotion-campaign-all-stats-design.md`

## Global Constraints

- Preserve the existing permission rule: only a superuser whose telephone is exactly `110` may use the report endpoints.
- Preserve the existing single-campaign query response and user-visible report fields.
- Group all-mode results by exact non-empty `organization_name`; merge campaign variants only within that organization.
- Include an organization only when the selected period contains at least one `UserCoupon` redemption or one applied `PaymentDiscountApplication` purchase.
- Return each group’s participating campaign names as a distinct, deterministic list; the frontend displays them joined by ` / `.
- Do not add a cross-organization grand-total card, dependency, migration, Git commit, or push.
- Keep styling desktop-first; narrow screens only need to remain readable, non-overflowing, and operable.

## Review Focus

- An organization with redemption-only activity must appear with zero purchase totals; Task 1 tests this.
- An organization with purchase-only activity must appear even if no matching `UserCoupon` exists in the period; Task 1 tests this.
- Two campaign names under one organization must produce one result without duplicate counts, while the same campaign text under different organizations must stay separate; Task 1 tests this.
- Month boundaries must use the existing current-timezone `[month start, next month start)` rule, and `all` must remain unbounded; Task 1 tests both modes.
- Checking and unchecking “全部统计” must clear/disable and restore the campaign input without breaking single-campaign or all-time queries; Task 2 tests these transitions.

## File Responsibilities

- `apps/accounts/services/promotion_codes.py`: calculate all-mode grouped reports and preserve the existing single-report service.
- `apps/accounts/serializers/user.py`: validate the mutually exclusive single/all query shapes.
- `apps/accounts/views/user.py`: select the report mode and serialize the grouped response.
- `apps/accounts/test_profile_promotion_codes.py`: API grouping, period, visibility, and backward-compatibility coverage.
- `frontend/src/api/auth/profile.js`: encode the single/all request parameters.
- `frontend/src/pages/profile/PromotionCampaignReportCard.jsx`: manage mode state and render reusable single/multiple report cards.
- `frontend/src/pages/profile/PromotionCampaignReportCard.test.jsx`: interaction, request-shape, grouping-title, card, empty, and regression coverage.
- `frontend/src/pages/ProfilePage.css`: minimal desktop-first controls and stacked group-card styling.

## Dependency and Dispatch Table

| task_id | depends_on | produces | consumes | write_scope | shared_state | status | owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | — | stable grouped API contract | existing promotion models/report service | backend service, serializer, view, backend tests | read-only report queries | ready | Subagent |
| T2 | — | all-mode UI against the stable contract below | defined API response shape | frontend API, component, CSS, frontend tests | component state only | ready | Subagent |
| T3 | T1,T2 | integrated verification evidence | completed backend and frontend | no product-code writes unless correcting an acceptance failure | test environment | blocked | Superagent |

T1 and T2 have stable interfaces and disjoint write scopes, so they may run in parallel after separate Jev preflights. The Superagent reviews both diffs and performs T3.

---

### Task 1: Add the grouped backend report mode

**Files:**
- Modify: `apps/accounts/services/promotion_codes.py`
- Modify: `apps/accounts/serializers/user.py`
- Modify: `apps/accounts/views/user.py`
- Test: `apps/accounts/test_profile_promotion_codes.py`

**Interfaces:**
- Consumes: `month_text: str`, using `YYYY-MM` or `all` exactly as the existing service does.
- Produces: `get_all_promotion_campaign_reports(*, month_text: str) -> dict[str, object]`.
- Produces API query: `GET /api/accounts/users/promotion-campaign-report/?month=<YYYY-MM|all>&all_campaigns=true` with no `campaign_name`.
- Produces API response: `{ "month": str, "all_campaigns": true, "reports": [{ "organization_name": str, "campaign_names": list[str], "coupon_redemptions": int, "redeeming_users": int, "paid_orders": int, "paying_users": int, "original_amount": str, "promotion_discount": str, "final_amount": str, "redemptions": list, "purchases": list }] }`.
- Preserves: the current single-mode query and response when `all_campaigns` is absent or false.

- [ ] **Step 1: Write failing API tests**
  Add tests for: required `campaign_name` only in single mode; all-mode permission; two campaign variants merging under one organization; campaign names sorted and distinct; redemption-only and purchase-only groups; identical campaign text under different organizations remaining separate; zero-activity organizations omitted; month exclusion and `month=all`; exact totals, unique users, purchase details, and stable organization ordering.
- [ ] **Step 2: Run the targeted backend tests and confirm the new assertions fail**
  Run: `uv run python manage.py test apps.accounts.test_profile_promotion_codes.PromotionCampaignReportApiTests -v 2`
  Expected: new all-mode assertions fail before implementation. If database creation is unavailable, record the exact environment failure and continue with static checks; do not weaken tests.
- [ ] **Step 3: Implement the minimal grouped service**
  Add the signature above. Reuse one month-boundary helper instead of duplicating date parsing; aggregate redemptions and applied purchases by exact `organization_name`, collect participating campaign names from in-period rows, attach ordered details, exclude empty organization names and zero-activity groups, and return deterministic ordering without issuing one query per organization.
- [ ] **Step 4: Validate the mutually exclusive query shapes and serialize the response**
  Add optional `all_campaigns` and conditionally required `campaign_name` to `PromotionCampaignReportQuerySerializer`; branch in `promotion_campaign_report` while preserving permission and the existing response exactly.
- [ ] **Step 5: Run backend regression checks**
  Run: `uv run python manage.py test apps.accounts.test_profile_promotion_codes apps.accounts.tests_promotion_campaign_report_source_filter -v 2`
  Expected: PASS, or only the previously recorded database-environment blocker.

### Task 2: Add the all-mode control and grouped cards

**Files:**
- Modify: `frontend/src/api/auth/profile.js`
- Modify: `frontend/src/pages/profile/PromotionCampaignReportCard.jsx`
- Modify: `frontend/src/pages/profile/PromotionCampaignReportCard.test.jsx`
- Modify: `frontend/src/pages/ProfilePage.css`

**Interfaces:**
- Consumes: Task 1’s all-mode query and response shape exactly as declared above.
- Produces: `fetchPromotionCampaignReport({ campaignName = "", month, allCampaigns = false })`.
- Produces: a checkbox with accessible name `全部统计`; checked mode clears and disables the `合作博主` combobox and sends `{ campaignName: "", month, allCampaigns: true }`.
- Preserves: existing single-mode calls with `allCampaigns: false` and existing report content.

- [ ] **Step 1: Write failing component tests**
  Add tests that the checkbox is initially unchecked; checking clears/disables the combobox; unchecking restores it; all mode submits the declared request for a month and for all time; multiple backend reports render as separate cards; each heading joins `campaign_names` with ` / `; redemption-only cards render with an empty purchase section; an empty `reports` array shows `暂无兑换或购买记录`; single-mode tests remain valid.
- [ ] **Step 2: Run the focused frontend test and confirm failure**
  Run: `cd frontend && npm test -- src/pages/profile/PromotionCampaignReportCard.test.jsx`
  Expected: new all-mode assertions fail before implementation.
- [ ] **Step 3: Extend the request helper and component state**
  Send `all_campaigns=true` only for all mode; omit `campaign_name` in that mode. Add the checkbox beside the campaign control, enforce the mutual exclusion in component state and native disabled/required attributes, and keep existing month/all-time behavior.
- [ ] **Step 4: Extract one local report-content renderer and render single or grouped results**
  Reuse the existing summary and purchase table markup. In all mode, render one bordered group card per report with a heading derived from `campaign_names.join(" / ")`; do not add a grand-total card.
- [ ] **Step 5: Add only the CSS needed for the new checkbox row and stacked cards**
  Match existing Profile styles; keep the current narrow-screen table behavior and prevent title/control overflow without a separate mobile redesign.
- [ ] **Step 6: Run frontend regression checks**
  Run: `cd frontend && npm test -- src/pages/profile/PromotionCampaignReportCard.test.jsx src/pages/ProfilePage.test.jsx`
  Expected: PASS.

### Task 3: Superagent integration review and verification

**Files:**
- Inspect all files changed by T1 and T2 plus the design and plan.

**Interfaces:**
- Consumes: T1 and T2 deliverables.
- Produces: acceptance evidence and any narrowly scoped correction feedback.

- [ ] Review the real diff for scope, API consistency, query count shape, exact organization grouping, deterministic ordering, and preservation of single mode.
- [ ] Run the focused backend and frontend commands from T1/T2 plus `cd frontend && npm run build`.
- [ ] Check every design acceptance criterion against code and test evidence; return failures to the owning Subagent, with at most two correction rounds, before direct takeover.
