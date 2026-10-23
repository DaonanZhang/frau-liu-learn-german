# Exam Preparation Referral Campaign Design

## Goal

Add a reusable, auditable referral campaign for users who have ever received
exam-preparation access. Each eligible user gets one personal code for this
campaign. A new exam-preparation learner can redeem that code for a CNY 5
exam-preparation-only coupon; when that exact coupon is used in a successfully
paid exam-preparation order, the referrer receives one month of
exam-preparation access and advances toward the one-time three- and five-person
video rewards.

The first campaign is identified internally as
`exam_preparation_referral_v1` and displayed as `备考季推广`.

## Scope

### Included

- One campaign-specific personal referral code for every user who has ever
  received an `exam_preparation` entitlement, regardless of how it was granted
  or whether it is currently active, expired, canceled, or refunded.
- Campaign-tagged referral-code redemption with self-referral protection,
  new-learner eligibility checks, coupon replacement, and confirmation.
- One CNY 5 no-minimum coupon restricted to exam-preparation purchases and
  stackable with the existing old-user discount.
- Referral qualification only after the issued coupon is actually applied to
  an exam-preparation order, payment succeeds, and the purchased entitlement
  is granted successfully.
- Unlimited one-month exam-preparation rewards, one for every valid referral.
- One-time three-person Science Season and five-person Vlog Season milestone
  rewards, including the CNY 10 substitute-coupon rule.
- Full-refund reconciliation for progress and rewards; payment failure,
  cancellation, closure, and partial refund behavior remain distinct.
- A battle-pass-style Profile panel, campaign history, and refund/reward
  notices.
- Inline activation-code, promotion-code, and referral-code redemption near
  the payment action on every module checkout page.
- A safe environment-variable rollout switch.
- Backfill of personal referral codes for existing eligible users.

### Excluded

- No badge models, badge selection, or badge UI. `推广达人` remains a future
  extension.
- No repeated Science or Vlog milestones after five valid referrals.
- No direct COS, media, learning-video import, or exam-content changes.
- No deletion or rewriting of existing operational promotion-code history.
- No change to the existing CNY 8 old-user discount.
- No browser verification unless explicitly requested.

## Campaign Configuration

The campaign has three identifiers:

- Stable internal tag: `exam_preparation_referral_v1`
- User-visible name: `备考季推广`
- Reserved code prefix: `BK1`

`PromotionCodeRecord.campaign_name` remains display and reporting text. It is
not used as the stable campaign identity. A separate machine-readable
`campaign_tag` identifies campaign rules and per-user participation.

The rollout switch is:

```text
EXAM_PREPARATION_REFERRAL_ENABLED=False
```

The code default is disabled. Production deployment must explicitly add
`EXAM_PREPARATION_REFERRAL_ENABLED=True` to the server `.env` when the campaign
is ready to launch.

Disabling the campaign:

- blocks new personal referral-code redemptions and replacements;
- does not delete personal codes, coupons, participation, progress, rewards,
  or history;
- does not revoke already earned rewards;
- allows a coupon that was validly issued before shutdown to finish its
  existing checkout and qualify normally;
- leaves the Profile panel readable with a clear `活动暂未开放` state.

The first campaign has no fixed start date, end date, code expiry, or issued
coupon expiry. A later campaign uses a new tag and a new reserved code prefix
rather than reusing either value.

## Eligibility

### Referrer eligibility

A user permanently unlocks the referral panel if the database contains any
historical `Entitlement` that covered exam preparation. A covering historical
entitlement is either:

- module-scoped or season-scoped to the module key `exam_preparation`; or
- platform-wide, represented by both `module` and `season` being null.

The source and current status do not matter. The entitlement may have come
from:

- an Alipay purchase;
- a Xiaohongshu purchase followed by activation-code redemption;
- another activation code;
- a gift or trial;
- a now-expired entitlement;
- a canceled entitlement left by a fully refunded purchase.

This eligibility is derived from existing entitlement history. No user-level
`has_referral_access` or `has_refunded_exam_preparation_purchase` flag is
added.

