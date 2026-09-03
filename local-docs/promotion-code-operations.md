# Promotion Code Operations

Promotion and activation codes are database-backed. Redis is not a source of
truth for either code type.

## Activation-Code Secret and Promotion-Code Storage

`ACTIVATION_CODE_HASH_KEY` is a server-side secret used to create the keyed
lookup hash and encrypted database copy for activation codes. Users do not
enter this key; they only enter the activation code printed by the generation
command.

- Set the same stable key on every backend and admin-command host.
- Do not rotate it while unredeemed activation codes exist.
- Activation-code generation prints the plaintext to stdout and stores only
  `code_hash` plus `code_ciphertext`.
- Promotion codes deliberately use a different policy: the normalized
  uppercase plaintext is stored directly in `PromotionCodeRecord.code` and no
  promotion-code hash or ciphertext fields exist.
- Migration `accounts.0023` needs the existing key once to decrypt any
  promotion codes created before this storage-policy change. It stops without
  deleting the old fields if any existing record cannot be decrypted.

Example activation-code generation (plaintext is printed below the summary):

```bash
.venv/bin/python manage.py generate_exam_preparation_codes \
  --days 30 \
  --count 10 \
  --remark "发给刘老师的 2026 秋季学员"
```

## Generate Promotion Codes

Generate ten CNY 10 coupons for one institution and one offer:

```bash
.venv/bin/python manage.py generate_promotion_codes \
  --campaign-name "合作机构 A" \
  --organization "机构 A" \
  --discount 10 \
  --count 10 \
  --offer exam-preparation-30d \
  --expires-days 180 \
  --minimum-order 20 \
  --remark "2026 秋季批次"
```

The plaintext codes are printed to stdout and stored directly in the unique,
indexed `PromotionCodeRecord.code` field. Staff with database or Django-admin
access can therefore read them without decryption.

Use `--remark` for the batch recipient or distribution purpose, for example
`--remark "发给刘老师的 2026 秋季学员"`. The remark is copied to every code in
the batch, searchable in Django admin, and snapshotted into the payment-discount
audit record when a coupon is used.

Use `--module` and optional `--season` instead of `--offer` for a broader
scope. Omit all three options for a coupon valid across every active offer.
Add `--stackable` only when the coupon may combine with automatic member
discounts.

Issued coupons are permanent by default: omit `--coupon-valid-days` and
`UserCoupon.expires_at` remains `NULL`. Pass a positive value such as
`--coupon-valid-days 30` only when coupons from that generated batch should
expire 30 days after redemption. `--expires-days` is separate and still
controls how long the unredeemed promotion code remains redeemable.

There is no separate promotion-campaign table. `campaign_name` and
`organization_name` are stored directly on every `PromotionCodeRecord`.
`UserCoupon` reads them through its protected one-to-one promotion-code source;
it does not duplicate those fields. This keeps code generation independent and
avoids a separate campaign lifecycle.

The management command delegates to
`create_promotion_code_batch()` in
`apps/accounts/services/promotion_codes.py`. The service creates the complete
batch atomically and returns the plaintext code list to its trusted caller.

## User Coupon Wallet and Checkout

- The signed-in redemption page is `/redeem-code` and is rendered inside the
  normal site layout with navigation. The legacy `/activate-entitlement` URL
  redirects there.
- Redeeming a promotion code at `/api/accounts/auth/redeem-code/` consumes the
  one-time code and creates one `UserCoupon` owned by the authenticated user.
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

Only `PaymentDiscountApplication.status=applied` rows count as effective paid
promotion purchases. Closed orders are released and full refunds are retained
as `refunded` audit rows rather than counted as current effective purchases.

## Admin Tables

- `PromotionCodeRecord`: one-time code, campaign/organization strings,
  operator remark, consumer, consumption time and scope.
- `UserCoupon`: issued, reserved, used, expired or revoked user coupon.
- `PaymentDiscountApplication`: immutable order price snapshot and discount
  lifecycle.
