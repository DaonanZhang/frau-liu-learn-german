import { apiFetch } from "../client";

const BASE = "/exam_preparation";

const STATE_ENDPOINTS = {
  listening_question: "user-listening-question-states",
  reading_understanding_question: "user-reading-understanding-question-states",
  reading_title_matching_item: "user-reading-title-matching-item-states",
  reading_ad_matching_item: "user-reading-ad-matching-item-states",
  cloze_choice_blank: "user-cloze-choice-blank-states",
  cloze_matching_blank: "user-cloze-matching-blank-states",
  speaking_gap_blank: "user-speaking-gap-blank-states",
  writing_exercise: "user-writing-exercise-states",
  writing_example_text: "user-writing-example-text-states",
  speaking_prompt_segmented_exercise: "user-speaking-prompt-segmented-exercise-states",
};

export function fetchFavoriteQuestions() {
  return apiFetch(`${BASE}/favorite-questions/`);
}

export function removeFavoriteQuestion(question) {
  const endpoint = STATE_ENDPOINTS[question?.state_type];
  const targetField = question?.target_field;
  const targetId = question?.target_id;

  if (!endpoint || !targetField || !targetId) {
    throw new Error("无法识别这条收藏题目的类型。");
  }

  return apiFetch(`${BASE}/${endpoint}/`, {
    method: "POST",
    body: {
      [targetField]: targetId,
      is_favorited: false,
    },
  });
}