### Referred-user eligibility

The referred user must not have received any covering exam-preparation access
before the referred purchase order is created. Any such historical
entitlement, regardless of source or status, makes the user ineligible. The
same covering-scope definition used for referrer eligibility applies here,
including historical platform-wide access.

The check occurs when the referral code is redeemed and again while the
referred order is created. Both operations lock the referred user's database
row before checking eligibility. This serializes them with payment and
activation entitlement grants, which use the same user lock.

The order-creation check is the eligibility cutoff. When the paid order later
qualifies, the server verifies that there was no covering entitlement created
before that order. It explicitly excludes the entitlement whose external
reference is `alipay_payment:<current merchant order number>`. Entitlements
created after the referred order do not retroactively invalidate that order.
This prevents the current purchase from disqualifying itself and matches the
rule that only access obtained before the current purchase matters.

A user may participate once per campaign tag. A participation that reached a
successful paid purchase remains consumed even if that purchase is later fully
refunded. The user cannot join the same campaign again but may participate in
a future campaign with a different tag.

## Personal Referral Codes

Each eligible referrer has exactly one reusable personal code for the campaign.
The identity is the pair `(user, campaign_tag)`, so a future campaign gives the
same user a different code without adding another field to the `User` table.

The first campaign uses a human-readable shape such as:

```text
BK1-7K3M9P2QX
```

`BK1` identifies the campaign. The random suffix uses a cryptographically
secure generator and excludes visually ambiguous characters such as `0/O` and
`1/I`. The database, rather than collision probability alone, guarantees
uniqueness. Generation retries with a new suffix if insertion encounters the
global unique-code constraint.

Each personal code:

- is normalized uppercase plaintext, following the existing code system;
- never expires while the campaign record exists;
- is reusable by different eligible users;
- cannot be redeemed by its owner;
- issues a CNY 5 no-minimum `UserCoupon` scoped to the
  `exam_preparation` module;
- uses the normal stacking policy, so it stacks with the CNY 8 old-user
  discount when that discount is otherwise applicable;
- does not affect ordinary operational promotion codes.

Each campaign referral code has a one-to-one associated
`PromotionCodeRecord`. That existing record owns the visible code text and the
coupon mechanics: CNY 5 discount, zero minimum, exam-preparation scope,
unlimited validity, reusable redemption mode, and normal stacking policy. The
`ReferralCode` record owns the user and campaign identity. This lets the
existing `UserCoupon` and `PaymentDiscountApplication` foreign keys continue
to work without creating a parallel coupon engine.

`PromotionCodeRecord` gains a source kind with values `operational`,
`referral`, and `internal_reward`; existing rows migrate to `operational`.
Only operational records use the ordinary promotion redemption path. Referral
records require their one-to-one referral metadata and use campaign checks.
Internal reward records exist only to satisfy coupon audit relationships and
cannot be manually redeemed.

The existing staff promotion-code creation and reporting flows otherwise
remain unchanged. Campaign prefixes are reserved for referral routing, so
ordinary promotion-code and activation-code creation must reject a code
beginning with a registered referral prefix. Before launch, deployment must
also scan existing persisted activation and promotion codes for the selected
prefix and choose a different prefix if any collision already exists.

Existing staff promotion-code history and operational campaign reports exclude
non-operational promotion records unless a referral-specific report explicitly
requests them. This prevents one promotion record per user and system-generated
milestone coupons from polluting ordinary promotion-code batches and totals.

## Redemption and Replacement

For one campaign tag, a referred user may redeem different personal referral
codes before paying, but only one campaign coupon may remain active at a time.

### First redemption

The unified redemption service recognizes the reserved prefix, loads the
`PromotionCodeRecord` and its one-to-one `ReferralCode`, and derives the
campaign and referrer from that relationship. A promotion record linked to a
referral record must always use the referral redemption service and may never
fall through to unrestricted ordinary promotion-code redemption. The user does
not separately select an activity or send a trusted campaign tag from the
frontend.

The server then atomically verifies that:

