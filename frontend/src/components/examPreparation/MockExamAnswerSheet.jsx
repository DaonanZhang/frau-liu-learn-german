export default function MockExamAnswerSheet({ rows, answers, onAnswer, review }) {
  const sections = [
    { key: "reading", label: "Lesen & Sprachbausteine", rows: rows.filter((row) => row.group === "reading") },
    { key: "listening", label: "Hören", rows: rows.filter((row) => row.group === "listening") },
  ];

  return (
    <aside className="mock-answer-sheet" role="region" aria-label="答题卡">
      <header className="mock-answer-sheet__header">
        <h2>答题卡</h2>
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
                              const correctAnswer = review && optionKey === row.correctKey;
                              const wrongSelection = review && selected === optionKey && optionKey !== row.correctKey;
                              return (
                                <button
                                  type="button"
                                  key={optionKey}
                                  className={`${!review && selected === optionKey ? "is-selected" : ""}${correctAnswer ? " is-correct" : ""}${wrongSelection ? " is-wrong" : ""}`}
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
      <footer><span className="is-answered" />已作答 {review ? <><span className="is-correct" />正确答案 <span className="is-wrong" />错误或未作答</> : null}</footer>
    </aside>
  );
}
