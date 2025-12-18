from __future__ import annotations

from rest_framework import serializers
from apps.learning_by_video.models import LearningVideoUserData


class LearningVideoUserDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = LearningVideoUserData
        fields = ["id", "user_data", "completed_videos", "last_watched_video", "updated_at"]
        read_only_fields = ["id", "user_data", "updated_at"]
