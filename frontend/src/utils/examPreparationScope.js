const EXAM_TYPE = "TELC";

export function examPreparationScope(levelParam) {
  const level = String(levelParam || "").toUpperCase();
  if (level !== "B1" && level !== "B2" && level !== "C1") return null;
  return { examType: EXAM_TYPE, level, levelPath: level.toLowerCase() };
}

export function examPreparationScopeQuery(scope) {
  const normalized = examPreparationScope(scope?.level);
  if (!normalized || scope?.examType !== EXAM_TYPE) return null;
  return `exam_type=${normalized.examType}&level=${normalized.level}`;
}

export function examPreparationScopeFromSearchParams(searchParams) {
  const examType = String(searchParams?.get?.("exam_type") || "").toUpperCase();
  const scope = examPreparationScope(searchParams?.get?.("level"));
  return examType === EXAM_TYPE ? scope : null;
}

export function examPreparationFavoriteQuery(scope) {
  return examPreparationScopeQuery(scope);
}

export function examPreparationPurchasePath(scope) {
  const normalized = examPreparationScope(scope?.level);
  if (!normalized || (scope?.examType && String(scope.examType).toUpperCase() !== EXAM_TYPE)) {
    return "/modules/exam-preparation/purchase";
  }
  const returnTo = `/modules/exam-preparation/${normalized.levelPath}`;
  return `/modules/exam-preparation/purchase?return_to=${encodeURIComponent(returnTo)}`;
}

export function examPreparationReturnPath(value, fallback = "/modules/exam-preparation") {
  return value === "/modules/exam-preparation/b1" || value === "/modules/exam-preparation/b2" || value === "/modules/exam-preparation/c1"
    ? value
    : fallback;
}
