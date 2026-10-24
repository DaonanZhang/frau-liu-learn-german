# Promotion Code Operations

Promotion and activation codes are database-backed. Activation codes also keep
Redis compatibility so codes created before the database ledger was introduced
remain redeemable.

## Exam Preparation Referral Campaign

The first campaign uses tag `exam_preparation_referral_v1` and reserves the
`BK1-` code namespace. The setting
`EXAM_PREPARATION_REFERRAL_ENABLED` defaults to `False`; a missing variable is
also disabled. Keep it unset or set it to `False` during deployment and
backfill. In production, set `EXAM_PREPARATION_REFERRAL_ENABLED=True` in the
server `.env` only after the rollout checklist in
`server-post-pull-checklist.md` is complete, then restart the web process.

Before backfill, check that the namespace is clear in promotion-code records,
database activation codes, and legacy Redis activation-code keys:

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py shell -c "from apps.accounts.services.referral_campaign import assert_referral_code_prefix_available; assert_referral_code_prefix_available(); print('BK1- prefix available')"
```

The command raises `Referral code prefix is already in use` if it finds a
collision. The backfill repeats this preflight before processing users. First
run its dry run:

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py backfill_exam_preparation_referral_codes --dry-run
```

Review `mode=dry-run created=0 existing=… skipped=… failed=0`; `skipped` is the
number of eligible users who do not yet have a code. Then apply the backfill:

```bash
cd /srv/projects/frau-liu-learn-german
.venv/bin/python manage.py backfill_exam_preparation_referral_codes
```

Review `mode=apply created=… existing=… skipped=0 failed=0`. Stop and inspect
any collision, nonzero `failed`, or unexpected counts before enabling the
feature. The command creates codes and linked records; it does not enable the
campaign flag.

The Alipay reconciliation runner also reconciles referral rewards and full
refunds. Its Celery task is `apps.accounts.tasks.reconcile_alipay_payments`,
scheduled by the existing `reconcile-alipay-payments` Beat entry at
`ALIPAY_RECONCILE_INTERVAL_SECONDS` (default 900 seconds). Keep a Celery worker
and Beat running, or keep the deployment's existing periodic invocation of
`manage.py reconcile_alipay_payments --limit 100`; a one-off command is not a
scheduler. Its output is a Python counter dictionary, including
`referral_processed`, `referral_disqualified`, `referral_deferred`,
`referral_failed`, `referral_refunds_reconciled`,
`referral_refunds_deferred`, and `referral_refunds_failed`. Investigate
nonzero failure counters and the log message
`Scheduled referral refund reconciliation failed`.
The scheduled repair also emits `referral_terminal_processed` and
`referral_terminal_failed`. If the latter is nonzero, inspect
`Scheduled terminal referral release failed` and
`Scheduled terminal milestone resolution failed`, then rerun or confirm the
next periodic reconciliation cycle. This repairs lost post-commit work for
`FAILED`/`CLOSED` `payment_reserved` rows and `revocation_pending` milestones;
payment failure is not a refund, and partial refunds do not roll back progress.

Only a payment whose status is `REFUNDED`, whose `refunded_at` is set, and whose
`refunded_amount` equals `total_amount` is selected for referral refund
reconciliation. Payment failures and partial refunds do not reverse referral
progress or rewards.

To roll back the launch, remove the setting or set
`EXAM_PREPARATION_REFERRAL_ENABLED=False` in the production `.env`, then restart
the web process. This disables the feature flag without deleting referral
codes, participations, reward history, or already granted access. Do not delete
campaign data as part of flag rollback.

## Plaintext Code Storage

Activation codes and promotion codes both use normalized uppercase plaintext
storage:

- activation codes are stored in the unique `ActivationCodeRecord.code` field
- promotion codes are stored in the unique `PromotionCodeRecord.code` field
- generation, lookup, redemption, revocation, admin search, and operational
  listing all use these plaintext fields directly
- new activation codes are written to PostgreSQL and mirrored to Redis
- lookup checks PostgreSQL first and falls back to the legacy
  `activation_code:<CODE>` Redis entry only when no database row exists
- on first redemption, a Redis-only code is copied into PostgreSQL and consumed
  there; Redis is deleted only after the database transaction commits
- an existing consumed, revoked, or expired PostgreSQL row always wins over a
  stale Redis entry, so Redis cannot reactivate a used code
- promotion codes remain PostgreSQL-only

Migration `accounts.0026` only exists to recover development or staging
databases that previously ran the abandoned hash-based branch. A normal
production upgrade from `main` already has plaintext activation codes and does
not need any conversion.

