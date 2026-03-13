import { apiFetch } from "../client";

const BASE = "/learning_by_video/occurrences";

/**
 * @typedef {"KNOWN"|"UNKNOWN"|"UNMARKED"} OccurrenceKnowledgeState
 */

/**
 * @typedef {Object} BaseOccurrence
 * @property {number} id - Occurrence id.
 * @property {number} video - Video id.
 * @property {number|null} subtitle - Subtitle id (nullable).
 * @property {number|null} time_start - Start time in seconds (nullable if missing).
 * @property {number|null} time_end - End time in seconds (nullable if missing).
 * @property {string} translation - Translation text.
 * @property {string} note - Optional note.
 * @property {string} created_at - ISO timestamp.
 * @property {OccurrenceKnowledgeState} my_knowledge - Current user's knowledge state for this occurrence.
 * @property {boolean} marked_elsewhere - True if text is globally marked but this occurrence is unmarked.
 */

/**
 * @typedef {BaseOccurrence & {
 *   word: number
 *   selected_text: string
 *   word_text: string
 *   word_lemma: string
 *   word_article: string
 *   word_pos: string
 *   word_splittable: boolean
 * }} WordOccurrence
 */

/**
 * @typedef {BaseOccurrence & {
 *   sentence: number
 *   sentence_text: string
 * }} SentenceOccurrence
 */

/**
 * @typedef {BaseOccurrence & {
 *   expression: number
 *   selected_text: string
 *   expression_text: string
 *   expression_prototype: string
 * }} ExpressionOccurrence
 */

/**
 * Generic helper for occurrences endpoints.
 *
 * @param {string} path - Endpoint path.
 * @param {Record<string, any>} params - Query params.
 * @returns {Promise<any[]>} Array of occurrences (handles paginated/non-paginated responses).
 */
async function fetchOccurrences(path, params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  const url = queryString ? `${path}?${queryString}` : path;

  const data = await apiFetch(url);

  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.results)) {
    return data.results;
  }

  return [];
}

/**
 * Fetch word occurrences.
 *
 * params suggestions:
 * - video: videoId
 * - subtitle: subtitleId
 * - t / window
 * - t_from / t_to
 *
 * @param {Record<string, any>} params - Query params.
 * @returns {Promise<WordOccurrence[]>} Word occurrences.
 */
export async function fetchWordOccurrences(params = {}) {
  const data = await fetchOccurrences(`${BASE}/words/`, params);
  return /** @type {WordOccurrence[]} */ (data);
}

/**
 * Fetch sentence occurrences.
 *
 * @param {Record<string, any>} params - Query params.
 * @returns {Promise<SentenceOccurrence[]>} Sentence occurrences.
 */
export async function fetchSentenceOccurrences(params = {}) {
  const data = await fetchOccurrences(`${BASE}/sentences/`, params);
  return /** @type {SentenceOccurrence[]} */ (data);
}

/**
 * Fetch expression occurrences.
 *
 * @param {Record<string, any>} params - Query params.
 * @returns {Promise<ExpressionOccurrence[]>} Expression occurrences.
 */
export async function fetchExpressionOccurrences(params = {}) {
  const data = await fetchOccurrences(`${BASE}/expressions/`, params);
  return /** @type {ExpressionOccurrence[]} */ (data);
}

/**
 * Convenience helper for lexicon panel:
 * fetch only word + expression occurrences for a given video.
 *
 * @param {string|number} videoId - Video id.
 * @returns {Promise<{words: WordOccurrence[], expressions: ExpressionOccurrence[]}>} Occurrence payload.
 */
export async function fetchLexiconOccurrencesByVideo(videoId) {
  const [words, expressions] = await Promise.all([
    fetchWordOccurrences({ video: videoId }),
    fetchExpressionOccurrences({ video: videoId }),
  ]);

  return { words, expressions };
}
