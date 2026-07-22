from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.exam_preparation.views import (
    ClozeChoiceBlankViewSet,
    ClozeChoiceExerciseViewSet,
    ClozeChoiceOptionViewSet,
    ClozeMatchingBlankAnswerViewSet,
    ClozeMatchingExerciseViewSet,
    ClozeMatchingOptionViewSet,
    ExerciseBaseViewSet,
    FavoriteQuestionViewSet,
    ListeningAnswerOptionViewSet,
    ListeningExerciseViewSet,
    ListeningQuestionViewSet,
    ReadingAdMatchingAdViewSet,
    ReadingAdMatchingExerciseViewSet,
    ReadingAdMatchingItemViewSet,
    ReadingTitleMatchingExerciseViewSet,
    ReadingTitleMatchingItemViewSet,
    ReadingTitleMatchingOptionViewSet,
    ReadingUnderstandingAnswerOptionViewSet,
    ReadingUnderstandingExerciseViewSet,
    ReadingUnderstandingQuestionViewSet,
    SpeakingGapBlankViewSet,
    SpeakingGapMatchingExerciseViewSet,
    SpeakingGapOptionViewSet,
    SpeakingPromptSegmentedExerciseViewSet,
    SpeakingPromptSegmentViewSet,
    UserClozeChoiceBlankStateViewSet,
    UserClozeMatchingBlankStateViewSet,
    UserExerciseFavoriteViewSet,
    UserListeningQuestionStateViewSet,
    UserReadingAdMatchingItemStateViewSet,
    UserReadingTitleMatchingItemStateViewSet,
    UserReadingUnderstandingQuestionStateViewSet,
    UserSpeakingGapBlankStateViewSet,
    UserSpeakingPromptSegmentedExerciseStateViewSet,
    UserWritingExampleTextStateViewSet,
    UserWritingExerciseStateViewSet,
    WritingExampleTextViewSet,
    WritingExerciseViewSet,
)

