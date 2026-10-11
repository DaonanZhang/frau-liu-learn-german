const ANNOTATION_PREFIX = "exam-annotations:v1:";
const ANNOTATION_VERSION = 1;
const STYLES = ["highlight", "underline"];

const emptyAnnotationState = () => ({ version: ANNOTATION_VERSION, regions: {} });

function isValidRange(range) {
  return range
    && Number.isInteger(range.start)
    && Number.isInteger(range.end)
    && range.start >= 0
    && range.end > range.start;
}

function isStyle(style) {
  return STYLES.includes(style);
}

function validSegment(segment) {
  return isValidRange(segment)
    && (Boolean(segment.highlight) || Boolean(segment.underline));
}

function mergeSegments(segments) {
  const merged = [];
  segments.forEach((segment) => {
    const previous = merged[merged.length - 1];
    if (previous
      && previous.end === segment.start
      && previous.highlight === segment.highlight
      && previous.underline === segment.underline) {
      previous.end = segment.end;
      return;
    }
    merged.push(segment);
  });
  return merged;
}

function partitionSegments(segments, range, style, shouldApply) {
  const existing = Array.isArray(segments) ? segments.filter(validSegment) : [];
  const boundaries = new Set();
  existing.forEach((segment) => {
    boundaries.add(segment.start);
    boundaries.add(segment.end);
  });
  if (isValidRange(range)) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  const result = [];
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const start = orderedBoundaries[index];
    const end = orderedBoundaries[index + 1];
    if (end <= start) continue;
    const source = existing.filter((segment) => segment.start < end && segment.end > start);
    const next = {
      start,
      end,
      highlight: source.some((segment) => segment.highlight),
      underline: source.some((segment) => segment.underline),
    };
    if (isValidRange(range) && range.start < end && range.end > start && isStyle(style)) {
      next[style] = shouldApply;
    }
    if (next.highlight || next.underline) result.push(next);
  }
  return mergeSegments(result);
}

export function normalizeAnnotationSegments(segments) {
  const valid = Array.isArray(segments)
    ? segments.filter(validSegment).map((segment) => ({
      start: segment.start,
      end: segment.end,
      highlight: Boolean(segment.highlight),
      underline: Boolean(segment.underline),
    }))
    : [];
  return partitionSegments(valid, null, null, false);
}

export function applyAnnotationStyle(segments, range, style) {
  if (!isValidRange(range) || !isStyle(style)) return normalizeAnnotationSegments(segments);
  return partitionSegments(segments, range, style, true);
}

export function removeAnnotationStyle(segments, range, style) {
  if (!isValidRange(range) || !isStyle(style)) return normalizeAnnotationSegments(segments);
  return partitionSegments(segments, range, style, false);
}

export function clearAnnotationStyles(segments, range) {
  if (!isValidRange(range)) return normalizeAnnotationSegments(segments);
  return partitionSegments(
    partitionSegments(segments, range, "highlight", false),
    range,
    "underline",
    false,
  );
}

export function getAnnotationStyleState(segments, range, style) {
  if (!isValidRange(range) || !isStyle(style)) return "inactive";
  const normalized = normalizeAnnotationSegments(segments);
  const boundaries = new Set([range.start, range.end]);
  normalized.forEach((segment) => {
    if (segment.start < range.end && segment.end > range.start) {
      boundaries.add(Math.max(segment.start, range.start));
      boundaries.add(Math.min(segment.end, range.end));
    }
  });
  const ordered = [...boundaries].sort((left, right) => left - right);
  let styled = false;
  let unstyled = false;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    const segment = normalized.find((candidate) => candidate.start <= start && candidate.end >= end);
    if (segment?.[style]) styled = true;
    else unstyled = true;
  }
  if (styled && unstyled) return "mixed";
  return styled ? "active" : "inactive";
}

export function findAnnotationSegmentAtOffset(segments, offset) {
  if (!Number.isFinite(offset)) return null;
  return normalizeAnnotationSegments(segments)
    .find((segment) => segment.start <= offset && offset < segment.end) || null;
}

export function exerciseAnnotationScope(exerciseType, exerciseId) {
  return `${ANNOTATION_PREFIX}exercise:${exerciseType}:${exerciseId}`;
}

export function mockAnnotationScope(attemptId) {
  return `${ANNOTATION_PREFIX}mock:${attemptId}`;
}

function getSessionStorage() {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isStoredState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.version !== ANNOTATION_VERSION || !value.regions
    || typeof value.regions !== "object" || Array.isArray(value.regions)) return false;
  return Object.values(value.regions).every((segments) => {
    if (!Array.isArray(segments)) return false;
    return segments.every((segment) => validSegment(segment));
  });
}

