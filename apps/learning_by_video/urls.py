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
    VideoExerciseQuestionViewSet,
    LearningVideoUserVideoMarkViewSet,
    LearningVideoUserVideoNoteViewSet,
    LearningVideoUserSubtitleFavoriteViewSet,
)

router = DefaultRouter()
router.register(r"videos", VideoViewSet, basename="videos")
router.register(r"subtitles", SubtitleViewSet, basename="subtitles")
router.register(r"occurrences/words", VideoWordOccurrenceViewSet, basename="occ-words")
router.register(r"occurrences/sentences", VideoSentenceOccurrenceViewSet, basename="occ-sentences")
router.register(r"occurrences/expressions", VideoExpressionOccurrenceViewSet, basename="occ-expressions")
router.register(r"exercise-questions", VideoExerciseQuestionViewSet, basename="exercise-question")
router.register("user-video-marks", LearningVideoUserVideoMarkViewSet, basename="user-video-marks")
router.register("user-video-notes", LearningVideoUserVideoNoteViewSet, basename="user-video-notes")
router.register(
    "user-subtitle-favorites",
    LearningVideoUserSubtitleFavoriteViewSet,
    basename="user-subtitle-favorites",
)


me_learning_video = LearningVideoUserDataViewSet.as_view({"get": "retrieve", "patch": "partial_update", "put": "update"})

urlpatterns = [
    path("", include(router.urls)),
    path("me/learning-video/", me_learning_video, name="me-learning-video"),
]
