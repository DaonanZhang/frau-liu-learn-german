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
    word_lemma = serializers.CharField(source="word.lemma", read_only=True)
    word_article = serializers.CharField(source="word.article", read_only=True)
    word_pos = serializers.CharField(source="word.pos", read_only=True)
    word_splittable = serializers.BooleanField(source="word.splittable", read_only=True)

    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoWordOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + [
            "word",
            "word_text",
            "word_lemma",
            "word_article",
            "word_pos",
            "word_splittable",
        ]
        read_only_fields = fields

class VideoSentenceOccurrenceSerializer(BaseOccurrenceReadSerializer):
    sentence_text = serializers.CharField(source="sentence.text", read_only=True)
    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoSentenceOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + ["sentence", "sentence_text"]
        read_only_fields = fields


class VideoExpressionOccurrenceSerializer(BaseOccurrenceReadSerializer):
    expression_text = serializers.CharField(source="expression.text", read_only=True)
    expression_prototype = serializers.CharField(source="expression.prototype", read_only=True)

    class Meta(BaseOccurrenceReadSerializer.Meta):
        model = VideoExpressionOccurrence
        fields = BaseOccurrenceReadSerializer.Meta.fields + [
            "expression",
            "expression_text",
            "expression_prototype",
        ]
        read_only_fields = fields