- the campaign is enabled;
- the code is an active personal code for this campaign;
- the user is not the code owner;
- the user has no historical entitlement covering exam preparation;
- the user has no already completed, disqualified, or refunded participation
  in the campaign.

It then creates or updates the user's campaign participation and issues the
CNY 5 exam-preparation coupon.

### Re-entering the same code

Redeeming the currently active code again is idempotent. It does not create a
second coupon and returns a message that the campaign coupon has already been
received.

### Replacing with another code

If the user already has an available coupon from another code in the same
campaign, the first request returns a structured replacement-required response.
The frontend shows a confirmation modal explaining that the old campaign
coupon will become invalid. Only an explicit confirmed retry replaces it.

Replacement is atomic:

- the old coupon is marked revoked with a replacement reason;
- its history remains available for audit;
- the participation points to the new referrer, code, and coupon;
- the new coupon is issued only after the old one is successfully revoked.

If the current coupon is reserved by an open payment, replacement is blocked.
The user must finish or close the pending order first. If the coupon has been
used, the campaign relationship is locked and cannot be replaced.

If B replaces A's code with C's code before paying, only C may receive credit.

### Explicit failures

- Self referral: `不能兑换自己的推广码。`
- Existing exam-preparation history: `你已经获得过备考季权限，无法参加本次推广活动。`
- Campaign already completed or refunded: `你已经参加过本次推广活动。`
- Coupon reserved by a pending order: explain that the pending order must be
  handled first.
- Campaign disabled: `备考季推广活动暂未开放。`

These are structured API outcomes, not frontend string matching.

## Qualification and Payment Flow

A code redemption alone never advances progress. One referral qualifies only
when all conditions are true:

1. B was eligible for this campaign when the referral coupon was issued.
2. B creates an order for an `exam_preparation` offer.
3. That exact campaign-issued CNY 5 coupon is reserved and applied to the
   order.
4. Alipay confirms the order as paid.
5. The order's `PaymentGrantTask` successfully grants B's exam-preparation
   entitlement.
6. At order creation, B had no covering entitlement created before that order;
   the entitlement produced by the current payment is excluded from this
   check.

The campaign participation state machine is:

```text
open -> payment_reserved -> reward_pending -> qualified
  |            |                  |
  +------------+------------------+-> refunded
                               \----> disqualified
```

When the purchased entitlement is granted, the same database transaction
links the qualifying payment and moves the participation to `reward_pending`
before the `PaymentGrantTask` becomes successful. After commit, a referral
worker grants A's progress and rewards in its own transaction and moves the
participation to `qualified`. A scheduled reconciliation retries every
`reward_pending` record, so a queue outage or reward error cannot lose the
referral and does not delay B's paid access.

Qualification uses the payment, discount application, coupon, promotion code,
referral code, participation, and grant task as one auditable chain. An
inconsistent legacy or manually modified chain is marked `disqualified`
rather than rewarded.

Database uniqueness and row locks guarantee that repeated Alipay callbacks,
status polling, Celery retries, or concurrent requests cannot qualify the same
user twice or issue duplicate rewards.

Payment failures, canceled payments, closed payments, and timeouts:

- release the coupon reservation through the existing payment lifecycle;
- do not advance or reduce referral progress;
- do not close campaign participation;
- allow the user to retry payment or replace the referral code later.

A failed entitlement grant after a confirmed payment is not a payment failure.
Its coupon remains consumed and its participation waits for the existing
durable entitlement-grant retry. It can become `reward_pending` only after that
grant succeeds.

Partial refunds keep the referral, progress, and rewards unchanged.

## Progress and Rewards

The effective referral count is the number of qualified, non-fully-refunded
participations currently attributed to the referrer. It is not capped.

### Per-referral reward

Every valid referral, including the sixth and every later referral, grants 30
days of exam-preparation access. This reward is independent of both milestones.

The visible timed-access balance follows the existing extension rule:

```text
credit target = max(now, current effective expiry) + 30 days
```

