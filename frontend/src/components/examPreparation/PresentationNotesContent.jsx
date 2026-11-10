import "./PresentationNotesContent.css";

const TOKEN_PATTERN = /(\{\{blank_[^}]+\}\}|<br\s*\/?\s*>|<\/?(?:central|bold)>)/gi;

function normalizeMarkup(value) {
  return String(value || "")
    .replace(/<\\(central|bold)\s*>/gi, "</$1>")
    .replace(/<bold>\s*<central>/gi, "<central><bold>")
    .replace(/<\/central>\s*<\/bold>/gi, "</bold></central>");
}

function parseMarkup(value) {
  const root = { children: [] };
  const stack = [root];
  const current = () => stack[stack.length - 1];

  normalizeMarkup(value).split(TOKEN_PATTERN).filter(Boolean).forEach((token) => {
    const lower = token.toLowerCase();
    if (/^<br\s*\/?\s*>$/i.test(token)) {
      current().children.push({ type: "break" });
      return;
    }
    if (/^\{\{blank_[^}]+\}\}$/.test(token)) {
      current().children.push({ type: "blank", key: token.slice(2, -2) });
      return;
    }
    if (lower === "<central>" || lower === "<bold>") {
      const node = { type: lower.slice(1, -1), children: [] };
      current().children.push(node);
      stack.push(node);
      return;
    }
    if (lower === "</central>" || lower === "</bold>") {
      const type = lower.slice(2, -1);
      const matchingIndex = stack.findLastIndex((node) => node.type === type);
      if (matchingIndex > 0) stack.length = matchingIndex;
      return;
    }
    current().children.push({ type: "text", value: token });
  });

  return root.children;
}

function collectBlankKeys(nodes, blankKeys = new Set()) {
  nodes.forEach((node) => {
    if (node.type === "blank") blankKeys.add(String(node.key));
    if (node.children) collectBlankKeys(node.children, blankKeys);
  });
  return blankKeys;
}

export default function PresentationNotesContent({
  text,
  questions,
  expectedQuestionKeys = [],
  values,
  onChange,
  disabled = false,
  review = false,
  questionNumberFor = (question) => question.question_number,
  answerIsCorrect = () => false,
  hasMultipleAnswers = () => false,
  correctAnswerPrefix = "",
}) {
  const questionByKey = new Map(
    (questions || []).map((question) => [String(question.question_key), question]),
  );
  const parsedNodes = parseMarkup(text);
  const inlineBlankKeys = collectBlankKeys(parsedNodes);
  const fallbackKeys = [...new Set(expectedQuestionKeys.map(String))]
    .filter((questionKey) => !inlineBlankKeys.has(questionKey) && questionByKey.has(questionKey));

  function renderBlank(questionKey, nodeKey) {
    const question = questionByKey.get(String(questionKey));
    if (!question) {
      return <span aria-hidden="true" className="presentation-notes-content__missing" key={nodeKey}>________</span>;
    }
    const questionNumber = questionNumberFor(question);
    const value = values?.[question.id] || "";
    const isCorrect = review && answerIsCorrect(question, value);
    return (
      <label
        className={`presentation-notes-content__blank${isCorrect ? " is-correct" : review ? " is-wrong" : ""}`}
        key={nodeKey}
      >
        <span aria-hidden="true" className="presentation-notes-content__number">{questionNumber}</span>
        <input
          type="text"
          aria-label={`Aufgabe ${questionNumber}`}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(question, event.target.value)}
        />
        {hasMultipleAnswers(question.correct_answer) ? (
          <small className="presentation-notes-content__hint">多个答案请用分号分隔</small>
        ) : null}
        {review ? (
          <strong className={isCorrect ? "is-correct" : "is-wrong"}>
            {correctAnswerPrefix}{question.correct_answer}
          </strong>
        ) : null}
      </label>
    );
  }

  function renderNodes(nodes, path = "root") {
    return nodes.map((node, index) => {
      const nodeKey = `${path}-${index}`;
      if (node.type === "text") return node.value;
      if (node.type === "break") return <br key={nodeKey} />;
      if (node.type === "central") {
        return <span className="presentation-notes-content__center" key={nodeKey}>{renderNodes(node.children, nodeKey)}</span>;
      }
      if (node.type === "bold") return <strong key={nodeKey}>{renderNodes(node.children, nodeKey)}</strong>;

      return renderBlank(node.key, nodeKey);
    });
  }

  return <div className="presentation-notes-content">
    {renderNodes(parsedNodes)}
    {fallbackKeys.length ? (
      <div className="presentation-notes-content__fallback">
        {fallbackKeys.map((questionKey, index) => renderBlank(questionKey, `fallback-${index}`))}
      </div>
    ) : null}
  </div>;
}
