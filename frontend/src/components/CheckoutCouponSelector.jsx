function formatAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return numeric.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatCouponExpiry(value) {
  if (!value) {
    return "长期有效";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "长期有效";
  }
  return `有效期至 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)}`;
}

function formatCouponScope(coupon) {
  const scope = coupon?.scope || {};
  if (scope.offer_title) {
    return scope.offer_title;
  }
  if (scope.module_name && scope.season_number) {
    return `${scope.module_name} · Season ${scope.season_number}`;
  }
  if (scope.module_name) {
    return scope.module_name;
  }
  return "全部商品";
}

export default function CheckoutCouponSelector({
  couponBundle,
  isOpen,
  offerTitle,
  selectedCouponId,
  onOpen,
  onClose,
  onSelectCoupon,
  onSelectNone,
}) {
  const choices = Array.isArray(couponBundle?.choices) ? couponBundle.choices : [];
  const brandFriendCouponDiscount = Number(
    couponBundle?.no_coupon_pricing?.brand_friend_coupon_discount_amount
  ) || 0;
  const hasBrandFriendCoupon = brandFriendCouponDiscount > 0;
  const availableCount = (Number(couponBundle?.available_count) || 0)
    + (hasBrandFriendCoupon ? 1 : 0);
  const selectedChoice = choices.find(
    (choice) => choice?.coupon?.id === selectedCouponId
  );

  return (
    <>
      <button
        className="module-checkout-page__couponSelector"
        type="button"
        disabled={!couponBundle}
        onClick={onOpen}
      >
        <span className="module-checkout-page__couponSelectorIcon" aria-hidden="true">券</span>
        <span className="module-checkout-page__couponSelectorText">
          <strong>优惠券</strong>
          <small>
            {selectedChoice
              ? `${hasBrandFriendCoupon ? "品牌挚友券 + " : ""}已选优惠券 · 最终优惠 ¥${formatAmount(selectedChoice.pricing?.total_discount_amount)}`
              : selectedCouponId === null && couponBundle
                ? hasBrandFriendCoupon
                  ? `品牌挚友优惠券已自动使用 · 本单减 ¥${formatAmount(brandFriendCouponDiscount)}`
                  : "不使用优惠券"
                : couponBundle
                  ? "暂无适用优惠券"
                  : "正在匹配可用优惠券"}
          </small>
        </span>
        {availableCount > 0 ? (
          <span className="module-checkout-page__couponSelectorCount">
            {availableCount} 张可用
          </span>
        ) : null}
        <span className="module-checkout-page__couponSelectorArrow" aria-hidden="true">›</span>
      </button>

      {isOpen && couponBundle ? (
        <div className="module-checkout-page__couponOverlay" role="presentation">
          <button
            type="button"
            className="module-checkout-page__couponBackdrop"
            aria-label="关闭优惠券选择"
            onClick={onClose}
          />
          <section
            className="module-checkout-page__couponSheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupon-sheet-title"
          >
            <div className="module-checkout-page__couponSheetHandle" aria-hidden="true" />
            <div className="module-checkout-page__couponSheetHeader">
              <div>
                <div className="module-checkout-page__couponSheetEyebrow">SMART SAVINGS</div>
                <h2 id="coupon-sheet-title">选择优惠券</h2>
                <p>
                  {offerTitle || "当前商品"} · {hasBrandFriendCoupon
                    ? "品牌挚友优惠券已自动叠加，可再选择其他优惠券"
                    : "可选择使用或不使用优惠券"}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="关闭">×</button>
            </div>

            <div className="module-checkout-page__couponChoices">
              {hasBrandFriendCoupon ? (
                <div className="module-checkout-page__couponChoice module-checkout-page__couponChoice--brandFriend is-selected">
                  <span className="module-checkout-page__couponChoiceValue">
                    <strong><small>¥</small>{formatAmount(brandFriendCouponDiscount)}</strong>
                    <small>无门槛</small>
                  </span>
                  <span className="module-checkout-page__couponChoiceBody">
                    <strong>品牌挚友优惠券</strong>
                    <small>长期有效 · 每笔订单自动使用</small>
                    <em>可与其他优惠券叠加</em>
                  </span>
                  <span className="module-checkout-page__couponRadio" aria-hidden="true">✓</span>
                </div>
              ) : null}

              {choices.map((choice) => {
                const coupon = choice.coupon;
                const checked = selectedCouponId === coupon.id;
                return (
                  <button
                    key={coupon.id}
                    type="button"
                    disabled={!choice.is_applicable}
                    className={`module-checkout-page__couponChoice${checked ? " is-selected" : ""}${!choice.is_applicable ? " is-disabled" : ""}`}
                    onClick={() => onSelectCoupon(coupon.id)}
                  >
                    <span className="module-checkout-page__couponChoiceValue">
                      <strong><small>¥</small>{formatAmount(coupon.discount_amount)}</strong>
                      <small>{Number(coupon.minimum_order_amount) > 0 ? `满 ¥${formatAmount(coupon.minimum_order_amount)} 可用` : "无门槛"}</small>
                    </span>
                    <span className="module-checkout-page__couponChoiceBody">
                      <strong>{Number(coupon.minimum_order_amount) > 0 ? "满减优惠券" : "无门槛优惠券"}</strong>
                      <small>适用于：{formatCouponScope(coupon)}</small>
                      <small>{formatCouponExpiry(coupon.expires_at)}</small>
                      <em>{choice.is_applicable ? `本单优惠 ¥${choice.pricing?.promotion_discount_amount}` : choice.unavailable_reason}</em>
                    </span>
                    <span className="module-checkout-page__couponRadio" aria-hidden="true">{checked ? "✓" : ""}</span>
                  </button>
                );
              })}

              <button
                type="button"
                className={`module-checkout-page__couponChoice module-checkout-page__couponChoice--none${selectedCouponId === null ? " is-selected" : ""}`}
                onClick={onSelectNone}
              >
                <span className="module-checkout-page__couponChoiceNoneIcon" aria-hidden="true">—</span>
                <span className="module-checkout-page__couponChoiceBody">
                  <strong>{hasBrandFriendCoupon ? "不使用其他优惠券" : "不使用优惠券"}</strong>
                  <small>
                    {hasBrandFriendCoupon
                      ? "品牌挚友优惠券仍会自动使用"
                      : "仅保留当前账号自动享有的优惠"}
                  </small>
                </span>
                <span className="module-checkout-page__couponRadio" aria-hidden="true">{selectedCouponId === null ? "✓" : ""}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
