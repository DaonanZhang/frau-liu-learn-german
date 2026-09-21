import { useEffect, useRef, useState } from "react";

export default function MockExamAnswerSheet({ rows, answers, onAnswer, review, open, onClose }) {
  const cardRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState({ x: 24, y: 96 });

  useEffect(() => {
    function move(event) {
      if (!dragRef.current) return;
      const card = cardRef.current;
      const width = card?.offsetWidth || 620;
      const height = card?.offsetHeight || 520;
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - dragRef.current.offsetX)),
        y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - dragRef.current.offsetY)),
      });
    }
    function stop() { dragRef.current = null; }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  if (!open) return null;

  const sections = [
    { key: "reading", label: "Lesen & Sprachbausteine", rows: rows.filter((row) => row.group === "reading") },
    { key: "listening", label: "Hören", rows: rows.filter((row) => row.group === "listening") },
  ];

  return (
    <aside
      ref={cardRef}
      className="mock-answer-sheet"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="mock-answer-sheet-title"
    >
      <header
        className="mock-answer-sheet__handle"
        onPointerDown={(event) => {
          const bounds = cardRef.current?.getBoundingClientRect();
          dragRef.current = {
            offsetX: event.clientX - (bounds?.left || 0),
            offsetY: event.clientY - (bounds?.top || 0),
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
      >
        <div><span>拖动此处移动</span><h2 id="mock-answer-sheet-title">答题卡</h2></div>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} aria-label="关闭答题卡">×</button>
      </header>

      <div className="mock-answer-sheet__body">
        {sections.map((section) => (
          <section key={section.key} className={`mock-answer-sheet__section is-${section.key}`}>
            <div className="mock-answer-sheet__section-title">
              <h3>{section.label}</h3>
              <span>{section.rows.filter((row) => answers[row.answerKey]).length} / {section.rows.length}</span>
            </div>
            <div className="mock-answer-sheet__parts">
              {[...new Set(section.rows.map((row) => row.partLabel))].map((partLabel) => (
                <div key={partLabel} className="mock-answer-sheet__part">
                  <h4>{partLabel}</h4>
                  <div className="mock-answer-sheet__rows">
                    {section.rows.filter((row) => row.partLabel === partLabel).map((row) => {
                      const selected = answers[row.answerKey] || "";
                      const rowCorrect = review && selected === row.correctKey;
                      const rowWrong = review && selected !== row.correctKey;
                      return (
                        <div key={row.answerKey} className={`mock-answer-sheet__row${rowCorrect ? " is-correct" : ""}${rowWrong ? " is-wrong" : ""}`}>
                          <strong>{row.number}</strong>
                          <div className="mock-answer-sheet__bubbles">
                            {row.optionKeys.map((optionKey) => {
                              const selectedCorrect = review && selected === optionKey && optionKey === row.correctKey;
                              const selectedWrong = review && selected === optionKey && optionKey !== row.correctKey;
                              const correctAnswer = review && optionKey === row.correctKey;
                              return (
                                <button
                                  type="button"
                                  key={optionKey}
                                  className={`${selected === optionKey ? "is-selected" : ""}${selectedCorrect || correctAnswer ? " is-correct" : ""}${selectedWrong ? " is-wrong" : ""}`}
                                  onClick={() => row.editable && onAnswer(row.answerKey, optionKey)}
                                  disabled={!row.editable}
                                  aria-label={`第 ${row.number} 题，答案 ${optionKey}`}
                                >
                                  <i aria-hidden="true" />
                                  <span>{optionKey}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer><span className="is-answered" />已作答 {review ? <><span className="is-correct" />正确 <span className="is-wrong" />错误</> : null}</footer>
    </aside>
  );
}
