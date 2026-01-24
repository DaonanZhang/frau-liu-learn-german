import { useEffect, useMemo, useState } from "react";
import {
  fetchExpressionOccurrences,
  fetchWordOccurrences,
} from "../../api/learning_by_video/occurrences";

import {
  buildVideoMarksSets,
  fetchMarksForVideo,
  toggleVideoOccurrenceMark,
} from "../../api/learning_by_video/marks"

/**
 * @typedef {"word"|"expression"} LexiconKind
 */

/**
 * @typedef {Object} LexiconEntry
 * @property {string} key
 * @property {LexiconKind} kind
 * @property {string} title
 * @property {number[]} subtitleIds
 * @property {string} translation
 * @property {string} pos
 * @property {boolean|null} splittable
 * @property {string} prototype
 * @property {string} surface
 * @property {number|null} entityId
 * @property {number[]} occurrenceIds
 */

function normalizeText(text) {
  return String(text ?? "").trim();
}

function uniqueNumberArray(numbers) {
  const seen = new Set();
  const result = [];
  for (const numberValue of numbers) {
    const num = Number(numberValue);
    if (!Number.isFinite(num)) {
      continue;
    }
    if (seen.has(num)) {
      continue;
    }
    seen.add(num);
    result.push(num);
  }
  return result;
}

function posToLabel(posValue) {
  const normalized = String(posValue ?? "").trim().toUpperCase();

  if (normalized === "NOUN") {
    return "n.";
  } else if (normalized === "VERB") {
    return "v.";
  } else if (normalized === "ADJ") {
    return "adj.";
  } else if (normalized === "ADV") {
    return "adv.";
  } else if (normalized === "PRON") {
    return "pron.";
  } else if (normalized === "PREP") {
    return "prep.";
  } else if (normalized === "CONJ") {
    return "conj.";
  } else if (normalized === "DET") {
    return "det.";
  } else if (normalized === "PART") {
    return "part.";
  } else if (normalized === "INTJ") {
    return "intj.";
  }

  return normalized ? normalized.toLowerCase() : "";
}

