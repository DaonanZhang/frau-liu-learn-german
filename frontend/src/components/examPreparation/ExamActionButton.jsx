import "./ExamActionButton.css";

function CheckIcon() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false" className="exam-action-btn__icon">
      <path
        fill="currentColor"
        d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-224 224c-12.5 12.5-32.8 12.5-45.3 0l-96-96c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L192 306.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"
      />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false" className="exam-action-btn__icon">
      <path
        fill="currentColor"
        d="M463.5 224H432c-8.8 0-16-7.2-16-16V80c0-14.3-17.3-21.4-27.4-11.3l-36.7 36.7C310.7 71.5 261.1 48 208 48 93.1 48 0 141.1 0 256s93.1 208 208 208c97.2 0 178.8-66.5 201.9-156.5 2.5-9.7-4.9-19.1-14.9-19.1h-32.6c-7.4 0-13.7 5.1-15.7 12.2C326.6 372.3 272.1 416 208 416c-88.2 0-160-71.8-160-160S119.8 96 208 96c39.8 0 76.4 14.7 104.5 38.9l-42.9 42.9c-10.1 10.1-2.9 27.3 11.3 27.3H463.5c8.8 0 16-7.2 16-16V240c0-8.8-7.2-16-16-16z"
      />
    </svg>
  );
}

export default function ExamActionButton({
  type = "button",
  label,
  icon,
  className = "",
  ...props
}) {
  const IconComponent = icon === "rotate" ? RotateIcon : CheckIcon;

  return (
    <button
      type={type}
      className={["exam-action-btn", className].filter(Boolean).join(" ")}
      {...props}
    >
      <IconComponent />
      <span>{label}</span>
    </button>
  );
}
