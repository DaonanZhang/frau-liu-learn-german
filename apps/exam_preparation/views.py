from __future__ import annotations

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.viewsets import ModelViewSet

from apps.exam_preparation.models import (
    ClozeChoiceBlank,
    ClozeChoiceExercise,
    ClozeChoiceOption,
    ClozeMatchingBlankAnswer,
    ClozeMatchingExercise,
    ClozeMatchingOption,
    ExerciseBase,
    ListeningAnswerOption,
    ListeningExercise,
    ListeningQuestion,
    ReadingAdMatchingAd,
    ReadingAdMatchingExercise,
    ReadingAdMatchingItem,
    ReadingTitleMatchingExercise,
    ReadingTitleMatchingItem,
    ReadingTitleMatchingOption,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingExercise,
    ReadingUnderstandingQuestion,
    SpeakingGapBlank,
    SpeakingGapMatchingExercise,
    SpeakingGapOption,
    UserExerciseFavorite,
    WritingExampleText,
    WritingExercise,
)
from apps.exam_preparation.serializers import (
    ClozeChoiceBlankSerializer,
    ClozeChoiceExerciseSerializer,
    ClozeChoiceOptionSerializer,
    ClozeMatchingBlankAnswerSerializer,
    ClozeMatchingExerciseSerializer,
    ClozeMatchingOptionSerializer,
    ExerciseBaseSerializer,
    ListeningAnswerOptionSerializer,
    ListeningExerciseSerializer,
    ListeningQuestionSerializer,
    ReadingAdMatchingAdSerializer,
    ReadingAdMatchingExerciseSerializer,
    ReadingAdMatchingItemSerializer,
    ReadingTitleMatchingExerciseSerializer,
    ReadingTitleMatchingItemSerializer,
    ReadingTitleMatchingOptionSerializer,
    ReadingUnderstandingAnswerOptionSerializer,
    ReadingUnderstandingExerciseSerializer,
    ReadingUnderstandingQuestionSerializer,
    SpeakingGapBlankSerializer,
    SpeakingGapMatchingExerciseSerializer,
    SpeakingGapOptionSerializer,
    UserExerciseFavoriteSerializer,
    WritingExampleTextSerializer,
    WritingExerciseSerializer,
)


class BaseExamPreparationViewSet(ModelViewSet):
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    ordering = ["id"]


class ExerciseBaseViewSet(BaseExamPreparationViewSet):
    queryset = ExerciseBase.objects.all().order_by("level", "exercise_type", "external_id", "id")
    serializer_class = ExerciseBaseSerializer
    filterset_fields = ["level", "skill", "exercise_type", "difficulty", "is_real_exam", "creation_method"]
    search_fields = ["external_id", "title", "title_zh", "source_name", "source_reference", "imported_from_file"]
    ordering_fields = ["id", "level", "exercise_type", "external_id", "created_at", "updated_at"]


