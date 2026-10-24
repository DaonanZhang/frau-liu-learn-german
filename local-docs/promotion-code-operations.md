# Promotion Code Operations

Promotion and activation codes are database-backed. Activation codes also keep
Redis compatibility so codes created before the database ledger was introduced
remain redeemable.

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

### FRAULIU8 Brand Coupon

Create the global, reusable FRAULIU8 code once on the server. This command is
safe to rerun: if `FRAULIU8` already exists, it only prints the existing
record for verification and does not overwrite it.

```bash
.venv/bin/python manage.py shell <<'PY'
from decimal import Decimal

from apps.accounts.models import PromotionCodeRecord
from apps.accounts.services.promotion_codes import store_promotion_code

existing = PromotionCodeRecord.objects.filter(code="FRAULIU8").first()
if existing:
    print(
        "FRAULIU8 already exists; verify it before using it: "
        f"campaign_name={existing.campaign_name!r}, discount={existing.discount_amount}, "
        f"status={existing.status}, redemption_mode={existing.redemption_mode}, "
        f"stacking_policy={existing.stacking_policy}"
    )
else:
    store_promotion_code(
        code="FRAULIU8",
        campaign_name="FRAULIU专属优惠券",
        organization_name="",
        discount_amount=Decimal("8.00"),
        minimum_order_amount=Decimal("0.00"),
        applicable_module=None,
        applicable_season=None,
        applicable_offer=None,
        coupon_valid_days=None,
        expires_at=None,
        redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
        stacking_policy=PromotionCodeRecord.StackingPolicy.EXCLUSIVE_BRAND_FRIEND,
    )
    print("Created active reusable code FRAULIU8")
PY
```

The issued coupon display name is `FRAULIU专属优惠券`. A signed-in user
redeems it at `/redeem-code` (the API endpoint is
`/api/accounts/auth/redeem-code/`). Every successful redemption creates a new
one-use `UserCoupon` for that user; the reusable `PromotionCodeRecord` remains
active and is never consumed. The coupon applies to every module, has no
minimum order, discounts CNY 8.00, and has no expiry on either the code or the
issued coupon. One order can use at most one coupon.

Automatic selection follows these rules:

- If the user has no FRAULIU8 coupon, the existing automatic-selection logic
  is unchanged.
- If the user has FRAULIU8, it participates in the normal best-final-price
  comparison. It replaces the automatic CNY 8 brand-friend discount rather
  than stacking with it. When the final prices tie, FRAULIU8 wins over that
  brand-friend discount.
- A regular `STACK` coupon that produces a lower final price than FRAULIU8
  still wins. Regular `STACK` coupons otherwise keep their existing behavior.
- `KLDYZMZ` remains a manually selected coupon and is not automatically
  selected.

The user may explicitly choose a coupon, or send `use_coupon=false` to place
the order without a coupon while retaining any automatic member discount.
Checkout recalculates the price and locks the selected coupon inside the
payment transaction. A successful payment marks it `USED`; a failed or closed
order releases it. A full refund keeps it consumed and marks the discount
audit as refunded; it does not return the coupon to the wallet.

Examples of the automatic result:

| Available coupons / discounts | Automatic result |
| --- | --- |
| No coupon | Existing automatic member/brand-friend pricing only. |
| Only a regular coupon | Existing automatic discount plus the regular coupon according to `STACK` rules. |
| Only FRAULIU8 | CNY 8 off; it is selected automatically. |
| FRAULIU8 + old-user/brand-friend CNY 8 discount | FRAULIU8 replaces the brand-friend discount; the equal-price tie goes to FRAULIU8. |
| FRAULIU8 + a regular coupon | The coupon with the lower final price wins; equal-price ties prefer FRAULIU8. |
| FRAULIU8 + KLDYZMZ | FRAULIU8 may be automatic; KLDYZMZ remains manual and is mutually exclusive with the brand-friend discount. |
| Same user redeems FRAULIU8 repeatedly | Each redemption creates another separate one-use `UserCoupon`; the code remains active and reusable. |

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
