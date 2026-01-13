from __future__ import annotations

from rest_framework import serializers

from apps.learning_by_video.models.exercise import VideoExerciseOption, VideoExerciseQuestion


class VideoExerciseOptionSerializer(serializers.ModelSerializer):
    """
    Serialize a single answer/option.
    """

    class Meta:
        model = VideoExerciseOption
        fields = [
            "id",
            "text",
            "is_correct",
            "explanation",
            "order",
        ]


class VideoExerciseQuestionSerializer(serializers.ModelSerializer):
    """
    Serialize a question with nested options.
    """
    options = VideoExerciseOptionSerializer(many=True, read_only=True)

    class Meta:
        model = VideoExerciseQuestion
        fields = [
            "id",
            "video",
            "external_id",
            "question_type",
            "prompt",
            "order",
            "created_at",
            "options",
        ]
        read_only_fields = ["id", "created_at", "options"]