class ListeningExerciseViewSet(BaseExamPreparationViewSet):
    queryset = ListeningExercise.objects.select_related("exercise_base").all()
    serializer_class = ListeningExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["audio_file_identifier", "audio_file_url", "script", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class ListeningQuestionViewSet(BaseExamPreparationViewSet):
    queryset = ListeningQuestion.objects.select_related("listening_exercise", "listening_exercise__exercise_base").all()
    serializer_class = ListeningQuestionSerializer
    filterset_fields = ["listening_exercise", "question_type", "question_number"]
    search_fields = ["question_text", "listening_exercise__exercise_base__external_id", "listening_exercise__exercise_base__title"]
    ordering_fields = ["id", "question_number", "created_at", "updated_at"]


class ListeningAnswerOptionViewSet(BaseExamPreparationViewSet):
    queryset = ListeningAnswerOption.objects.select_related(
        "question",
        "question__listening_exercise",
        "question__listening_exercise__exercise_base",
    ).all()
    serializer_class = ListeningAnswerOptionSerializer
    filterset_fields = ["question", "is_correct", "option_key"]
    search_fields = ["option_text", "explanation", "question__question_text"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class ReadingTitleMatchingExerciseViewSet(BaseExamPreparationViewSet):
    queryset = ReadingTitleMatchingExercise.objects.select_related("exercise_base").all()
    serializer_class = ReadingTitleMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class ReadingTitleMatchingItemViewSet(BaseExamPreparationViewSet):
    queryset = ReadingTitleMatchingItem.objects.select_related(
        "exercise",
        "exercise__exercise_base",
        "correct_option",
    ).all()
    serializer_class = ReadingTitleMatchingItemSerializer
    filterset_fields = ["exercise", "correct_option", "item_number"]
    search_fields = ["text", "explanation", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "item_number", "created_at", "updated_at"]


class ReadingTitleMatchingOptionViewSet(BaseExamPreparationViewSet):
    queryset = ReadingTitleMatchingOption.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ReadingTitleMatchingOptionSerializer
    filterset_fields = ["exercise", "option_key"]
    search_fields = ["option_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "option_order", "created_at", "updated_at"]


class ReadingUnderstandingExerciseViewSet(BaseExamPreparationViewSet):
    queryset = ReadingUnderstandingExercise.objects.select_related("exercise_base").all()
    serializer_class = ReadingUnderstandingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["text_markdown", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class ReadingUnderstandingQuestionViewSet(BaseExamPreparationViewSet):
    queryset = ReadingUnderstandingQuestion.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ReadingUnderstandingQuestionSerializer
    filterset_fields = ["exercise", "question_number"]
    search_fields = ["question_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "question_number", "created_at", "updated_at"]


class ReadingUnderstandingAnswerOptionViewSet(BaseExamPreparationViewSet):
    queryset = ReadingUnderstandingAnswerOption.objects.select_related(
        "question",
        "question__exercise",
        "question__exercise__exercise_base",
    ).all()
    serializer_class = ReadingUnderstandingAnswerOptionSerializer
    filterset_fields = ["question", "is_correct", "option_key"]
    search_fields = ["option_text", "explanation", "question__question_text"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class ReadingAdMatchingExerciseViewSet(BaseExamPreparationViewSet):
    queryset = ReadingAdMatchingExercise.objects.select_related("exercise_base").all()
    serializer_class = ReadingAdMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class ReadingAdMatchingItemViewSet(BaseExamPreparationViewSet):
    queryset = ReadingAdMatchingItem.objects.select_related(
        "exercise",
        "exercise__exercise_base",
        "correct_ad",
    ).all()
    serializer_class = ReadingAdMatchingItemSerializer
    filterset_fields = ["exercise", "correct_ad", "item_number"]
    search_fields = ["item_text", "explanation", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "item_number", "created_at", "updated_at"]


class ReadingAdMatchingAdViewSet(BaseExamPreparationViewSet):
    queryset = ReadingAdMatchingAd.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ReadingAdMatchingAdSerializer
    filterset_fields = ["exercise", "ad_key", "is_no_match_option"]
    search_fields = ["ad_text_markdown", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "ad_order", "created_at", "updated_at"]


class ClozeChoiceExerciseViewSet(BaseExamPreparationViewSet):
    queryset = ClozeChoiceExercise.objects.select_related("exercise_base").all()
    serializer_class = ClozeChoiceExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "original_source_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class ClozeChoiceBlankViewSet(BaseExamPreparationViewSet):
    queryset = ClozeChoiceBlank.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ClozeChoiceBlankSerializer
    filterset_fields = ["exercise", "blank_key", "blank_number"]
    search_fields = ["blank_key", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "blank_number", "created_at", "updated_at"]


class ClozeChoiceOptionViewSet(BaseExamPreparationViewSet):
    queryset = ClozeChoiceOption.objects.select_related("blank", "blank__exercise", "blank__exercise__exercise_base").all()
    serializer_class = ClozeChoiceOptionSerializer
    filterset_fields = ["blank", "option_key", "is_correct"]
    search_fields = ["option_text", "explanation", "blank__blank_key", "blank__exercise__exercise_base__external_id"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class ClozeMatchingExerciseViewSet(BaseExamPreparationViewSet):
    queryset = ClozeMatchingExercise.objects.select_related("exercise_base").all()
    serializer_class = ClozeMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "original_source_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingOptionViewSet(BaseExamPreparationViewSet):
    queryset = ClozeMatchingOption.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = ClozeMatchingOptionSerializer
    filterset_fields = ["exercise", "option_key", "is_extra"]
    search_fields = ["option_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "option_order", "created_at", "updated_at"]


class ClozeMatchingBlankAnswerViewSet(BaseExamPreparationViewSet):
    queryset = ClozeMatchingBlankAnswer.objects.select_related(
        "exercise",
        "exercise__exercise_base",
        "correct_option",
    ).all()
    serializer_class = ClozeMatchingBlankAnswerSerializer
    filterset_fields = ["exercise", "blank_key", "blank_number", "correct_option"]
    search_fields = ["blank_key", "explanation", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "blank_number", "created_at", "updated_at"]


class WritingExerciseViewSet(BaseExamPreparationViewSet):
    queryset = WritingExercise.objects.select_related("exercise_base").all()
    serializer_class = WritingExerciseSerializer
    filterset_fields = ["exercise_base", "time_limit_minutes", "words_limit"]
    search_fields = ["request_text", "task_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "time_limit_minutes", "words_limit", "created_at", "updated_at"]


class WritingExampleTextViewSet(BaseExamPreparationViewSet):
    queryset = WritingExampleText.objects.select_related("writing_exercise", "writing_exercise__exercise_base").all()
    serializer_class = WritingExampleTextSerializer
    filterset_fields = ["writing_exercise", "label", "sort_order"]
    search_fields = ["label", "note", "example_text", "writing_exercise__exercise_base__external_id"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class SpeakingGapMatchingExerciseViewSet(BaseExamPreparationViewSet):
    queryset = SpeakingGapMatchingExercise.objects.select_related("exercise_base").all()
    serializer_class = SpeakingGapMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class SpeakingGapBlankViewSet(BaseExamPreparationViewSet):
    queryset = SpeakingGapBlank.objects.select_related("exercise", "exercise__exercise_base", "correct_option").all()
    serializer_class = SpeakingGapBlankSerializer
    filterset_fields = ["exercise", "blank_key", "blank_number", "correct_option"]
    search_fields = ["blank_key", "explanation", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "blank_number", "created_at", "updated_at"]


class SpeakingGapOptionViewSet(BaseExamPreparationViewSet):
    queryset = SpeakingGapOption.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = SpeakingGapOptionSerializer
    filterset_fields = ["exercise", "option_key", "is_extra"]
    search_fields = ["option_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "option_order", "created_at", "updated_at"]


class UserExerciseFavoriteViewSet(BaseExamPreparationViewSet):
    queryset = UserExerciseFavorite.objects.select_related("user", "exercise").all()
    serializer_class = UserExerciseFavoriteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["exercise"]
    search_fields = ["exercise__external_id", "exercise__title", "exercise__title_zh"]
    ordering_fields = ["id", "created_at"]
    ordering = ["-created_at", "id"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


