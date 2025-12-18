from __future__ import annotations

from typing import Any

from rest_framework import serializers
from apps.learning_by_video.models import Video
from .subtitles import SubtitleSerializer
from .progress import VideoProgressSerializer


class VideoListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for video list pages."""

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "description",
            "difficulty",
            "video_url",
            "cover_letter_url",
            "duration_seconds",
            "created_at",
        ]
        read_only_fields = fields


class VideoDetailSerializer(serializers.ModelSerializer):
    """
    Video detail serializer.
    - optionally includes subtitles if context['include_subtitles'] is True
    - includes current user's progress if context['progress'] is provided
    """

    subtitles = SubtitleSerializer(many=True, read_only=True)
    progress = VideoProgressSerializer(read_only=True)

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "description",
            "difficulty",
            "video_url",
            "cover_letter_url",
            "duration_seconds",
            "created_at",
            "subtitles",
            "progress",
        ]
        read_only_fields = fields

    def to_representation(self, instance: Video) -> dict[str, Any]:
        data = super().to_representation(instance)

        include_subtitles = bool(self.context.get("include_subtitles"))
        if not include_subtitles:
            data.pop("subtitles", None)

        progress_obj = self.context.get("progress")
        if progress_obj is None:
            data.pop("progress", None)
        else:
            data["progress"] = VideoProgressSerializer(progress_obj).data

        return data
