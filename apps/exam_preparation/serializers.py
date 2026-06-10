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
    UserExerciseFavorite,
    WritingExampleText,
    WritingExercise,
)


class ExerciseBaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseBase
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ListeningExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListeningExercise
        fields = "__all__"
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


class ReadingTitleMatchingExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingTitleMatchingExercise
        fields = "__all__"
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


class ReadingUnderstandingExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingUnderstandingExercise
        fields = "__all__"
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


class ReadingAdMatchingExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingAdMatchingExercise
        fields = "__all__"
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


class ClozeChoiceExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeChoiceExercise
        fields = "__all__"
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


class ClozeMatchingExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingExercise
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingOption
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ClozeMatchingBlankAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClozeMatchingBlankAnswer
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class WritingExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingExercise
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class WritingExampleTextSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingExampleText
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class SpeakingGapMatchingExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingGapMatchingExercise
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


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


class UserExerciseFavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserExerciseFavorite
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at"]

