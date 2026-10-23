# Exam Preparation Referral Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first campaign-tagged exam-preparation referral system, including personal codes, checkout redemption, durable rewards/refund rollback, Profile progress UI, and user notices.

**Architecture:** Reuse `PromotionCodeRecord`, `UserCoupon`, `PaymentDiscountApplication`, `Entitlement`, and the existing Alipay grant/reconciliation pipeline. Add campaign-specific referral identity, participation, reward-ledger, and notice models; keep all state transitions in focused transactional services with idempotency keys and consistent user-first row locking. The frontend consumes structured outcomes from the unified redemption endpoint and a read-only campaign snapshot API.

**Tech Stack:** Django, Django REST Framework, Celery, Alipay reconciliation, React 19, React Router, SweetAlert2, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-exam-preparation-referral-design.md`

## Global Constraints

- Campaign identity is `exam_preparation_referral_v1`, display name is `备考季推广`, and reserved prefix is `BK1-`.
- Add `EXAM_PREPARATION_REFERRAL_ENABLED=False`; production must explicitly set it to `True` only after migration, prefix preflight, and backfill.
- Badge models and the `推广达人` badge are excluded.
- A referral qualifies only after the exact ¥5 referral coupon is used, Alipay payment is confirmed, and the purchased entitlement grant succeeds.
- Payment failure, cancellation, closure, and timeout never run refund rollback; partial refund preserves progress and rewards; only confirmed full refund reverses them.
- Every effective referral, including the sixth and later, grants 30 days; the 3/5 milestones are separate one-time Science/Vlog rewards or ¥10 substitutes.
- The 30-day rollback is capped at the end of the refund day in `ALIPAY_TIME_ZONE`, never creates debt, never extends access, and never shortens unrelated platform-wide or other-module access.
- Keep activation codes and ordinary operational promotion codes backward compatible; ordinary staff reports exclude referral and internal-reward records by default.
- No new dependency, no media/COS/import change, no browser verification, and no Git commit or push without explicit user authorization.
- All new frontend copy follows the repository's restrained product-writing rules and all layouts must work on desktop, iPad/tablet, and mobile with reduced-motion support.

## Review Focus

- An empty, unknown, malformed, or case-varied code must return a structured safe error without creating a coupon or participation; Task 3 pins this.
- A historical platform-wide or exam-preparation entitlement created just before order creation must make B ineligible, while the current order's own entitlement and later entitlements must not; Tasks 2 and 4 pin the cutoff.
- Duplicate callbacks, task retries, concurrent redemptions, concurrent Profile repair, and repeated refund reconciliation must remain exactly-once; Tasks 2, 4, 5, and 6 pin idempotency and locking.
- A full refund arriving while reward work or a milestone coupon payment is pending must choose the correct terminal or pending state without treating payment failure as refund; Task 6 pins all transition orderings.
- Disabled rollout, missing optional campaign data, API failure, and narrow-screen/reduced-motion rendering must degrade to a readable locked/retry state without breaking checkout or Profile; Tasks 7–9 pin these fallbacks.

## File Responsibilities

- `apps/accounts/models/referral.py`: referral code, participation, reward ledger, and privacy-safe event/notice persistence only.
- `apps/accounts/services/referral_campaign.py`: campaign constants, eligibility, code creation, backfill primitives, and Profile snapshot.
- `apps/accounts/services/referral_redemption.py`: referral-code redemption and replacement transaction.
- `apps/accounts/services/referral_qualification.py`: payment reservation, post-grant qualification, per-referral reward, and retry.
- `apps/accounts/services/referral_milestones.py`: 3/5 threshold issue, revoke, settle, and reissue behavior.
- `apps/accounts/services/referral_refunds.py`: full-refund-only reconciliation and 30-day debit.
- `apps/accounts/serializers/referral.py` and `apps/accounts/views/referral.py`: authenticated campaign snapshot and notice API.
- `frontend/src/components/CheckoutCodeRedemption.jsx`: reusable inline checkout code control.
- `frontend/src/components/ReferralCampaignPanel.jsx`: Profile battle-pass panel.
- `frontend/src/components/ReferralNoticeModal.jsx`: next-page acknowledgement flow.

## Dependency and Dispatch Table

| task_id | depends_on | produces | consumes | write_scope | shared_state | initial status/owner |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | — | schema and constraints | existing account models | referral/promotion models, migration, admin | database schema | ready / Subagent |
| T2 | T1 | eligibility, code creation, backfill | T1 models | campaign/code services, generators, reports, grant hooks | code namespace, user locks | blocked / Subagent |
| T3 | T2 | structured referral redemption | T2 services | redemption service/view/serializer | participation and coupons | blocked / Subagent |
| T4 | T3 | payment-to-qualified pipeline and +30 days | T3 participation/coupon chain | payment, grant, qualification, tasks | payments, entitlements | blocked / Subagent |
| T5 | T4 | 3/5 milestone engine | T4 qualified count/ledger | milestone service/tests | reward ledger | blocked / Subagent |
| T6 | T5 | full-refund rollback | T4/T5 rewards | refund service, Alipay lifecycle, tasks | refunds, entitlements, coupons | blocked / Subagent |
| T7 | T6 | snapshot/history/notice API | all backend state | serializer/view/URL/admin | read model, notice acknowledgement | blocked / Subagent |
| T8 | T3 | checkout redemption UI | T3 redemption contract | frontend checkout/redeem files | frontend coupon selection | blocked / Subagent |
| T9 | T7,T8 | Profile panel and global notice UI | T7 API and T8 API helper conventions | frontend Profile/layout components | frontend auth/page state | blocked / Subagent |
| T10 | T1–T9 | runbook and release evidence | complete feature | docs and verification only | none | blocked / Superagent |

After T3, T4 and T8 have disjoint write scopes and may run in parallel after separate Jev preflights. All other tasks stay serial. Before every task's first dispatch, the Superagent runs one Jev `preflight` with that task's complete scope and acceptance criteria, reports the resolved model, answers, provided probabilities/confidence, usage, and any unavailable fields, and dispatches only a `capable` result. The Superagent personally reviews the real diff and reruns risk-proportionate tests after every Subagent delivery.

---

### Task 1: Add referral persistence and source separation

**Files:**
- Create: `apps/accounts/models/referral.py`
- Create: `apps/accounts/migrations/0039_referral_campaign.py`
- Create/Test: `apps/accounts/tests_referral_models.py`
- Modify: `apps/accounts/models/promotion.py`
- Modify: `apps/accounts/models/__init__.py`
- Modify: `apps/accounts/admin.py`
- Modify: `config/settings.py`
- Modify: `apps/accounts/feature_flags.py`

**Interfaces:**
- Produces: `ReferralCode`, `ReferralParticipation`, `ReferralReward`, and `ReferralNotice` models; `ReferralNotice` distinguishes permanent history-only events from one-time global notices.
- Produces: `PromotionCodeRecord.SourceKind.OPERATIONAL|REFERRAL|INTERNAL_REWARD` and `UserCoupon.revoked_at/revocation_reason`.
- Produces: `exam_preparation_referral_enabled() -> bool`.
- Consumes: existing user, promotion, coupon, payment, and entitlement foreign keys.

- [ ] Add failing model tests for one `(user, campaign_tag)` code, one `(referred_user, campaign_tag)` participation, one-to-one code/promotion linkage, unique qualifying payment/idempotency keys, valid state choices, history-only versus global-notice events, coupon revocation audit, and migration default `source_kind=operational`.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_models -v 2`; expect failures because the schema does not exist.
- [ ] Implement the four focused models, indexes/check constraints, source-kind field, coupon revocation audit fields, admin registrations, disabled-by-default setting, and feature-flag accessor.
- [ ] Generate and inspect migration `0039`; ensure it only adds the agreed tables/fields and migrates existing promotion rows to `operational`.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_models apps.accounts.tests_promotion -v 2`; expect PASS.
- [ ] Run `.venv/bin/python manage.py makemigrations --check --dry-run`; expect `No changes detected`.

### Task 2: Implement eligibility, personal-code creation, and safe backfill

**Files:**
- Create: `apps/accounts/services/referral_campaign.py`
- Create: `apps/accounts/management/commands/backfill_exam_preparation_referral_codes.py`
- Create/Test: `apps/accounts/tests_referral_campaign.py`
- Modify: `apps/accounts/services/promotion_codes.py`
- Modify: `apps/accounts/services/activation_codes.py`
- Modify: `apps/accounts/security/activation.py`
- Modify: `apps/accounts/services/payment_grant_service.py`
- Modify: `apps/accounts/management/commands/generate_promotion_codes.py`
- Modify: `apps/accounts/management/commands/promotion_campaign_report.py`
- Modify: `apps/accounts/management/commands/promotion_organization_excel_report.py`
- Modify: `apps/accounts/views/user.py`

**Interfaces:**
- Produces: `CAMPAIGN_TAG`, `CAMPAIGN_NAME`, `CODE_PREFIX`, and immutable `ReferralCampaignConfig`.
- Produces: `has_historical_exam_preparation_access(*, user, before=None, exclude_external_ref="") -> bool`.
- Produces: `ensure_referral_code(*, user, campaign_tag=CAMPAIGN_TAG) -> ReferralCode`.
- Produces: `backfill_referral_codes(*, dry_run: bool) -> ReferralBackfillStats`.
- Consumes: T1 models/source kinds and existing activation-code lookup, including legacy Redis.

- [ ] Add failing tests covering expired/canceled/refunded-history eligibility, platform-wide coverage, exact `before` cutoff, current-order external-ref exclusion, no-history rejection, different campaigns, concurrent ensure calls, uppercase `BK1-` plus nine nonambiguous characters, no code expiry, and prefix collision against DB activation, legacy activation, and promotion records.
- [ ] Add failing tests that activation/payment grants call `ensure_referral_code` after a covering grant, ordinary code creation rejects reserved prefixes, internal/referral records cannot enter ordinary redemption, and staff history/reports default to operational rows only.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_campaign apps.accounts.test_profile_promotion_codes apps.accounts.tests_promotion_organization_report -v 2`; expect targeted failures.
- [ ] Implement the campaign config, covering-scope query, secure nine-character suffix, atomic idempotent creation with user-first locking and collision retry, reserved-prefix guards, post-commit grant hooks, and report filters.
- [ ] Implement the dry-run/idempotent backfill command with a whole-run prefix preflight before the first insert and created/existing/skipped/failed counters.
- [ ] Run the same targeted tests; expect PASS, including the cutoff and concurrent-repair cases from Review Focus.

