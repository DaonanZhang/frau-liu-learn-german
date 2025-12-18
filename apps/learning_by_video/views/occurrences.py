from __future__ import annotations

from django.db.models import QuerySet
from rest_framework.filters import OrderingFilter
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.learning_by_video.models import (
    VideoExpressionOccurrence,
    VideoSentenceOccurrence,
    VideoWordOccurrence,
)
from apps.learning_by_video.serializers import (
    VideoExpressionOccurrenceSerializer,
    VideoSentenceOccurrenceSerializer,
    VideoWordOccurrenceSerializer,
)


class OccurrenceFilterMixin:
    """
    Supports:
    - ?video=<id>
    - ?subtitle=<id>
    - ?t_from=<float>&t_to=<float>
    - OR: ?t=<float>&window=<float>  (preferred for player; symmetric window)
    """

    def _parse_float(self, v: str | None) -> float | None:
        if v is None or v == "":
            return None
        return float(v)

    def filter_queryset_by_params(self, qs: QuerySet) -> QuerySet:
        p = self.request.query_params

        video = p.get("video")
        if video:
            qs = qs.filter(video_id=video)

        subtitle = p.get("subtitle")
        if subtitle:
            qs = qs.filter(subtitle_id=subtitle)

        # New: t + window
        t = self._parse_float(p.get("t"))
        window = self._parse_float(p.get("window"))
        if t is not None and window is not None:
            t_from = t - window
            t_to = t + window
            qs = qs.filter(time_start__gte=t_from, time_start__lte=t_to)
            return qs

        # fallback: explicit range
        t_from = self._parse_float(p.get("t_from"))
        t_to = self._parse_float(p.get("t_to"))
        if t_from is not None:
            qs = qs.filter(time_start__gte=t_from)
        if t_to is not None:
            qs = qs.filter(time_start__lte=t_to)

        return qs


class VideoWordOccurrenceViewSet(OccurrenceFilterMixin, ReadOnlyModelViewSet):
    serializer_class = VideoWordOccurrenceSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ["time_start"]
    ordering = ["time_start"]

    def get_queryset(self):
        qs = VideoWordOccurrence.objects.select_related("video", "subtitle", "word").all()
        return self.filter_queryset_by_params(qs)


class VideoSentenceOccurrenceViewSet(OccurrenceFilterMixin, ReadOnlyModelViewSet):
    serializer_class = VideoSentenceOccurrenceSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ["time_start"]
    ordering = ["time_start"]

    def get_queryset(self):
        qs = VideoSentenceOccurrence.objects.select_related("video", "subtitle", "sentence").all()
        return self.filter_queryset_by_params(qs)


class VideoExpressionOccurrenceViewSet(OccurrenceFilterMixin, ReadOnlyModelViewSet):
    serializer_class = VideoExpressionOccurrenceSerializer
    filter_backends = [OrderingFilter]
    ordering_fields = ["time_start"]
    ordering = ["time_start"]

    def get_queryset(self):
        qs = VideoExpressionOccurrence.objects.select_related("video", "subtitle", "expression").all()
        return self.filter_queryset_by_params(qs)
