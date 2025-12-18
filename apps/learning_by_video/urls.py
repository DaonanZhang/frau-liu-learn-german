from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.learning_by_video.views import (
    LearningVideoUserDataViewSet,
    SubtitleViewSet,
    VideoExpressionOccurrenceViewSet,
    VideoSentenceOccurrenceViewSet,
    VideoViewSet,
    VideoWordOccurrenceViewSet,
)

router = DefaultRouter()
router.register(r"videos", VideoViewSet, basename="videos")
router.register(r"subtitles", SubtitleViewSet, basename="subtitles")
router.register(r"occurrences/words", VideoWordOccurrenceViewSet, basename="occ-words")
router.register(r"occurrences/sentences", VideoSentenceOccurrenceViewSet, basename="occ-sentences")
router.register(r"occurrences/expressions", VideoExpressionOccurrenceViewSet, basename="occ-expressions")

me_learning_video = LearningVideoUserDataViewSet.as_view({"get": "retrieve", "patch": "partial_update", "put": "update"})

urlpatterns = [
    path("", include(router.urls)),
    path("me/learning-video/", me_learning_video, name="me-learning-video"),
]
