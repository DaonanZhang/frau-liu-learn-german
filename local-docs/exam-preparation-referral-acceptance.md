# Exam Preparation Referral Acceptance

## Contract

- Module scope: `exam_preparation`.
- Referral campaign tag: `exam_preparation_referral_v1`.
- Reserved referral-code prefix: `BK1-`.
- `EXAM_PREPARATION_REFERRAL_ENABLED` defaults to `False`; an unset or missing
  setting is also disabled.
- Badge work is fully deferred. This acceptance does not cover adding,
  displaying, or verifying a referral badge.

## Automated validation

Run from the repository root unless the command changes directory.

| Command | Expected | Actual (2026-10-24) | Blocker |
| --- | --- | --- | --- |
| <code>rg --files apps/accounts &#124; rg '^apps/accounts/tests_referral.*\.py$' &#124; sed 's#/#.#g;s#\.py$##' &#124; xargs .venv/bin/python manage.py test --settings=config.settings_sqlite_test -v 1</code> | Referral backend test modules pass. | 373 passed, 1 skipped. | 无。 |
| Focused terminal reconciliation, hook, and milestone-resolution tests | Terminal repair paths pass. | 37 passed. | 无。 |
| Canceled-lifetime refund focused suites | Both canceled-lifetime refund suites pass. | 56 passed. | 无。 |
| `.venv/bin/python manage.py test --settings=config.settings_sqlite_test` | 全量 backend suite 结果留作审查，不以定向结果代替。 | 529 tests，17 errors；未通过。 | 既有 `apps.accounts.tests_migrations` 将 schema 停在 0026 后，当前 User 在 migration 0038 才添加字段 `has_seen_b2_schreiben_guide`，旧测试单独运行可复现。非推广改动引入；推广定向套件通过。 |
| `cd frontend && npm test -- --run src/api/referrals.test.js src/components/ReferralCampaignPanel.test.jsx src/components/ReferralNoticeModal.test.jsx src/components/CheckoutCodeRedemption.test.jsx src/pages/ModuleCheckoutPage.test.jsx src/pages/ActivateEntitlementPage.test.jsx src/layouts/AppLayout.test.jsx src/pages/ProfilePage.test.jsx src/api/auth/auth.test.js src/utils/modulePurchaseRedeem.test.js` | Promotion/referral frontend tests pass. | 10 files, 127 tests passed. | 无。 |
| `cd frontend && npm test` | 全量 frontend suite 结果留作审查。 | 48 files；482 passed, 1 failed；未通过。 | 未修改的 TELC 测试 `keeps part arrows available when listening autoplay is rejected` 等待超时；该文件随后单独连续两次均 85/85 通过，记录为 flaky、非推广 blocker。 |
| `.venv/bin/python manage.py check --settings=config.settings_sqlite_test` | Django reports no system-check issues. | 通过，0 issues。 | 无。 |
| `.venv/bin/python manage.py makemigrations --check --dry-run --settings=config.settings_sqlite_test` | No model changes are missing migrations. | 通过，无 changes。 | 无。 |
| `cd frontend && npm run lint` | ESLint reports no errors. | 失败：未修改的 `src/App.jsx` 有 2 errors，`src/pages/examPreparation/ExamPreparationWritingDetailPage.jsx` 有 1 error；另有 warnings。 | 非推广文件的既有 lint errors。 |
| `cd frontend && npx eslint src/api/auth/auth.js src/api/auth/auth.test.js src/api/referrals.js src/api/referrals.test.js src/components/CheckoutCodeRedemption.jsx src/components/CheckoutCodeRedemption.test.jsx src/components/ReferralCampaignPanel.jsx src/components/ReferralCampaignPanel.test.jsx src/components/ReferralNoticeModal.jsx src/components/ReferralNoticeModal.test.jsx src/layouts/AppLayout.jsx src/layouts/AppLayout.test.jsx src/pages/ActivateEntitlementPage.jsx src/pages/ActivateEntitlementPage.test.jsx src/pages/Home.jsx src/pages/Homepage/ModuleEntryCard.jsx src/pages/Homepage/VideoGrid.jsx src/pages/LexiconPage/LexiconPage.jsx src/pages/ModuleCheckoutPage.jsx src/pages/ModuleCheckoutPage.test.jsx src/pages/ProfilePage.jsx src/pages/ProfilePage.test.jsx src/utils/examPreparationTrial.js src/utils/modulePurchaseRedeem.js src/utils/modulePurchaseRedeem.test.js` | Changed referral frontend files pass ESLint. | 显式文件列表检查退出 0，0 errors。 | 无。 |
| `cd frontend && npm run build` | Vite production build completes. | 通过；有 >500k chunk warning。 | 无；记录 build warning。 |
| `git diff --check` | No whitespace errors are reported. | 通过。 | 无。 |

