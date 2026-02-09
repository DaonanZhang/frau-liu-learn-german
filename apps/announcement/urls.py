from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.announcement.views import AnnouncementViewSet

router = DefaultRouter()
router.register(r"announcements", AnnouncementViewSet, basename="announcements")

urlpatterns = [
    path("", include(router.urls)),
]
