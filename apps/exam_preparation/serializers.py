from __future__ import annotations

from rest_framework import serializers

from apps.exam_preparation.access import (
    FREE_EXERCISES_PER_TYPE,
    user_has_full_exam_preparation_access,
)
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


class TrialAwareExerciseSerializerMixin:
    locked_content_fields = ()

    def get_is_locked(self, exercise):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if "has_full_exam_preparation_access" not in self.context:
            self.context["has_full_exam_preparation_access"] = user_has_full_exam_preparation_access(user)
        if self.context["has_full_exam_preparation_access"]:
            return False

        exercise_type = exercise.exercise_base.exercise_type
        cache_key = (type(exercise), exercise_type)
        free_ids_by_type = self.context.setdefault("free_trial_exercise_ids", {})
        if cache_key not in free_ids_by_type:
            free_ids_by_type[cache_key] = set(
                type(exercise).objects.filter(
                    exercise_base__exercise_type=exercise_type,
                )
                .order_by("id")
                .values_list("id", flat=True)[:FREE_EXERCISES_PER_TYPE]
            )
        return exercise.pk not in free_ids_by_type[cache_key]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.get_is_locked(instance):
            for field_name in self.locked_content_fields:
                if field_name in data:
                    if isinstance(data[field_name], dict):
                        data[field_name] = {}
                    elif isinstance(data[field_name], list):
                        data[field_name] = []
                    else:
                        data[field_name] = ""
        return data


class ExerciseBaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseBase
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("audio_file_identifier", "audio_file_url", "script")

    class Meta:
        model = ListeningExercise
        fields = [
            "id",
            "is_locked",
            "exercise_base",
            "listening_type",
            "audio_file_identifier",
            "audio_file_url",
            "script",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningQuestion
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningAnswerOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningAnswerOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningAnswerOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningAnswerOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "is_correct",
            "explanation",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ListeningQuestionDetailSerializer(serializers.ModelSerializer):
    answer_options = ListeningAnswerOptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ListeningQuestion
        fields = [
            "id",
            "question_number",
            "question_type",
            "question_text",
            "created_at",
            "updated_at",
            "answer_options",
        ]
        read_only_fields = fields


class ListeningExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    questions = ListeningQuestionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ListeningExercise
        fields = [
            "id",
            "exercise_base",
            "listening_type",
            "audio_file_identifier",
            "audio_file_url",
            "script",
            "created_at",
            "updated_at",
            "questions",
        ]
        read_only_fields = fields


class ReadingTitleMatchingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("instruction",)

    class Meta:
        model = ReadingTitleMatchingExercise
        fields = [
            "id",
            "is_locked",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingTitleMatchingItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingTitleMatchingItem
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingTitleMatchingOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingTitleMatchingOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingTitleMatchingItemDetailSerializer(serializers.ModelSerializer):
    correct_option = ReadingTitleMatchingOptionSerializer(read_only=True)

    class Meta:
        model = ReadingTitleMatchingItem
        fields = [
            "id",
            "item_number",
            "text",
            "correct_option",
            "explanation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingTitleMatchingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    options = ReadingTitleMatchingOptionSerializer(many=True, read_only=True)
    items = ReadingTitleMatchingItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingTitleMatchingExercise
        fields = [
            "id",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
            "options",
            "items",
        ]
        read_only_fields = fields


class ReadingUnderstandingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("text_markdown",)

    class Meta:
        model = ReadingUnderstandingExercise
        fields = [
            "id",
            "is_locked",
            "exercise_base",
            "text_markdown",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingUnderstandingQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingUnderstandingQuestion
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingUnderstandingAnswerOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingUnderstandingAnswerOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingUnderstandingAnswerOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingUnderstandingAnswerOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "is_correct",
            "explanation",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingUnderstandingQuestionDetailSerializer(serializers.ModelSerializer):
    answer_options = ReadingUnderstandingAnswerOptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingUnderstandingQuestion
        fields = [
            "id",
            "question_number",
            "question_text",
            "created_at",
            "updated_at",
            "answer_options",
        ]
        read_only_fields = fields


class ReadingUnderstandingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    questions = ReadingUnderstandingQuestionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingUnderstandingExercise
        fields = [
            "id",
            "exercise_base",
            "text_markdown",
            "created_at",
            "updated_at",
            "questions",
        ]
        read_only_fields = fields


class ReadingAdMatchingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("instruction",)

    class Meta:
        model = ReadingAdMatchingExercise
        fields = [
            "id",
            "is_locked",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingAdMatchingItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAdMatchingItem
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingAdMatchingAdSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAdMatchingAd
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ReadingAdMatchingAdDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAdMatchingAd
        fields = [
            "id",
            "ad_key",
            "ad_text_markdown",
            "ad_order",
            "is_no_match_option",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingAdMatchingItemDetailSerializer(serializers.ModelSerializer):
    correct_ad = ReadingAdMatchingAdDetailSerializer(read_only=True)

    class Meta:
        model = ReadingAdMatchingItem
        fields = [
            "id",
            "item_number",
            "item_text",
            "correct_ad",
            "explanation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReadingAdMatchingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    ads = ReadingAdMatchingAdDetailSerializer(many=True, read_only=True)
    items = ReadingAdMatchingItemDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ReadingAdMatchingExercise
        fields = [
            "id",
            "exercise_base",
            "instruction",
            "created_at",
            "updated_at",
            "ads",
            "items",
        ]
        read_only_fields = fields


class ClozeChoiceExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("content_with_placeholders", "original_source_text")

    class Meta:
        model = ClozeChoiceExercise
        fields = [
            "id",
            "is_locked",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeChoiceBlankSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeChoiceBlank
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeChoiceOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeChoiceOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeChoiceOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeChoiceOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "is_correct",
            "explanation",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ClozeChoiceBlankDetailSerializer(serializers.ModelSerializer):
    options = ClozeChoiceOptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ClozeChoiceBlank
        fields = [
            "id",
            "blank_key",
            "blank_number",
            "created_at",
            "updated_at",
            "options",
        ]
        read_only_fields = fields


class ClozeChoiceExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    blanks = ClozeChoiceBlankDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ClozeChoiceExercise
        fields = [
            "id",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
            "blanks",
        ]
        read_only_fields = fields


class ClozeMatchingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("content_with_placeholders", "original_source_text")

    class Meta:
        model = ClozeMatchingExercise
        fields = [
            "id",
            "is_locked",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingOption
        fields = [
            "id",
            "option_key",
            "option_text",
            "option_order",
            "is_extra",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ClozeMatchingBlankAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingBlankAnswer
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingBlankAnswerDetailSerializer(serializers.ModelSerializer):
    correct_option = ClozeMatchingOptionDetailSerializer(read_only=True)

    class Meta:
        model = ClozeMatchingBlankAnswer
        fields = [
            "id",
            "blank_key",
            "blank_number",
            "correct_option",
            "explanation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ClozeMatchingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    options = ClozeMatchingOptionDetailSerializer(many=True, read_only=True)
    blank_answers = ClozeMatchingBlankAnswerDetailSerializer(many=True, read_only=True)

    class Meta:
        model = ClozeMatchingExercise
        fields = [
            "id",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
            "options",
            "blank_answers",
        ]
        read_only_fields = fields


class WritingExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("request_text", "task_text")

    class Meta:
        model = WritingExercise
        fields = [
            "id",
            "is_locked",
            "exercise_base",
            "request_text",
            "time_limit_minutes",
            "words_limit",
            "task_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class WritingExampleTextSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingExampleText
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class WritingExampleTextDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingExampleText
        fields = [
            "id",
            "label",
            "note",
            "example_text",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class WritingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    example_texts = WritingExampleTextDetailSerializer(many=True, read_only=True)

    class Meta:
        model = WritingExercise
        fields = [
            "id",
            "exercise_base",
            "request_text",
            "time_limit_minutes",
            "words_limit",
            "task_text",
            "created_at",
            "updated_at",
            "example_texts",
        ]
        read_only_fields = fields


class SpeakingTeilExerciseSerializer(TrialAwareExerciseSerializerMixin, serializers.ModelSerializer):
    is_locked = serializers.SerializerMethodField()
    exercise_base = ExerciseBaseSerializer(read_only=True)
    locked_content_fields = ("instruction", "content")

    class Meta:
        model = SpeakingTeilExercise
        fields = ["id", "is_locked", "exercise_base", "instruction", "content", "created_at", "updated_at"]
        read_only_fields = fields


class UserExerciseFavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserExerciseFavorite
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at"]


class UserListeningQuestionStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserListeningQuestionState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserReadingUnderstandingQuestionStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserReadingUnderstandingQuestionState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserReadingTitleMatchingItemStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserReadingTitleMatchingItemState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserReadingAdMatchingItemStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserReadingAdMatchingItemState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserClozeChoiceBlankStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserClozeChoiceBlankState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserClozeMatchingBlankStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserClozeMatchingBlankState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserWritingExerciseStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserWritingExerciseState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserWritingExampleTextStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserWritingExampleTextState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]
