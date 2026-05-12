import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchVideoList } from "../../api/learning_by_video/videos";
import {
  fetchExpressionOccurrences,
  fetchWordOccurrences,
} from "../../api/learning_by_video/occurrences";
import { fetchSubtitlesByVideo } from "../../api/learning_by_video/subtitles";
import { toggleVideoOccurrenceMark } from "../../api/learning_by_video/marks_occurrences.js";
import {
  fetchUserSubtitleFavoritesByVideo,
  setSubtitleFavorite,
} from "../../api/learning_by_video/subtitle_favorites.js";

import Sidebar from "./components/Sidebar.jsx";
import LexiconCard from "./components/LexiconCard";
import { EyeIcon } from "./components/Icons";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

import "./LexiconPage.css";

/**
 * Hook: track whether viewport is <= maxWidth.
 *
 * @param {number} maxWidth - Max viewport width in px.
 * @returns {boolean} True when viewport matches.
 */
function useIsMobileView(maxWidth) {
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);

    const update = () => {
      setIsMobileView(Boolean(mediaQuery.matches));
    };

    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => {
        mediaQuery.removeEventListener("change", update);
      };
    }

    mediaQuery.addListener(update);
    return () => {
      mediaQuery.removeListener(update);
    };
  }, [maxWidth]);

  return isMobileView;
}

/**
 * @typedef {"word"|"expression"} LexiconKind
 */

/**
 * @typedef {"all"|"unmarked"|"known"|"not_known"} StatusFilter
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
 * @property {string|null} article
 */

/**
 * Normalize a potential text field into a trimmed string.
 *
 * @param {unknown} text - Any input value.
 * @returns {string} Normalized string (may be empty).
 */
function normalizeText(text) {
  return String(text ?? "").trim();
}

/**
 * @param {unknown} value - Any value.
 * @returns {number|null} Positive integer or null.
 */
