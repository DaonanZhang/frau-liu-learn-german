from __future__ import annotations

import re

from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.viewsets import ModelViewSet, ViewSet

from apps.accounts.permissions import HasValidEntitlement, IsAdminOrReadOnly

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
    SpeakingTeilExercise,
    UserClozeChoiceBlankState,
    UserClozeMatchingBlankState,
    UserExerciseFavorite,
    UserListeningQuestionState,
    UserReadingAdMatchingItemState,
    UserReadingTitleMatchingItemState,
    UserReadingUnderstandingQuestionState,
    UserWritingExampleTextState,
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
    SpeakingTeilExerciseSerializer,
    UserClozeChoiceBlankStateSerializer,
    UserClozeMatchingBlankStateSerializer,
    UserExerciseFavoriteSerializer,
    UserListeningQuestionStateSerializer,
    UserReadingAdMatchingItemStateSerializer,
    UserReadingTitleMatchingItemStateSerializer,
    UserReadingUnderstandingQuestionStateSerializer,
    UserWritingExampleTextStateSerializer,
    UserWritingExerciseStateSerializer,
    WritingExampleTextSerializer,
    WritingExerciseDetailSerializer,
    WritingExerciseSerializer,
)


class BaseExamPreparationViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated, HasValidEntitlement, IsAdminOrReadOnly]
    required_module_key = "exam_preparation"
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    ordering = ["id"]


class BaseUserExerciseStateViewSet(BaseExamPreparationViewSet):
    permission_classes = [IsAuthenticated, HasValidEntitlement]
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


class SpeakingTeilExerciseViewSet(BaseExamPreparationViewSet):
    queryset = SpeakingTeilExercise.objects.select_related("exercise_base").all()
    serializer_class = SpeakingTeilExerciseSerializer
    filterset_fields = ["exercise_base", "exercise_base__exercise_type"]
    search_fields = ["instruction", "exercise_base__external_id", "exercise_base__title"]
    ordering_fields = ["id", "created_at", "updated_at"]


