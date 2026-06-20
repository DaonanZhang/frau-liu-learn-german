from __future__ import annotations

from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework import status
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
    SpeakingPromptSegment,
    SpeakingPromptSegmentedExercise,
    UserClozeChoiceBlankState,
    UserClozeMatchingBlankState,
    UserExerciseFavorite,
    UserListeningQuestionState,
    UserReadingAdMatchingItemState,
    UserReadingTitleMatchingItemState,
    UserReadingUnderstandingQuestionState,
    UserSpeakingGapBlankState,
    UserSpeakingPromptSegmentedExerciseState,
    UserWritingExerciseState,
    WritingExampleText,
    WritingExercise,
)
from apps.exam_preparation.serializers import (
    ClozeChoiceBlankSerializer,
    ClozeChoiceExerciseDetailSerializer,
    ClozeChoiceExerciseSerializer,
    ClozeChoiceOptionSerializer,
    ClozeMatchingBlankAnswerSerializer,
    ClozeMatchingExerciseDetailSerializer,
    ClozeMatchingExerciseSerializer,
    ClozeMatchingOptionSerializer,
    ExerciseBaseSerializer,
    ListeningAnswerOptionSerializer,
    ListeningExerciseDetailSerializer,
    ListeningExerciseSerializer,
    ListeningQuestionSerializer,
    ReadingAdMatchingAdSerializer,
    ReadingAdMatchingExerciseDetailSerializer,
    ReadingAdMatchingExerciseSerializer,
    ReadingAdMatchingItemSerializer,
    ReadingTitleMatchingExerciseDetailSerializer,
    ReadingTitleMatchingExerciseSerializer,
    ReadingTitleMatchingItemSerializer,
    ReadingTitleMatchingOptionSerializer,
    ReadingUnderstandingExerciseDetailSerializer,
    ReadingUnderstandingAnswerOptionSerializer,
    ReadingUnderstandingExerciseSerializer,
    ReadingUnderstandingQuestionSerializer,
    SpeakingGapBlankSerializer,
    SpeakingGapMatchingExerciseDetailSerializer,
    SpeakingGapMatchingExerciseSerializer,
    SpeakingGapOptionSerializer,
    SpeakingPromptSegmentedExerciseDetailSerializer,
    SpeakingPromptSegmentedExerciseSerializer,
    SpeakingPromptSegmentSerializer,
    UserClozeChoiceBlankStateSerializer,
    UserClozeMatchingBlankStateSerializer,
    UserExerciseFavoriteSerializer,
    UserListeningQuestionStateSerializer,
    UserReadingAdMatchingItemStateSerializer,
    UserReadingTitleMatchingItemStateSerializer,
    UserReadingUnderstandingQuestionStateSerializer,
    UserSpeakingGapBlankStateSerializer,
    UserSpeakingPromptSegmentedExerciseStateSerializer,
    UserWritingExerciseStateSerializer,
    WritingExampleTextSerializer,
    WritingExerciseDetailSerializer,
    WritingExerciseSerializer,
)


class BaseExamPreparationViewSet(ModelViewSet):
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    ordering = ["id"]


