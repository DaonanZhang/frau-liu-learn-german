# Provider-Neutral Payment Order Design

## Objective

Replace the支付宝-specific payment persistence boundary with one provider-neutral
payment order while preserving the behavior and data of the existing支付宝 purchase
flow. This change prepares the project for a later WeChat Pay integration without
introducing parallel foreign keys for grants, coupons, discounts, or reporting.

This change does not implement WeChat Pay, change the checkout UI, rename the
existing支付宝 HTTP endpoints, or replace the支付宝 reconciliation schedule.

## Current Problem

`PaymentGrantTask`, `PaymentDiscountApplication`, and the reserved/used payment
fields on `UserCoupon` all point directly to `AlipayWebsitePayment`. Entitlement
idempotency and refund revocation also construct references with an
`alipay_payment:` prefix.

Adding a separate WeChat payment model in this state would require parallel
foreign keys and duplicated grant, coupon, refund, reporting, and operational
logic.

## Selected Architecture

Rename `AlipayWebsitePayment` to `PaymentOrder` and make the model identify its
payment provider explicitly.

`PaymentOrder` owns the shared commercial state:

- merchant order number;
- provider and provider transaction number;
- subject and amount;
- local lifecycle status;
- timestamps for creation, payment, expiry, reconciliation, and refund;
- cumulative refunded amount;
- the sanitized callback payload retained for operational diagnosis.

The initial provider choices are `alipay` and `wechat_pay`. All existing and newly
created支付宝 orders use `alipay`. The `wechat_pay` choice reserves the stable value
that a later integration will use; this change does not yet create WeChat orders.

Provider-specific protocol behavior remains outside the model. The existing
支付宝 service and endpoints continue to sign支付宝 requests, verify支付宝 responses,
map支付宝 statuses, and call支付宝 query/close APIs.

## Model Contract

Rename:

- model: `AlipayWebsitePayment` to `PaymentOrder`;
- source module: `alipay_payment.py` to `payment_order.py`;
- field: `alipay_trade_no` to `provider_trade_no`.

Add:

- `provider`, a required indexed field with `alipay` and `wechat_pay` choices;
- `PaymentOrder.entitlement_external_ref`, returning
  `payment:<provider>:<merchant_order_no>`.

Keep the existing status values unchanged:

- `created`;
- `pending`;
- `paid`;
- `failed`;
- `closed`;
- `partially_refunded`;
- `refunded`.

Keep `merchant_order_no` globally unique. Replace the支付宝 transaction-number
constraint with a conditional uniqueness constraint on
`(provider, provider_trade_no)` when `provider_trade_no` is non-empty.

The existing shared relations keep their field names and point to
`PaymentOrder`:

- `PaymentGrantTask.payment`;
- `PaymentDiscountApplication.payment`;
- `UserCoupon.reserved_payment`;
- `UserCoupon.used_payment`.

No compatibility alias named `AlipayWebsitePayment` will remain in application
code. All current call sites and tests will use the single target model name.

## Data Migration

The migration must preserve every existing payment primary key and all related
foreign-key values. It will:

1. rename the model;
2. add `provider` with all historical rows set to `alipay`;
3. rename `alipay_trade_no` to `provider_trade_no`;
4. replace the old transaction-number uniqueness constraint;
5. rewrite only entitlement references beginning with `alipay_payment:` to
   `payment:alipay:`.

The entitlement-reference migration must be reversible. Its reverse operation
rewrites only `payment:alipay:` references to the former prefix.

Historical migration files remain unchanged. A new forward migration performs
the rename and data conversion so existing deployments can migrate normally.

## Shared Business Behavior

Payment-dependent business services will use `PaymentOrder.Status` and the
payment's `entitlement_external_ref`. They must not import an支付宝-specific model
or construct an支付宝-specific entitlement reference.

The following behavior remains unchanged across the refactor:

- the server calculates the authoritative purchase price;
- purchase intent keys remain idempotent;
- a coupon is reserved when an order is created;
- successful payment consumes the reserved coupon;
- failed or closed payment releases it;
- full refund records the refund and revokes/compacts the purchased entitlement;
- payment confirmation grants or extends access exactly once;
- a failed grant remains retryable;
- reports continue to count the same historical支付宝 orders.