function toIntOrNull(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

/**
 * @param {unknown[]} numbers - Any list.
 * @returns {number[]} Unique finite number array.
 */
function uniqueNumberArray(numbers) {
  const seen = new Set();
  const result = [];

  for (const numberValue of numbers || []) {
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

/**
 * Merge occurrences into a unique lexicon entry list.
 *
 * @param {any[]} wordOccurrences - Word occurrences.
 * @param {any[]} expressionOccurrences - Expression occurrences.
 * @returns {LexiconEntry[]} Entries.
 */
function buildLexiconEntries(wordOccurrences, expressionOccurrences) {
  /** @type {Map<string, LexiconEntry>} */
  const map = new Map();

  /**
   * @param {string} entryKey - Stable entry key.
   * @param {LexiconEntry} nextEntry - Next entry base data.
   * @param {unknown} subtitleId - Subtitle id.
   * @param {unknown} occurrenceId - Occurrence id.
   * @returns {void}
   */
  function upsert(entryKey, nextEntry, subtitleId, occurrenceId) {
    const existing = map.get(entryKey);

    if (!existing) {
      map.set(entryKey, {
        ...nextEntry,
        subtitleIds:
          subtitleId !== null && subtitleId !== undefined ? [Number(subtitleId)] : [],
        occurrenceIds:
          occurrenceId !== null && occurrenceId !== undefined
            ? [Number(occurrenceId)]
            : [],
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

    if ((existing.article === null || existing.article === undefined) && nextEntry.article) {
      existing.article = nextEntry.article;
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

  for (const occurrence of wordOccurrences || []) {
    const word_lemma = normalizeText(occurrence?.word_lemma);
    if (!word_lemma) {
      continue;
    }

    const entryKey = `word:${word_lemma.toLowerCase()}`;

    const occurrenceId = toIntOrNull(occurrence?.id);
    const wordId = toIntOrNull(occurrence?.word);

    upsert(
      entryKey,
      {
        key: entryKey,
        kind: "word",
        title: word_lemma,
        article: normalizeText(occurrence?.word_article) || null,
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

  for (const occurrence of expressionOccurrences || []) {
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
        article: null,
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

/**
 * @param {any} occurrence - occurrence object.
 * @returns {"known"|"not_known"|"elsewhere"|"unmarked"}
 */
function resolveUiStateFromOccurrence(occurrence) {
  const knowledge = String(occurrence?.my_knowledge || "UNMARKED").toUpperCase();
  const markedElsewhere = occurrence?.marked_elsewhere === true;

  if (knowledge === "KNOWN") {
    return "known";
  }

  if (knowledge === "UNKNOWN") {
    return "not_known";
  }

  if (knowledge === "UNMARKED" && markedElsewhere) {
    return "elsewhere";
  }

  return "unmarked";
}

/**
 * @param {number[]} occurrenceIds - occurrence ids.
 * @param {Record<number, "known"|"not_known"|"elsewhere"|"unmarked">} uiStateByOccurrenceId - state map.
 * @returns {"known"|"not_known"|"elsewhere"|"unmarked"}
 */
function aggregateEntryStateByOccurrences(occurrenceIds, uiStateByOccurrenceId) {
  let hasElsewhere = false;

  for (const occurrenceIdValue of occurrenceIds || []) {
    const occurrenceId = Number(occurrenceIdValue);
    const state = uiStateByOccurrenceId[occurrenceId];

    if (state === "known") {
      return "known";
    }

    if (state === "not_known") {
      return "not_known";
    }

    if (state === "elsewhere") {
      hasElsewhere = true;
    }
  }

  if (hasElsewhere) {
    return "elsewhere";
  }

  return "unmarked";
}

/**
 * @param {"KNOWN"|"UNKNOWN"|"UNMARKED"} occurrenceState - server occurrence state.
 * @param {"elsewhere"|"unmarked"} fallback - fallback.
 * @returns {"known"|"not_known"|"elsewhere"|"unmarked"}
 */
function mapOccurrenceStateToUi(occurrenceState, fallback) {
  if (occurrenceState === "KNOWN") {
    return "known";
  }

  if (occurrenceState === "UNKNOWN") {
    return "not_known";
  }

  return fallback;
}

/**
 * Convert a videos list entry into {id, name}.
 *
 * @param {Record<string, unknown>} video - Video object from API.
 * @returns {{ id: number | string, name: string }}
 */
function normalizeVideo(video) {
  const id = video.id;
  const name =
    normalizeText(video.title) ||
    normalizeText(video.name) ||
    normalizeText(video.display_name) ||
    normalizeText(video.displayName) ||
    `Video ${id}`;
  const seasonNumber = toIntOrNull(video.season_number);
  const moduleKey = seasonNumber === 4 ? "vlog" : "science";
  const moduleLabel = moduleKey === "vlog" ? "Vlog" : "Science";

  return { id, name, seasonNumber, moduleKey, moduleLabel };
}

/**
 * @param {unknown} response - API response.
 * @returns {any[]} Safe array.
 */
function safeArray(response) {
  if (Array.isArray(response)) {
    return response;
  }
  if (Array.isArray(response?.results)) {
    return response.results;
  }
  return [];
}

/**
 * Clamp value into [min, max]
 *
 * @param {number} value - Value to clamp.
 * @param {number} min - Min.
 * @param {number} max - Max.
 * @returns {number} Clamped value.
 */
function clampNumber(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function formatTime(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s < 0) {
    return "0:00";
  }

  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function StarIcon({ filled }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5 14.9 9l6 .87-4.35 4.24 1.03 5.99L12 17.03 6.42 20.1l1.03-5.99L3.1 9.87 9.1 9 12 3.5Z" />
    </svg>
  );
}

export default function LexiconPage() {
  const navigate = useNavigate();
  const isMobileView = useIsMobileView(990);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  useBodyScrollLock(isMobileView && isMobileSidebarOpen);

  const [isVideosLoading, setIsVideosLoading] = useState(false);
  const [videos, setVideos] = useState([]);
  const [selectedVideoId, setSelectedVideoId] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [entries, setEntries] = useState([]);
  const [activeKind, setActiveKind] = useState("word");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sentenceFilter, setSentenceFilter] = useState("all");

  const [knowledgeByKey, setKnowledgeByKey] = useState({});
  const [hiddenChineseByKey, setHiddenChineseByKey] = useState({});
  const [isChineseHiddenGlobal, setIsChineseHiddenGlobal] = useState(false);

  const [subtitlesById, setSubtitlesById] = useState({});
  const [subtitleItems, setSubtitleItems] = useState([]);
  const [favoriteSubtitleIds, setFavoriteSubtitleIds] = useState(() => new Set());
  const [favoritePendingBySubtitleId, setFavoritePendingBySubtitleId] = useState({});

  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);

  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    deltaX: 0,
    startTime: 0,
  });

  useEffect(() => {
    if (!isMobileView) {
      setIsMobileSidebarOpen(false);
    }
  }, [isMobileView]);

  useEffect(() => {
    if (isMobileView) {
      setMobileActiveIndex(0);
    }
  }, [isMobileView, activeKind, statusFilter, sentenceFilter, selectedVideoId]);

  const loadVideos = useCallback(async () => {
    setIsVideosLoading(true);

    try {
      const response = await fetchVideoList();
      const list = safeArray(response);
      const normalized = list.map(normalizeVideo);

      setVideos(normalized);

      if (normalized.length > 0 && selectedVideoId === null) {
        setSelectedVideoId(normalized[0].id);
      }
    } finally {
      setIsVideosLoading(false);
    }
  }, [selectedVideoId]);

  const effectiveSidebarCollapsed = isMobileView ? !isMobileSidebarOpen : isSidebarCollapsed;

  const groupedVideos = useMemo(() => {
    const groups = [
      { key: "science", label: "Science", videos: [] },
      { key: "vlog", label: "Vlog", videos: [] },
    ];

    for (const video of videos) {
      const targetGroup = video.moduleKey === "vlog" ? groups[1] : groups[0];
      targetGroup.videos.push(video);
    }

    return groups.filter((group) => group.videos.length > 0);
  }, [videos]);

  useEffect(() => {
    if (!effectiveSidebarCollapsed) {
      loadVideos();
    }
  }, [effectiveSidebarCollapsed, loadVideos]);

  useEffect(() => {
    let aborted = false;

    async function loadAllData(videoId) {
      try {
        setIsLoading(true);
        setErrorText("");

        const [wordResponse, expressionResponse, subtitleResponse, favoriteResponse] = await Promise.all([
          fetchWordOccurrences({ video: videoId }),
          fetchExpressionOccurrences({ video: videoId }),
          fetchSubtitlesByVideo(videoId),
          fetchUserSubtitleFavoritesByVideo(videoId),
        ]);

        if (aborted) {
          return;
        }

        const wordOccurrences = safeArray(wordResponse);
        const expressionOccurrences = safeArray(expressionResponse);
        const subtitleItems = safeArray(subtitleResponse);
        const favoriteItems = safeArray(favoriteResponse);

        const nextEntries = buildLexiconEntries(wordOccurrences, expressionOccurrences);

        /** @type {Record<number, "known"|"not_known"|"elsewhere"|"unmarked">} */
        const uiStateByOccurrenceId = {};

        for (const occurrence of wordOccurrences) {
          const occurrenceId = Number(occurrence?.id);
          if (!Number.isFinite(occurrenceId) || occurrenceId <= 0) {
            continue;
          }
          uiStateByOccurrenceId[occurrenceId] = resolveUiStateFromOccurrence(occurrence);
        }

        for (const occurrence of expressionOccurrences) {
          const occurrenceId = Number(occurrence?.id);
          if (!Number.isFinite(occurrenceId) || occurrenceId <= 0) {
            continue;
          }
          uiStateByOccurrenceId[occurrenceId] = resolveUiStateFromOccurrence(occurrence);
        }

        /** @type {Record<string, "known"|"not_known"|"elsewhere"|"unmarked">} */
        const nextKnowledgeByKey = {};

        for (const entry of nextEntries) {
          nextKnowledgeByKey[entry.key] = aggregateEntryStateByOccurrences(
            entry.occurrenceIds,
            uiStateByOccurrenceId
          );
        }

        /** @type {Record<number, any>} */
        const nextSubtitlesById = {};

        for (const subtitle of subtitleItems) {
          const subtitleId = toIntOrNull(subtitle?.id);
          if (!subtitleId) {
            continue;
          }
          nextSubtitlesById[subtitleId] = subtitle;
        }

        const nextFavoriteSubtitleIds = new Set();
        for (const favorite of favoriteItems) {
          const subtitleId = toIntOrNull(favorite?.subtitle);
          if (!subtitleId) {
            continue;
          }
          nextFavoriteSubtitleIds.add(subtitleId);
        }

        setEntries(nextEntries);
        setKnowledgeByKey(nextKnowledgeByKey);
        setSubtitlesById(nextSubtitlesById);
        setSubtitleItems(subtitleItems);
        setFavoriteSubtitleIds(nextFavoriteSubtitleIds);
        setFavoritePendingBySubtitleId({});
        setHiddenChineseByKey({});
      } catch (error) {
        if (aborted) {
          return;
        }
        setEntries([]);
        setKnowledgeByKey({});
        setSubtitlesById({});
        setSubtitleItems([]);
        setFavoriteSubtitleIds(new Set());
        setFavoritePendingBySubtitleId({});
        setHiddenChineseByKey({});
        setErrorText(error?.message ? String(error.message) : "Failed to load lexicon");
      } finally {
        if (!aborted) {
          setIsLoading(false);
        }
      }
    }

    if (selectedVideoId !== null && selectedVideoId !== undefined) {
      loadAllData(selectedVideoId);
    } else {
      setEntries([]);
      setKnowledgeByKey({});
      setSubtitlesById({});
      setSubtitleItems([]);
      setFavoriteSubtitleIds(new Set());
      setFavoritePendingBySubtitleId({});
      setHiddenChineseByKey({});
      setIsLoading(false);
      setErrorText("");
    }

    return () => {
      aborted = true;
    };
  }, [selectedVideoId]);

  const selectedVideoName = useMemo(() => {
    if (selectedVideoId === null) {
      return "";
    }
    const matched = videos.find((video) => video.id === selectedVideoId);
    return matched ? matched.name : "";
  }, [selectedVideoId, videos]);

  const onClickGoHome = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const onToggleSidebar = useCallback(() => {
    if (isMobileView) {
      setIsMobileSidebarOpen((previous) => !previous);
      return;
    }
    setIsSidebarCollapsed((previous) => !previous);
  }, [isMobileView]);

  const onCloseMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false);
  }, []);

  const onSelectVideo = useCallback(
    (videoId) => {
      setSelectedVideoId(videoId);

      if (isMobileView) {
        setIsMobileSidebarOpen(false);
      }
    },
    [isMobileView]
  );

  const onToggleGlobalChinese = useCallback(() => {
    setIsChineseHiddenGlobal((previous) => !previous);
  }, []);

  const onToggleCardChinese = useCallback((entryKey) => {
    setHiddenChineseByKey((previous) => {
      const current = previous[entryKey] === true;
      return { ...previous, [entryKey]: !current };
    });
  }, []);

  const baseEntries = useMemo(() => {
    if (activeKind === "sentence") {
      return [];
    }

    let list = entries;

    if (activeKind) {
      list = list.filter((x) => x.kind === activeKind);
    }

    return list;
  }, [entries, activeKind]);

  const sentenceCount = useMemo(() => subtitleItems.length, [subtitleItems]);

  const sentenceStatusCounts = useMemo(() => {
    let favorited = 0;
    for (const subtitle of subtitleItems) {
      const subtitleId = toIntOrNull(subtitle?.id);
      if (subtitleId && favoriteSubtitleIds.has(subtitleId)) {
        favorited += 1;
      }
    }
    return {
      all: subtitleItems.length,
      favorited,
      unfavorited: Math.max(0, subtitleItems.length - favorited),
    };
  }, [subtitleItems, favoriteSubtitleIds]);

  const filteredSentenceItems = useMemo(() => {
    if (sentenceFilter === "all") {
      return subtitleItems;
    }

    return subtitleItems.filter((subtitle) => {
      const subtitleId = toIntOrNull(subtitle?.id);
      const isFavorited = Boolean(subtitleId && favoriteSubtitleIds.has(subtitleId));
      if (sentenceFilter === "favorited") {
        return isFavorited;
      }
      return !isFavorited;
    });
  }, [subtitleItems, sentenceFilter, favoriteSubtitleIds]);

  const statusCounts = useMemo(() => {
    let known = 0;
    let notKnown = 0;
    let unmarked = 0;

    for (const entry of baseEntries) {
      const state = knowledgeByKey[entry.key] || "unmarked";
      if (state === "known") {
        known += 1;
      } else if (state === "not_known") {
        notKnown += 1;
      } else {
        unmarked += 1;
      }
    }

    return {
      all: baseEntries.length,
      known,
      not_known: notKnown,
      unmarked,
    };
  }, [baseEntries, knowledgeByKey]);

  const filteredEntries = useMemo(() => {
    if (statusFilter === "all") {
      return baseEntries;
    }

    return baseEntries.filter((entry) => {
      const state = knowledgeByKey[entry.key] || "unmarked";

      if (statusFilter === "known") {
        return state === "known";
      }

      if (statusFilter === "not_known") {
        return state === "not_known";
      }

      return state === "unmarked" || state === "elsewhere";
    });
  }, [baseEntries, knowledgeByKey, statusFilter]);

  useEffect(() => {
    setMobileActiveIndex((previous) => {
      const maxIndex = Math.max(0, filteredEntries.length - 1);
      return clampNumber(previous, 0, maxIndex);
    });
  }, [filteredEntries.length]);

  const wordCount = useMemo(() => entries.filter((x) => x.kind === "word").length, [entries]);
  const expressionCount = useMemo(
    () => entries.filter((x) => x.kind === "expression").length,
    [entries]
  );

  const onToggleSentenceFavorite = useCallback(
    async (subtitleId) => {
      const parsedSubtitleId = toIntOrNull(subtitleId);
      if (!parsedSubtitleId) {
        return;
      }

      if (favoritePendingBySubtitleId[parsedSubtitleId]) {
        return;
      }

      const currentFavorite = favoriteSubtitleIds.has(parsedSubtitleId);
      const nextFavorite = !currentFavorite;

      setFavoritePendingBySubtitleId((previous) => ({
        ...previous,
        [parsedSubtitleId]: true,
      }));

      setFavoriteSubtitleIds((previous) => {
        const next = new Set(previous);
        if (nextFavorite) {
          next.add(parsedSubtitleId);
        } else {
          next.delete(parsedSubtitleId);
        }
        return next;
      });

      try {
        await setSubtitleFavorite(parsedSubtitleId, nextFavorite);
      } catch {
        setFavoriteSubtitleIds((previous) => {
          const rollback = new Set(previous);
          if (currentFavorite) {
            rollback.add(parsedSubtitleId);
          } else {
            rollback.delete(parsedSubtitleId);
          }
          return rollback;
        });
      } finally {
        setFavoritePendingBySubtitleId((previous) => {
          const next = { ...previous };
          delete next[parsedSubtitleId];
          return next;
        });
      }
    },
    [favoritePendingBySubtitleId, favoriteSubtitleIds]
  );

  /**
   * @param {LexiconEntry} entry - Entry.
   * @param {"KNOWN"|"UNKNOWN"|"UNMARKED"} knowledge - Next knowledge state.
   * @returns {Promise<void>}
   */
  const postOccurrenceMark = useCallback(async (entry, knowledge) => {
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

      setKnowledgeByKey((previous) => {
        const previousState = previous[entry.key] || "unmarked";
        const fallback = previousState === "elsewhere" ? "elsewhere" : "unmarked";
        const nextState = mapOccurrenceStateToUi(result?.occurrence_state, fallback);
        return { ...previous, [entry.key]: nextState };
      });
    } catch (error) {
      setErrorText(error?.message ? String(error.message) : "Failed to update mark");
    }
  }, []);

  const onToggleKnown = useCallback(
    (entry) => {
      const currentState = knowledgeByKey[entry.key] || "unmarked";
      const nextKnowledge = currentState === "known" ? "UNMARKED" : "KNOWN";
      postOccurrenceMark(entry, nextKnowledge);
    },
    [knowledgeByKey, postOccurrenceMark]
  );

  const onToggleNotKnown = useCallback(
    (entry) => {
      const currentState = knowledgeByKey[entry.key] || "unmarked";
      const nextKnowledge = currentState === "not_known" ? "UNMARKED" : "UNKNOWN";
      postOccurrenceMark(entry, nextKnowledge);
    },
    [knowledgeByKey, postOccurrenceMark]
  );

  const activeEntry = useMemo(() => {
    if (!isMobileView) {
      return null;
    }
    if (filteredEntries.length <= 0) {
      return null;
    }
    return filteredEntries[mobileActiveIndex] || null;
  }, [filteredEntries, isMobileView, mobileActiveIndex]);

  const handleGoPrev = useCallback(() => {
    setMobileActiveIndex((previous) => Math.max(0, previous - 1));
  }, []);

  const handleGoNext = useCallback(() => {
    setMobileActiveIndex((previous) => Math.min(filteredEntries.length - 1, previous + 1));
  }, [filteredEntries.length]);

  const handlePointerDown = useCallback((event) => {
    if (!isMobileView) {
      return;
    }

    dragRef.current = {
      isDragging: true,
      startX: event.clientX,
      deltaX: 0,
      startTime: Date.now(),
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }, [isMobileView]);

  const handlePointerMove = useCallback((event) => {
    if (!isMobileView) {
      return;
    }

    if (!dragRef.current.isDragging) {
      return;
    }

    dragRef.current.deltaX = event.clientX - dragRef.current.startX;
  }, [isMobileView]);

  const handlePointerUp = useCallback(() => {
    if (!isMobileView) {
      return;
    }

    if (!dragRef.current.isDragging) {
      return;
    }

    const deltaX = dragRef.current.deltaX;
    const elapsedMs = Date.now() - dragRef.current.startTime;

    dragRef.current.isDragging = false;
    dragRef.current.deltaX = 0;

    const threshold = 60;
    const fastSwipe = elapsedMs < 240 && Math.abs(deltaX) > 30;

    if (deltaX <= -threshold || (fastSwipe && deltaX < 0)) {
      handleGoNext();
      return;
    }

    if (deltaX >= threshold || (fastSwipe && deltaX > 0)) {
      handleGoPrev();
    }
  }, [handleGoNext, handleGoPrev, isMobileView]);

  /**
   * Render one LexiconCard with subtitle mapping.
   *
   * @param {LexiconEntry|null} entry - Entry.
   * @param {"prev"|"current"|"next"} slot - slot.
   * @returns {JSX.Element|null}
   */
  function renderMobileCard(entry, slot) {
    if (!entry) {
      return null;
    }

    const knowledgeState = knowledgeByKey[entry.key] || "unmarked";
    const isHiddenLocal = hiddenChineseByKey[entry.key] === true;
    const isChineseHidden = isChineseHiddenGlobal || isHiddenLocal;

    const firstSubtitleId =
      Array.isArray(entry.subtitleIds) && entry.subtitleIds.length > 0
        ? toIntOrNull(entry.subtitleIds[0])
        : null;

    const subtitleItem = firstSubtitleId ? subtitlesById[firstSubtitleId] : null;

    const subtitleContent = normalizeText(subtitleItem?.content);
    const subtitleTranslation = normalizeText(subtitleItem?.translation);

    return (
      <div className={["lp-carouselCard", `lp-carouselCard--${slot}`].join(" ")}>
        <LexiconCard
          entry={entry}
          knowledgeState={knowledgeState}
          isChineseHidden={isChineseHidden}
          onToggleKnown={onToggleKnown}
          onToggleNotKnown={onToggleNotKnown}
          onToggleChinese={() => {
            onToggleCardChinese(entry.key);
          }}
          subtitleContent={subtitleContent}
          subtitleTranslation={subtitleTranslation}
        />
      </div>
    );
  }

  return (
    <div className={["lp-root", isMobileView ? "lp-root--mobile" : ""].filter(Boolean).join(" ")}>
      {isMobileView ? (
        <div
          className={["lp-mobileOverlay", isMobileSidebarOpen ? "lp-mobileOverlay--open" : ""]
            .filter(Boolean)
            .join(" ")}
          role="button"
          tabIndex={0}
          onClick={() => {
            onCloseMobileSidebar();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onCloseMobileSidebar();
            }
          }}
        />
      ) : null}

      <aside
        className={[
          "lp-sidebarSlot",
          isMobileView ? "lp-sidebarSlot--drawer" : "",
          isMobileView && isMobileSidebarOpen ? "lp-sidebarSlot--open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={isMobileView && !isMobileSidebarOpen}
      >
        <Sidebar
          isCollapsed={effectiveSidebarCollapsed}
          isLoading={isVideosLoading}
          videos={videos}
          videoGroups={groupedVideos}
          selectedVideoId={selectedVideoId}
          onSelectVideo={onSelectVideo}
          onToggleCollapsed={onToggleSidebar}
          onGoHome={onClickGoHome}
        />
      </aside>

      <main className="lp-main">
        <header className="lp-header">
          <div className="lp-headerLeft">
            <div className="lp-title">词库</div>
            {selectedVideoName ? <div className="lp-subtitle">{selectedVideoName}</div> : null}
          </div>

          <div className="lp-headerActions">
            {isMobileView ? (
              <button
                type="button"
                className="lp-sidebarToggle"
                onClick={() => {
                  onToggleSidebar();
                }}
              >
                {isMobileSidebarOpen ? "收起" : "目录"}
              </button>
            ) : null}

            <button
              type="button"
              className={["lp-eyeToggle", isChineseHiddenGlobal ? "is-active" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={onToggleGlobalChinese}
              aria-label={isChineseHiddenGlobal ? "Show Chinese" : "Hide Chinese"}
            >
              <EyeIcon isHidden={isChineseHiddenGlobal} />
            </button>
          </div>
        </header>

        <div className="lp-tabsRow">
          <button
            type="button"
            className={["lp-tab", activeKind === "word" ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              setActiveKind("word");
              setStatusFilter("all");
            }}
            disabled={isLoading}
          >
            单词 ({wordCount})
          </button>

          <button
            type="button"
            className={[
              "lp-tab",
              activeKind === "expression" ? "is-active" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => {
              setActiveKind("expression");
              setStatusFilter("all");
            }}
            disabled={isLoading}
          >
            地道表达 ({expressionCount})
          </button>

          <button
            type="button"
            className={["lp-tab", activeKind === "sentence" ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              setActiveKind("sentence");
              setSentenceFilter("all");
            }}
            disabled={isLoading}
          >
            句子 ({sentenceCount})
          </button>
        </div>

        <div className="lp-filtersRow">
          {activeKind === "sentence" ? (
            <>
              <button
                type="button"
                className={["lp-pill", sentenceFilter === "all" ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setSentenceFilter("all");
                }}
                disabled={isLoading}
              >
                全部 ({sentenceStatusCounts.all})
              </button>

              <button
                type="button"
                className={["lp-pill", sentenceFilter === "unfavorited" ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setSentenceFilter("unfavorited");
                }}
                disabled={isLoading}
              >
                未收藏 ({sentenceStatusCounts.unfavorited})
              </button>

              <button
                type="button"
                className={["lp-pill", sentenceFilter === "favorited" ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setSentenceFilter("favorited");
                }}
                disabled={isLoading}
              >
                已收藏 ({sentenceStatusCounts.favorited})
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={["lp-pill", statusFilter === "all" ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setStatusFilter("all");
                }}
                disabled={isLoading}
              >
                全部 ({statusCounts.all})
              </button>

              <button
                type="button"
                className={["lp-pill", statusFilter === "unmarked" ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setStatusFilter("unmarked");
                }}
                disabled={isLoading}
              >
                未标记 ({statusCounts.unmarked})
              </button>

              <button
                type="button"
                className={["lp-pill", statusFilter === "known" ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setStatusFilter("known");
                }}
                disabled={isLoading}
              >
                认识 ({statusCounts.known})
              </button>

              <button
                type="button"
                className={["lp-pill", statusFilter === "not_known" ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setStatusFilter("not_known");
                }}
                disabled={isLoading}
              >
                不认识 ({statusCounts.not_known})
              </button>
            </>
          )}
        </div>

        {isLoading ? <div className="lp-stateBox">Loading…</div> : null}
        {!isLoading && errorText ? <div className="lp-stateBox">Failed to load: {errorText}</div> : null}
        {!isLoading && !errorText && activeKind === "sentence" && filteredSentenceItems.length <= 0 ? (
          <div className="lp-stateBox">暂无句子</div>
        ) : null}
        {!isLoading && !errorText && activeKind !== "sentence" && filteredEntries.length <= 0 ? (
          <div className="lp-stateBox"></div>
        ) : null}

        {!isLoading && !errorText ? (
          <>
            {activeKind === "sentence" ? (
              <section className="lp-sentenceList" aria-label="Sentence cards">
                {filteredSentenceItems.map((subtitle) => {
                  const subtitleId = toIntOrNull(subtitle?.id);
                  const isFavorited = Boolean(subtitleId && favoriteSubtitleIds.has(subtitleId));
                  const isPending = Boolean(subtitleId && favoritePendingBySubtitleId[subtitleId]);
                  const sentenceDe = normalizeText(subtitle?.content);
                  const sentenceZh = normalizeText(subtitle?.translation);
                  const timeLabel = formatTime(subtitle?.start);

                  return (
                    <article
                      key={String(subtitle?.id || `${subtitle?.start}-${sentenceDe}`)}
                      className={[
                        "lp-sentenceCard",
                        isFavorited ? "is-favorited" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <button
                        type="button"
                        className={[
                          "lp-sentenceFavBtn",
                          isFavorited ? "is-favorited" : "",
                          isPending ? "is-pending" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-label={isFavorited ? "Unfavorite subtitle" : "Favorite subtitle"}
                        onClick={() => {
                          if (!subtitleId) {
                            return;
                          }
                          onToggleSentenceFavorite(subtitleId);
                        }}
                        disabled={!subtitleId || isPending}
                      >
                        <StarIcon filled={isFavorited} />
                      </button>

                      <div className="lp-sentenceTime">{timeLabel}</div>
                      {sentenceDe ? <div className="lp-sentenceDe">{sentenceDe}</div> : null}
                      {!isChineseHiddenGlobal && sentenceZh ? (
                        <div className="lp-sentenceZh">{sentenceZh}</div>
                      ) : null}
                    </article>
                  );
                })}
              </section>
            ) : isMobileView ? (
              <section
                className="lp-carousel"
                aria-label="Lexicon cards carousel"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >

                {renderMobileCard(activeEntry, "current")}

                <div className="lp-playerBar" aria-label="Carousel controls">
                  <button
                    type="button"
                    className="lp-iconBtn"
                    aria-label="Previous"
                    onClick={() => {
                      handleGoPrev();
                    }}
                    disabled={mobileActiveIndex <= 0}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M19 20L9 12l10-8v16Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M5 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>

                  <div className="lp-counterText">
                    {filteredEntries.length > 0 ? mobileActiveIndex + 1 : 0}/{filteredEntries.length}
                  </div>

                  <button
                    type="button"
                    className="lp-iconBtn"
                    aria-label="Next"
                    onClick={() => {
                      handleGoNext();
                    }}
                    disabled={mobileActiveIndex >= filteredEntries.length - 1}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 4l10 8-10 8V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M19 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

              </section>
            ) : (
              <section className="lp-grid" aria-label="Lexicon cards">
                {filteredEntries.map((entry) => {
                  const knowledgeState = knowledgeByKey[entry.key] || "unmarked";
                  const isHiddenLocal = hiddenChineseByKey[entry.key] === true;
                  const isChineseHidden = isChineseHiddenGlobal || isHiddenLocal;

                  const firstSubtitleId =
                    Array.isArray(entry.subtitleIds) && entry.subtitleIds.length > 0
                      ? toIntOrNull(entry.subtitleIds[0])
                      : null;

                  const subtitleItem = firstSubtitleId ? subtitlesById[firstSubtitleId] : null;

                  const subtitleContent = normalizeText(subtitleItem?.content);
                  const subtitleTranslation = normalizeText(subtitleItem?.translation);

                  return (
                    <LexiconCard
                      key={entry.key}
                      entry={entry}
                      knowledgeState={knowledgeState}
                      isChineseHidden={isChineseHidden}
                      onToggleKnown={onToggleKnown}
                      onToggleNotKnown={onToggleNotKnown}
                      onToggleChinese={() => {
                        onToggleCardChinese(entry.key);
                      }}
                      subtitleContent={subtitleContent}
                      subtitleTranslation={subtitleTranslation}
                    />
                  );
                })}
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