export function loadAnnotationState(scope) {
  const storage = getSessionStorage();
  if (!storage || typeof scope !== "string") return emptyAnnotationState();
  let raw;
  try {
    raw = storage.getItem(scope);
  } catch {
    return emptyAnnotationState();
  }
  if (raw === null) return emptyAnnotationState();
  try {
    const parsed = JSON.parse(raw);
    if (!isStoredState(parsed)) throw new Error("invalid annotation state");
    const regions = Object.fromEntries(Object.entries(parsed.regions).map(([regionId, segments]) => [
      regionId,
      normalizeAnnotationSegments(segments),
    ]));
    return { version: ANNOTATION_VERSION, regions };
  } catch {
    try {
      storage.removeItem(scope);
    } catch {
      // Storage cleanup is best effort.
    }
    return emptyAnnotationState();
  }
}

export function saveAnnotationState(scope, state) {
  const storage = getSessionStorage();
  if (!storage || typeof scope !== "string") return false;
  try {
    storage.setItem(scope, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearAnnotationScope(scope) {
  const storage = getSessionStorage();
  if (!storage || typeof scope !== "string") return;
  try {
    storage.removeItem(scope);
  } catch {
    // Storage cleanup is best effort.
  }
}

export function clearAllExamAnnotations() {
  const storage = getSessionStorage();
  if (!storage) return;
  const keys = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(ANNOTATION_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage cleanup is best effort.
  }
}

function textNodes(root) {
  if (!root || !root.ownerDocument) return [];
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

function validDomPoint(root, node, offset) {
  if (!root || !node || !Number.isInteger(offset) || offset < 0) return false;
  if (node !== root && !root.contains(node)) return false;
  if (node.nodeType === 3) return offset <= node.data.length;
  return node.nodeType === 1 && offset <= node.childNodes.length;
}

export function domPointToTextOffset(root, node, offset) {
  if (!validDomPoint(root, node, offset)) return null;
  try {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

export function textOffsetToDomPoint(root, offset) {
  if (!root || !Number.isInteger(offset) || offset < 0 || offset > (root.textContent || "").length) {
    return null;
  }
  const nodes = textNodes(root);
  if (!nodes.length) return null;
  let consumed = 0;
  for (const node of nodes) {
    const end = consumed + node.data.length;
    if (offset <= end) return { node, offset: offset - consumed };
    consumed = end;
  }
  return { node: nodes[nodes.length - 1], offset: nodes[nodes.length - 1].data.length };
}

function closestAnnotationRegion(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.("[data-exam-annotation-region]") || null;
}

export function selectionToAnnotationRange(selection) {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const startRoot = closestAnnotationRegion(range.startContainer);
  const endRoot = closestAnnotationRegion(range.endContainer);
  if (!startRoot || startRoot !== endRoot) return null;
  const crossesNestedRegion = [...startRoot.querySelectorAll("[data-exam-annotation-region]")]
    .some((candidate) => candidate !== startRoot && candidate.textContent && range.intersectsNode(candidate));
  if (crossesNestedRegion) return null;
  const start = domPointToTextOffset(startRoot, range.startContainer, range.startOffset);
  const end = domPointToTextOffset(startRoot, range.endContainer, range.endOffset);
  const text = range.toString();
  if (start === null || end === null || end <= start || !text) return null;
  return {
    regionId: startRoot.dataset.examAnnotationRegion,
    root: startRoot,
    start,
    end,
    text,
  };
}

export function getAnnotationToolbarPosition(selectionRect, toolbarRect, viewport, gutter = 8) {
  const width = Number.isFinite(toolbarRect?.width) ? toolbarRect.width : 0;
  const height = Number.isFinite(toolbarRect?.height) ? toolbarRect.height : 0;
  const viewportWidth = Number.isFinite(viewport?.width) ? viewport.width : 0;
  const viewportHeight = Number.isFinite(viewport?.height) ? viewport.height : 0;
  const selectionCenter = ((selectionRect?.left || 0) + (selectionRect?.right || 0)) / 2;
  const left = Math.min(
    Math.max(gutter, selectionCenter - (width / 2)),
    Math.max(gutter, viewportWidth - width - gutter),
  );
  const aboveTop = (selectionRect?.top || 0) - height - gutter;
  const placement = aboveTop >= gutter ? "above" : "below";
  const top = placement === "above"
    ? aboveTop
    : Math.min((selectionRect?.bottom || 0) + gutter, Math.max(gutter, viewportHeight - height - gutter));
  return { left, top, placement };
}
