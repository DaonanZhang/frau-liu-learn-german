import { useEffect, useId, useRef, useState } from "react";

import { redeemCode } from "../api/auth/auth.js";
import "./CheckoutCodeRedemption.css";

export default function CheckoutCodeRedemption({
  module,
  onCouponIssued,
  onActivationApplied,
}) {
  const idPrefix = `checkout-code-redemption-${useId().replace(/:/g, "")}`;
  const inputId = `${idPrefix}-input`;
  const dialogTitleId = `${idPrefix}-confirm-title`;
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const submitting = useRef(false);
  const submitButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const wasDialogOpen = useRef(false);

  useEffect(() => {
    if (confirmation) {
      wasDialogOpen.current = true;
      cancelButtonRef.current?.focus();
    } else if (wasDialogOpen.current && !pending) {
      wasDialogOpen.current = false;
      submitButtonRef.current?.focus();
    }
  }, [confirmation, pending]);

  async function submit(confirmReplace = false) {
    if (submitting.current || !code.trim()) return;
    submitting.current = true;
    setPending(true);
    setMessage("");
    setIsError(false);
    try {
      const result = await redeemCode(code, { confirmReplace });
      if (result?.type === "referral" && result.outcome === "replacement_required") {
        setConfirmation(true);
        setMessage(result.message || "同活动旧优惠券将被替换，请确认是否继续。");
      } else if (result?.type === "activation") {
        setCode("");
        try {
          await onActivationApplied?.(result);
        } catch {
          setMessage("权限已激活，但页面刷新失败，请刷新页面查看。");
          setIsError(true);
          return;
        }
        setMessage("激活成功。");
      } else if (
        (result?.type === "promotion" || result?.type === "referral")
        && result.coupon
      ) {
        setCode("");
        try {
          await onCouponIssued?.(result.coupon, result);
        } catch {
          setMessage("优惠券已领取，但页面刷新失败，请刷新页面查看。");
          setIsError(true);
          return;
        }
        setMessage(result.outcome === "already_issued" ? "优惠券已在账户中。" : "优惠券已添加。");
      } else {
        setCode("");
        setMessage("兑换成功。");
      }
    } catch (error) {
      setMessage(error?.data?.message || error?.data?.detail || "暂时无法兑换，请重试。");
      setIsError(true);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <section className="checkout-code-redemption" data-module={module || ""}>
      <div className="checkout-code-redemption__header">
        <span className="checkout-code-redemption__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2.5 2.5 0 0 0 0-5v-2Z" />
            <path d="M13 8.5v1m0 2v1m0 2v1" />
          </svg>
        </span>
        <div>
          <h2 className="checkout-code-redemption__title">使用兑换码</h2>
          <p className="checkout-code-redemption__description">兑换优惠券或激活当前模块。</p>
        </div>
      </div>
      <form
        className="checkout-code-redemption__form"
        onSubmit={(event) => {
          event.preventDefault();
          setConfirmation(false);
          void submit();
        }}
      >
        <label className="checkout-code-redemption__label" htmlFor={inputId}>
          激活码、优惠码或推广码
        </label>
        <div className="checkout-code-redemption__controls">
          <input
            id={inputId}
            className="checkout-code-redemption__input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            placeholder="输入兑换码"
          />
          <button ref={submitButtonRef} className="checkout-code-redemption__submit" type="submit" disabled={pending || !code.trim()}>
            {pending ? "处理中…" : "兑换"}
          </button>
        </div>
      </form>
      <div className="checkout-code-redemption__message" role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"}>
        {message}
      </div>
      {confirmation ? (
        <div className="checkout-code-redemption__overlay">
          <section
            className="checkout-code-redemption__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setConfirmation(false);
                setMessage("");
              } else if (event.key === "Tab") {
                event.preventDefault();
                const focused = document.activeElement;
                const nextButton = event.shiftKey
                  ? (focused === cancelButtonRef.current ? confirmButtonRef : cancelButtonRef)
                  : (focused === confirmButtonRef.current ? cancelButtonRef : confirmButtonRef);
                nextButton.current?.focus();
              }
            }}
          >
            <h2 id={dialogTitleId}>确认替换优惠券</h2>
            <p>继续后，同活动旧优惠券将被替换。是否继续？</p>
            <div className="checkout-code-redemption__actions">
              <button ref={cancelButtonRef} type="button" onClick={() => { setConfirmation(false); setMessage(""); }}>取消</button>
              <button ref={confirmButtonRef} type="button" disabled={pending} onClick={() => { setConfirmation(false); void submit(true); }}>确认替换</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