The entitlement external reference changes format, but the data migration keeps
historical and future references aligned so grant retries cannot create duplicate
access.

## Alipay Isolation

Existing支付宝 routes, frontend return behavior, response shapes, and operational
commands retain their current names.

Every支付宝-created payment explicitly sets
`provider=PaymentOrder.Provider.ALIPAY`. Every支付宝 callback lookup, status lookup,
gateway query, close operation, and scheduled reconciliation selection must
require the same provider.

This prevents a future WeChat order from being sent to支付宝 merely because it has
a shared local status such as `pending`.

The支付宝 gateway service accepts `PaymentOrder` but rejects a non-支付宝 order
before building a request. Provider checks are defense in depth; endpoint queryset
filtering remains required as well.

## Reconciliation and Server Operations

The existing `reconcile_alipay_payments` command, Celery task, systemd service,
and 15-minute timer remain enabled. Removing the timer would weaken the current
payment guarantees because it recovers missed callbacks, synchronizes later
refunds, retries failed entitlement grants, and purges retained callback data.

The task changes only in its persistence dependency:

- query `PaymentOrder` instead of `AlipayWebsitePayment`;
- filter all gateway-facing payment selections by `provider=alipay`;
- retry generic grant tasks only when their payment provider is `alipay`;
- process refunded orders only when their payment provider is `alipay`;
- purge callback payloads only for支付宝 orders handled by this task.

A later WeChat integration may add its own provider-specific reconciliation task.
Both provider tasks will use the same shared grant, coupon, and entitlement
services. Combining the two timers into a dispatcher is explicitly deferred
until WeChat exists; doing it now adds no working capability.

Deployment validation continues to verify the支付宝 callback URL. No server unit
is removed or renamed in this refactor.

## Administration and Reporting

The Django admin registers `PaymentOrder`, displays the provider, and searches
`provider_trade_no` instead of `alipay_trade_no`.

Sales and promotion reports use `PaymentOrder`. Reports that are intended to
represent the current historical支付宝-only business retain their current totals.
Where a report is specifically named or described as支付宝-only, its queryset must
filter `provider=alipay` so future WeChat orders do not silently change its meaning.

Operational documentation and shell examples will use the new model and field
names.支付宝 command and service names remain unchanged because they still perform
支付宝-specific gateway work.

## Testing and Verification

The implementation must use a migration test plus behavioral regression tests.
Verification covers:

1. Existing payment IDs, amounts, statuses, timestamps, and trade numbers survive
   the migration.
2. Existing grant, coupon, and discount foreign keys still identify the same
   payment rows.
3. Historical orders have `provider=alipay`.
4. Historical entitlement references are converted exactly once and reverse
   correctly.
5. Retrying a migrated paid order does not issue duplicate access.
6. New支付宝 orders explicitly use the支付宝 provider.
7.支付宝 endpoints and services do not operate on `wechat_pay` orders.
8. The支付宝 reconciliation task excludes `wechat_pay` orders.
9. Coupon reservation, application, release, and refund behavior is unchanged.
10. Full-refund entitlement revocation and timeline compaction are unchanged.
11. Existing支付宝 API, promotion, report, migration, and account test suites pass.
12. Django reports no missing migrations, and frontend tests/build remain green
    because public HTTP contracts do not change.

## Rollout and Risk Controls

Run the migration during a normal backend deployment before restarting payment
workers. The PostgreSQL rename preserves rows instead of copying live payment
data into a second table.

Before deployment, take the normal database backup and record counts for payment
orders, grant tasks, discount applications, reserved coupons, used coupons, and
payment-backed entitlements. After migration, compare the same counts and sample
foreign-key relationships.

Keep the支付宝 reconciliation timer enabled. After deployment, run its oneshot
service once and verify that it queries only支付宝 orders and completes without
creating duplicate entitlements.

The principal risks are an incomplete provider filter, an incorrectly converted
entitlement reference, and reporting queries whose former支付宝-only meaning becomes
ambiguous. The tests and post-migration checks above directly target those risks.