Each credit has an immutable reward-ledger entry tied to the qualifying
participation. The ledger provides auditability and idempotency; the product
treats exam-preparation time as one fungible balance rather than presenting
separate purchased and rewarded balances.

If the user has covering permanent exam-preparation access, the 30-day reward
is still recorded in the ledger but does not change the visible permanent
expiry and is not converted into another coupon.

### Three-person milestone

When the effective count first reaches three:

- grant permanent Science Season access if the user does not currently have
  covering permanent Science Season access;
- otherwise issue one permanent CNY 10 no-minimum coupon usable across all
  modules.

Temporary, expired, or canceled Science Season access does not trigger the
coupon substitute; it is upgraded to permanent access.

### Five-person milestone

When the effective count first reaches five:

- grant permanent Vlog Season access if the user does not currently have
  covering permanent Vlog Season access;
- otherwise issue one permanent CNY 10 no-minimum coupon usable across all
  modules.

Temporary, expired, or canceled Vlog Season access does not trigger the coupon
substitute; it is upgraded to permanent access.

### Counts above five

Science and Vlog rewards do not repeat after five. Every later valid referral
continues to increase the effective count and grant another 30 days of
exam-preparation access.

## Full Refund Reconciliation

Only a confirmed full refund triggers referral reversal. A failed, canceled,
closed, expired, or partially refunded order never runs this flow.

The existing Alipay callback and scheduled reconciliation remain the refund
source of truth. Referral reconciliation has its own durable marker on the
participation/reward records and does not reuse
`refund_entitlement_reconciled_at`, which only describes revocation of B's
purchased entitlement. A scheduled job retries fully refunded referral
payments whose referral effects have not been reconciled.

For any fully refunded order that used the campaign referral coupon:

1. Mark B's campaign participation as refunded and permanently closed for this
   campaign tag.
2. If the participation is still `payment_reserved` or `reward_pending`, cancel
   pending referral work and do not add or subtract progress or rewards.
3. If the participation is `qualified`, remove it from A's effective count and
   debit the associated 30-day reward exactly once.
4. Re-evaluate the three- and five-person milestones only if qualified progress
   was removed.
5. Create an unread user notice and a permanent Profile history event only for
   effects that actually occurred.

Once the payment is fully refunded, a delayed `PaymentGrantTask` or referral
worker may not qualify the participation. B remains unable to join this
campaign again even when the refund happened before A received progress.

### Thirty-day debit

The product does not attribute the user's visible remaining days to a specific
purchase or reward. The debit rule is:

```text
debit target = min(
    current effective expiry,
    max(refund-day floor, current effective expiry - 30 days)
)
```

The outer `min` guarantees that a refund can never extend access. The debit
never moves access into the past and never creates a debt. If the account has
fewer than 30 future days, only the removable future balance is removed. If
access has already expired, no time is removed. A future purchase then follows
the normal rule: extend from the current expiry when still valid, otherwise
start from the purchase time.

The implementation may adjust timed entitlement rows to materialize the target
expiry, but it must preserve the immutable referral reward/debit ledger and
must never shorten unrelated module or platform-wide access.

The refund-day floor is the end of the calendar day in the configured Alipay
business timezone. This avoids terminating an active learning session
immediately while keeping the rule deterministic on the server.

### Milestone rollback

If the effective count falls below three or five:

- a milestone-granted permanent entitlement is canceled;
- an unused CNY 10 substitute coupon is revoked;
- a used substitute coupon cannot be reclaimed and permanently settles that
  milestone.

A substitute coupon reserved by an open payment is neither unused nor finally
used. The milestone enters `revocation_pending` without invalidating the open
order:

- if the payment succeeds, the coupon becomes used and the milestone is
  permanently settled;
- if the payment fails or closes while the effective count is still below the
  threshold, the released coupon is immediately revoked and the milestone may
  be reissued after a later threshold crossing;
- if the effective count reaches the threshold again before the payment
  resolves, clear `revocation_pending`; the same coupon continues to represent
  the milestone and no duplicate reward is issued.