### Task 3: Add campaign-aware redemption and replacement

**Files:**
- Create: `apps/accounts/services/referral_redemption.py`
- Create: `apps/accounts/serializers/code_redemption.py`
- Create/Test: `apps/accounts/tests_referral_redemption.py`
- Modify: `apps/accounts/views/code_redemption.py`
- Modify: `apps/accounts/services/promotion_codes.py`
- Modify: `apps/accounts/serializers/activation.py`
- Modify: `apps/accounts/serializers/coupon.py`

**Interfaces:**
- Produces: `redeem_referral_code(*, user, code: str, confirm_replace: bool = False) -> ReferralRedemptionResult`.
- Produces structured API outcomes: `type`, `outcome`, `code`, `message`, optional `coupon`, and optional `replacement` metadata; stable outcomes include `issued`, `already_issued`, `replacement_required`, and named error codes.
- Consumes: T2 campaign resolution/eligibility and T1 participation/coupon models.

- [ ] Add failing tests for empty/unknown/malformed/lowercase codes, self-referral, previous module/platform access, disabled campaign, first issue with exactly ¥5/zero minimum/exam-preparation-only/no expiry/stacking enabled, same-code idempotency, explicit replacement confirmation, atomic old-coupon revocation, reserved/used blocking, completed/refunded participation blocking, and no writes on every rejected input.
- [ ] Add failing tests proving referral-linked and internal-reward promotion records never fall through to ordinary promotion redemption, while existing operational reusable/single-use codes behave unchanged.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_redemption apps.accounts.tests_promotion -v 2`; expect targeted failures.
- [ ] Implement the request serializer with `confirm_replace`, prefix/source-kind routing, user-first transactional replacement, stable structured errors, and coupon serialization needed by checkout.
- [ ] Run the same targeted tests; expect PASS, including every malformed-input case from Review Focus.

### Task 4: Link checkout payment to durable qualification and the 30-day reward

**Files:**
- Create: `apps/accounts/services/referral_qualification.py`
- Create/Test: `apps/accounts/tests_referral_qualification.py`
- Modify: `apps/accounts/views/payment.py`
- Modify: `apps/accounts/services/payment_grant_service.py`
- Modify: `apps/accounts/tasks.py`

**Interfaces:**
- Produces: `reserve_referral_participation_for_payment(*, user, offer, coupon, payment) -> ReferralParticipation | None`.
- Produces: `mark_referral_reward_pending(*, payment_grant_task) -> ReferralParticipation | None` inside the successful entitlement-grant transaction.
- Produces: `process_referral_reward_pending(*, participation_id: int) -> None` and `reconcile_pending_referrals_now(*, limit: int = 100) -> dict[str, int]`.
- Consumes: T3 exact coupon attribution, T2 eligibility cutoff, and existing grant/entitlement extension services.

- [ ] Add failing tests for redemption without purchase, purchase without the exact coupon, wrong-module coupon, order-time recheck, access created one microsecond before order, current-order entitlement exclusion, access created after order still allowing the already valid order to qualify, an already issued coupon completing after the campaign flag is disabled, payment failure/closed reservation release, grant failure retry, full refund racing before qualification, and an inconsistent payment/coupon/code chain becoming `disqualified` without reward.
- [ ] Add a pricing assertion that the ¥5 referral coupon stacks with the existing eligible ¥8 old-user automatic discount while the server still calculates the final amount.
- [ ] Add failing tests for repeated callbacks/tasks and concurrent workers producing exactly one `+30 days` ledger entry and one qualified count; assert the sixth referral also grants 30 days.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_qualification apps.accounts.tests_alipay -v 2`; expect targeted failures.
- [ ] Implement order linkage under the B-user lock, `payment_reserved -> reward_pending` in the grant transaction, post-commit enqueue, scheduled retry integration, and idempotent `reward_pending -> qualified` processing under the A-user lock.
- [ ] Grant 30 days with external/idempotency references tied to the participation; record but do not alter visible expiry for covering permanent exam-preparation access, and append one privacy-safe history-only success event.
- [ ] Run the same targeted tests; expect PASS, including cutoff, duplicate-callback, queue-failure, and concurrent-worker Review Focus cases.