router = DefaultRouter()
router.register(r"exercise-bases", ExerciseBaseViewSet, basename="exam-prep-exercise-bases")
router.register(r"listening-exercises", ListeningExerciseViewSet, basename="exam-prep-listening-exercises")
router.register(r"listening-questions", ListeningQuestionViewSet, basename="exam-prep-listening-questions")
router.register(r"listening-answer-options", ListeningAnswerOptionViewSet, basename="exam-prep-listening-answer-options")
router.register(
    r"reading-title-matching-exercises",
    ReadingTitleMatchingExerciseViewSet,
    basename="exam-prep-reading-title-matching-exercises",
)
router.register(
    r"reading-title-matching-items",
    ReadingTitleMatchingItemViewSet,
    basename="exam-prep-reading-title-matching-items",
)
router.register(
    r"reading-title-matching-options",
    ReadingTitleMatchingOptionViewSet,
    basename="exam-prep-reading-title-matching-options",
)
router.register(
    r"reading-understanding-exercises",
    ReadingUnderstandingExerciseViewSet,
    basename="exam-prep-reading-understanding-exercises",
)
router.register(
    r"reading-understanding-questions",
    ReadingUnderstandingQuestionViewSet,
    basename="exam-prep-reading-understanding-questions",
)
router.register(
    r"reading-understanding-answer-options",
    ReadingUnderstandingAnswerOptionViewSet,
    basename="exam-prep-reading-understanding-answer-options",
)
router.register(
    r"reading-ad-matching-exercises",
    ReadingAdMatchingExerciseViewSet,
    basename="exam-prep-reading-ad-matching-exercises",
)
router.register(
    r"reading-ad-matching-items",
    ReadingAdMatchingItemViewSet,
    basename="exam-prep-reading-ad-matching-items",
)
router.register(
    r"reading-ad-matching-ads",
    ReadingAdMatchingAdViewSet,
    basename="exam-prep-reading-ad-matching-ads",
)
router.register(r"cloze-choice-exercises", ClozeChoiceExerciseViewSet, basename="exam-prep-cloze-choice-exercises")
router.register(r"cloze-choice-blanks", ClozeChoiceBlankViewSet, basename="exam-prep-cloze-choice-blanks")
router.register(r"cloze-choice-options", ClozeChoiceOptionViewSet, basename="exam-prep-cloze-choice-options")
router.register(r"cloze-matching-exercises", ClozeMatchingExerciseViewSet, basename="exam-prep-cloze-matching-exercises")
router.register(r"cloze-matching-options", ClozeMatchingOptionViewSet, basename="exam-prep-cloze-matching-options")
router.register(
    r"cloze-matching-blank-answers",
    ClozeMatchingBlankAnswerViewSet,
    basename="exam-prep-cloze-matching-blank-answers",
)
router.register(r"writing-exercises", WritingExerciseViewSet, basename="exam-prep-writing-exercises")
router.register(r"writing-example-texts", WritingExampleTextViewSet, basename="exam-prep-writing-example-texts")
router.register(
    r"speaking-gap-matching-exercises",
    SpeakingGapMatchingExerciseViewSet,
    basename="exam-prep-speaking-gap-matching-exercises",
)
router.register(r"speaking-gap-blanks", SpeakingGapBlankViewSet, basename="exam-prep-speaking-gap-blanks")
router.register(r"speaking-gap-options", SpeakingGapOptionViewSet, basename="exam-prep-speaking-gap-options")
router.register(
    r"speaking-prompt-segmented-exercises",
    SpeakingPromptSegmentedExerciseViewSet,
    basename="exam-prep-speaking-prompt-segmented-exercises",
)
router.register(
    r"speaking-prompt-segments",
    SpeakingPromptSegmentViewSet,
    basename="exam-prep-speaking-prompt-segments",
)
router.register(r"user-exercise-favorites", UserExerciseFavoriteViewSet, basename="exam-prep-user-exercise-favorites")
router.register(r"favorite-questions", FavoriteQuestionViewSet, basename="exam-prep-favorite-questions")
router.register(
    r"user-listening-question-states",
    UserListeningQuestionStateViewSet,
    basename="exam-prep-user-listening-question-states",
)
router.register(
    r"user-reading-understanding-question-states",
    UserReadingUnderstandingQuestionStateViewSet,
    basename="exam-prep-user-reading-understanding-question-states",
)
router.register(
    r"user-reading-title-matching-item-states",
    UserReadingTitleMatchingItemStateViewSet,
    basename="exam-prep-user-reading-title-matching-item-states",
)
router.register(
    r"user-reading-ad-matching-item-states",
    UserReadingAdMatchingItemStateViewSet,
    basename="exam-prep-user-reading-ad-matching-item-states",
)
router.register(
    r"user-cloze-choice-blank-states",
    UserClozeChoiceBlankStateViewSet,
    basename="exam-prep-user-cloze-choice-blank-states",
)
router.register(
    r"user-cloze-matching-blank-states",
    UserClozeMatchingBlankStateViewSet,
    basename="exam-prep-user-cloze-matching-blank-states",
)
router.register(
    r"user-speaking-gap-blank-states",
    UserSpeakingGapBlankStateViewSet,
    basename="exam-prep-user-speaking-gap-blank-states",
)
router.register(
    r"user-writing-exercise-states",
    UserWritingExerciseStateViewSet,
    basename="exam-prep-user-writing-exercise-states",
)
router.register(
    r"user-writing-example-text-states",
    UserWritingExampleTextStateViewSet,
    basename="exam-prep-user-writing-example-text-states",
)
router.register(
    r"user-speaking-prompt-segmented-exercise-states",
    UserSpeakingPromptSegmentedExerciseStateViewSet,
    basename="exam-prep-user-speaking-prompt-segmented-exercise-states",
)

urlpatterns = [
    path("", include(router.urls)),
]
