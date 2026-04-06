/**
 * learning_by_video.exercise_questions API wrapper.
 *
 * Provides functions to fetch exercise questions (with nested options)
 * for a given video.
 */

import { apiFetch } from "../client";

const LEARNING_BY_VIDEO_BASE_PATH = "/learning_by_video";

/**
 * Fetch all exercise questions for a given video id.
 *
 * Backend endpoint:
 * - GET /api/learning_by_video/exercise-questions/?video=<video_id>
 *
 * @param {number|string} videoId - Video primary key used for filtering questions.
 * @returns {Promise<Array<Object>>} List of questions including nested options.
 */
export async function fetchExerciseQuestionsByVideo(videoId, options = {}) {
  const normalizedVideoId = String(videoId ?? "").trim();
  if (!normalizedVideoId) {
    throw new Error("fetchExerciseQuestionsByVideo: videoId is required");
  }

  const normalizedCategory = String(options?.category ?? "").trim();
  const queryParts = [`video=${encodeURIComponent(normalizedVideoId)}`];

  if (normalizedCategory) {
    queryParts.push(`category=${encodeURIComponent(normalizedCategory)}`);
  }

  return apiFetch(`${LEARNING_BY_VIDEO_BASE_PATH}/exercise-questions/?${queryParts.join("&")}`);
}

/**
 * Fetch exercise questions for a given video id, optionally filtered by question type.
 *
 * Backend endpoint:
 * - GET /api/learning_by_video/exercise-questions/?video=<video_id>&question_type=TRUE_FALSE|CHOICE
 *
 * @param {number|string} videoId - Video primary key used for filtering questions.
 * @param {"TRUE_FALSE"|"CHOICE"|""|null|undefined} questionType - Optional question type filter.
 * @returns {Promise<Array<Object>>} List of questions including nested options.
 */
export async function fetchExerciseQuestions(videoId, questionType, options = {}) {
  const normalizedVideoId = String(videoId ?? "").trim();
  if (!normalizedVideoId) {
    throw new Error("fetchExerciseQuestions: videoId is required");
  }

  const normalizedQuestionType = String(questionType ?? "").trim();
  const normalizedCategory = String(options?.category ?? "").trim();
  const queryParts = [`video=${encodeURIComponent(normalizedVideoId)}`];

  if (normalizedQuestionType) {
    queryParts.push(`question_type=${encodeURIComponent(normalizedQuestionType)}`);
  }

  if (normalizedCategory) {
    queryParts.push(`category=${encodeURIComponent(normalizedCategory)}`);
  }

  const queryString = queryParts.join("&");
  return apiFetch(`${LEARNING_BY_VIDEO_BASE_PATH}/exercise-questions/?${queryString}`);
}