### Task 5: Implement three- and five-person milestone rewards

**Files:**
- Create: `apps/accounts/services/referral_milestones.py`
- Create/Test: `apps/accounts/tests_referral_milestones.py`
- Modify: `apps/accounts/services/referral_qualification.py`
- Modify: `apps/accounts/services/promotion_codes.py`

**Interfaces:**
- Produces: `reconcile_referral_milestones(*, referrer, campaign_tag: str) -> list[ReferralReward]`.
- Produces: idempotent threshold ledger identities for `science_3` and `vlog_5` plus reissue generations after successful revocation.
- Consumes: T4 effective qualified count and T1 reward ledger.

- [ ] Add failing tests that the third and fifth referrals each receive their normal 30 days plus the separate milestone; 1/2/4 and 6+ do not repeat milestones.
- [ ] Add failing tests for permanent Science/Vlog access producing one ¥10 all-module/no-minimum substitute, while temporary/expired/canceled access is upgraded to permanent; internal reward codes cannot be publicly redeemed.
- [ ] Add failing tests for repeated qualification/concurrent milestone reconciliation and for already settled substitute coupons never producing a duplicate.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_milestones -v 2`; expect failures.
- [ ] Implement permanent Science Season 1 and Vlog Season 4 grants, system-owned `internal_reward` promotion records for ¥10 coupons, idempotent milestone issue/settlement records, and history-only milestone events.
- [ ] Call milestone reconciliation after each successful T4 qualification and run the targeted tests; expect PASS.

### Task 6: Reconcile confirmed full refunds and reward rollback

**Files:**
- Create: `apps/accounts/services/referral_refunds.py`
- Create/Test: `apps/accounts/tests_referral_refunds.py`
- Modify: `apps/accounts/services/referral_milestones.py`
- Modify: `apps/accounts/services/promotion_codes.py`
- Modify: `apps/accounts/views/payment.py`
- Modify: `apps/accounts/tasks.py`

**Interfaces:**
- Produces: `reconcile_referral_refund(*, payment_id: int, at=None) -> ReferralRefundResult`.
- Produces: `debit_exam_preparation_reward(*, reward: ReferralReward, at=None) -> datetime | None` using the spec formula and `ALIPAY_TIME_ZONE` refund-day floor.
- Produces: `resolve_pending_milestone_revocation(*, payment_id: int) -> None` from coupon payment terminal changes.
- Consumes: T4 per-referral ledger, T5 milestones, and existing authoritative Alipay statuses.

- [ ] Add failing tests proving failed/canceled/closed/expired payments do nothing and create no refund notice, partial refund does nothing, partial-then-full runs once, and only `REFUNDED` enters reconciliation.
- [ ] Add failing tests for refund before qualification, after qualification, repeated retry, reward-worker race, 30-day/fewer-than-30/already-expired/permanent-access debit, no extension, end-of-refund-day floor, future purchase from the remaining expiry or today, and no change to platform-wide/other-module rights.
- [ ] Add failing tests for threshold fall/re-cross: revoke lifetime entitlement, revoke available ¥10 coupon, mark reserved coupon `revocation_pending`, settle it on payment success, revoke after payment failure/closure if still below, clear pending without duplication if the count re-crosses, and never reissue a used settled substitute.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_refunds apps.accounts.tests_alipay -v 2`; expect targeted failures.
- [ ] Implement the independent refund marker, A-user-first rollback, fungible timed-access debit, milestone reevaluation, coupon terminal hook, durable retry counters, and notice/history creation only for effects that occurred.
- [ ] Run the same targeted tests; expect PASS for every transition-ordering and exactly-once Review Focus case.

