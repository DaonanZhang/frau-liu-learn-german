# Provider-Neutral Payment Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the支付宝-specific persisted payment model with one provider-neutral order while preserving all existing支付宝 data, behavior, routes, and reconciliation guarantees.

**Architecture:** Rename the existing Django model and trade-number field in place, add an explicit provider discriminator, and keep all grant/coupon/discount foreign keys on that single row identity. Shared business services use `PaymentOrder`, while the existing支付宝 adapter, endpoints, and scheduled recovery remain provider-specific and reject non-支付宝 orders.

**Tech Stack:** Python 3.13, Django 4.2, Django REST Framework, PostgreSQL/SQLite migration tests, Celery, systemd, React/Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-provider-neutral-payment-order-design.md`

## Global Constraints

- Do not implement WeChat Pay in this change.
- Preserve all historical payment primary keys and related foreign-key values.
- Preserve the public支付宝 HTTP routes, frontend response shapes, and systemd unit names.
- Keep `reconcile_alipay_payments` enabled and restrict its gateway work to `provider=alipay`.
- Use `PaymentOrder` as the only application model name; do not add an `AlipayWebsitePayment` compatibility alias.
- Preserve server-authoritative pricing, coupon reservation, grant idempotency, refund revocation, and reporting behavior.
- Do not perform browser verification unless the user explicitly requests it.

## Review Focus

- A migrated paid支付宝 order with an existing `alipay_payment:` entitlement must not receive a duplicate extension when its grant task is retried; Task 2 adds this regression test.
- A future `wechat_pay` row in `pending` state must never be queried, closed, or reconciled through支付宝; Task 3 adds service, endpoint, and scheduled-task isolation tests.
- Renaming the model and field must leave grant, coupon, and discount foreign keys attached to the same primary key; Task 1 verifies all relation IDs across migration.
- An empty provider transaction number may repeat, while the same non-empty number may repeat only across different providers; Task 1 tests the conditional composite constraint.
- Existing支付宝-only reports must not silently include future WeChat rows; Task 4 adds provider filtering and report regressions.

---

## File Structure

- `apps/accounts/models/payment_order.py`: provider-neutral order model, lifecycle enums, and entitlement reference.
- `apps/accounts/migrations/0035_provider_neutral_payment_order.py`: in-place model/field rename, provider backfill, constraint replacement, and reversible entitlement-reference conversion.
- `apps/accounts/tests_payment_order.py`: provider-neutral model and shared service behavior.
- `apps/accounts/tests_migrations.py`: migration preservation and data-conversion coverage.
- `apps/accounts/services/alipay_service.py`:支付宝 protocol adapter operating only on支付宝 `PaymentOrder` rows.
- `apps/accounts/views/payment.py`: existing支付宝 endpoints with explicit provider assignment and filtering.
- `apps/accounts/tasks.py`:支付宝 reconciliation with explicit provider scope.
- Shared account services and models: switch imports/status checks/external references to `PaymentOrder` without changing business behavior.
- Admin, reports, scripts, tests, and operational docs: use neutral names and retain支付宝-only filters where semantics require them.

### Task 1: Introduce `PaymentOrder` and Preserve Historical Data

**Files:**
- Create: `apps/accounts/models/payment_order.py`
- Create: `apps/accounts/migrations/0035_provider_neutral_payment_order.py`
- Create: `apps/accounts/tests_payment_order.py`
- Delete: `apps/accounts/models/alipay_payment.py`
- Modify: `apps/accounts/models/__init__.py`
- Modify: `apps/accounts/models/payment_grant_task.py`
- Modify: `apps/accounts/models/promotion.py`
- Modify: `apps/accounts/tests_migrations.py`

**Interfaces:**
- Produces: `PaymentOrder.Provider.ALIPAY`, `PaymentOrder.Provider.WECHAT_PAY`, unchanged `PaymentOrder.Status`, `provider_trade_no`, and `entitlement_external_ref`.
- Preserves: relation field names `payment`, `reserved_payment`, and `used_payment`.

- [ ] **Step 1: Add failing migration and model tests**

Add `PaymentOrderMigrationTests` that migrates from `accounts.0034_reset_device_activity_after_lifecycle_fix` to `accounts.0035_provider_neutral_payment_order`. Seed an支付宝 payment, grant task, coupon reservation, discount application, and matching entitlement in the old state. Assert after migration that IDs and relation IDs are unchanged, `provider == "alipay"`, `provider_trade_no` preserves the old value, and the entitlement reference is `payment:alipay:<merchant_order_no>`. Exercise the reverse migration and assert the old model/field/prefix return.

Add model tests asserting the two provider values, the canonical external reference, repeatable blank transaction numbers, rejection of duplicate `(provider, provider_trade_no)`, and allowance of the same non-empty transaction number for different providers.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
.venv/bin/python manage.py test apps.accounts.tests_payment_order apps.accounts.tests_migrations.PaymentOrderMigrationTests --settings=config.settings_sqlite_test -v 2
```

