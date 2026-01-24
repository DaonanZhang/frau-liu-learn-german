import { apiFetch } from "../client";

const BASE = "/learning_by_video/occurrences";

/**
 * @typedef {Object} BaseOccurrence
 * @property {number} id
 * @property {number} video
 * @property {number|null} subtitle
 * @property {number|null} time_start
 * @property {number|null} time_end
 * @property {string} translation
 * @property {string} note
 * @property {string} created_at
 */

/**
 * @typedef {BaseOccurrence & {
 *   word: number
 *   word_text: string
 *   word_lemma: string
 *   word_article: string
 *   word_pos: string
 *   word_splittable: boolean
 * }} WordOccurrence
 */

/**
 * @typedef {BaseOccurrence & {
 *   expression: number
 *   expression_text: string
 *   expression_prototype: string
 * }} ExpressionOccurrence
 */

/**
 * Generic helper for occurrences endpoints.
 *
 * @param {string} path
 * @param {Record<string, any>} params
 * @returns {Promise<any[]>}
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
 * @param {Record<string, any>} params
 * @returns {Promise<WordOccurrence[]>}
 */
export async function fetchWordOccurrences(params = {}) {
  const data = await fetchOccurrences(`${BASE}/words/`, params);
  return /** @type {WordOccurrence[]} */ (data);
}

/**
 * Fetch sentence occurrences.
 *
 * @param {Record<string, any>} params
 * @returns {Promise<any[]>}
 */
export async function fetchSentenceOccurrences(params = {}) {
  return fetchOccurrences(`${BASE}/sentences/`, params);
}

/**
 * Fetch expression occurrences.
 *
 * @param {Record<string, any>} params
 * @returns {Promise<ExpressionOccurrence[]>}
 */
export async function fetchExpressionOccurrences(params = {}) {
  const data = await fetchOccurrences(`${BASE}/expressions/`, params);
  return /** @type {ExpressionOccurrence[]} */ (data);
}

/**
 * Convenience helper for lexicon panel:
 * fetch only word + expression occurrences for a given video.
 *
 * @param {string|number} videoId
 * @returns {Promise<{words: WordOccurrence[], expressions: ExpressionOccurrence[]}>}
 */
export async function fetchLexiconOccurrencesByVideo(videoId) {
  const [words, expressions] = await Promise.all([
    fetchWordOccurrences({ video: videoId }),
    fetchExpressionOccurrences({ video: videoId }),
  ]);

  return { words, expressions };
}
