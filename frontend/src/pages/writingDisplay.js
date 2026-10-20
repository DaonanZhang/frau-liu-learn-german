export function isTelcB2Writing(exercise) {
  const base = exercise?.exercise_base || {};
  return String(base.exam_type || "").trim().toUpperCase() === "TELC"
    && String(base.level || "").trim().toUpperCase() === "B2";
}

export function writingCardContent(exercise) {
  return {
    title: String(exercise?.exercise_base?.title || "").trim(),
    preview: "",
  };
}

export function writingWordLimitLabel(exercise) {
  if (isTelcB2Writing(exercise)) return `最少 ${exercise?.words_limit || 150} 词`;
  return exercise?.words_limit ? `${exercise.words_limit} 词` : "字数不限";
}