Example activation-code generation (plaintext is printed below the summary):

```bash
.venv/bin/python manage.py generate_exam_preparation_codes \
  --days 30 \
  --count 10 \
  --remark "发给刘老师的 2026 秋季学员"
```

## Generate Promotion Codes

The command defaults to one global CNY 5 coupon with no minimum order. The
unredeemed promotion code expires after 360 days, while the coupon issued on
redemption has no separate expiry. Omit `--module`, `--season`, and `--offer`
to keep the coupon valid for every module and active offer.

Generate one default global code for a channel partner:

```bash
.venv/bin/python manage.py generate_promotion_codes \
  --campaign-name "渠道名称" \
  --organization "渠道账号" \
  --remark "合作博主"
```

Generate ten CNY 10 coupons for one institution and one offer:

```bash
.venv/bin/python manage.py generate_promotion_codes \
  --campaign-name "合作机构 A" \
  --organization "机构 A" \
  --discount 10 \
  --count 10 \
  --offer exam-preparation-30d \
  --expires-days 360 \
  --minimum-order 20 \
  --remark "2026 秋季批次"
```

The plaintext codes are printed to stdout and stored directly in the unique,
indexed `PromotionCodeRecord.code` field. Staff with database or Django-admin
access can therefore read them directly.

Use `--remark` for the batch recipient or distribution purpose, for example
`--remark "发给刘老师的 2026 秋季学员"`. The remark is copied to every code in
the batch, searchable in Django admin, and snapshotted into the payment-discount
audit record when a coupon is used.

Use `--module` and optional `--season` instead of `--offer` for a broader
scope. Omit all three options for a coupon valid across every active offer.
Ordinary promotion coupons apply after the automatic old-user discount. An
eligible existing entitlement gives one ¥8 old-user discount. This includes
buying Vlog or Science after exam preparation; that combination no longer uses
the former half-price rule. Multiple qualifying entitlements still produce only
one ¥8 discount. For example, a ¥59.90 exam-preparation offer with that discount
and a ¥10 ordinary coupon costs ¥41.90. The configured Kunlun Subtitle Group
coupon is the exception described below.

Promotion codes expire after 360 days by default. Pass `--no-expiry` when the
unredeemed promotion code itself should remain redeemable indefinitely. This
is separate from `--coupon-valid-days`.

Issued coupons are permanent by default: omit `--coupon-valid-days` and
`UserCoupon.expires_at` remains `NULL`. Pass a positive value such as
`--coupon-valid-days 30` only when coupons from that generated batch should
expire 30 days after redemption. `--expires-days` is separate and still
controls how long the unredeemed promotion code remains redeemable.

There is no separate promotion-campaign table. `campaign_name` and
`organization_name` are stored directly on every `PromotionCodeRecord`.
`UserCoupon` reads them through its protected promotion-code source;
it does not duplicate those fields. This keeps code generation independent and
avoids a separate campaign lifecycle.

The management command delegates to
`create_promotion_code_batch()` in
`apps/accounts/services/promotion_codes.py`. The service creates the complete
batch atomically and returns the plaintext code list to its trusted caller.

### Kunlun Subtitle Group Code

The single reusable Kunlun Subtitle Group code is `KLDYZMZ`. Create it
once in the target environment with:

```bash
.venv/bin/python manage.py generate_promotion_codes \
  --campaign-name "昆仑字幕组" \
  --organization "昆仑字幕组" \
  --code "KLDYZMZ" \
  --reusable \
  --exclusive-brand-friend \
  --no-expiry \
  --remark "昆仑字幕组长期合作码"
```

The code text does not activate any behavior. This one database record stores
that it is reusable and that its issued coupons replace the automatic
brand-friend discount. Existing and randomly generated promotion codes remain
single-use and keep their current stacking behavior.

Each redemption creates a separate one-use CNY 5 coupon. It never stacks with
the ¥8 old-user discount. Because selecting it makes an eligible old user pay
CNY 3 more, checkout must show the old and new final prices and require an
explicit confirmation before replacing the old-user discount. The coupon is
not selected automatically. Other promotion coupons continue to stack with the
¥8 old-user discount.

### FRAULIU8 Public Code

Create the reusable public code once on the server:

