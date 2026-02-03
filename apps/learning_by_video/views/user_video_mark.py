from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.learning_by_video.models import LearningVideoUserData, LearningVideoUserVideoMark, Video
from apps.learning_by_video.serializers.user_video_mark import (
    LearningVideoUserVideoMarkSerializer,
    LearningVideoUserVideoMarkUpsertSerializer,
)


class LearningVideoUserVideoMarkViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for marking videos as favorite/completed for the current user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = LearningVideoUserVideoMarkSerializer

    def _get_learning_video_user_data(self) -> LearningVideoUserData:
        """
        Get or create module user data for the authenticated user.

        Returns:
            The LearningVideoUserData instance.

        Raises:
            ValueError: If `request.user.user_data` relation is missing.
        """
        user_data = getattr(self.request.user, "user_data", None)
        if user_data is None:
            raise ValueError(
                "UserData relation not found on user. "
                "Adjust _get_learning_video_user_data() to match your accounts.UserData relation."
            )

        obj, _ = LearningVideoUserData.objects.get_or_create(user_data=user_data)
        return obj

    def get_queryset(self):
        """
        Restrict queryset to current user's records.

        Returns:
            QuerySet filtered by current user.
        """
        learning_video_user_data = self._get_learning_video_user_data()
        return (
            LearningVideoUserVideoMark.objects.filter(learning_video_user_data=learning_video_user_data)
            .select_related("video")
            .order_by("-updated_at")
        )

    @action(detail=False, methods=["get", "patch"], url_path=r"by-video/(?P<video_id>\d+)")
    def by_video(self, request: Request, video_id: str) -> Response:
        """
        Get or update mark status for a specific video by id.

        GET:
            Returns the current mark state (record is created if missing).
        PATCH:
            Updates `is_favorite` / `is_completed` and timestamps accordingly.

        Args:
            request: DRF request.
            video_id: Video primary key as string.

        Returns:
            Response containing the mark record.
        """
        learning_video_user_data = self._get_learning_video_user_data()
        video = get_object_or_404(Video, pk=video_id)

        mark, _ = LearningVideoUserVideoMark.objects.get_or_create(
            learning_video_user_data=learning_video_user_data,
            video=video,
        )

        if request.method.lower() == "get":
            out = LearningVideoUserVideoMarkSerializer(instance=mark, context={"request": request})
            return Response(out.data, status=status.HTTP_200_OK)

        upsert = LearningVideoUserVideoMarkUpsertSerializer(data=request.data)
        upsert.is_valid(raise_exception=True)

        validated = upsert.validated_data

        if "is_favorite" in validated:
            new_value = bool(validated["is_favorite"])
            mark.is_favorite = new_value
            mark.favorited_at = timezone.now() if new_value else None

        if "is_completed" in validated:
            new_value = bool(validated["is_completed"])
            mark.is_completed = new_value
            mark.completed_at = timezone.now() if new_value else None

        mark.save()

        out = LearningVideoUserVideoMarkSerializer(instance=mark, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="favorites")
    def favorites(self, request: Request) -> Response:
        """
        List current user's favorited videos.

        Returns:
            List of mark records where is_favorite=True.
        """
        queryset = self.get_queryset().filter(is_favorite=True)
        serializer = LearningVideoUserVideoMarkSerializer(
            instance=queryset,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="completed")
    def completed(self, request: Request) -> Response:
        """
        List current user's completed videos.

        Returns:
            List of mark records where is_completed=True.
        """
        queryset = self.get_queryset().filter(is_completed=True)
        serializer = LearningVideoUserVideoMarkSerializer(
            instance=queryset,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)