If a milestone reward was successfully revoked and the referrer later reaches
the threshold again, the reward is issued again. If its substitute coupon was
already used and could not be revoked, crossing the threshold again does not
issue another reward.

A new valid referral after any rollback always earns a new 30-day reward,
including when the total remains above five.

## Data Model Boundaries

The implementation should follow the existing account and coupon models rather
than create a parallel discount engine.

### Campaign referral codes

A dedicated referral-code record stores:

- owning user;
- stable campaign tag;
- reserved campaign prefix;
- a one-to-one link to the reusable `PromotionCodeRecord` that stores the
  normalized visible code and coupon terms;
- creation timestamp and active state.

Database constraints enforce both:

- exactly one referral record for each `(user, campaign_tag)` pair;
- one referral record per linked promotion record;
- global uniqueness of the full code text through the existing
  `PromotionCodeRecord.code` constraint.

This data does not live as one field per campaign on the `User` table. A new
campaign creates new rows instead of requiring another user-schema migration.
Existing ordinary `PromotionCodeRecord` rows retain their behavior. The reverse
one-to-one relation is what distinguishes referral records from ordinary
promotion codes and preserves referrer attribution on every issued coupon.
The promotion record's source kind provides explicit routing and reporting
guards; referral metadata remains the authoritative user/campaign identity.

### Campaign participation

A dedicated participation record stores one row per `(campaign_tag,
referred_user)` with:

- current referrer, personal code, and issued coupon;
- state covering open, payment-reserved, reward-pending, qualified,
  disqualified, and refunded/closed participation;
- qualifying payment and timestamps;
- an independent referral-refund reconciliation marker;
- replacement and lifecycle audit timestamps.

The unique campaign/user key enforces one completed use per campaign while
allowing confirmed coupon replacement before purchase.

Revoked `UserCoupon` rows preserve every earlier code redemption, so coupon
replacement history is not deleted.

### Reward ledger

A referral reward ledger stores:

- campaign tag and referrer;
- triggering participation or milestone;
- reward kind and amount;
- linked entitlement or coupon when applicable;
- granted, revocation-pending, revoked, consumed/non-reversible, and reissued
  state;
- timestamps and a unique idempotency identity.

The ledger is the source of truth for whether a callback may add or subtract
time and whether a milestone can be issued again. It does not expose separate
time wallets to the user.

### Notices and history

Referral events provide:

- an unread/read state for one-time global notices;
- permanent Profile history;
- event type and safe display payload describing progress and reward changes.

No telephone number, payment credentials, or private identity of the referred
user is exposed to the referrer. History may use neutral labels such as
`一位新用户完成购买` and `一笔推广订单已退款`.

## API Shape

The exact serializer naming may follow repository conventions, but the API
must provide these capabilities:

- Read the current user's campaign eligibility, enabled state, personal code,
  effective count, five-node progress, reward state, and history.
- Redeem any activation, promotion, or campaign referral code through the
  existing unified code endpoint. Referral lookup derives its campaign from
  the stored code record before issuing a coupon.
- Return structured referral errors and a structured replacement-required
  outcome.
- Confirm replacement explicitly; never infer confirmation from a repeated
  request.
- Read unread referral notices and mark a shown notice read.
- Re-fetch coupon choices after inline checkout redemption.

Code creation is centralized in an idempotent
`ensure_referral_code(user, campaign)` service. It creates the linked promotion
and referral rows atomically, follows the same user-first lock order as
redemption, and retries random-code collisions.

Normal payment and activation grants call this service after committing any
new entitlement that covers exam preparation, including platform-wide access.
Existing eligible users are handled by the deployment backfill command. As a
repair path for administrator-created or otherwise out-of-band entitlements,
the Profile referral response may call the same idempotent service when an
eligible user is missing a code. Database uniqueness keeps concurrent grant,
backfill, and Profile requests from creating duplicates.

## Existing-User Backfill

Provide an idempotent management command that:

- finds every user with any historical entitlement covering exam preparation,
  including platform-wide entitlement history;
- creates the missing personal code for
  `exam_preparation_referral_v1`;