## Business edge matrix

以下矩阵按 `exam_preparation_referral_v1` 活动验证。持久化指参与、优惠券、订单、支付优惠应用、支付授权任务和权限记录；可观察结果包括兑换响应、订单/回调状态及活动资格。

| 场景 | Setup | Action | Expected persistence | Expected observable |
| --- | --- | --- | --- | --- |
| 推荐人当前有备考季权限 | 推荐人有 `exam_preparation` 模块权限，`Entitlement.status=active`，且当前未过期；用户尚无活动码 | 查询或生成活动码 | 同一用户与活动至多一条 `ReferralCode`；对应 `PromotionCodeRecord.source_kind=referral`、`code` 前缀 `BK1-` | 推荐人符合发码资格 |
| 推荐人权限已过期 | 推荐人有备考季权限记录，`status=expired` 或 `expires_at` 已过 | 查询或生成活动码 | 依然最多一条活动码，不因过期重建重复记录 | 仍符合发码资格，历史拥有即满足 |
| 推荐人权限已撤销 | 推荐人有备考季权限记录，`status=canceled` | 查询或生成活动码 | 依然最多一条活动码 | 仍符合发码资格 |
| 推荐人曾有平台权限 | 推荐人有平台级权限记录（`module`、`season` 均为空），无论其当前状态 | 查询或生成活动码 | 依然最多一条活动码 | 仍符合发码资格 |
| 推荐人从未有权限 | 推荐人没有备考季或平台级权限记录 | 查询或生成活动码 | 不创建 `ReferralCode` 或关联推广码 | 不符合发码资格 |
| 兑换人从未有备考季权限 | 兑换人无备考季权限历史、未参加该活动；活动开启且码有效 | 兑换他人的 `BK1-` 活动码 | 创建唯一活动 `ReferralParticipation(status=open)` 和 `UserCoupon(status=available)`，优惠金额 ¥5、适用 `exam_preparation` | 返回领取成功；可用于备考季订单 |
| 订单创建前曾有权限 | 兑换人有备考季或平台级 `Entitlement`，其 `created_at < payment.created_at`；已领取活动券 | 用券创建备考季订单 | 不把该订单记为合格订单；参与资格转为 `disqualified`（错误为 `Referral qualification is not eligible`） | 即使权限现为过期或撤销，也不能以此订单计入推荐奖励 |
| 权限记录与订单同刻或晚于订单 | 兑换人相关权限记录 `created_at >= payment.created_at`（包括恰好同刻），该记录由本次购买授予时按订单 `merchant_order_no` 排除 | 用活动券创建并支付备考季订单，成功授予权限 | 可进入 `payment_reserved`，随后 `reward_pending`；成功后转 `qualified` | 资格只检查订单 `created_at` 之前的权限历史，不被本订单事后授予反向否决 |
| 每用户每活动仅能绑定一个推荐人 | 用户已在本活动领取 A 的券（`open`）；准备通过 B 再兑换 | 首次请求 B（不确认），再以 `confirm_replace=true` 重试 | 首次不写库，返回 replacement metadata；确认后撤销旧券（`status=revoked`、`revocation_reason=referral_code_replaced`），创建新可用券并将唯一 participation 绑定 B | 用户每活动仍只有一条 participation；显示确认换码信息，确认后显示新码已领取 |
| 自我推荐 | 当前用户兑换其本人名下有效活动码 | 提交兑换 | 不创建或更改 participation/coupon | 返回 `self_referral`；提示不能兑换自己的推广码 |
| 已有备考季权限者兑换 | 用户曾拥有备考季权限（包括已过期或已撤销），但尚无本活动 participation | 兑换他人的活动码 | 不创建 participation 或 coupon | 返回 `existing_exam_preparation_access` |
| 普通运营码兑换 | 普通码 `source_kind=operational`，不使用保留的 `BK1-` 前缀 | 按普通运营码流程兑换 | 使用既有普通码逻辑；不创建 referral participation | 不应用推荐活动的自推、每活动一次或权限历史限制 |
| 只有精确活动券和完整成功订单计入 | 券、优惠应用、订单、活动 participation 均属于同一用户；券和推广记录均为 `referral`、¥5、无最低金额、仅 `exam_preparation`；订单支付为 `paid`，对应 `PaymentGrantTask.status=succeeded` | 处理支付授权完成 | participation 依次为 `payment_reserved`、`reward_pending`、`qualified`，关联合格 payment；该 participation 的合格记账只建立一次 | 缺少支付成功或授权成功任一条件时不计入推荐奖励 |
| 错券或错模块不计入 | 活动参与订单应用普通券/其他券，或券、应用、offer 模块不一致/不属于 `exam_preparation`，或金额不是精确 ¥5 | 处理创建、支付或授权回调 | 不建立合格 participation/payment 关联；不发推荐奖励 | 订单不会计入活动；普通优惠仍按其自身规则处理 |
| 支付失败后释放，可重新购买 | 合格券已被订单占用，payment 进入 `failed` 或 `closed` | 执行失败支付释放，再次创建备考季订单 | 旧占用释放，participation 回到 `open`，清空合格 payment 与 `order_created_at`；券恢复可用 | 用户可重新购买；失败订单不计入推荐奖励 |
| 部分退款保留资格 | 已合格订单及其支付进入 `partially_refunded` | 执行退款对账或重复处理支付回调 | 保留 `qualified` 参与和已授予的资格记录 | 部分退款不撤销推荐资格 |
| 重复支付/授权回调幂等 | 同一合格 payment、授权任务和活动 participation 已处理一次 | 重放相同成功回调或重复运行对账 | 仍关联同一 payment；不增加重复 participation、奖励或授权任务 | 状态保持一致，第二次处理不重复计数 |

