import { AnnotatableTextRegion } from "./ExamTextAnnotations.jsx";

export function StoredLineBreaks({ text, fallback = "" }) {
  return String(text || fallback).split(/<br\s*\/?>|\r\n?|\n/gi).map((part, index) => (
    <span key={`${index}-${part}`}>
      {index > 0 ? <br /> : null}{part}
    </span>
  ));
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export default function WritingExerciseWorkspace({
  exercise,
  isTelcB2,
  value,
  onChange,
  disabled = false,
  metaPanel = null,
  requestRef,
  taskRef,
  inputRef,
  requestClassName = "",
  taskClassName = "",
  inputClassName = "",
  requestRegionId = "task",
  promptRegionId = "prompt",
  inputHeaderAction = null,
}) {
  return (
    <div className="writing-detail-content">
      <section
        ref={requestRef}
        className={[
          "writing-detail-request-panel",
          isTelcB2
            ? "writing-detail-request-panel--announcement"
            : "writing-detail-request-panel--email",
          requestClassName,
        ].filter(Boolean).join(" ")}
      >
        {isTelcB2 ? (
          <>
            <div className="writing-detail-request-panel__announcement-title">
              <h2>Aushang</h2>
            </div>
            <div className="writing-detail-request-panel__announcement-sheet">
              <span className="writing-detail-request-panel__notice-pin" aria-hidden="true">📌</span>
              <AnnotatableTextRegion className="writing-detail-request-panel__body" as="p" regionId={requestRegionId}>
                <StoredLineBreaks text={exercise?.request_text} fallback="请阅读题目要求并完成写作。" />
              </AnnotatableTextRegion>
            </div>
          </>
        ) : (
          <>
            <div className="writing-detail-request-panel__heading">
              <h2>E-Mail</h2>
            </div>
            <div className="writing-detail-request-panel__recipient">An: Prüfende</div>
            <AnnotatableTextRegion className="writing-detail-request-panel__body" as="p" regionId={requestRegionId}>
              <StoredLineBreaks text={exercise?.request_text} fallback="请阅读题目要求并完成写作。" />
            </AnnotatableTextRegion>
          </>
        )}
      </section>

      {metaPanel}

      <section className="writing-detail-workspace">
        <article ref={taskRef} className={["writing-detail-task-card", taskClassName].filter(Boolean).join(" ")}>
          <h2>写作要求</h2>
          <AnnotatableTextRegion as="p" regionId={promptRegionId}>
            <StoredLineBreaks text={exercise?.task_text} fallback="请根据题目要求完成写作。" />
          </AnnotatableTextRegion>
        </article>

        <article
          ref={inputRef}
          className={[
            "writing-detail-input-card",
            isTelcB2 ? "writing-detail-input-card--long" : "",
            inputClassName,
          ].filter(Boolean).join(" ")}
        >
          <div className="writing-detail-input-card__header">
            <h2>我的作答</h2>
            {inputHeaderAction}
            <span>{wordCount(value)} 词</span>
          </div>
          <textarea
            className="writing-detail-textarea"
            value={value}
            onChange={onChange}
            disabled={disabled}
            placeholder="请在这里输入你的写作内容..."
          />
        </article>
      </section>
    </div>
  );
}
