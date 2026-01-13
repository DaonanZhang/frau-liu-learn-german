from __future__ import annotations

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

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

    def get_queryset(self):
        qs = (
            VideoExerciseQuestion.objects
            .select_related("video")
            .prefetch_related("options")
            .order_by("video_id", "order", "id")
        )

        video_id = self.request.query_params.get("video")
        if video_id:
            qs = qs.filter(video_id=video_id)

        q_type = self.request.query_params.get("question_type")
        if q_type:
            qs = qs.filter(question_type=q_type)

        return qs