class UserExerciseFavoriteViewSet(BaseExamPreparationViewSet):
    queryset = UserExerciseFavorite.objects.select_related("user", "exercise").all()
    serializer_class = UserExerciseFavoriteSerializer
    permission_classes = [IsAuthenticated, HasValidEntitlement]
    filterset_fields = ["exercise"]
    search_fields = ["exercise__exam_type", "exercise__external_id", "exercise__title"]
    ordering_fields = ["id", "created_at"]
    ordering = ["-created_at", "id"]

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class FavoriteQuestionViewSet(ViewSet):
    """Return every favorited exam-preparation item in one normalized list."""

    permission_classes = [IsAuthenticated, HasValidEntitlement]
    required_module_key = "exam_preparation"

    @staticmethod
    def _preview_text(value, limit=700):
        text = str(value or "")
        return text if len(text) <= limit else f"{text[:limit].rstrip()}…"

    @staticmethod
    def _option_summary(options, limit=6):
        texts = [str(option.option_text or "").strip() for option in options]
        texts = [text for text in texts if text]
        if not texts:
            return ""
        visible = texts[:limit]
        suffix = " …" if len(texts) > limit else ""
        return f"可选项：{' · '.join(visible)}{suffix}"

    @staticmethod
    def _blank_excerpt(content, blank_key, blank_number, limit=420):
        marker = f"【第 {blank_number} 空】"
        normalized_target = str(blank_key or "").strip().lower()

        def replace_placeholder(match):
            placeholder_key = match.group(1).strip().lower()
            return marker if placeholder_key == normalized_target else "____"

        rendered = re.sub(r"\{\{\s*([^{}]+?)\s*\}\}", replace_placeholder, str(content or ""))
        rendered = re.sub(r"\s+", " ", rendered).strip()
        if not rendered:
            return marker
        if marker not in rendered:
            return f"{marker} · {FavoriteQuestionViewSet._preview_text(rendered, limit)}"
        if len(rendered) <= limit:
            return rendered

        marker_index = rendered.index(marker)
        half_window = max(80, (limit - len(marker)) // 2)
        start = max(0, marker_index - half_window)
        end = min(len(rendered), marker_index + len(marker) + half_window)
        excerpt = rendered[start:end].strip()
        if start > 0:
            excerpt = f"…{excerpt}"
        if end < len(rendered):
            excerpt = f"{excerpt}…"
        return excerpt

    @staticmethod
    def _base_payload(state, exercise_base, *, state_type, target_field, target_id, exercise_id, href):
        return {
            "id": f"{state_type}:{state.pk}",
            "state_type": state_type,
            "state_id": state.pk,
            "target_field": target_field,
            "target_id": target_id,
            "exercise_id": exercise_id,
            "exercise_base_id": exercise_base.pk,
            "exercise_type": exercise_base.exercise_type,
            "skill": exercise_base.skill,
            "level": exercise_base.level,
            "exam_type": exercise_base.exam_type,
            "external_id": exercise_base.external_id,
            "title": exercise_base.title,
            "is_real_exam": exercise_base.is_real_exam,
            "difficulty": exercise_base.difficulty,
            "href": href,
            "updated_at": state.updated_at,
        }

    def list(self, request):
        user = request.user
        items = []

        listening_states = UserListeningQuestionState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "question__listening_exercise__exercise_base",
        ).prefetch_related("question__answer_options")
        listening_routes = {
            "short_text_true_false_with_prep": "short-text-prep",
            "short_text_true_false_once": "short-text-once",
            "dialog_true_false_twice": "dialog-twice",
        }
        for state in listening_states:
            question = state.question
            exercise = question.listening_exercise
            exercise_base = exercise.exercise_base
            route = listening_routes.get(exercise.listening_type, "short-text-prep")
            payload = self._base_payload(
                state,
                exercise_base,
                state_type="listening_question",
                target_field="question",
                target_id=question.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/hoeren/{route}/{exercise.pk}",
            )
            payload.update(
                question_label=f"听力选择 · 第 {question.question_number} 题",
                question_text=question.question_text,
                context_text=self._option_summary(question.answer_options.all()),
            )
            items.append(payload)

        reading_understanding_states = UserReadingUnderstandingQuestionState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "question__exercise__exercise_base",
        ).prefetch_related("question__answer_options")
        for state in reading_understanding_states:
            question = state.question
            exercise = question.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="reading_understanding_question",
                target_field="question",
                target_id=question.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/lesen/understanding/{exercise.pk}",
            )
            payload.update(
                question_label=f"阅读理解 · 第 {question.question_number} 题",
                question_text=question.question_text,
                context_text=self._option_summary(question.answer_options.all()),
            )
            items.append(payload)

        reading_title_states = UserReadingTitleMatchingItemState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related("item__exercise__exercise_base")
        for state in reading_title_states:
            item = state.item
            exercise = item.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="reading_title_matching_item",
                target_field="item",
                target_id=item.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/lesen/title-matching/{exercise.pk}",
            )
            payload.update(
                question_label=f"标题匹配 · 第 {item.item_number} 段",
                question_text=item.text,
                context_text="为这段文字选择最合适的标题。",
            )
            items.append(payload)

        reading_ad_states = UserReadingAdMatchingItemState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related("item__exercise__exercise_base")
        for state in reading_ad_states:
            item = state.item
            exercise = item.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="reading_ad_matching_item",
                target_field="item",
                target_id=item.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/lesen/ad-matching/{exercise.pk}",
            )
            payload.update(
                question_label=f"广告匹配 · 情境 {item.item_number}",
                question_text=item.item_text,
                context_text="为这个人物情境寻找最合适的广告。",
            )
            items.append(payload)

        cloze_choice_states = UserClozeChoiceBlankState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "blank__exercise__exercise_base",
        ).prefetch_related("blank__options")
        for state in cloze_choice_states:
            blank = state.blank
            exercise = blank.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="cloze_choice_blank",
                target_field="blank",
                target_id=blank.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/sprachbausteine/cloze-choice/{exercise.pk}",
            )
            payload.update(
                question_label=f"单选完形 · 第 {blank.blank_number} 空",
                question_text=self._blank_excerpt(
                    exercise.content_with_placeholders,
                    blank.blank_key,
                    blank.blank_number,
                ),
                context_text=self._option_summary(blank.options.all()),
            )
            items.append(payload)

        cloze_matching_states = UserClozeMatchingBlankState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "blank__exercise__exercise_base",
        ).prefetch_related("blank__exercise__options")
        for state in cloze_matching_states:
            blank = state.blank
            exercise = blank.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="cloze_matching_blank",
                target_field="blank",
                target_id=blank.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/sprachbausteine/cloze-matching/{exercise.pk}",
            )
            payload.update(
                question_label=f"选项池完形 · 第 {blank.blank_number} 空",
                question_text=self._blank_excerpt(
                    exercise.content_with_placeholders,
                    blank.blank_key,
                    blank.blank_number,
                ),
                context_text=self._option_summary(exercise.options.all()),
            )
            items.append(payload)

        writing_states = UserWritingExerciseState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related("exercise__exercise_base")
        for state in writing_states:
            exercise = state.exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="writing_exercise",
                target_field="exercise",
                target_id=exercise.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/schreiben/{exercise.pk}",
            )
            payload.update(
                question_label="写作题",
                question_text=exercise.request_text or exercise.task_text,
                context_text=self._preview_text(exercise.task_text),
            )
            items.append(payload)

        writing_example_states = UserWritingExampleTextState.objects.filter(
            user=user,
            is_favorited=True,
        ).select_related(
            "example_text__writing_exercise__exercise_base",
        )
        for state in writing_example_states:
            example = state.example_text
            exercise = example.writing_exercise
            payload = self._base_payload(
                state,
                exercise.exercise_base,
                state_type="writing_example_text",
                target_field="example_text",
                target_id=example.pk,
                exercise_id=exercise.pk,
                href=f"/modules/exam-preparation/schreiben/{exercise.pk}",
            )
            payload.update(
                question_label=example.label or f"Beispieltext {example.sort_order + 1}",
                question_text=self._preview_text(example.example_text),
                context_text=self._preview_text(example.note),
            )
            items.append(payload)

        items.sort(key=lambda item: item["updated_at"], reverse=True)
        return Response({"count": len(items), "results": items})


class UserListeningQuestionStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserListeningQuestionState.objects.select_related(
        "user",
        "question",
        "question__listening_exercise",
        "question__listening_exercise__exercise_base",
    ).all()
    serializer_class = UserListeningQuestionStateSerializer
    state_lookup_field = "question"
    filterset_fields = ["question", "question__listening_exercise", "is_favorited", "is_correct"]
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
    filterset_fields = ["question", "question__exercise", "is_favorited", "is_correct"]
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
    filterset_fields = ["item", "item__exercise", "is_favorited", "is_correct"]
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
    filterset_fields = ["item", "item__exercise", "is_favorited", "is_correct"]
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
    filterset_fields = ["blank", "blank__exercise", "is_favorited", "is_correct"]
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


class UserWritingExampleTextStateViewSet(BaseUserExerciseStateViewSet):
    queryset = UserWritingExampleTextState.objects.select_related(
        "user",
        "example_text",
        "example_text__writing_exercise",
        "example_text__writing_exercise__exercise_base",
    ).all()
    serializer_class = UserWritingExampleTextStateSerializer
    state_lookup_field = "example_text"
    filterset_fields = ["example_text", "example_text__writing_exercise", "is_favorited"]
    search_fields = [
        "example_text__label",
        "example_text__example_text",
        "example_text__writing_exercise__exercise_base__external_id",
        "example_text__writing_exercise__exercise_base__title",
    ]
    ordering_fields = ["id", "created_at", "updated_at"]