Expected: failure because `PaymentOrder` and migration `0035` do not exist.

- [ ] **Step 3: Implement the neutral model and migration**

Create `PaymentOrder` with exact provider values `alipay` and `wechat_pay`. Rename `alipay_trade_no` to `provider_trade_no`, add the indexed required provider field with historical default `alipay`, and replace `uniq_nonblank_alipay_trade_no` with a conditional composite constraint named `uniq_provider_nonblank_trade_no`.

Use `RenameModel` and `RenameField` so deployment renames existing schema objects rather than copying payment rows. Use reversible `RunPython` operations that update only the exact external-reference prefixes defined by the spec. Update every shared relation target to `accounts.PaymentOrder` and export only `PaymentOrder` from the model package.

- [ ] **Step 4: Run focused tests and migration-state checks**

Run the command from Step 2, then:

```bash
.venv/bin/python manage.py makemigrations --check --dry-run --settings=config.settings_sqlite_test
```

Expected: focused tests pass and Django reports `No changes detected`.

- [ ] **Step 5: Commit**

```bash
git add apps/accounts/models apps/accounts/migrations/0035_provider_neutral_payment_order.py apps/accounts/tests_payment_order.py apps/accounts/tests_migrations.py
git commit -m "refactor: introduce provider-neutral payment orders"
```

### Task 2: Make Grant, Coupon, and Refund Services Provider-Neutral

**Files:**
- Modify: `apps/accounts/services/payment_grant_service.py`
- Modify: `apps/accounts/services/entitlement_grant_service.py`
- Modify: `apps/accounts/services/promotion_codes.py`
- Modify: `apps/accounts/security/activation.py`
- Modify: `apps/accounts/tests_alipay.py`
- Modify: `apps/accounts/tests_promotion.py`
- Modify: `apps/accounts/tests.py`
- Modify: `apps/accounts/tests_payment_order.py`

**Interfaces:**
- Consumes: `PaymentOrder.Status` and `PaymentOrder.entitlement_external_ref` from Task 1.
- Produces: channel-neutral grant idempotency, refund revocation, coupon reservation/application/release, and open-payment checks.

- [ ] **Step 1: Add failing shared-behavior regressions**

Add tests that retry a migrated支付宝 grant without creating a second entitlement, grant a synthetic `wechat_pay` order using `payment:wechat_pay:<merchant_order_no>`, revoke an entitlement through the payment's canonical reference, and exercise coupon reservation/application/release for both provider values.

- [ ] **Step 2: Run focused service tests and verify RED**

```bash
.venv/bin/python manage.py test apps.accounts.tests_payment_order apps.accounts.tests_promotion apps.accounts.tests_alipay --settings=config.settings_sqlite_test -v 2
```

Expected: failures from支付宝-specific model imports or `alipay_payment:` reference construction.

- [ ] **Step 3: Replace支付宝-specific shared dependencies**

Use `PaymentOrder.Status` in promotion, activation, and grant services. Build entitlement references exclusively through `payment.entitlement_external_ref`. Update refund revocation to locate the entitlement via that property. Do not change coupon or entitlement state transitions.