## 奖励、退款与通知矩阵

| 场景 | Setup | Action | Expected persistence | Expected observable |
| --- | --- | --- | --- | --- |
| 每个有效推荐分别奖励 30 天（1/3/5/6+） | 推荐人分别有 0、2、4、5 名 `qualified` 推荐；新参与者已用本人活动券完成合格订单，`PaymentGrantTask.status=succeeded` | 完成支付授权并处理 `reward_pending` | 每个 `qualified` participation 各有唯一 `ReferralReward(kind=referral_month, status=granted, amount_days=30, generation=1)` 及对应 30 天 `exam_preparation` entitlement；计数到 3、5 时另按里程碑行处理，超过阈值的每个新推荐仍新增自己的 30 天奖励 | 推荐资格历史每次增加 1；通知 `referral_qualified` 的 payload 仅含 `days=30` 和更新后的 `effective_count` |
| 曾发生退款后再次推荐 | 一名推荐已全额退款，状态为 `refunded`；推荐人随后获得新的有效推荐 | 完成新推荐的支付授权 | 退款参与不计入有效数；新参与转 `qualified`，另建其独立 30 天 `ReferralReward`，不复用退款记录的奖励 | 有效数按新资格增加 1，显示新推荐奖励；此前退款历史仍保留 |
| 3 人 Science lifetime 里程碑 | `effective_count` 从 2 增至 3；对应 Science（`learning_by_video` season 1）没有既有覆盖权限 | 处理第 3 个合格推荐 | 建立 `science_3`、threshold 3、generation 1 的 `ReferralReward(status=granted)`，关联 season 1 lifetime entitlement | milestone 状态显示 `earned`；生成里程碑通知，字段为 threshold、kind、reward_type |
| 5 人 Vlog lifetime 里程碑 | `effective_count` 从 4 增至 5；对应 Vlog（`learning_by_video` season 4）没有既有覆盖权限 | 处理第 5 个合格推荐 | 建立 `vlog_5`、threshold 5、generation 1 的 `ReferralReward(status=granted)`，关联 season 4 lifetime entitlement | milestone 状态显示 `earned`；生成对应里程碑通知 |
| 已有对应视频季权限则发 ¥10 全模块券 | 达到 3 或 5 人里程碑；推荐人已有对应 season 的权限 | 对账里程碑 | milestone reward 关联 `UserCoupon(status=available)`，金额 ¥10、无最低消费，`applicable_module`、`applicable_season`、`applicable_offer` 均为 `null`；券为无门槛全模块券，Science/Vlog 仅表示触发来源；generation 与奖励账本唯一 | 显示可使用的 ¥10 无门槛全模块券及对应里程碑 |
| 全额退款发生在资格建立前 | 推荐订单全额退款，参与处于 `payment_reserved`、`reward_pending` 或 `disqualified`，尚无 `qualified_at` 或月奖励 | 将支付和支付优惠应用对账为 `refunded`，执行退款 reconcile | participation 变为 `refunded`，设置 `refunded_at`、`refund_reconciled_at`；不创建 30 天奖励，不减少有效人数或里程碑 | 不产生奖励通知或退款全局通知；该人不计入有效推荐 |
| 全额退款发生在资格建立后 | 参与已 `qualified`，对应订单全额退款且 30 天奖励仍有效 | 执行退款 reconcile | participation 变 `refunded` 并从有效数扣 1；该 30 天奖励撤销。账户备考季所有有效定时权限按总到期日统一减 30 天，不区分剩余期限来自付费还是奖励；按新有效数重算里程碑 | 创建未确认的全局 `referral_refunded` 通知，说明有效人数变化、实际扣除天数和新到期日 |
| 全额退款扣减底线与共享/终身权限 | 推荐人剩余有效备考权限短于 30 天、已到期，或另有终身权限 | 对合格推荐执行全额退款 reconcile | 定时权限总到期日扣减后不得早于 `ALIPAY_TIME_ZONE` 当天 `23:59:59.999999`；不足 30 天时到当天结束，用户当日仍可用，不形成欠费。全局终身权限保持不变，不能因撤销月奖励删除共享终身记录 | 退款历史的 `days_removed` 反映实际变化（可为 0），`access_expires_at` 反映扣减后的有效到期；终身权限仍可用 |
| 部分退款或支付失败不回退奖励 | 已合格订单分别进入 `partially_refunded`；或未合格订单进入 `failed`/`closed` | 运行退款对账、失败释放及重复回调 | 部分退款不改变 `qualified`、月奖励或已授里程碑；未成功授权的失败/关闭订单释放支付占用，不创建合格资格或奖励 | 不因部分退款或失败产生全额退款通知；失败用户仍可重新购买 |
| 退款使有效人数跌破 3/5，撤销未使用里程碑 | 已授 3 人 Science lifetime entitlement，或 5 人 Vlog ¥10 券处于 `available`；退款后有效人数低于对应门槛 | 处理全额退款并 reconcile milestones | lifetime entitlement 设为 `canceled`，奖励为 `revoked`；`available` 券设为 `revoked`、`revocation_reason=referral_milestone_count_below_threshold`，奖励为 `revoked`。若券为 `reserved`，奖励先进入 `revocation_pending`，在关联支付终态后撤券/定案 | `referral_refunded` 的 `milestone_changes` 列出 threshold、kind、outcome（`revoked` 或 `revocation_pending`）及 `reward_type` |
| 再次跨过已撤销的 3/5 门槛 | 先前里程碑已撤销；后续有效推荐令人数重新达到该门槛 | 处理新资格并 reconcile milestones | 重新发放同类里程碑，generation 加 1；记录新 entitlement 或券和新的 `ReferralReward(status=granted)`，旧撤销记录保留 | milestone 状态恢复 `earned` 并显示最新 generation；发出新里程碑通知 |
| 已使用的 ¥10 milestone 券不可逆 | 门槛券已被订单使用，`UserCoupon.status=used`；退款使人数跌破门槛 | reconcile 退款及里程碑 | 券仍为 `used`，对应奖励转 `non_reversible`，不撤销已结算消费；人数后来重新达标也不重发该同一已使用里程碑 | 退款通知的 milestone outcome 为 `non_reversible`；后续快照不将该奖励标作可撤销/待用 |
| 全局退款提醒与永久历史 | 已处理的合格推荐发生全额退款 | 读取提醒、历史；不确认后刷新，再确认后刷新 | 持久化 `ReferralNotice(event_type=referral_refunded, is_global_notice=True, acknowledged_at=NULL)`；历史记录永久保留。仅成功 ack 将 `acknowledged_at` 写入；重复 ack 幂等 | 未确认提醒持续出现在未读接口；明确 ack 成功后从未读提醒消失，但仍在历史中；历史 payload 仅允许 `progress_removed`、`days_removed`（实际扣除天数）、`access_expires_at`、`effective_count`、`milestone_changes` 这些有效人数/实际天数/到期/里程碑结果，不含被推荐人身份、电话、订单或支付标识 |
| 提醒确认失败后重试 | 全局退款提醒尚未确认；首次 acknowledge 请求失败或未收到成功响应 | 再次请求该提醒的 acknowledge endpoint | 首次失败不写 `acknowledged_at`；成功重试写入确认时间，重复成功调用保持原时间 | 失败后提醒仍可见；收到成功响应后从未读提醒消失，永久历史不变 |