function EyeIcon({ isHidden }) {
  if (isHidden) {
    return (
      <svg
        className="vs-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 3l18 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M10.6 10.6A3 3 0 0 0 13.4 13.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.5 0 9.7 4.7 10.9 7-0.5 1-1.7 2.8-3.6 4.3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M6.2 6.2C3.9 7.8 2.4 10.1 1.1 12c1.2 2.2 5.4 7 10.9 7 1.6 0 3.1-.4 4.4-1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className="vs-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.1 12c1.2-2.2 5.4-7 10.9-7s9.7 4.7 10.9 7c-1.2 2.2-5.4 7-10.9 7S2.3 14.2 1.1 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="vs-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 18c3.3 0 6-2.7 6-6s-2.7-6-6-6-6 2.7-6 6 2.7 6 6 6Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 14c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * Merge occurrences into a unique lexicon entry list.
 *
 * Word fields expected from API:
 * - word_text
 * - word_pos
 * - word_splittable
 * - translation
 *
 * Expression fields expected from API:
 * - expression_text
 * - expression_prototype
 * - translation
 *
 * @param {any[]} wordOccurrences
 * @param {any[]} expressionOccurrences
 * @returns {LexiconEntry[]}
 */
function buildLexiconEntries(wordOccurrences, expressionOccurrences) {
  /** @type {Map<string, LexiconEntry>} */
  const map = new Map();

  function toIntOrNull(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
      return null;
    }
    return num;
  }

  function upsert(entryKey, nextEntry, subtitleId, occurrenceId) {
    const existing = map.get(entryKey);

    if (!existing) {
      map.set(entryKey, {
        ...nextEntry,
        subtitleIds:
          subtitleId !== null && subtitleId !== undefined ? [Number(subtitleId)] : [],
        occurrenceIds:
          occurrenceId !== null && occurrenceId !== undefined ? [Number(occurrenceId)] : [],
      });
      return;
    }

    if (subtitleId !== null && subtitleId !== undefined) {
      existing.subtitleIds.push(Number(subtitleId));
    }

    if (occurrenceId !== null && occurrenceId !== undefined) {
      existing.occurrenceIds.push(Number(occurrenceId));
    }

    if (!existing.translation && nextEntry.translation) {
      existing.translation = nextEntry.translation;
    }

    if (!existing.pos && nextEntry.pos) {
      existing.pos = nextEntry.pos;
    }

    if (existing.splittable === null && nextEntry.splittable !== null) {
      existing.splittable = nextEntry.splittable;
    }

    if (!existing.prototype && nextEntry.prototype) {
      existing.prototype = nextEntry.prototype;
    }

    if (!existing.surface && nextEntry.surface) {
      existing.surface = nextEntry.surface;
    }

    if ((existing.entityId === null || existing.entityId === undefined) && nextEntry.entityId) {
      existing.entityId = nextEntry.entityId;
    }
  }

  for (const occurrence of wordOccurrences) {
    const wordText = normalizeText(occurrence?.word_text);
    if (!wordText) {
      continue;
    }

    const entryKey = `word:${wordText.toLowerCase()}`;

    const occurrenceId = toIntOrNull(occurrence?.id);
    const wordId = toIntOrNull(occurrence?.word);

    upsert(
      entryKey,
      {
        key: entryKey,
        kind: "word",
        title: wordText,
        translation: normalizeText(occurrence?.translation),
        pos: normalizeText(occurrence?.word_pos),
        splittable:
          occurrence?.word_splittable === true
            ? true
            : occurrence?.word_splittable === false
              ? false
              : null,
        prototype: "",
        surface: "",
        subtitleIds: [],
        occurrenceIds: [],
        entityId: wordId,
      },
      occurrence?.subtitle,
      occurrenceId
    );
  }

  for (const occurrence of expressionOccurrences) {
    const prototype = normalizeText(occurrence?.expression_prototype);
    const surface = normalizeText(occurrence?.expression_text);
    const title = prototype || surface;

    if (!title) {
      continue;
    }

    const entryKey = `expression:${title.toLowerCase()}`;

    const occurrenceId = toIntOrNull(occurrence?.id);
    const expressionId = toIntOrNull(occurrence?.expression);

    upsert(
      entryKey,
      {
        key: entryKey,
        kind: "expression",
        title: title,
        translation: normalizeText(occurrence?.translation),
        pos: "",
        splittable: null,
        prototype: prototype,
        surface: surface,
        subtitleIds: [],
        occurrenceIds: [],
        entityId: expressionId,
      },
      occurrence?.subtitle,
      occurrenceId
    );
  }

  for (const entry of map.values()) {
    entry.subtitleIds = uniqueNumberArray(entry.subtitleIds);
    entry.occurrenceIds = uniqueNumberArray(entry.occurrenceIds);

    if (entry.entityId !== null && entry.entityId !== undefined) {
      entry.entityId = Number(entry.entityId);
    } else {
      entry.entityId = null;
    }
  }

  return Array.from(map.values());
}

export default function LexiconPanel({
  videoId,
  subtitleItems,
  activeSubtitleIndex,
  onSeek,
  onClose,
}) {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [entries, setEntries] = useState(/** @type {LexiconEntry[]} */ ([]));
  const [activeKind, setActiveKind] = useState(/** @type {LexiconKind} */ ("word"));
  const [onlyCurrentSubtitle, setOnlyCurrentSubtitle] = useState(false);

  // per card: hide Chinese (meaning + subtitle zh)
  const [hiddenChineseByKey, setHiddenChineseByKey] = useState({});

  // UI-only (not persisted yet)
  const [knowledgeByKey, setKnowledgeByKey] = useState({});

  const currentSubtitleId = useMemo(() => {
    if (!subtitleItems || subtitleItems.length <= 0) {
      return null;
    }
    if (activeSubtitleIndex < 0 || activeSubtitleIndex >= subtitleItems.length) {
      return null;
    }
    const subtitleId = subtitleItems[activeSubtitleIndex]?.id;
    if (subtitleId === null || subtitleId === undefined) {
      return null;
    }
    return Number(subtitleId);
  }, [activeSubtitleIndex, subtitleItems]);

  useEffect(() => {
    let aborted = false;

    async function loadOccurrences() {
      try {
        setLoading(true);
        setErrorText("");

        const [words, expressions] = await Promise.all([
          fetchWordOccurrences({ video: videoId }),
          fetchExpressionOccurrences({ video: videoId }),
        ]);

        if (aborted) {
          return;
        }

        const nextEntries = buildLexiconEntries(words, expressions);

        const [wordScope, expressionScope] = await Promise.all([
          fetchMarksForVideo({ contentType: "word", videoId: Number(videoId) }),
          fetchMarksForVideo({ contentType: "expression", videoId: Number(videoId) }),
        ]);

        const wordSets = buildVideoMarksSets(wordScope);
        const expressionSets = buildVideoMarksSets(expressionScope);

        /**
         * @param {number|null} occurrenceId
         * @param {{knownSet:Set<number>, unknownSet:Set<number>, elsewhereSet:Set<number>}} sets
         * @returns {"known"|"not_known"|"elsewhere"|"unmarked"}
         */
        function resolveUiStateByOccurrence(occurrenceId, sets) {
          if (!occurrenceId) {
            return "unmarked";
          }

          if (sets.knownSet.has(occurrenceId)) {
            return "known";
          }

          if (sets.unknownSet.has(occurrenceId)) {
            return "not_known";
          }

          if (sets.elsewhereSet.has(occurrenceId)) {
            return "elsewhere";
          }

          return "unmarked";
        }

        /** @type {Record<string, "known"|"not_known"|"elsewhere"|"unmarked">} */
        const nextKnowledgeByKey = {};

        for (const entry of nextEntries) {
          const firstOccurrenceId =
            Array.isArray(entry.occurrenceIds) && entry.occurrenceIds.length > 0
              ? Number(entry.occurrenceIds[0])
              : null;

          const sets = entry.kind === "word" ? wordSets : expressionSets;
          nextKnowledgeByKey[entry.key] = resolveUiStateByOccurrence(firstOccurrenceId, sets);
        }

        setEntries(nextEntries);
        setKnowledgeByKey(nextKnowledgeByKey);

      } catch (error) {
        if (aborted) {
          return;
        }
        setEntries([]);
        setErrorText(error?.message ? String(error.message) : "Failed to load lexicon");
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    }

    if (videoId) {
      loadOccurrences();
    } else {
      setEntries([]);
      setLoading(false);
      setErrorText("");
    }

    return () => {
      aborted = true;
    };
  }, [videoId]);

  function toggleHideChinese(entryKey) {
    setHiddenChineseByKey((prev) => {
      const current = prev[entryKey] === true;
      return { ...prev, [entryKey]: !current };
    });
  }

  function toIntOrNull(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
      return null;
    }
    return num;
  }

  /**
   * @param {"KNOWN"|"UNKNOWN"|"UNMARKED"} occurrenceState
   * @param {"elsewhere"|"unmarked"} fallback
   * @returns {"known"|"not_known"|"elsewhere"|"unmarked"}
   */
  function mapOccurrenceStateToUi(occurrenceState, fallback) {
    if (occurrenceState === "KNOWN") {
      return "known";
    } else if (occurrenceState === "UNKNOWN") {
      return "not_known";
    }
    return fallback;
  }

  /**
   * @param {LexiconEntry} entry
   * @param {"KNOWN"|"UNKNOWN"|"UNMARKED"} knowledge
   * @returns {Promise<void>}
   */
  async function postOccurrenceMark(entry, knowledge) {
    if (!entry) {
      return;
    }

    const entityId = toIntOrNull(entry.entityId);
    const occurrenceId =
      Array.isArray(entry.occurrenceIds) && entry.occurrenceIds.length > 0
        ? toIntOrNull(entry.occurrenceIds[0])
        : null;

    if (!entityId || !occurrenceId) {
      return;
    }

    try {
      const result = await toggleVideoOccurrenceMark({
        contentType: entry.kind,
        entityId,
        occurrenceId,
        knowledge,
      });

      setKnowledgeByKey((prev) => {
        const prevState = prev[entry.key] || "unmarked";
        const fallback = prevState === "elsewhere" ? "elsewhere" : "unmarked";
        const nextState = mapOccurrenceStateToUi(result?.occurrence_state, fallback);

        return { ...prev, [entry.key]: nextState };
      });
    } catch (error) {
      setErrorText(error?.message ? String(error.message) : "Failed to update mark");
    }
  }

  /**
   * Mark current entry as KNOWN.
   *
   * @param {LexiconEntry} entry
   * @returns {void}
   */
  function handleMarkKnown(entry) {
    postOccurrenceMark(entry, "KNOWN");
  }

  /**
   * Mark current entry as UNKNOWN.
   *
   * @param {LexiconEntry} entry
   * @returns {void}
   */
  function handleMarkNotKnown(entry) {
    postOccurrenceMark(entry, "UNKNOWN");
  }

  /**
   * Unmark current entry (force UNMARKED).
   *
   * @param {LexiconEntry} entry
   * @returns {void}
   */
  function handleUnmark(entry) {
    postOccurrenceMark(entry, "UNMARKED");
  }


  function findStartBySubtitleId(subtitleId) {
    if (!subtitleItems || subtitleItems.length <= 0) {
      return null;
    }

    const targetId = Number(subtitleId);
    for (const item of subtitleItems) {
      if (Number(item?.id) === targetId) {
        const startValue = Number(item?.start ?? 0);
        if (Number.isFinite(startValue)) {
          return startValue;
        }
        return 0;
      }
    }

    return null;
  }

  function findSubtitleById(subtitleId) {
    if (!subtitleItems || subtitleItems.length <= 0) {
      return null;
    }

    const targetId = Number(subtitleId);
    for (const item of subtitleItems) {
      if (Number(item?.id) === targetId) {
        return item;
      }
    }

    return null;
  }

  function handleJumpToEntry(entry) {
    if (!entry || entry.subtitleIds.length <= 0) {
      return;
    }

    const firstSubtitleId = entry.subtitleIds[0];
    const startSeconds = findStartBySubtitleId(firstSubtitleId);

    if (startSeconds === null) {
      return;
    }

    if (onSeek) {
      onSeek(startSeconds);
    }
  }

  const filteredEntries = useMemo(() => {
    let list = entries;

    if (activeKind) {
      list = list.filter((x) => x.kind === activeKind);
    }

    if (onlyCurrentSubtitle && currentSubtitleId !== null) {
      list = list.filter((x) => x.subtitleIds.includes(currentSubtitleId));
    }

    return list;
  }, [entries, activeKind, onlyCurrentSubtitle, currentSubtitleId]);

  const wordCount = useMemo(() => entries.filter((x) => x.kind === "word").length, [entries]);
  const expressionCount = useMemo(() => entries.filter((x) => x.kind === "expression").length, [entries]);

  return (
    <div className="vs-panel">
      <div className="vs-rightHeader">
        <div className="vs-rightHeaderTop">
          <div className="vs-rightHeaderTitle">单词面板</div>

          <button
            className="vs-rightCollapseBtn"
            type="button"
            aria-label="Collapse lexicon panel"
            onClick={() => {
              if (onClose) {
                onClose();
              }
            }}
          >
            ×
          </button>
        </div>

        <div className="vs-tabs">
          <button
            className={["vs-tab", activeKind === "word" ? "is-active" : ""].filter(Boolean).join(" ")}
            type="button"
            onClick={() => {
              setActiveKind("word");
            }}
          >
            单词 ({wordCount})
          </button>

          <button
            className={["vs-tab", activeKind === "expression" ? "is-active" : ""].filter(Boolean).join(" ")}
            type="button"
            onClick={() => {
              setActiveKind("expression");
            }}
          >
            地道表达 ({expressionCount})
          </button>
        </div>

        <div className="vs-actionsRow">
          <button
            className={["vs-actionBtn", onlyCurrentSubtitle ? "is-primary" : ""].filter(Boolean).join(" ")}
            type="button"
            onClick={() => {
              setOnlyCurrentSubtitle((prev) => !prev);
            }}
            disabled={currentSubtitleId === null}
            aria-label="Toggle filter by current subtitle"
          >
            {onlyCurrentSubtitle ? "仅当前字幕" : "全部字幕"}
          </button>
        </div>
      </div>

      <div className="vs-lexList">
        {loading ? <div className="vs-subEmpty">Loading…</div> : null}

        {!loading && errorText ? (
          <div className="vs-subEmpty">Failed to load: {errorText}</div>
        ) : null}

        {!loading && !errorText && filteredEntries.length <= 0 ? (
          <div className="vs-subEmpty">No items</div>
        ) : null}

        {!loading && !errorText
          ? filteredEntries.map((entry) => {
              const isWord = entry.kind === "word";
              const hideChinese = hiddenChineseByKey[entry.key] === true;
              const knowledgeState = knowledgeByKey[entry.key] || "unknown";

              const posLabel = posToLabel(entry.pos);
              const splittableLabel = entry.splittable === true ? "trennbar" : "";
              const showMetaLine = Boolean(posLabel || splittableLabel);

              const firstSubtitleId = entry.subtitleIds.length > 0 ? entry.subtitleIds[0] : null;
              const subtitleItem = firstSubtitleId !== null ? findSubtitleById(firstSubtitleId) : null;

              // SubtitlePanel provides items as {id, start, end, de, zh}
              const subtitleDe = normalizeText(subtitleItem?.de);
              const subtitleZh = normalizeText(subtitleItem?.zh);

              return (
                <article
                  key={entry.key}
                  className={[
                    "vs-lexCard",
                    knowledgeState === "known" ? "is-known" : "",
                    knowledgeState === "not_known" ? "is-not-known" : "",
                    knowledgeState === "elsewhere" ? "is-elsewhere" : "",
                  ].filter(Boolean).join(" ")}
                  tabIndex={0}
                >
                  <div className="vs-lexHeaderRow">
                    <div className="vs-lexWord">{entry.title}</div>

                    <div className="vs-lexHoverActions" aria-label="Knowledge actions">
                      <button
                        className="vs-lexMarkBtn vs-lexMarkBtn--known"
                        type="button"
                        onClick={() => {
                          handleMarkKnown(entry.key);
                        }}
                      >
                        认识
                      </button>

                      <button
                        className="vs-lexMarkBtn vs-lexMarkBtn--not-known"
                        type="button"
                        onClick={() => {
                          handleMarkNotKnown(entry.key);
                        }}
                      >
                        不认识
                      </button>
                    </div>
                  </div>

                  {!hideChinese && entry.translation ? (
                    <div className="vs-lexMeaning">
                      <span className="vs-lexMeaningText">{entry.translation}</span>

                      {showMetaLine ? (
                        <span className="vs-lexMeaningMeta">
                          {posLabel ? <span className="vs-lexPos">{posLabel}</span> : null}
                          {splittableLabel ? <span className="vs-lexMetaDot">·</span> : null}
                          {splittableLabel ? <span className="vs-lexMetaText">{splittableLabel}</span> : null}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {(subtitleDe || subtitleZh) ? (
                    <div className="vs-lexSubtitleCard" role="group" aria-label="Subtitle example">
                      {subtitleDe ? <div className="vs-lexSubtitleDe">{subtitleDe}</div> : null}
                      {!hideChinese && subtitleZh ? (
                        <div className="vs-lexSubtitleZh">{subtitleZh}</div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="vs-lexFooter">
                    <button
                      className="vs-lexBtn"
                      type="button"
                      onClick={() => {
                        handleJumpToEntry(entry);
                      }}
                      disabled={entry.subtitleIds.length <= 0}
                    >
                      <TargetIcon />
                      <span>点读跳转</span>
                    </button>

                    <button
                      className={["vs-eyeBtn", hideChinese ? "is-off" : "is-on"].filter(Boolean).join(" ")}
                      type="button"
                      aria-label={hideChinese ? "Show Chinese" : "Hide Chinese"}
                      onClick={() => {
                        toggleHideChinese(entry.key);
                      }}
                    >
                      <EyeIcon isHidden={hideChinese} />
                    </button>
                  </div>
                </article>
              );
            })
          : null}
      </div>
    </div>
  );
}
