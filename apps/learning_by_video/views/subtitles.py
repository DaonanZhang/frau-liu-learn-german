from __future__ import annotations

from django.db.models import QuerySet
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.learning_by_video.models import Subtitle
from apps.learning_by_video.serializers import SubtitleSerializer


class SubtitleViewSet(ReadOnlyModelViewSet):
    serializer_class = SubtitleSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["video"]
    ordering_fields = ["start"]

    def get_queryset(self) -> QuerySet[Subtitle]:
        return Subtitle.objects.select_related("video").all()
