from __future__ import annotations

from rest_framework.filters import OrderingFilter
from rest_framework.permissions import AllowAny
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.announcement.models import Announcement
from apps.announcement.serializers import AnnouncementSerializer


class AnnouncementViewSet(ReadOnlyModelViewSet):
    queryset = Announcement.objects.all().order_by("-created_at")
    serializer_class = AnnouncementSerializer
    permission_classes = [AllowAny]
    filter_backends = [OrderingFilter]
    ordering_fields = ["created_at", "priority"]
