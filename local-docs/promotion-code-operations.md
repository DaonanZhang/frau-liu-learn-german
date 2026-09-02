# Promotion Code Operations

Promotion and activation codes are database-backed. Redis is not a source of
truth for either code type.

## Generate Promotion Codes

Generate ten CNY 10 coupons for one institution and one offer:

```bash
.venv/bin/python manage.py generate_promotion_codes \
  --campaign partner-a-2026 \
  --campaign-name "合作机构 A" \
  --organization "机构 A" \
  --discount 10 \
  --count 10 \
  --offer exam-preparation-30d \
  --expires-days 180 \
  --coupon-valid-days 30 \
  --minimum-order 20 \
  --remark "2026 秋季批次"
```

The plaintext codes are printed to stdout. The database stores an encrypted
copy for authorized administration and a keyed hash for lookup.

Use `--module` and optional `--season` instead of `--offer` for a broader
scope. Omit all three options for a coupon valid across every active offer.
Add `--stackable` only when the campaign may combine with automatic member
discounts.

## Monthly Channel Report

Summary:

```bash
.venv/bin/python manage.py promotion_campaign_report \
  --campaign partner-a-2026 \
  --month 2026-09
```

Include the redeemed code, user telephone, purchased offer, order number,
original price, promotion discount, final price, and timestamps:

```bash
.venv/bin/python manage.py promotion_campaign_report \
  --campaign partner-a-2026 \
  --month 2026-09 \
  --details
```

Only `PaymentDiscountApplication.status=applied` rows count as effective paid
promotion purchases. Closed orders are released and full refunds are retained
as `refunded` audit rows rather than counted as current effective purchases.

## Admin Tables

- `PromotionCampaign`: channel/institution and campaign metadata.
- `PromotionCodeRecord`: one-time code, consumer, consumption time and scope.
- `UserCoupon`: issued, reserved, used, expired or revoked user coupon.
- `PaymentDiscountApplication`: immutable order price snapshot and discount
  lifecycle.
