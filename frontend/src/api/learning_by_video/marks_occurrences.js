import {
	buildVideoScopeSets,
	fetchVideoScopeMarks,
	toggleOccurrenceMark,
} from "../lexicon/marks"

const MODULE_NAME = "learning_by_video"

/**
 * @typedef {"word"|"sentence"|"expression"} ContentType
 */

/**
 * @typedef {"KNOWN"|"UNKNOWN"|"UNMARKED"} OccurrenceKnowledgeState
 */

/**
 * Toggle a single video occurrence mark (learning_by_video module).
 *
 * Note:
 * - MODULE_NAME is kept for future extensibility, but the current backend API does not need it.
 *
 * @param {object} params
 * @param {ContentType} params.contentType
 * @param {number} params.entityId
 * @param {number} params.occurrenceId
 * @param {OccurrenceKnowledgeState} params.knowledge
 * @returns {Promise<{occurrence_state: OccurrenceKnowledgeState, global_state: "UNMARKED"|"KNOWN"|"UNKNOWN"|"MIXED"}>}
 */
export async function toggleVideoOccurrenceMark(params) {
	if (!MODULE_NAME) {
		throw new Error("MODULE_NAME is required.")
	}

	return await toggleOccurrenceMark({
		contentType: params.contentType,
		entityId: params.entityId,
		occurrenceId: params.occurrenceId,
		knowledge: params.knowledge,
	})
}

/**
 * Fetch scope marks for a video (learning_by_video module).
 *
 * @param {object} params
 * @param {ContentType} params.contentType
 * @param {number} params.videoId
 * @returns {Promise<{video_id:number, known_cards_in_scope:number[], unknown_cards_in_scope:number[], same_text_marked_elsewhere:number[]}>}
 */
export async function fetchMarksForVideo(params) {
	if (!MODULE_NAME) {
		throw new Error("MODULE_NAME is required.")
	}

	return await fetchVideoScopeMarks({
		contentType: params.contentType,
		videoId: params.videoId,
	})
}

/**
 * Build lookup sets for video scope.
 *
 * @param {object} scope
 * @returns {{ knownSet: Set<number>, unknownSet: Set<number>, elsewhereSet: Set<number> }}
 */
export function buildVideoMarksSets(scope) {
	return buildVideoScopeSets(scope)
}
