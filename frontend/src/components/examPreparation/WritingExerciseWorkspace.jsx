import { useState } from "react";
import { AnnotatableTextRegion } from "./ExamTextAnnotations.jsx";

export function TranslationVisibilityIcon() {
  return (
    <img className="translation-visibility-icon" src="/images/translate_icon.png" alt="" aria-hidden="true" />
  );
}

export function VocabularyCollapseIcon({ expanded }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={expanded ? "m6 10 6 6 6-6" : "m6 14 6-6 6 6"} />
    </svg>
  );
}

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
  isTelcC1 = false,
  showTranslations = true,
  showVocabulary = true,
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
  const [hiddenQuoteTranslations, setHiddenQuoteTranslations] = useState({});
  const taskCard = (
    <article
      ref={taskRef}
      className={[
        "writing-detail-task-card",
        isTelcC1 ? "writing-detail-task-card--c1" : "",
        taskClassName,
      ].filter(Boolean).join(" ")}
    >
      <h2>写作要求</h2>
      <AnnotatableTextRegion as="p" regionId={promptRegionId}>
        <StoredLineBreaks text={exercise?.task_text} fallback="请根据题目要求完成写作。" />
      </AnnotatableTextRegion>
      {showTranslations && !isTelcB2 && !isTelcC1 && exercise?.content?.task_translation_zh ? <p className="writing-detail-translation-zh">{exercise.content.task_translation_zh}</p> : null}
    </article>
  );

  return (
    <div className="writing-detail-content">
      {!isTelcC1 ? <section
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
            {showTranslations && !isTelcB2 && !isTelcC1 && exercise?.content?.request_translation_zh ? <p className="writing-detail-translation-zh">{exercise.content.request_translation_zh}</p> : null}
          </>
        )}
      </section> : null}

      {isTelcC1 ? taskCard : null}

      {isTelcC1 ? (
        <section className="writing-detail-c1-quotes" aria-label="引语">
          {(Array.isArray(exercise?.content?.quotes) ? exercise.content.quotes : []).map((quote, index) => {
            const quoteTitle = `Zitate ${index + 1}`;
            const translationVisible = showTranslations && !hiddenQuoteTranslations[index];
            return <article key={`${index}-${quote.text}`} className="writing-detail-c1-quote">
              <div className="writing-detail-c1-quote__header">
                <h2>{quoteTitle}</h2>
                {showTranslations && quote.translation_zh ? <button
                  type="button"
                  className="writing-detail-translation-toggle"
                  aria-label={`${translationVisible ? "隐藏" : "显示"} ${quoteTitle} 中文翻译`}
                  title="翻译"
                  onClick={() => setHiddenQuoteTranslations((current) => ({
                    ...current,
                    [index]: !current[index],
                  }))}
                >
                  <TranslationVisibilityIcon hidden={!translationVisible} />
                </button> : null}
              </div>
              <p>{quote.text}</p>
              {translationVisible && quote.translation_zh ? <p>{quote.translation_zh}</p> : null}
            </article>;
          })}
        </section>
      ) : null}

      {showVocabulary && isTelcC1 && Array.isArray(exercise?.content?.vocabulary_pages) && exercise.content.vocabulary_pages.length ? (
        <VocabularyPages pages={exercise.content.vocabulary_pages} />
      ) : null}

      {metaPanel}

      <section className={`writing-detail-workspace${isTelcC1 ? " writing-detail-workspace--c1" : ""}`}>
        {!isTelcC1 ? taskCard : null}

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

export function VocabularyPages({ pages }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const page = pages[pageIndex] || {};
  const entries = Array.isArray(page) ? page : Array.isArray(page.entries) ? page.entries : [];
  return (
    <aside className="writing-detail-vocabulary" aria-label="词汇表">
      <div className="writing-detail-vocabulary__header">
        <strong>相关词汇</strong>
        <button
          type="button"
          aria-label={isExpanded ? "收起词汇表" : "展开词汇表"}
          title={isExpanded ? "收起词汇表" : "展开词汇表"}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <VocabularyCollapseIcon expanded={isExpanded} />
        </button>
      </div>
      {isExpanded ? (
        <>
          <div className="writing-detail-vocabulary__cards">
            {entries.map((entry, index) => (
              <p className="writing-detail-vocabulary__card" key={`${entry.word || entry.term || index}`}>
                <strong>{entry.word || entry.term || entry.de || ""}</strong>
                {entry.translation_zh || entry.translation || entry.zh ? <span>
                  <i aria-hidden="true"> · </i>{entry.translation_zh || entry.translation || entry.zh}
                </span> : null}
              </p>
            ))}
          </div>
          <footer className="writing-detail-vocabulary__pagination">
            <button type="button" onClick={() => setPageIndex((current) => Math.max(0, current - 1))} disabled={pageIndex === 0} aria-label="上一页">←</button>
            <span>{pageIndex + 1} / {pages.length}</span>
            <button type="button" onClick={() => setPageIndex((current) => Math.min(pages.length - 1, current + 1))} disabled={pageIndex >= pages.length - 1} aria-label="下一页">→</button>
          </footer>
        </>
      ) : null}
    </aside>
  );
}
