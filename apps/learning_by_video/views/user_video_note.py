from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.learning_by_video.access import ensure_video_access
from apps.learning_by_video.models import LearningVideoUserData, LearningVideoUserVideoNote, Video
from apps.learning_by_video.serializers.user_video_note import (
    LearningVideoUserVideoNoteSerializer,
    LearningVideoUserVideoNoteUpsertSerializer,
)


class LearningVideoUserVideoNoteViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for per-video markdown notes for the current user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = LearningVideoUserVideoNoteSerializer
    required_module_key = "learning_by_video"

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
            LearningVideoUserVideoNote.objects.filter(learning_video_user_data=learning_video_user_data)
            .select_related("video")
            .order_by("-updated_at")
        )

    @action(detail=False, methods=["get", "put", "patch"], url_path=r"by-video/(?P<video_id>\d+)")
    def by_video(self, request: Request, video_id: str) -> Response:
        learning_video_user_data = self._get_learning_video_user_data()
        video = get_object_or_404(Video, pk=video_id)
        ensure_video_access(
            user=request.user,
            video=video,
            module_key=self.required_module_key,
        )

        note, _ = LearningVideoUserVideoNote.objects.get_or_create(
            learning_video_user_data=learning_video_user_data,
            video=video,
        )

        if request.method.lower() == "get":
            out = LearningVideoUserVideoNoteSerializer(instance=note, context={"request": request})
            return Response(out.data, status=status.HTTP_200_OK)

        upsert = LearningVideoUserVideoNoteUpsertSerializer(data=request.data)
        upsert.is_valid(raise_exception=True)
        note.note_markdown = str(upsert.validated_data.get("note_markdown", ""))
        note.save(update_fields=["note_markdown", "updated_at"])

        out = LearningVideoUserVideoNoteSerializer(instance=note, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)
