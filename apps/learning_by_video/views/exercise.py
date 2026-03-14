from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.learning_by_video.access import ensure_video_access, filter_occurrences_by_entitlement
from apps.learning_by_video.models import Video
from apps.learning_by_video.models.exercise import VideoExerciseQuestion
from apps.learning_by_video.serializers.exercise import VideoExerciseQuestionSerializer


class VideoExerciseQuestionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only API for video exercises.

    Supported filters:
    - ?video=<video_id>
    - ?question_type=TRUE_FALSE|CHOICE
    """
    serializer_class = VideoExerciseQuestionSerializer
    permission_classes = [IsAuthenticated]
    required_module_key = "learning_by_video"

    def get_queryset(self):
        qs = (
            VideoExerciseQuestion.objects
            .select_related("video")
            .prefetch_related("options")
            .order_by("video_id", "order", "id")
        )

        video_id = self.request.query_params.get("video")
        if video_id:
            video = get_object_or_404(
                Video.objects.prefetch_related("access_seasons"),
                pk=video_id,
            )
            ensure_video_access(
                user=self.request.user,
                video=video,
                module_key=self.required_module_key,
            )
            qs = qs.filter(video_id=video.pk)
        else:
            qs = filter_occurrences_by_entitlement(
                qs,
                user=self.request.user,
                module_key=self.required_module_key,
            )

        q_type = self.request.query_params.get("question_type")
        if q_type:
            qs = qs.filter(question_type=q_type)

        return qs
