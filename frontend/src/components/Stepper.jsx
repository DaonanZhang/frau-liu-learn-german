import React from "react";

const DEFAULT_STEPS = ["验证激活码", "创建账户"];

export default function Stepper({ current = 1, labels = DEFAULT_STEPS }) {
  const step1Active = current >= 1;
  const step2Active = current >= 2;

  return (
    <div className="stepper">
      <div className="step">
        <div className={`step-circle ${step1Active ? "active" : ""}`}>1</div>
        <div className={`step-label ${step1Active ? "active" : ""}`}>
          {labels[0] || DEFAULT_STEPS[0]}
        </div>
      </div>

      <div className={`step-line ${step2Active ? "active" : ""}`} />

      <div className="step">
        <div className={`step-circle ${step2Active ? "active" : ""}`}>2</div>
        <div className={`step-label ${step2Active ? "active" : ""}`}>
          {labels[1] || DEFAULT_STEPS[1]}
        </div>
      </div>
    </div>
  );
}
