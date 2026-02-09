from __future__ import annotations

from rest_framework import serializers

from apps.announcement.models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "content",
            "priority",
            "created_at",
        ]
        read_only_fields = fields
