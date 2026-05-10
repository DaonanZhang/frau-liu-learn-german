from __future__ import annotations

from rest_framework import serializers

from apps.learning_by_video.models import LearningVideoUserVideoNote


class LearningVideoUserVideoNoteSerializer(serializers.ModelSerializer):
    """
    Serializer for per-video markdown notes.
    """

    class Meta:
        model = LearningVideoUserVideoNote
        fields = [
            "id",
            "video",
            "note_markdown",
            "updated_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "video",
            "updated_at",
            "created_at",
        ]


class LearningVideoUserVideoNoteUpsertSerializer(serializers.Serializer):
    """
    Upsert serializer for one video note body.
    """

    note_markdown = serializers.CharField(required=False, allow_blank=True, default="")