### Task 7: Expose campaign snapshot, history, and notice acknowledgement

**Files:**
- Create: `apps/accounts/serializers/referral.py`
- Create: `apps/accounts/views/referral.py`
- Create/Test: `apps/accounts/tests_referral_api.py`
- Modify: `apps/accounts/views/__init__.py`
- Modify: `apps/accounts/urls.py`
- Modify: `apps/accounts/admin.py`
- Modify: `apps/accounts/services/referral_campaign.py`

**Interfaces:**
- Produces: `GET /accounts/referral-campaign/` with enabled/eligible/locked state, personal code, unlimited effective count, five nodes, reward statuses, and privacy-safe history.
- Produces: `GET /accounts/referral-notices/unread/` and `POST /accounts/referral-notices/<id>/acknowledge/`.
- Consumes: T2 `ensure_referral_code` as a repair path and T4–T6 ledger/notices.

- [ ] Add failing API tests for anonymous rejection, locked user, eligible missing-code repair, disabled readable state, 0/3/5/12 progress snapshots, chronological privacy-safe history, unread-only retrieval, acknowledgement idempotency/ownership, and missing campaign rows returning a stable empty state.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_api -v 2`; expect failures.
- [ ] Implement focused serializers/views/URLs and admin support without exposing B identity or payment secrets.
- [ ] Run the targeted tests; expect PASS, including disabled/missing-data Review Focus fallbacks.

### Task 8: Add inline code redemption to every checkout

**Files:**
- Create: `frontend/src/components/CheckoutCodeRedemption.jsx`
- Create: `frontend/src/components/CheckoutCodeRedemption.css`
- Create/Test: `frontend/src/components/CheckoutCodeRedemption.test.jsx`
- Create/Test: `frontend/src/pages/ActivateEntitlementPage.test.jsx`
- Modify: `frontend/src/api/auth/auth.js`
- Modify: `frontend/src/api/coupons.js`
- Modify: `frontend/src/pages/ModuleCheckoutPage.jsx`
- Modify: `frontend/src/pages/ModuleCheckoutPage.css`
- Modify/Test: `frontend/src/pages/ModuleCheckoutPage.test.jsx`
- Modify: `frontend/src/pages/ActivateEntitlementPage.jsx`
- Modify/Test: `frontend/src/utils/modulePurchaseRedeem.test.js`

**Interfaces:**
- Produces: `redeemCode(code, { confirmReplace?: boolean })` preserving activation/promotion responses and supporting T3 referral outcomes.
- Produces: `CheckoutCodeRedemption({ offer, module, onCouponIssued, onActivationApplied })`.
- Consumes: T3 structured redemption result and current coupon-choice API.

- [ ] Add failing tests for activation covering the current module/platform and navigating away after `reloadMe`, activation for another module staying put, promotion/referral coupon refresh and auto-selection only when applicable, replacement confirmation/cancel, structured error copy, API failure retry, and duplicate-submit prevention.
- [ ] Add component layout assertions/classes for usable 44px controls and narrow checkout placement; preserve payment amount authority and existing coupon selection.
- [ ] Run `cd frontend && npm test -- src/components/CheckoutCodeRedemption.test.jsx src/pages/ModuleCheckoutPage.test.jsx src/pages/ActivateEntitlementPage.test.jsx src/utils/modulePurchaseRedeem.test.js`; expect targeted failures.
- [ ] Implement the reusable control, update standalone copy to `激活码、优惠码或推广码`, integrate every module checkout, and replace the purchase-modal redirect-only helper with checkout-local redemption behavior where applicable.
- [ ] Run the same focused tests; expect PASS, including API-failure fallback from Review Focus.

### Task 9: Build the Profile battle-pass panel and global refund notice

**Files:**
- Create: `frontend/src/api/referrals.js`
- Create: `frontend/src/components/ReferralCampaignPanel.jsx`
- Create: `frontend/src/components/ReferralCampaignPanel.css`
- Create/Test: `frontend/src/components/ReferralCampaignPanel.test.jsx`
- Create: `frontend/src/components/ReferralNoticeModal.jsx`
- Create/Test: `frontend/src/components/ReferralNoticeModal.test.jsx`
- Modify: `frontend/src/pages/ProfilePage.jsx`
- Modify: `frontend/src/pages/ProfilePage.css`
- Modify/Test: `frontend/src/pages/ProfilePage.test.jsx`
- Modify: `frontend/src/layouts/AppLayout.jsx`
- Create/Test: `frontend/src/layouts/AppLayout.test.jsx`

**Interfaces:**
- Produces: `fetchReferralCampaign()`, `fetchUnreadReferralNotice()`, and `acknowledgeReferralNotice(id)`.
- Produces: five-node responsive panel with enlarged 3/5 milestones, unlimited total, copy/share actions, locked CTA, reward state, and permanent history.
- Consumes: T7 snapshot/notices and existing authenticated layout/Profile conventions.

- [ ] Add failing tests for locked click/modal and routing through the existing exam-preparation purchase path, eligible code copy and native-share fallback, counts 0/3/5/12, 3/5 node emphasis, 6+ copy, automatic rewards with no claim button, history privacy, disabled/missing/API-error state, and no badge UI.
- [ ] Add failing notice tests for next authenticated page display, acknowledgement only after confirmation, one-time redisplay behavior, API failure retry, and no modal for no unread notice.
- [ ] Add responsive/reduced-motion assertions through stable classes and CSS checks covering desktop, tablet, mobile, 44px actions, fine-pointer hover, and `prefers-reduced-motion`.
- [ ] Run `cd frontend && npm test -- src/components/ReferralCampaignPanel.test.jsx src/components/ReferralNoticeModal.test.jsx src/pages/ProfilePage.test.jsx src/layouts/AppLayout.test.jsx`; expect targeted failures.
- [ ] Implement the restrained battle-pass UI between personal details and coupons, global notice mount in authenticated `AppLayout`, and safe clipboard/share fallbacks.
- [ ] Run the focused tests; expect PASS for disabled, API-error, narrow-screen, and reduced-motion Review Focus cases.

### Task 10: Document rollout and perform whole-feature verification

**Files:**
- Modify: `local-docs/promotion-code-operations.md`
- Modify: `local-docs/server-post-pull-checklist.md`
- Modify only if required by actual implementation: `docs/superpowers/specs/2026-10-21-exam-preparation-referral-design.md`

**Interfaces:**
- Produces: operator sequence and verification evidence; no new runtime interface.
- Consumes: all prior task outputs.

- [ ] Document migration, mandatory `BK1-` collision preflight, dry-run and real backfill, `EXAM_PREPARATION_REFERRAL_ENABLED=True`, worker/beat availability, rollback-by-flag behavior, and post-launch counters; explicitly state that the env variable is absent/false by default.
- [ ] Run `.venv/bin/python manage.py test apps.accounts.tests_referral_models apps.accounts.tests_referral_campaign apps.accounts.tests_referral_redemption apps.accounts.tests_referral_qualification apps.accounts.tests_referral_milestones apps.accounts.tests_referral_refunds apps.accounts.tests_referral_api apps.accounts.tests_promotion apps.accounts.tests_alipay -v 2`; expect PASS.
- [ ] Run `.venv/bin/python manage.py test apps.accounts -v 2`; expect PASS.
- [ ] Run `.venv/bin/python manage.py check` and `.venv/bin/python manage.py makemigrations --check --dry-run`; expect no errors and no pending migrations.
- [ ] Run `cd frontend && npm test`; expect PASS.
- [ ] Run `cd frontend && npm run lint`; expect PASS with no new lint errors.
- [ ] Run `cd frontend && npm run build`; expect a successful production build.
- [ ] Run `git diff --check`, inspect `git status --short`, and review the complete diff against the spec; verify no badge, media/COS/import, dependency, commit, or unrelated refactor entered the change.
- [ ] Superagent checks every acceptance item, reports any environment-limited verification separately, and reminds the user to add `EXAM_PREPARATION_REFERRAL_ENABLED=True` to production `.env` only when the rollout sequence is complete.