- never changes an existing personal code;
- never generates codes for users without entitlement history;
- uses the reserved `BK1` prefix and secure random suffix generation;
- retries the extremely unlikely suffix collision while relying on the
  database unique constraint as the final guarantee;
- reports created, existing, skipped, and failed counts;
- supports a dry run.

Before generating codes, the command checks whether any persisted activation
or promotion code already begins with `BK1-`. A detected collision aborts the
run without partial generation so the operator can choose another prefix.
Every generated candidate is also checked through the existing activation-code
lookup, including the legacy store, before insertion.

The production runbook must place the command after database migration and
before enabling `EXAM_PREPARATION_REFERRAL_ENABLED=True`.

## Profile Experience

### Eligible state

The Profile page gains a visually prominent referral panel between personal
details and the coupon wallet. It includes:

- the campaign name and concise rule summary;
- the personal code with copy and native-share actions;
- total successful referrals with no maximum;
- a five-node horizontal reward path;
- smaller nodes for referrals one, two, and four;
- larger reward nodes at three and five;
- reward status and a compact event history.

After five referrals, all five nodes remain filled. The panel separately shows
the true count, for example `已成功推广 12 人`, and continues to emphasize
`每成功推广 1 人，备考季 +30 天`.

The third node represents permanent Science Season access or its CNY 10
substitute. The fifth represents permanent Vlog Season access or its CNY 10
substitute. Rewards are automatic; there is no claim button.

### Locked state

Users with no historical entitlement covering exam preparation see the same
panel in a muted locked state. Clicking it opens a short modal:

```text
获得备考季权限后即可解锁推广系统。
```

The action routes to the exam-preparation purchase page. The locked panel does
not generate or reveal a personal code.

### Visual direction

The panel should feel like a restrained battle pass rather than a casino:

- strong depth, progression, and milestone contrast;
- no decorative copy that merely restates features;
- progress and rewards remain readable without animation;
- brief transform/opacity transitions only for occasional modal, copy, and
  newly completed milestone feedback;
- press feedback uses subtle scale and transitions stay under 300 ms;
- hover treatment is limited to fine-pointer devices;
- `prefers-reduced-motion` removes movement without hiding state changes.

Desktop, iPad/tablet, and mobile layouts are designed together. The five nodes
remain legible on narrow screens without overlapping; code copy/share actions
remain at least 44 CSS pixels high.

## Checkout Redemption Experience

Every module checkout page adds a compact `兑换代码` control next to the
payment area. It accepts activation codes, ordinary promotion codes, and
personal referral codes through the existing unified redemption API.

### Activation code result

- Reload the authenticated user after success.
- If the new entitlement covers the module currently being purchased,
  immediately leave checkout and navigate to that module's landing page.
- Platform-wide activation also counts as covering the current module.
- If the activation applies only to another module, stay on checkout and show
  its actual scope.

### Promotion or referral result

- Stay on checkout.
- Re-fetch coupon choices for the current offer.
- Automatically select the newly issued coupon when it is applicable.
- If it is not applicable, keep the current selection and explain the coupon's
  scope.
- Referral replacement uses the required confirmation modal before the old
  coupon is revoked.

The standalone `/redeem-code` page remains available. Its heading, helper
copy, success messages, and errors explicitly cover `激活码、优惠码或推广码`.

## User Notices

When a refund changes a referrer's progress or rewards:

- create one unread referral notice;
- show it once as a modal on the next authenticated page load;
- mark it read only after the user acknowledges it;
- retain the same event permanently in the Profile referral history.

The notice states:

- that a referred purchase was fully refunded;
- the new effective progress;
- whether up to 30 days were removed and the resulting expiry;
- whether a Science/Vlog entitlement or unused CNY 10 coupon was revoked;
- whether a used milestone coupon could not be reclaimed.

Notices never describe payment failure as a refund and never expose B's
identity.

## Security, Consistency, and Operations

- All redemption, replacement, qualification, reward, and refund transitions
  use database transactions and row locks.