- [ ] **Step 4: Update existing tests to the single target model name**

Replace application and test imports of `AlipayWebsitePayment` with `PaymentOrder`, rename field assertions to `provider_trade_no`, and update exact entitlement references to `payment:alipay:<merchant_order_no>`.

- [ ] **Step 5: Run focused service tests and verify GREEN**

Run the command from Step 2. Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/accounts/services apps/accounts/security apps/accounts/tests.py apps/accounts/tests_alipay.py apps/accounts/tests_promotion.py apps/accounts/tests_payment_order.py
git commit -m "refactor: share payment business services across providers"
```

### Task 3: Isolate the Existing Alipay Gateway and Reconciliation Path

**Files:**
- Modify: `apps/accounts/services/alipay_service.py`
- Modify: `apps/accounts/views/payment.py`
- Modify: `apps/accounts/tasks.py`
- Modify: `apps/accounts/serializers/payment.py`
- Modify: `apps/accounts/tests_alipay.py`

**Interfaces:**
- Consumes: `PaymentOrder` from Task 1 and neutral shared services from Task 2.
- Preserves: existing支付宝 routes, payloads, throttle scopes, return URL, command name, Celery task name, and systemd behavior.
- Produces: explicit支付宝 provider assignment and defense-in-depth provider rejection/filtering.

- [ ] **Step 1: Add failing provider-isolation tests**

Assert that creating an支付宝 purchase stores `provider=alipay`; `AlipayService` refuses to build a page-pay request for a `wechat_pay` order;支付宝 notify and status endpoints do not match a `wechat_pay` order even when given its merchant order number; and `reconcile_alipay_payments_now()` never calls the支付宝 query path or retries a grant for a `wechat_pay` payment.

- [ ] **Step 2: Run focused支付宝 tests and verify RED**

```bash
.venv/bin/python manage.py test apps.accounts.tests_alipay --settings=config.settings_sqlite_test -v 2
```

Expected: failures because provider assignment and isolation are not enforced everywhere.

- [ ] **Step 3: Update支付宝 service and endpoint types**

Change signatures and imports to `PaymentOrder`. Add a provider guard in the支付宝 service before signing or calling the gateway. Set `provider=alipay` for debug, simulated, and real支付宝 orders. Replace field access with `provider_trade_no`.

Filter callback and status lookups by both merchant order number and支付宝 provider. Keep the current not-found behavior so a caller cannot use支付宝 endpoints to inspect a future WeChat order.

- [ ] **Step 4: Scope scheduled支付宝 reconciliation**

Filter the initial and refunded `PaymentOrder` querysets with
`provider=PaymentOrder.Provider.ALIPAY`; filter grant retries with
`payment__provider=PaymentOrder.Provider.ALIPAY`; and apply the same direct
provider filter to callback-payload purging. Keep the command, Celery schedule,
systemd service, and 15-minute timer intact.

- [ ] **Step 5: Run focused支付宝 tests and verify GREEN**

Run the command from Step 2. Expected: all支付宝 tests pass, including provider isolation.

- [ ] **Step 6: Commit**

```bash
git add apps/accounts/services/alipay_service.py apps/accounts/views/payment.py apps/accounts/tasks.py apps/accounts/serializers/payment.py apps/accounts/tests_alipay.py
git commit -m "refactor: isolate alipay operations by provider"
```

### Task 4: Update Administration, Reports, Scripts, and Operations Documentation

**Files:**
- Modify: `apps/accounts/admin.py`
- Modify: `scripts/report_exam_preparation_sales.py`
- Modify: `apps/accounts/management/commands/promotion_organization_excel_report.py`
- Modify: `apps/accounts/tests_promotion_organization_report.py`
- Modify: `local-docs/server-post-pull-checklist.md`
- Modify: `local-docs/exam-preparation-server-deployment.md`

**Interfaces:**
- Consumes: the neutral model and exact provider values from Task 1.
- Produces: accurate admin visibility, stable支付宝-only report meaning, and updated operational examples.

- [ ] **Step 1: Add failing report coverage for mixed providers**

Extend report tests with one otherwise eligible `wechat_pay` payment and assert existing支付宝-oriented totals remain unchanged. Assert the admin search/display configuration uses `provider` and `provider_trade_no`.

- [ ] **Step 2: Run report tests and verify RED**

```bash
.venv/bin/python manage.py test apps.accounts.tests_promotion_organization_report --settings=config.settings_sqlite_test -v 2
```

Expected: failures from the old model name/field or mixed-provider totals.

- [ ] **Step 3: Update admin and report queries**

Register `PaymentOrder`, display/filter by provider, and search the neutral transaction number. Change report imports to `PaymentOrder` and explicitly filter `provider=alipay` wherever the report's current meaning is支付宝 sales rather than all-provider revenue.

- [ ] **Step 4: Update operational documentation**

Replace shell examples that import `AlipayWebsitePayment` or inspect `alipay_trade_no`. State explicitly that `frau-liu-alipay-reconcile.timer` remains enabled and is provider-scoped after the migration.

- [ ] **Step 5: Run report tests and reference audit**

Run the command from Step 2, then:

```bash
rg -n "AlipayWebsitePayment|alipay_trade_no|alipay_payment:" apps config scripts local-docs
```

Expected: report tests pass; old names remain only in historical migration files and intentional historical migration-state tests.

- [ ] **Step 6: Commit**

```bash
git add apps/accounts/admin.py apps/accounts/management/commands/promotion_organization_excel_report.py apps/accounts/tests_promotion_organization_report.py scripts/report_exam_preparation_sales.py local-docs/server-post-pull-checklist.md local-docs/exam-preparation-server-deployment.md
git commit -m "docs: update payment operations for shared orders"
```

### Task 5: Full Regression, Migration, and Risk Verification

**Files:**
- Modify only files needed to correct failures caused by Tasks 1–4.

**Interfaces:**
- Verifies the complete design; produces no new public interface.

- [ ] **Step 1: Run all account backend tests**

```bash
.venv/bin/python manage.py test apps.accounts --settings=config.settings_sqlite_test -v 2
```

Expected: all account tests pass.

- [ ] **Step 2: Run the complete backend test suite**

```bash
.venv/bin/python manage.py test --settings=config.settings_sqlite_test
```

Expected: all backend tests pass.

- [ ] **Step 3: Run Django configuration and migration checks**

```bash
.venv/bin/python manage.py check --settings=config.settings_sqlite_test
.venv/bin/python manage.py makemigrations --check --dry-run --settings=config.settings_sqlite_test
.venv/bin/python manage.py migrate --plan --settings=config.settings_sqlite_test
```

Expected: no system-check issues, no uncommitted model changes, and a valid migration plan.

- [ ] **Step 4: Run frontend regression checks**

Run from `frontend/`:

```bash
npm test
npm run build
```

Expected: tests and production build pass; checkout and支付宝 return contracts are unchanged.

- [ ] **Step 5: Inspect the final diff for migration and provider risks**

Confirm every changed line traces to the neutralization request. Verify that the支付宝 reconciliation timer remains installed/enabled, all支付宝 gateway entry points filter the provider, the data migration is reversible, no secrets were added, and no unrelated refactoring entered the diff.

- [ ] **Step 6: Run final status and whitespace checks**

```bash
git status --short
git diff --check
```

Expected: only intentional work remains and there are no whitespace errors.

- [ ] **Step 7: Commit any verification fixes**

If verification required corrections, stage only those exact corrected files and
commit them with message `test: verify provider-neutral payment migration`. Skip
this step when verification produced no changes.

- [ ] **Step 8: Prepare the server rollout handoff**

Report that production rollout remains: take a database backup, deploy and migrate, restart the backend, keep the支付宝 timer enabled, run `frau-liu-alipay-reconcile.service` once, and compare pre/post payment, grant, coupon, and entitlement counts. Do not perform production operations without a separate explicit server request.