class BaseUserExerciseStateViewSet(BaseExamPreparationViewSet):
    permission_classes = [IsAuthenticated]
    state_lookup_field = ""
    ordering = ["-updated_at", "id"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def _apply_answer_timestamp(self, validated_data):
        answer_keys = {"answer_payload", "is_correct"}
        if "last_answered_at" in validated_data:
            return validated_data
        if any(key in validated_data for key in answer_keys):
            validated_data["last_answered_at"] = timezone.now()
        return validated_data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = self._apply_answer_timestamp(dict(serializer.validated_data))
        lookup_field = self.state_lookup_field
        target_object = validated_data[lookup_field]
        defaults = {
            key: value
            for key, value in validated_data.items()
            if key != lookup_field
        }
        instance, created = self.get_queryset().update_or_create(
            user=request.user,
            **{lookup_field: target_object},
            defaults=defaults,
        )
        output_serializer = self.get_serializer(instance)
        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def perform_update(self, serializer):
        validated_data = self._apply_answer_timestamp(dict(serializer.validated_data))
        serializer.save(**validated_data)


class ExerciseBaseViewSet(BaseExamPreparationViewSet):
    queryset = ExerciseBase.objects.all().order_by("level", "exercise_type", "external_id", "id")
    serializer_class = ExerciseBaseSerializer
    filterset_fields = ["exam_type", "level", "skill", "exercise_type", "difficulty", "is_real_exam", "creation_method"]
    search_fields = ["exam_type", "external_id", "title", "source_name", "source_reference", "imported_from_file"]
    ordering_fields = ["id", "exam_type", "level", "exercise_type", "external_id", "created_at", "updated_at"]


class ListeningExerciseViewSet(BaseExamPreparationViewSet):
    queryset = ListeningExercise.objects.select_related("exercise_base").prefetch_related(
        "questions__answer_options",
    ).all()
    serializer_class = ListeningExerciseSerializer
    filterset_fields = ["exercise_base", "listening_type"]
    search_fields = ["audio_file_identifier", "audio_file_url", "script", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ListeningExerciseDetailSerializer
        return super().get_serializer_class()


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
    queryset = ReadingTitleMatchingExercise.objects.select_related("exercise_base").prefetch_related(
        "options",
        "items__correct_option",
    ).all()
    serializer_class = ReadingTitleMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReadingTitleMatchingExerciseDetailSerializer
        return super().get_serializer_class()


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
    queryset = ReadingUnderstandingExercise.objects.select_related("exercise_base").prefetch_related(
        "questions__answer_options",
    ).all()
    serializer_class = ReadingUnderstandingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["text_markdown", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReadingUnderstandingExerciseDetailSerializer
        return super().get_serializer_class()


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
    queryset = ReadingAdMatchingExercise.objects.select_related("exercise_base").prefetch_related(
        "ads",
        "items__correct_ad",
    ).all()
    serializer_class = ReadingAdMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ReadingAdMatchingExerciseDetailSerializer
        return super().get_serializer_class()


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
    queryset = ClozeChoiceExercise.objects.select_related("exercise_base").prefetch_related(
        "blanks__options",
    ).all()
    serializer_class = ClozeChoiceExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "original_source_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ClozeChoiceExerciseDetailSerializer
        return super().get_serializer_class()


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
    queryset = ClozeMatchingExercise.objects.select_related("exercise_base").prefetch_related(
        "options",
        "blank_answers__correct_option",
    ).all()
    serializer_class = ClozeMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "original_source_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ClozeMatchingExerciseDetailSerializer
        return super().get_serializer_class()


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
    queryset = WritingExercise.objects.select_related("exercise_base").prefetch_related("example_texts").all()
    serializer_class = WritingExerciseSerializer
    filterset_fields = ["exercise_base", "time_limit_minutes", "words_limit"]
    search_fields = ["request_text", "task_text", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "time_limit_minutes", "words_limit", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WritingExerciseDetailSerializer
        return super().get_serializer_class()


class WritingExampleTextViewSet(BaseExamPreparationViewSet):
    queryset = WritingExampleText.objects.select_related("writing_exercise", "writing_exercise__exercise_base").all()
    serializer_class = WritingExampleTextSerializer
    filterset_fields = ["writing_exercise", "label", "sort_order"]
    search_fields = ["label", "note", "example_text", "writing_exercise__exercise_base__external_id"]
    ordering_fields = ["id", "sort_order", "created_at", "updated_at"]


class SpeakingGapMatchingExerciseViewSet(BaseExamPreparationViewSet):
    queryset = SpeakingGapMatchingExercise.objects.select_related("exercise_base").prefetch_related(
        "options",
        "blanks__correct_option",
    ).all()
    serializer_class = SpeakingGapMatchingExerciseSerializer
    filterset_fields = ["exercise_base"]
    search_fields = ["content_with_placeholders", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SpeakingGapMatchingExerciseDetailSerializer
        return super().get_serializer_class()


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


class SpeakingPromptSegmentedExerciseViewSet(BaseExamPreparationViewSet):
    queryset = SpeakingPromptSegmentedExercise.objects.select_related("exercise_base").prefetch_related("segments").all()
    serializer_class = SpeakingPromptSegmentedExerciseSerializer
    filterset_fields = ["exercise_base", "segment_delimiter"]
    search_fields = ["prompt_text", "example_text_raw", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SpeakingPromptSegmentedExerciseDetailSerializer
        return super().get_serializer_class()


class SpeakingPromptSegmentViewSet(BaseExamPreparationViewSet):
    queryset = SpeakingPromptSegment.objects.select_related("exercise", "exercise__exercise_base").all()
    serializer_class = SpeakingPromptSegmentSerializer
    filterset_fields = ["exercise", "segment_order"]
    search_fields = ["segment_text", "exercise__exercise_base__external_id", "exercise__exercise_base__title"]
    ordering_fields = ["id", "segment_order", "created_at", "updated_at"]


class UserExerciseFavoriteViewSet(BaseExamPreparationViewSet):
    queryset = UserExerciseFavorite.objects.select_related("user", "exercise").all()
    serializer_class = UserExerciseFavoriteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["exercise"]
    search_fields = ["exercise__exam_type", "exercise__external_id", "exercise__title"]
    ordering_fields = ["id", "created_at"]
    ordering = ["-created_at", "id"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class UserListeningQuestionStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserListeningQuestionState.objects.select_related(
        "user",
        "question",
        "question__listening_exercise",
        "question__listening_exercise__exercise_base",
    ).all()
    serializer_class = UserListeningQuestionStateSerializer
    state_lookup_field = "question"
    filterset_fields = ["question", "is_favorited", "is_correct"]
    search_fields = [
        "question__question_text",
        "question__listening_exercise__exercise_base__external_id",
        "question__listening_exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserReadingUnderstandingQuestionStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserReadingUnderstandingQuestionState.objects.select_related(
        "user",
        "question",
        "question__exercise",
        "question__exercise__exercise_base",
    ).all()
    serializer_class = UserReadingUnderstandingQuestionStateSerializer
    state_lookup_field = "question"
    filterset_fields = ["question", "is_favorited", "is_correct"]
    search_fields = [
        "question__question_text",
        "question__exercise__exercise_base__external_id",
        "question__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserReadingTitleMatchingItemStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserReadingTitleMatchingItemState.objects.select_related(
        "user",
        "item",
        "item__exercise",
        "item__exercise__exercise_base",
        "item__correct_option",
    ).all()
    serializer_class = UserReadingTitleMatchingItemStateSerializer
    state_lookup_field = "item"
    filterset_fields = ["item", "is_favorited", "is_correct"]
    search_fields = [
        "item__text",
        "item__exercise__exercise_base__external_id",
        "item__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserReadingAdMatchingItemStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserReadingAdMatchingItemState.objects.select_related(
        "user",
        "item",
        "item__exercise",
        "item__exercise__exercise_base",
        "item__correct_ad",
    ).all()
    serializer_class = UserReadingAdMatchingItemStateSerializer
    state_lookup_field = "item"
    filterset_fields = ["item", "is_favorited", "is_correct"]
    search_fields = [
        "item__item_text",
        "item__exercise__exercise_base__external_id",
        "item__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserClozeChoiceBlankStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserClozeChoiceBlankState.objects.select_related(
        "user",
        "blank",
        "blank__exercise",
        "blank__exercise__exercise_base",
    ).all()
    serializer_class = UserClozeChoiceBlankStateSerializer
    state_lookup_field = "blank"
    filterset_fields = ["blank", "is_favorited", "is_correct"]
    search_fields = [
        "blank__blank_key",
        "blank__exercise__exercise_base__external_id",
        "blank__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserClozeMatchingBlankStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserClozeMatchingBlankState.objects.select_related(
        "user",
        "blank",
        "blank__exercise",
        "blank__exercise__exercise_base",
        "blank__correct_option",
    ).all()
    serializer_class = UserClozeMatchingBlankStateSerializer
    state_lookup_field = "blank"
    filterset_fields = ["blank", "is_favorited", "is_correct"]
    search_fields = [
        "blank__blank_key",
        "blank__exercise__exercise_base__external_id",
        "blank__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserSpeakingGapBlankStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserSpeakingGapBlankState.objects.select_related(
        "user",
        "blank",
        "blank__exercise",
        "blank__exercise__exercise_base",
        "blank__correct_option",
    ).all()
    serializer_class = UserSpeakingGapBlankStateSerializer
    state_lookup_field = "blank"
    filterset_fields = ["blank", "blank__exercise", "is_favorited", "is_correct"]
    search_fields = [
        "blank__blank_key",
        "blank__exercise__exercise_base__external_id",
        "blank__exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserWritingExerciseStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserWritingExerciseState.objects.select_related(
        "user",
        "exercise",
        "exercise__exercise_base",
    ).all()
    serializer_class = UserWritingExerciseStateSerializer
    state_lookup_field = "exercise"
    filterset_fields = ["exercise", "is_favorited", "is_correct"]
    search_fields = [
        "exercise__exercise_base__external_id",
        "exercise__exercise_base__title",
        "exercise__request_text",
        "exercise__task_text",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]


class UserSpeakingPromptSegmentedExerciseStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserSpeakingPromptSegmentedExerciseState.objects.select_related(
        "user",
        "exercise",
        "exercise__exercise_base",
    ).all()
    serializer_class = UserSpeakingPromptSegmentedExerciseStateSerializer
    state_lookup_field = "exercise"
    filterset_fields = ["exercise", "is_favorited", "is_correct"]
    search_fields = [
        "exercise__exercise_base__external_id",
        "exercise__exercise_base__title",
        "exercise__prompt_text",
    ]
    ordering_fields = ["id", "last_answered_at", "created_at", "updated_at"]