- Operations concerning B lock B's user row before participation, coupon, and
  payment rows. Reward and refund operations concerning A run separately and
  lock A's user row before campaign reward rows. This consistent user-first
  order prevents entitlement/redemption races and reduces deadlock risk.
- Unique constraints enforce one personal code per referrer/campaign, global
  referral-code uniqueness, and one participation per referred user/campaign.
- Reserved campaign prefixes route referral codes without a separate activity
  selector; ordinary code creation cannot claim those prefixes.
- Every reward credit and debit has an idempotency key derived from its
  participation and lifecycle action.
- Server-side pricing remains authoritative; the frontend never sends an
  amount.
- Coupon applicability and stacking are revalidated while creating the order.
- Self-referral uses authenticated user IDs, never visible names or code text.
- Existing redemption throttling remains active.
- Admin/support views expose campaign tag, referrer, referred user,
  participation state, qualifying order, reward state, and timestamps without
  weakening normal-user privacy.
- Existing Alipay refund reconciliation remains the source of truth. This
  feature does not reinterpret failed or closed orders as refunds.
- Referral reward-pending and refund-pending records are independently
  recoverable and observable; queue delivery is an optimization, not the only
  path to completion.

## Testing Strategy

### Eligibility and code generation

- Every historical exam-preparation entitlement status/source unlocks a code.
- Historical platform-wide entitlements also unlock A and disqualify B.
- No entitlement history keeps the panel locked.
- Backfill is dry-run capable and idempotent.
- Concurrent creation produces one personal code.
- Different campaigns produce different codes for the same user without
  changing the `User` schema.
- Generated codes remain globally unique and reserved prefixes cannot be used
  by ordinary promotion or activation codes.
- Existing-code prefix collisions abort backfill before any codes are created.
- Payment, activation, backfill, administrator-created entitlement repair, and
  concurrent Profile reads all converge on one code through the idempotent
  creation service.
- Disabled campaign blocks new redemption but preserves existing data.

### Redemption and replacement

- Self-referral is rejected.
- Any historical module-specific or platform-wide entitlement covering exam
  preparation makes B ineligible at redemption and order creation.
- First redemption issues one correctly scoped, stackable CNY 5 coupon.
- A referral-linked promotion record cannot bypass campaign checks through the
  ordinary promotion redemption path.
- Internal reward promotion records cannot be entered in the public redemption
  endpoint.
- Every referral code has exactly one linked promotion record and issued
  coupons retain that attribution.
- Same-code retry is idempotent.
- Different-code redemption requires explicit confirmation.
- Confirmed replacement revokes the old available coupon and issues one new
  coupon atomically.
- Reserved and used coupons cannot be replaced.
- Ordinary operational promotion codes retain existing behavior.
- Existing staff promotion-code history and reports include only operational
  promotion records by default.

### Qualification

- Redemption without purchase does not count.
- Purchase without the exact referral coupon does not count.
- Referral coupon used for a non-exam offer is rejected.
- Failed, closed, canceled, and pending payments do not count.
- Paid payment with failed entitlement grant does not count until the grant
  retry succeeds.
- The entitlement created by the current referred order does not disqualify
  itself.
- A covering entitlement created before order creation disqualifies B; one
  created after order creation does not retroactively disqualify that order.
- Concurrent redemption, order creation, and activation serialize on B's user
  row and produce the same result as some sequential ordering.
- Repeated callbacks and retries count once.
- A referral in `reward_pending` survives queue failure and is retried.
- One B cannot qualify twice in the same campaign.

### Rewards

- Each effective referral grants 30 days with no count cap.
- Sixth and later referrals continue granting 30 days.
- Three grants Science lifetime or the CNY 10 substitute exactly as specified.
- Five grants Vlog lifetime or the CNY 10 substitute exactly as specified.
- Temporary, expired, and canceled video access receives lifetime rather than
  the substitute coupon.
- Counts above five do not repeat milestone rewards.
- Permanent exam access records each monthly reward without changing its
  visible expiry.

### Refunds

- Full refund closes B's campaign participation, decreases A's effective
  count, and applies one idempotent 30-day debit only if A was already
  rewarded.
