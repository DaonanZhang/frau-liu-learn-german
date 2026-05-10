from __future__ import annotations

from typing import Any

from rest_framework import serializers
from apps.learning_by_video.models import Video
from apps.learning_by_video.access import is_video_free_preview, user_has_video_entitlement
from .subtitles import SubtitleSerializer
from .progress import VideoProgressSerializer


class VideoListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for video list pages."""
    season_number = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    is_free_preview = serializers.SerializerMethodField()
    show_free_preview_badge = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "creator",
            "description",
            "difficulty",
            "video_url",
            "cover_letter_url",
            "duration_seconds",
            "tags",
            "created_at",
            "season_number",
            "is_locked",
            "is_free_preview",
            "show_free_preview_badge",
        ]
        read_only_fields = fields

    @staticmethod
    def _get_video_season_ids(obj: Video) -> set[int]:
        season_ids: set[int] = set()
        if obj.season_id:
            season_ids.add(obj.season_id)
        access_rel = getattr(obj, "access_seasons", None)
        if access_rel is not None:
            season_ids.update(access_rel.values_list("id", flat=True))
        return season_ids

    def get_season_number(self, obj: Video) -> int | None:
        return obj.season.season_number if obj.season_id else None

    def get_is_locked(self, obj: Video) -> bool:
        if is_video_free_preview(video=obj, module_key="learning_by_video"):
            return False

        # No season assigned => locked
        video_season_ids = self._get_video_season_ids(obj)
        if not video_season_ids:
            return True

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and getattr(user, "is_staff", False):
            return False

        season_ids = self.context.get("accessible_season_ids")
        if season_ids is None:
            return False
        if not season_ids:
            return True
        return not video_season_ids.intersection(season_ids)

    def get_is_free_preview(self, obj: Video) -> bool:
        return is_video_free_preview(video=obj, module_key="learning_by_video")

    def get_show_free_preview_badge(self, obj: Video) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return self.get_is_free_preview(obj) and not user_has_video_entitlement(
            user=user,
            video=obj,
            module_key="learning_by_video",
        )


class VideoDetailSerializer(serializers.ModelSerializer):
    """
    Video detail serializer.
    - optionally includes subtitles if context['include_subtitles'] is True
    - includes current user's progress if context['progress'] is provided
    """

    subtitles = SubtitleSerializer(many=True, read_only=True)
    progress = VideoProgressSerializer(read_only=True)
    season_number = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    is_free_preview = serializers.SerializerMethodField()
    show_free_preview_badge = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "creator",
            "description",
            "difficulty",
            "video_url",
            "cover_letter_url",
            "duration_seconds",
            "tags",
            "created_at",
            "season_number",
            "is_locked",
            "is_free_preview",
            "show_free_preview_badge",
            "subtitles",
            "progress",
        ]
        read_only_fields = fields

    @staticmethod
    def _get_video_season_ids(obj: Video) -> set[int]:
        season_ids: set[int] = set()
        if obj.season_id:
            season_ids.add(obj.season_id)
        access_rel = getattr(obj, "access_seasons", None)
        if access_rel is not None:
            season_ids.update(access_rel.values_list("id", flat=True))
        return season_ids

    def get_season_number(self, obj: Video) -> int | None:
        return obj.season.season_number if obj.season_id else None

    def get_is_locked(self, obj: Video) -> bool:
        if is_video_free_preview(video=obj, module_key="learning_by_video"):
            return False

        video_season_ids = self._get_video_season_ids(obj)
        if not video_season_ids:
            return True

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and getattr(user, "is_staff", False):
            return False

        season_ids = self.context.get("accessible_season_ids")
        if season_ids is None:
            return False
        if not season_ids:
            return True
        return not video_season_ids.intersection(season_ids)

    def get_is_free_preview(self, obj: Video) -> bool:
        return is_video_free_preview(video=obj, module_key="learning_by_video")

    def get_show_free_preview_badge(self, obj: Video) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return self.get_is_free_preview(obj) and not user_has_video_entitlement(
            user=user,
            video=obj,
            module_key="learning_by_video",
        )

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