```bash
.venv/bin/python manage.py shell <<'PY'
from apps.accounts.models import PromotionCodeRecord
from apps.accounts.services.promotion_codes import store_promotion_code

code = "FRAULIU8"
existing = PromotionCodeRecord.objects.filter(code=code).first()
if existing:
    print(f"already exists: {existing.code}; not overwritten")
    print("If its configuration differs, inspect it and correct it manually.")
else:
    record = store_promotion_code(
        code=code,
        campaign_name="FRAULIU8",
        organization_name="",
        discount_amount=8,
        minimum_order_amount=0,
        applicable_module=None,
        applicable_season=None,
        applicable_offer=None,
        coupon_valid_days=None,
        expires_at=None,
        redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
        stacking_policy=PromotionCodeRecord.StackingPolicy.EXCLUSIVE_BRAND_FRIEND,
    )
    print(f"created: code={record.code}, discount_amount={record.discount_amount}")
PY
```

This code gives a reusable ¥8 coupon with no minimum order and no module
restriction. Both the code and issued coupons are permanently valid because
`expires_at` and `coupon_valid_days` are `None`. Repeating the command leaves
an existing record unchanged and prints that it already exists; if the
existing record has different settings, inspect and correct it manually. FRAULIU8 is
automatically selected when it gives the best price and wins an equal-price
tie against the automatic brand-friend discount or another coupon. It still
replaces, rather than stacks with, that discount. The existing KLDYZMZ code
keeps its manual confirmation flow.

## User Coupon Wallet and Checkout

- The signed-in redemption page is `/redeem-code` and is rendered inside the
  normal site layout with navigation. The legacy `/activate-entitlement` URL
  redirects there.
- Redeeming a promotion code at `/api/accounts/auth/redeem-code/` consumes the
  one-time code and creates one `UserCoupon` owned by the authenticated user.
- Redeeming the configured `KLDYZMZ` record leaves that code active and
  creates a new one-use `UserCoupon` on every redemption.
- `/api/accounts/coupons/` returns only the current user's coupon wallet and
  includes scope, status, expiry, and usage history.
- `/api/accounts/coupons/choices/?offer_code=<code>` returns server-calculated
  applicable and unavailable choices, the default best coupon, and the
  no-coupon price for one offer.
- Omitting `coupon_id` with `use_coupon=true` asks the server to select the best
  applicable coupon.
- Sending a specific `coupon_id` with `use_coupon=true` requests that coupon;
  the server revalidates and locks it inside the order transaction.
- Sending `use_coupon=false` explicitly creates the order without a coupon,
  while retaining any automatic member discount.

The frontend never supplies the payment amount. The server recalculates the
price, prevents cross-user or concurrent coupon use, and reserves the coupon
against the created Alipay order.

`PaymentDiscountApplication` records:

- payment and merchant order number through the payment relation
- user, offer, module, promotion code, and coupon
- original amount, automatic discount, coupon discount, and final amount
- automatic versus manual coupon selection
- campaign name, organization, and operator remark snapshots
- reserved, applied, released, and refunded lifecycle timestamps

Closed or failed unpaid orders release the coupon. Paid orders mark it used. A
full refund keeps the coupon consumed and marks the audit row refunded, so the
same one-time promotion benefit cannot be reused after a refund.

## Monthly Channel Report

Summary:

```bash
.venv/bin/python manage.py promotion_campaign_report \
  --campaign-name "合作机构 A" \
  --organization "机构 A" \
  --month 2026-09
```

Include the redeemed code, user telephone, purchased offer, order number,
original price, promotion discount, final price, and timestamps:

```bash
.venv/bin/python manage.py promotion_campaign_report \
  --campaign-name "合作机构 A" \
  --organization "机构 A" \
  --month 2026-09 \
  --details
```

Report only the reusable Kunlun Subtitle Group code:

```bash
.venv/bin/python manage.py promotion_campaign_report \
  --campaign-name "昆仑字幕组" \
  --organization "昆仑字幕组" \
  --code "KLDYZMZ" \
  --month 2026-10 \
  --details
```

The summary includes coupon redemption count, distinct redeeming users, paid
orders, distinct paying users, and amount totals. Detail rows list every
redemption and every paid product purchase.

Only `PaymentDiscountApplication.status=applied` rows count as effective paid
promotion purchases. Closed orders are released and full refunds are retained
as `refunded` audit rows rather than counted as current effective purchases.

## Admin Tables

- `PromotionCodeRecord`: code, redemption mode, stacking policy,
  campaign/organization strings, operator remark, consumption data and scope.
- `UserCoupon`: issued, reserved, used, expired or revoked user coupon.
- `PaymentDiscountApplication`: immutable order price snapshot and discount
  lifecycle.