- Full refund before qualification closes B permanently but neither credits nor
  debits A.
- A partial refund followed later by a full refund retains rewards at the
  partial stage and reconciles them exactly once at the full stage.
- Referral refund reconciliation retries independently from purchased-access
  revocation.
- Debit never extends access, never moves expiry before the refund-day floor,
  and never touches unrelated module/platform access.
- Partial refund retains progress and rewards.
- Failed, canceled, and closed payments never run referral reversal.
- Falling below milestones revokes lifetime rewards or unused substitute
  coupons.
- Used substitute coupons remain consumed and prevent duplicate reissue.
- Reserved substitute coupons enter revocation-pending; payment success settles
  them, payment failure revokes them only if the count remains below the
  threshold, and re-crossing cancels the pending revocation.
- Successfully revoked milestones are reissued after the threshold is reached
  again.
- Refund notices are created once and retain permanent history.

### Frontend

- Locked, eligible, disabled, loading, and error panel states render.
- Five-node progress works at counts 0, 1, 2, 3, 4, 5, and above 5.
- Copy/share behavior has an accessible fallback.
- Inline checkout redemption handles activation, promotion, referral,
  replacement confirmation, applicability, and current-module navigation.
- Refund modal is shown once and Profile history remains available.
- Desktop, tablet, and mobile CSS prevents overlap and horizontal breakage.
- Reduced-motion behavior preserves state clarity.

### Regression

- Existing account, entitlement, promotion, and Alipay tests.
- Existing coupon wallet and checkout tests.
- Frontend Profile, Navigator, checkout, activation, routing, and API tests.
- Django system checks and migration consistency checks.
- Frontend production build.

## Deployment Sequence

1. Keep `EXAM_PREPARATION_REFERRAL_ENABLED=False` or absent.
2. Deploy backend schema, services, APIs, refund integration, and frontend.
3. Apply database migrations.
4. Run the reserved-prefix collision check for `BK1-`; stop and select another
   prefix if any existing activation or promotion code matches.
5. Run the personal-code backfill in dry-run mode.
6. Review counts, then run the actual backfill.
7. Verify Celery worker and beat are running so payment, reward-pending, and
   refund-pending reconciliation remain active.
8. Add `EXAM_PREPARATION_REFERRAL_ENABLED=True` to the server `.env` and
   restart the affected application processes.
9. Verify one eligible Profile, one locked Profile, code redemption, coupon
   selection, a local/test payment, and refund reconciliation logs.

The final implementation handoff must explicitly remind the operator about
the `.env` variable and backfill command.

## Acceptance Criteria

1. Any user who has ever held module-specific or platform-wide access covering
   exam preparation receives exactly one globally unique personal code for
   this campaign; users without such history see a locked panel. Future
   campaigns create another `(user, campaign)` code row rather than adding
   fields to `User`.
2. Self-referral and previously entitled B users cannot participate.
3. B may replace an unused campaign coupon only after explicit confirmation;
   one active coupon and one completed participation exist per campaign.
4. Only a paid, successfully granted exam-preparation order using the exact
   issued referral coupon increments A's progress. Eligibility considers only
   covering access created before that order and excludes the current order's
   entitlement.
5. Every valid referral grants 30 days without a cap; three and five grant the
   separate one-time video rewards or their defined substitutes.
6. Full refunds, and only full refunds, close B's participation. They reduce
   progress, debit up to 30 days without debt or accidental extension, and
   reconcile milestones only when rewards had already been issued.
7. Payment failure, cancellation, closure, timeout, and partial refund never
   trigger referral rollback.
8. Existing promotion codes, coupon pricing, old-user discounts, and payment
   security remain unchanged.
9. Checkout supports immediate activation/promotion/referral redemption on all
   module purchase pages.
10. Refund effects are communicated once globally and remain visible in
    Profile history.
11. The panel is attractive, legible, and usable on desktop, iPad/tablet, and
    mobile, including reduced-motion users.
12. The campaign stays disabled until the production `.env` explicitly enables
    it.
