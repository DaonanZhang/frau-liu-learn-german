from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.learning_by_video.models import LearningVideoUserVideoMark


class LearningVideoUserVideoMarkSerializer(serializers.ModelSerializer):
    """
    Serializer for per-video user mark states.
    """

    class Meta:
        model = LearningVideoUserVideoMark
        fields = [
            "id",
            "video",
            "is_favorite",
            "is_completed",
            "favorited_at",
            "completed_at",
            "updated_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "video",
            "favorited_at",
            "completed_at",
            "updated_at",
            "created_at",
        ]


class LearningVideoUserVideoMarkUpsertSerializer(serializers.Serializer):
    """
    Upsert serializer for toggling favorite/completed states.

    At least one of `is_favorite` or `is_completed` must be provided.

    Fields:
        is_favorite:
            Whether the user favorited the video.
        is_completed:
            Whether the user completed the video.
    """

    is_favorite = serializers.BooleanField(required=False)
    is_completed = serializers.BooleanField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """
        Ensure at least one update field is provided.

        Args:
            attrs: Incoming validated fields.

        Returns:
            Validated attributes.

        Raises:
            serializers.ValidationError: When no fields are provided.
        """
        if "is_favorite" not in attrs and "is_completed" not in attrs:
            raise serializers.ValidationError(
                "Provide at least one of: is_favorite, is_completed."
            )
        return attrs
