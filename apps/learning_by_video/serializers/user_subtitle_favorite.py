from __future__ import annotations

from rest_framework import serializers

from apps.learning_by_video.access import ensure_video_access
from apps.learning_by_video.models import LearningVideoUserSubtitleFavorite, Subtitle


class LearningVideoUserSubtitleFavoriteSerializer(serializers.ModelSerializer):
    """
    Serializer for current user's subtitle favorite records.
    """

    video = serializers.IntegerField(source="subtitle.video_id", read_only=True)

    class Meta:
        model = LearningVideoUserSubtitleFavorite
        fields = [
            "id",
            "subtitle",
            "video",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "video",
            "created_at",
        ]

    def validate_subtitle(self, subtitle: Subtitle) -> Subtitle:
        """
        Ensure user can access subtitle's video before favorite is created.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None:
            return subtitle

        ensure_video_access(
            user=user,
            video=subtitle.video,
            module_key="learning_by_video",
        )
        return subtitle

