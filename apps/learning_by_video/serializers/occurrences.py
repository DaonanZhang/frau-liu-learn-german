from __future__ import annotations

from rest_framework import serializers
from apps.learning_by_video.models import (
    VideoWordOccurrence,
    VideoSentenceOccurrence,
    VideoExpressionOccurrence,
)


class BaseOccurrenceReadSerializer(serializers.ModelSerializer):
    class Meta:
        fields = [
            "id",
            "video",
            "subtitle",
            "time_start",
            "time_end",
            "translation",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class VideoWordOccurrenceSerializer(BaseOccurrenceReadSerializer):
    word_text = serializers.CharField(source="word.text", read_only=True)

    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoWordOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + ["word", "word_text"]
        read_only_fields = fields


class VideoSentenceOccurrenceSerializer(BaseOccurrenceReadSerializer):
    sentence_text = serializers.CharField(source="sentence.text", read_only=True)
    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoSentenceOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + ["sentence", "sentence_text"]
        read_only_fields = fields


class VideoExpressionOccurrenceSerializer(BaseOccurrenceReadSerializer):
    expression_text = serializers.CharField(source="expression.text", read_only=True)
    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoExpressionOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + ["expression", "meaning", "example", "expression_text"]
        read_only_fields = fields
