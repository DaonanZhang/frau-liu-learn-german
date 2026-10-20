export const READING_SECONDS = 90 * 60;
export const LISTENING_SECONDS = 30 * 60;
export const WRITING_SECONDS = 30 * 60;
export const COLLECTION_SECONDS = 60;

export const PARTS = {
  reading_title_matching: { section: "reading", short: "L 1", title: "Lesen · Teil 1" },
  reading_understanding: { section: "reading", short: "L 2", title: "Lesen · Teil 2" },
  reading_ad_matching: { section: "reading", short: "L 3", title: "Lesen · Teil 3" },
  cloze_choice: { section: "reading", short: "SB 1", title: "Sprachbausteine · Teil 1" },
  cloze_matching: { section: "reading", short: "SB 2", title: "Sprachbausteine · Teil 2" },
  listening_teil1: { section: "listening", short: "H 1", title: "Hören · Teil 1" },
  listening_teil2: { section: "listening", short: "H 2", title: "Hören · Teil 2" },
  listening_teil3: { section: "listening", short: "H 3", title: "Hören · Teil 3" },
  writing: { section: "writing", short: "Schr.", title: "Schreiben" },
};

export const INTRODUCTION_BY_PART = {
  reading_title_matching: "Lesen Sie die Überschriften und die Texte. Finden Sie für jeden Text die passende Überschrift. Sie können jede Überschrift nur einmal benutzen.",
  reading_understanding: "Lesen Sie den Text und die Aufgaben. Welche Lösung (a, b oder c) ist jeweils richtig?",
  reading_ad_matching: "Lesen sie die Situationen 1-10 und die Anzeigen a-l. Finden sie für jede die passende Anzeige. Sie können jede Anzeige nur einmal benutzen. Markieren sie Ihre Lösungen für die Aufgaben 1–10 auf dem Antwortbogen. Wenn Sie zu einer Situation keine Anzeige finden, markieren Sie x.",
  cloze_choice: "Lesen Sie den Text und schließen Sie die Lücken. Welche Lösung ist jeweils richtig?",
  cloze_matching: "Lesen Sie den folgenden Text. Welcher Ausdruck passt am besten in die Lücken?",
  listening_teil1: "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen 1 - 5 richtig oder falsch sind. Lesen Sie jetzt die Aufgaben 1 - 5. Sie haben dazu 30 Sekunden Zeit.",
  listening_teil2: "Sie hören nun ein Gespräch. Dazu sollen Sie 10 Aufgaben lösen. Sie hören das Gespräch zweimal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
  listening_teil3: "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
};

export const READING_PART_KEYS = Object.keys(PARTS).filter((key) => PARTS[key].section === "reading");
export const LISTENING_PART_KEYS = Object.keys(PARTS).filter((key) => PARTS[key].section === "listening");
export const ALL_REVIEW_PART_KEYS = [...READING_PART_KEYS, ...LISTENING_PART_KEYS, "writing"];
export const REVIEW_NAVIGATION_PART_KEYS = [...READING_PART_KEYS, ...LISTENING_PART_KEYS];

export const AUDIO_SEQUENCE = [
  { kind: "audio", partKey: "listening_teil1", playbackLabel: "einmal", playCount: 1 },
  { kind: "break", next: "Hören · Teil 2", durationSeconds: COLLECTION_SECONDS },
  { kind: "audio", partKey: "listening_teil2", playbackLabel: "zweimal", playCount: 2 },
  { kind: "break", next: "Hören · Teil 3", durationSeconds: COLLECTION_SECONDS },
  { kind: "audio", partKey: "listening_teil3", playbackLabel: "einmal", playCount: 1 },
];

const B2_AUDIO_SEQUENCE = [
  { kind: "audio", partKey: "listening_teil1", playbackLabel: "einmal", playCount: 1 },
  { kind: "break", next: "Hören · Teil 2", durationSeconds: 30 },
  { kind: "audio", partKey: "listening_teil2", playbackLabel: "einmal", playCount: 1 },
  { kind: "break", next: "Hören · Teil 3", durationSeconds: 30 },
  { kind: "audio", partKey: "listening_teil3", playbackLabel: "einmal", playCount: 1 },
];

export function audioSequenceForLevel(level) {
  return String(level || "").trim().toUpperCase() === "B2" ? B2_AUDIO_SEQUENCE : AUDIO_SEQUENCE;
}

export const WRITING_GRADE_POINTS = { A: 5, B: 3, C: 1, D: 0 };
export const EMPTY_WRITING_ASSESSMENT = {
  topic_relevant: null,
  task_completion: "",
  communicative_design: "",
  formal_accuracy: "",
};
export const EARLY_SUBMISSION_WRITING_ASSESSMENT = {
  topic_relevant: true,
  task_completion: "D",
  communicative_design: "D",
  formal_accuracy: "D",
};
export const WRITING_CRITERIA = [
  {
    key: "task_completion",
    title: "I · Aufgabenbewältigung（任务完成度）",
    options: {
      A: "4 个要点均得到合理且充分的处理。",
      B: "3 个要点得到合理处理。",
      C: "2 个要点得到合理处理。",
      D: "仅处理了 1 个要点，或没有处理任何要点。",
    },
  },
  {
    key: "communicative_design",
    title: "II · Kommunikative Gestaltung（交际构思与语篇表达）",
    options: {
      A: "词汇充足，能够表达较复杂的内容，并使用多种连接方式组织句子。",
      B: "能够围绕熟悉话题连贯表达，并使用基础连接词组织段落。",
      C: "主要使用简单词汇和短句，连接方式较单一。",
      D: "主要由套话、零散单词或短语组成，无法形成连贯表达。",
    },
  },
  {
    key: "formal_accuracy",
    title: "III · Formale Richtigkeit（形式正确性）",
    options: {
      A: "有少量错误，但不影响理解；拼写和标点基本准确。",
      B: "有较明显的语法错误，但全文仍容易理解。",
      C: "基础错误较多，理解部分内容时需要推测。",
      D: "语法结构混乱，全文大部分内容无法理解。",
    },
  },
];
