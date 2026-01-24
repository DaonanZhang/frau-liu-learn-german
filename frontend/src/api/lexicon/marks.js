import { apiFetch } from "../client"

/**
 * @typedef {"word"|"sentence"|"expression"} ContentType
 */

/**
 * @typedef {"KNOWN"|"UNKNOWN"|"UNMARKED"} OccurrenceKnowledgeState
 */

/**
 * @typedef {"UNMARKED"|"KNOWN"|"UNKNOWN"|"MIXED"} TextGlobalState
 */

/**
 * @typedef {object} ToggleOccurrencePayload
 * @property {number} entityId - WordText/SentenceText/ExpressionText id.
 * @property {number} occurrenceId - VideoXOccurrence id.
 * @property {OccurrenceKnowledgeState} knowledge - KNOWN/UNKNOWN/UNMARKED.
 */

/**
 * @typedef {object} ToggleOccurrenceResult
 * @property {OccurrenceKnowledgeState} occurrence_state - Result state for the occurrence.
 * @property {TextGlobalState} global_state - Result aggregated state for the text.
 */

/**
 * @typedef {object} VideoScopeResult
 * @property {number} video_id
 * @property {number[]} known_cards_in_scope
 * @property {number[]} unknown_cards_in_scope
 * @property {number[]} same_text_marked_elsewhere
 */

/**
 * Require a finite integer.
 *
 * @param {unknown} value - Candidate value.
 * @param {string} fieldName - Field name for error messages.
 * @returns {number} Validated integer.
 */
function requireInteger(value, fieldName) {
	const numericValue = Number(value)

	if (!Number.isFinite(numericValue) || !Number.isInteger(numericValue) || numericValue <= 0) {
		throw new Error(`${fieldName} must be a positive integer.`)
	}

	return numericValue
}

/**
 * Resolve marks base path by content type.
 *
 * @param {ContentType} contentType
 * @returns {string}
 */
function getMarksBasePath(contentType) {
	if (contentType === "word") {
		return "/lexicon/word-marks/"
	}

	if (contentType === "sentence") {
		return "/lexicon/sentence-marks/"
	}

	if (contentType === "expression") {
		return "/lexicon/expression-marks/"
	}

	throw new Error(`Unsupported contentType: ${String(contentType)}`)
}

/**
 * Toggle a single occurrence card state.
 *
 * Backend endpoint:
 *   POST {basePath}toggle-occurrence/
 *
 * Payload:
 *   { entity_id, occurrence_id, knowledge }
 *
 * @param {object} params
 * @param {ContentType} params.contentType
 * @param {number} params.entityId
 * @param {number} params.occurrenceId
 * @param {OccurrenceKnowledgeState} params.knowledge
 * @returns {Promise<ToggleOccurrenceResult>}
 */
export async function toggleOccurrenceMark(params) {
	const contentType = /** @type {ContentType} */ (params.contentType)
	const entityId = requireInteger(params.entityId, "entityId")
	const occurrenceId = requireInteger(params.occurrenceId, "occurrenceId")

	const basePath = getMarksBasePath(contentType)

	return await apiFetch(`${basePath}toggle-occurrence/`, {
		method: "POST",
		body: {
			entity_id: entityId,
			occurrence_id: occurrenceId,
			knowledge: params.knowledge,
		},
	})
}

/**
 * Fetch scope marks for a video.
 *
 * Backend endpoint:
 *   GET {basePath}video-scope/?video_id=...
 *
 * @param {object} params
 * @param {ContentType} params.contentType
 * @param {number} params.videoId
 * @returns {Promise<VideoScopeResult>}
 */
export async function fetchVideoScopeMarks(params) {
	const contentType = /** @type {ContentType} */ (params.contentType)
	const videoId = requireInteger(params.videoId, "videoId")

	const basePath = getMarksBasePath(contentType)
	const query = new URLSearchParams({ video_id: String(videoId) }).toString()

	return await apiFetch(`${basePath}video-scope/?${query}`, {
		method: "GET",
	})
}

/**
 * Build lookup sets for fast rendering.
 *
 * @param {VideoScopeResult} scope
 * @returns {{ knownSet: Set<number>, unknownSet: Set<number>, elsewhereSet: Set<number> }}
 */
export function buildVideoScopeSets(scope) {
	const knownSet = new Set(scope?.known_cards_in_scope || [])
	const unknownSet = new Set(scope?.unknown_cards_in_scope || [])
	const elsewhereSet = new Set(scope?.same_text_marked_elsewhere || [])

	return { knownSet, unknownSet, elsewhereSet }
}
