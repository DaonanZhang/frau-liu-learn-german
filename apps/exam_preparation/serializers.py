from __future__ import annotations

from rest_framework import serializers

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
    SpeakingTeilExercise,
    UserClozeChoiceBlankState,
    UserClozeMatchingBlankState,
    UserExerciseFavorite,
    UserListeningQuestionState,
    UserReadingAdMatchingItemState,
    UserReadingTitleMatchingItemState,
    UserReadingUnderstandingQuestionState,
    UserSpeakingGapBlankState,
    UserSpeakingPromptSegmentedExerciseState,
    UserWritingExampleTextState,
    UserWritingExerciseState,
    WritingExampleText,
    WritingExercise,
)


class ExerciseBaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseBase
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

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


class ReadingTitleMatchingExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = ReadingTitleMatchingExercise
        fields = [
            "id",
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


class ReadingUnderstandingExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = ReadingUnderstandingExercise
        fields = [
            "id",
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


class ReadingAdMatchingExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = ReadingAdMatchingExercise
        fields = [
            "id",
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


class ClozeChoiceExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = ClozeChoiceExercise
        fields = [
            "id",
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


class ClozeMatchingExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = ClozeMatchingExercise
        fields = [
            "id",
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


class WritingExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

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


class SpeakingGapMatchingExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = SpeakingGapMatchingExercise
        fields = [
            "id",
            "exercise_base",
            "content_with_placeholders",
            "original_source_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SpeakingTeilExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = SpeakingTeilExercise
        fields = ["id", "exercise_base", "instruction", "content", "created_at", "updated_at"]
        read_only_fields = fields


class SpeakingGapBlankSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingGapBlank
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class SpeakingGapOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingGapOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class SpeakingGapOptionDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingGapOption
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


class SpeakingGapBlankDetailSerializer(serializers.ModelSerializer):
    options = SpeakingGapOptionDetailSerializer(many=True, read_only=True)

    class Meta:
        model = SpeakingGapBlank
        fields = [
            "id",
            "blank_key",
            "blank_number",
            "created_at",
            "updated_at",
            "options",
        ]
        read_only_fields = fields


class SpeakingGapMatchingExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    blanks = SpeakingGapBlankDetailSerializer(many=True, read_only=True)

    class Meta:
        model = SpeakingGapMatchingExercise
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


class SpeakingPromptSegmentedExerciseSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)

    class Meta:
        model = SpeakingPromptSegmentedExercise
        fields = [
            "id",
            "exercise_base",
            "prompt_text",
            "segment_delimiter",
            "example_text_raw",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SpeakingPromptSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingPromptSegment
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class SpeakingPromptSegmentDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingPromptSegment
        fields = [
            "id",
            "segment_order",
            "segment_text",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SpeakingPromptSegmentedExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_base = ExerciseBaseSerializer(read_only=True)
    segments = SpeakingPromptSegmentDetailSerializer(many=True, read_only=True)

    class Meta:
        model = SpeakingPromptSegmentedExercise
        fields = [
            "id",
            "exercise_base",
            "prompt_text",
            "segment_delimiter",
            "example_text_raw",
            "created_at",
            "updated_at",
            "segments",
        ]
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


class UserSpeakingGapBlankStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSpeakingGapBlankState
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


class UserSpeakingPromptSegmentedExerciseStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSpeakingPromptSegmentedExerciseState
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at", "updated_at"]
