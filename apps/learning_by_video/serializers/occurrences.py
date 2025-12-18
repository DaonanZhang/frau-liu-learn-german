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
    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoWordOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + ["word"]
        read_only_fields = fields


class VideoSentenceOccurrenceSerializer(BaseOccurrenceReadSerializer):
    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoSentenceOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + ["sentence"]
        read_only_fields = fields


class VideoExpressionOccurrenceSerializer(BaseOccurrenceReadSerializer):
    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoExpressionOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + ["expression", "meaning", "example"]
        read_only_fields = fields