## Browser and responsive acceptance

### Browser execution report (2026-10-24)

PASS: locked panel; 12+ progress with fixed five nodes and emphasized 3/5;
copy and no-native-share fallback; privacy-safe history; non-dismissible global
refund modal requiring explicit confirmation; checkout redemption, replacement
confirmation, self-referral and history-permission rejection; current-module
activation exit; and 1440×900, 768×1024, 390×844, and 320×800 layouts without
overflow, with key controls at least 44px.

BLOCKED: exact 0/3/5 progression, ordinary operational-code flow, and the
tablet/mobile second refund-modal pass. The initial attempts were blocked by
the Mac being locked; after user interaction the Mac was unlocked, but the CUA
browser inventory was empty, IAB/Chrome creation returned browser unavailable,
and binding native Chrome timed out after about 145 seconds before reset.
Therefore these cases remain blocked and are not passes. Clipboard permission
denial, native share support, real touch, and dynamic reduced-motion checks
remain blocked because the in-app browser lacks those capabilities. No fixture
secrets or personal data are included.

### Local setup and cleanup

Run against a local development database and local fixture accounts only. Do not
use production accounts, credentials, payment providers, or real personal data.
Prepare isolated fixture roles with known login details stored only in the
local development environment:

- `locked`: no historical `exam_preparation` or platform entitlement.
- `eligible`: historical `exam_preparation` entitlement; referral campaign
  enabled; no existing referral participation; eligible offers and coupons.
