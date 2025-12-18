from __future__ import annotations

from rest_framework import serializers
from apps.learning_by_video.models import Subtitle


class SubtitleSerializer(serializers.ModelSerializer):
    """Read-only serializer for subtitle timeline items."""

    class Meta:
        model = Subtitle
        fields = ["id", "video", "start", "end", "content", "translation"]
        read_only_fields = fields
