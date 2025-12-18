from __future__ import annotations

from rest_framework import serializers
from apps.learning_by_video.models import VideoProgress


class VideoProgressSerializer(serializers.ModelSerializer):
    """Per-user per-video progress serializer (read/write)."""

    class Meta:
        model = VideoProgress
        fields = ["id", "video", "current_time", "completed", "updated_at"]
        read_only_fields = ["id", "video", "updated_at"]

    def validate_current_time(self, value: float) -> float:
        if value < 0:
            raise serializers.ValidationError("current_time must be >= 0.")
        return round(float(value), 3)