- `participant`: eligible to redeem another user's referral code, with no prior
  `exam_preparation` entitlement.
- `replacement`: participant with an existing open participation and coupon.
- `self`: eligible referrer used to verify self-redemption rejection.
- `prior-access`: no campaign participation, but historical
  `exam_preparation` entitlement.
- `notice`: eligible account with an unread global `referral_refunded` notice;
  prepare a second identical notice for retry testing.

Use local-only, clearly labeled codes for an activation code that grants the
current module, an applicable promotion code, and referral codes for the
eligible and self cases. Fixture reset must restore a fresh state before each
case; record fixture IDs or a local fixture command, never passwords, tokens,
or code values in this document or evidence.

1. Start the backend from the repository root:
   `.venv/bin/python manage.py runserver 127.0.0.1:8001`
2. In another terminal, confirm the backend responds:
   `curl -i http://127.0.0.1:8001/api/accounts/referral-campaign/`.
   An unauthenticated `401` is an acceptable health response; connection errors
   are not. Confirm `/static/` and `/media/` requests used by the test fixtures
   also resolve from this backend when applicable.
3. Start the frontend in a separate terminal with the prepared temporary
   configuration `/private/tmp/referral-vite-8001.mjs`. It proxies `/api`,
   `/static`, and `/media` to `http://127.0.0.1:8001` without changing the
   checked-in Vite config:

   `cd frontend && npm run dev -- --config /private/tmp/referral-vite-8001.mjs --host 127.0.0.1 --port 5174 --strictPort`

   Open `http://127.0.0.1:5174` in the available browser. Verify the UI loads
   and a signed-in referral request reaches port 8001.
4. After the cases, stop both development servers with Ctrl-C. If the temporary
   config is no longer needed, delete `/private/tmp/referral-vite-8001.mjs`.
   Reset only the local fixtures created for this run.

For each case, capture the route and viewport, the visible result, and the
relevant local request/response or fixture state with secrets and personal data
redacted. Mark each row `PASS` or `FAIL`; a failure needs the observed result
and a reproducible step. Do not use a production account.

