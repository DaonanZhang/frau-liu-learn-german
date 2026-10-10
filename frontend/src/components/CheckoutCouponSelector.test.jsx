import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CheckoutCouponSelector from "./CheckoutCouponSelector.jsx";


describe("CheckoutCouponSelector", () => {
  it("asks for confirmation before replacing the brand-friend discount", () => {
    const onSelectCoupon = vi.fn();
    render(
      <CheckoutCouponSelector
        couponBundle={{
          available_count: 1,
          default_coupon_id: null,
          no_coupon_pricing: {
            brand_friend_coupon_discount_amount: "5.00",
            final_amount: "34.90",
          },
          choices: [{
            coupon: {
              id: 17,
              discount_amount: "5.00",
              minimum_order_amount: "0.00",
              expires_at: null,
              stacking_policy: "exclusive_brand_friend",
              scope: {},
            },
            is_applicable: true,
            unavailable_reason: "",
            pricing: {
              promotion_discount_amount: "5.00",
              total_discount_amount: "5.00",
              final_amount: "34.90",
            },
          }],
        }}
        isOpen
        offerTitle="测试商品"
        selectedCouponId={null}
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onSelectCoupon={onSelectCoupon}
        onSelectNone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /无门槛优惠券/ }));

    expect(onSelectCoupon).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "优惠方式确认" })).toBeInTheDocument();
    expect(screen.getByText(/不能与品牌挚友优惠叠加使用/)).toBeInTheDocument();
    expect(screen.getByText(/最终价格不变/)).toBeInTheDocument();
    expect(screen.queryByText("可与其他优惠券叠加")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认使用" }));
    expect(onSelectCoupon).toHaveBeenCalledWith(17);
  });
});
