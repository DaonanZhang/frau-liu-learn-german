import { useEffect, useRef, useState } from "react";

import "./VideoFilter.css";

function FilterField({
  icon,
  label,
  options = [],
  selected = [],
  onChange,
  formatOption = (value) => String(value),
  isOpen = false,
  onToggle,
}) {
  const displayValue = selected.length ? selected.map(formatOption).join("、") : "全部";

  function handleToggle(value) {
    if (!onChange) return;
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="vf-field">
      <div className="vf-label">
        <span className="vf-icon" aria-hidden="true">
          {icon}
        </span>
        <span>{label}</span>
      </div>

      <button
        className="vf-select"
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="vf-select__value">{displayValue}</span>
        <span className="vf-select__chevron" aria-hidden="true">
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="vf-options">
          <button
            className="vf-clear"
            type="button"
            onClick={() => onChange?.([])}
          >
            全部
          </button>
          {options.map((option) => (
            <label key={String(option)} className="vf-option">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => handleToggle(option)}
              />
              <span>{formatOption(option)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VideoFilter({
  difficultyOptions = [],
  durationOptions = [],
  creatorOptions = [],
  topicOptions = [],
  selectedDifficulties = [],
  selectedDurations = [],
  selectedCreators = [],
  selectedTopics = [],
  onDifficultyChange,
  onDurationChange,
  onCreatorChange,
  onTopicChange,
}) {
  const rootRef = useRef(null);
  const [openKey, setOpenKey] = useState("");

  useEffect(() => {
    function handleOutside(event) {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(event.target)) {
        setOpenKey("");
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  const formatDuration = (value) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return "未知时长";
    return `${minutes}分钟`;
  };

  return (
    <section className="vf-card" ref={rootRef}>
      <div className="vf-grid">
        <FilterField
          icon={<DifficultyIcon />}
          label="视频难度"
          options={difficultyOptions}
          selected={selectedDifficulties}
          onChange={onDifficultyChange}
          isOpen={openKey === "difficulty"}
          onToggle={() =>
            setOpenKey((prev) => (prev === "difficulty" ? "" : "difficulty"))
          }
        />

        <FilterField
          icon={<DurationIcon />}
          label="视频时长"
          options={durationOptions}
          selected={selectedDurations}
          onChange={onDurationChange}
          formatOption={formatDuration}
          isOpen={openKey === "duration"}
          onToggle={() =>
            setOpenKey((prev) => (prev === "duration" ? "" : "duration"))
          }
        />

        <FilterField
          icon={<CreatorIcon />}
          label="视频博主"
          options={creatorOptions}
          selected={selectedCreators}
          onChange={onCreatorChange}
          isOpen={openKey === "creator"}
          onToggle={() =>
            setOpenKey((prev) => (prev === "creator" ? "" : "creator"))
          }
        />

        <FilterField
          icon={<TopicIcon />}
          label="视频话题"
          options={topicOptions}
          selected={selectedTopics}
          onChange={onTopicChange}
          isOpen={openKey === "topic"}
          onToggle={() =>
            setOpenKey((prev) => (prev === "topic" ? "" : "topic"))
          }
        />
      </div>
    </section>
  );
}

/** Inline SVG icons (no external deps). */
function DifficultyIcon() {
  return (
    <svg
      className="vf-svg"
      width="20"
      height="20"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M23.9986 5L17.8856 17.4776L4 19.4911L14.0589 29.3251L11.6544 43L23.9986 36.4192L36.3454 43L33.9586 29.3251L44 19.4911L30.1913 17.4776L23.9986 5Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DurationIcon() {
  return (
    <svg
      className="vf-svg"
      width="20"
      height="20"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M20 24V17.0718L26 20.5359L32 24L26 27.4641L20 30.9282V24Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreatorIcon() {
  return (
    <svg
      className="vf-svg"
      width="20"
      height="20"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24 20C27.866 20 31 16.866 31 13C31 9.13401 27.866 6 24 6C20.134 6 17 9.13401 17 13C17 16.866 20.134 20 24 20Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 40.8V42H42V40.8C42 36.3196 42 34.0794 41.1281 32.3681C40.3611 30.8628 39.1372 29.6389 37.6319 28.8719C35.9206 28 33.6804 28 29.2 28H18.8C14.3196 28 12.0794 28 10.3681 28.8719C8.86278 29.6389 7.63893 30.8628 6.87195 32.3681C6 34.0794 6 36.3196 6 40.8Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TopicIcon() {
  return (
    <svg
      className="vf-svg"
      width="20"
      height="20"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M42.1691 29.2451L29.2631 42.1511C28.5879 42.8271 27.6716 43.2069 26.7161 43.2069C25.7606 43.2069 24.8444 42.8271 24.1691 42.1511L8 26V8H26L42.1691 24.1691C43.5649 25.5732 43.5649 27.841 42.1691 29.2451Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 21C19.8807 21 21 19.8807 21 18.5C21 17.1193 19.8807 16 18.5 16C17.1193 16 16 17.1193 16 18.5C16 19.8807 17.1193 21 18.5 21Z"
        fill="currentColor"
      />
    </svg>
  );
}
