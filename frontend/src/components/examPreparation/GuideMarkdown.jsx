import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function tableCells(line) {
  let value = String(line || "").trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function isTableDelimiter(line) {
  const cells = tableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeMultilineTableRows(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const normalized = [];
  let index = 0;

  while (index < lines.length) {
    const header = lines[index];
    const delimiter = lines[index + 1];
    if (!header?.includes("|") || !isTableDelimiter(delimiter)) {
      normalized.push(header);
      index += 1;
      continue;
    }

    const columnCount = tableCells(header).length;
    normalized.push(header, delimiter);
    index += 2;

    while (index < lines.length && lines[index].trim().startsWith("|")) {
      const rowStart = index;
      const rowParts = [];
      let completedRow = "";

      while (index < lines.length) {
        const part = lines[index].trim();
        index += 1;
        if (part) rowParts.push(part);

        const candidate = rowParts.join(" ");
        if (candidate.endsWith("|") && tableCells(candidate).length >= columnCount) {
          completedRow = candidate;
          break;
        }
      }

      if (!completedRow) {
        normalized.push(...lines.slice(rowStart, index));
        break;
      }
      normalized.push(completedRow);
    }
  }

  return normalized.join("\n");
}

export default function GuideMarkdown({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children: headingChildren, ...props }) => <h2 {...props}>{headingChildren}</h2>,
        table: ({ children: tableChildren, ...props }) => (
          <div className="exam-guide-markdown__table-wrap">
            <table {...props}>{tableChildren}</table>
          </div>
        ),
      }}
    >
      {normalizeMultilineTableRows(children)}
    </ReactMarkdown>
  );
}
