from __future__ import annotations

from django_filters import rest_framework as filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.learning_by_video.models import (
    LearningVideoUserData,
    LearningVideoUserSubtitleFavorite,
)
from apps.learning_by_video.serializers.user_subtitle_favorite import (
    LearningVideoUserSubtitleFavoriteSerializer,
)


class LearningVideoUserSubtitleFavoriteFilter(filters.FilterSet):
    video = filters.NumberFilter(field_name="subtitle__video_id")
    subtitle = filters.NumberFilter(field_name="subtitle_id")

    class Meta:
        model = LearningVideoUserSubtitleFavorite
        fields = ["video", "subtitle"]


class LearningVideoUserSubtitleFavoriteViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for current user's subtitle favorites.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = LearningVideoUserSubtitleFavoriteSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = LearningVideoUserSubtitleFavoriteFilter
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]

    def _get_learning_video_user_data(self) -> LearningVideoUserData:
        user_data = getattr(self.request.user, "user_data", None)
        if user_data is None:
            raise ValueError(
                "UserData relation not found on user. "
                "Adjust _get_learning_video_user_data() to match your accounts.UserData relation."
            )
        obj, _ = LearningVideoUserData.objects.get_or_create(user_data=user_data)
        return obj

    def get_queryset(self):
        learning_video_user_data = self._get_learning_video_user_data()
        return (
            LearningVideoUserSubtitleFavorite.objects.filter(
                learning_video_user_data=learning_video_user_data
            )
            .select_related("subtitle", "subtitle__video")
            .order_by("-created_at")
        )

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        learning_video_user_data = self._get_learning_video_user_data()
        subtitle = serializer.validated_data["subtitle"]

        obj, created = LearningVideoUserSubtitleFavorite.objects.get_or_create(
            learning_video_user_data=learning_video_user_data,
            subtitle=subtitle,
        )

        out = self.get_serializer(instance=obj)
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(out.data, status=status_code)

