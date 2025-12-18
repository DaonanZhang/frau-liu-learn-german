from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.learning_by_video.models import LearningVideoUserData, Video, VideoProgress
from apps.learning_by_video.serializers import VideoDetailSerializer, VideoListSerializer, VideoProgressSerializer
from apps.learning_by_video.throttles import VideoProgressWriteThrottle


@dataclass(frozen=True)
class ProgressPolicy:
    """Controls how progress is normalized and when to auto-complete."""
    auto_complete_ratio: float = 0.95  # 95%
    clamp_to_duration: bool = True


class VideoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Video.objects.all().order_by("-created_at")
    filter_backends = [DjangoFilterBackend, OrderingFilter, SearchFilter]
    filterset_fields = ["difficulty"]
    ordering_fields = ["created_at", "difficulty", "duration_seconds"]
    search_fields = ["title"]

    progress_policy = ProgressPolicy()

    def get_permissions(self):
        return [AllowAny()]

    def get_serializer_class(self):
        return VideoListSerializer if self.action == "list" else VideoDetailSerializer

    def retrieve(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        instance: Video = self.get_object()

        include_subtitles = request.query_params.get("include_subtitles") in {"1", "true", "True"}
        qs = Video.objects.all()
        if include_subtitles:
            qs = qs.prefetch_related("subtitles")

        instance = get_object_or_404(qs, pk=instance.pk)

        progress_obj = None
        if request.user.is_authenticated:
            progress_obj = (
                VideoProgress.objects.filter(user=request.user, video=instance)
                .only("id", "video_id", "current_time", "completed", "updated_at")
                .first()
            )

        serializer = VideoDetailSerializer(
            instance,
            context={
                "request": request,
                "include_subtitles": include_subtitles,
                "progress": progress_obj,
            },
        )
        return Response(serializer.data)

    def _normalize_progress_payload(self, *, video: Video, current_time: float | None, completed: bool | None) -> tuple[float | None, bool | None]:
        """
        Apply:
        1) clamp current_time to [0, duration_seconds] if enabled and duration > 0
        2) auto-complete if current_time >= ratio * duration_seconds
        """
        if current_time is None:
            return None, completed

        ct = float(current_time)
        if ct < 0:
            ct = 0.0

        duration = int(video.duration_seconds or 0)
        if self.progress_policy.clamp_to_duration and duration > 0:
            if ct > duration:
                ct = float(duration)

        # If client didn't explicitly mark completed, we can auto-complete
        if completed is None and duration > 0:
            if ct >= self.progress_policy.auto_complete_ratio * duration:
                completed = True

        # normalize float noise
        ct = round(ct, 3)
        return ct, completed

    def _sync_learning_user_data(self, request: Request, *, video: Video, current_time: float) -> None:
        """
        Keep module-level user data in sync.
        This assumes `request.user.user_data` exists (adjust if your relation name differs).
        """
        user_data = getattr(request.user, "user_data", None)
        if user_data is None:
            return

        obj, _ = LearningVideoUserData.objects.get_or_create(user_data=user_data)
        obj.last_watched_video = video
        obj.updated_at = timezone.now()
        # If you later add last_watched_time/last_watched_at fields, update them here.
        obj.save(update_fields=["last_watched_video", "updated_at"])

    @action(
        detail=True,
        methods=["get", "put", "patch"],
        permission_classes=[IsAuthenticated],
        throttle_classes=[VideoProgressWriteThrottle],
        url_path="progress",
    )
    def progress(self, request: Request, pk: str | None = None) -> Response:
        video = self.get_object()
        obj, _created = VideoProgress.objects.get_or_create(user=request.user, video=video)

        if request.method == "GET":
            return Response(VideoProgressSerializer(obj).data)

        partial = (request.method == "PATCH")
        serializer = VideoProgressSerializer(obj, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        validated = dict(serializer.validated_data)
        ct_in = validated.get("current_time")
        completed_in = validated.get("completed")  # might be missing
        ct_norm, completed_norm = self._normalize_progress_payload(
            video=video,
            current_time=ct_in,
            completed=completed_in,
        )
        if ct_norm is not None:
            validated["current_time"] = ct_norm
        if completed_norm is not None:
            validated["completed"] = completed_norm

        obj = serializer.save(**validated)

        # Sync module-level "last watched video" (and later time) after save
        if "current_time" in validated:
            self._sync_learning_user_data(request, video=video, current_time=obj.current_time)

        return Response(VideoProgressSerializer(obj).data, status=status.HTTP_200_OK)