| Case | Steps | Expected result | Evidence / verdict |
| --- | --- | --- | --- |
| Locked profile | Sign in as `locked`; open Profile. | Referral panel says the feature unlocks after obtaining exam-preparation access; no referral code, progress, or claim action is shown. | Screenshot plus campaign response/fixture entitlement state; PASS/FAIL. |
| Eligible campaign and progress | Sign in as `eligible`; open Profile. Set up counts 0, 3, 5, and greater than 5 in turn. | A referral code, copy/share actions, five progress nodes, referral count, reward history, and the 3-person Science and 5-person Vlog milestones appear. Nodes 3 and 5 are visually emphasized; all five remain lit above five, with the unlimited count shown accurately. No referral badge appears and viewing the panel does not claim/redeem a code or create a participation/coupon. | Screenshot for each count and before/after fixture state; PASS/FAIL. |
| Copy and share fallback | On the eligible profile, test copy with clipboard permission granted and denied/unavailable; test share where supported and unsupported. | Copy/share success is reported when available; clipboard fallback remains usable when clipboard access fails; unsupported share leaves a usable copy path and clear feedback. No uncaught error or misleading success. | Browser permission state, screenshot, and clipboard/share outcome; PASS/FAIL. |
| Referral history and privacy | View profile history using fixtures with qualified, milestone, and refund events. | History remains visible and readable. It contains no referred person's identity, phone, order, or payment identifier. | Screenshot and redacted rendered/API fields; PASS/FAIL. |
| Checkout inline redemption | Open an applicable exam-preparation checkout as `participant`; submit a referral code. Repeat with a promotion code. | Redemption is inline. Referral success refreshes checkout state without navigating away. Promotion success refreshes offers and selects the applicable coupon/discount. No unrelated offer is selected. | Screenshot, route before/after, and redacted response/selected offer; PASS/FAIL. |
| Replacement confirmation and cancel | As `replacement`, submit a different same-campaign referral code; first cancel, then repeat and confirm. | First submission shows a confirmation. Cancel keeps the original participation/coupon and makes no replacement request. Confirm replaces the old coupon and shows success. | Screenshots and before/after participation, coupon, and request state; PASS/FAIL. |
| Self and prior-access errors | Attempt self-code redemption as `self`; attempt referral redemption as `prior-access`. | Each attempt shows the specific rejection in context; no participation or coupon is created or replaced. | Screenshot plus unchanged fixture state and redacted error response; PASS/FAIL. |
| Activation code from checkout | Submit the local activation code granting the current module on checkout. | On success, exit the purchase flow to the refreshed app/access state; do not leave the user on a checkout that implies another purchase is needed. | Route and visible access state before/after; PASS/FAIL. |
| Promotion/referral coupon from checkout | Redeem a local promotion or referral code that issues a coupon. | Stay in checkout, refresh offers, and select the applicable discounted offer; do not navigate to the activation success flow. | Route, selected offer/discount, and redacted response; PASS/FAIL. |
| Global refund notice acknowledgment | Sign in as `notice`; open the app with an unread global refund notice. Click outside the dialog, then repeat and press Escape; finally activate “我知道了”. | Notice is modal. Overlay click and Escape do not acknowledge or dismiss it. Only explicit acknowledgment dismisses it and removes it from unread notices; the permanent history entry remains. | Screen recording or screenshots for each action and unread/history state; PASS/FAIL. |
| Acknowledgment failure and retry | Use the second unread fixture notice; make its first acknowledgment request fail (local request interception or controlled fixture response), then retry successfully. | Failure is announced, dialog remains open, notice stays unread, and retry is available. Successful retry dismisses it and leaves history intact. | Redacted failed/successful responses and unread/history state; PASS/FAIL. |
| Notice privacy | Inspect refund notice and history rendered for `notice`. | Only progress removed, days removed, expiry, effective count, and milestone outcomes are disclosed; no referred-person identity, phone, order, or payment identifiers. | Screenshot and redacted rendered/API fields; PASS/FAIL. |
| Desktop, tablet, and mobile | Repeat profile, checkout, replacement dialog, and refund notice at desktop (1440×900), tablet (768×1024), and mobile (390×844); also check a narrow 320px viewport. | Content is readable and operable; no horizontal overflow, clipped controls, overlap, or cramped actions. Dialog content and page remain usable at each size. | Viewport-labeled screenshots and overflow check; PASS/FAIL. |
| Keyboard and focus | Keyboard-navigate profile and checkout. Open each dialog; test Tab and Shift+Tab at both ends, Escape/overlay behavior where relevant, dismissal, and reopening. | Focus is visible, stays within modal dialogs, and returns to the invoking control when the dialog closes. Refund notice cannot be dismissed without explicit acknowledgment. | Short recording or focus-order notes for each dialog; PASS/FAIL. |
| Touch and target size | On tablet/mobile, operate copy, share, redeem, cancel, confirm, acknowledgment, and navigation controls by touch. | Interactive targets are at least 44×44 CSS px where applicable. No control depends on sticky hover to reveal its label or action. | Viewport screenshots and measured target sizes; PASS/FAIL. |
| Reduced motion | Enable the browser/OS reduced-motion preference and repeat profile/checkout/dialog transitions. | No nonessential motion interferes with reading, focus, or operation; state changes remain clear. | Preference state and brief recording/screenshots; PASS/FAIL. |
