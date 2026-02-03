from __future__ import annotations

from rest_framework import serializers

from apps.learning_by_video.models import LearningVideoUserData


class LearningVideoUserDataSerializer(serializers.ModelSerializer):
    """
    Serializer for module-level learning-by-video user data.

    Adds:
        favorite_count:
            Number of videos marked as favorite by the current user.
        completed_count:
            Number of videos marked as completed by the current user.
    """

    favorite_count = serializers.SerializerMethodField()
    completed_count = serializers.SerializerMethodField()

    class Meta:
        model = LearningVideoUserData
        fields = [
            "id",
            "user_data",
            "last_watched_video",
            "updated_at",
            "favorite_count",
            "completed_count",
        ]
        read_only_fields = [
            "id",
            "user_data",
            "updated_at",
            "favorite_count",
            "completed_count",
        ]

    def get_favorite_count(self, obj: LearningVideoUserData) -> int:
        """
        Count favorited videos for this user.

        Args:
            obj: LearningVideoUserData instance.

        Returns:
            Number of favorited videos.
        """
        return obj.video_marks.filter(is_favorite=True).count()

    def get_completed_count(self, obj: LearningVideoUserData) -> int:
        """
        Count completed videos for this user.

        Args:
            obj: LearningVideoUserData instance.

        Returns:
            Number of completed videos.
        """
        return obj.video_marks.filter(is_completed=True).count()
