from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.lexicon.views.marks import UserWordMarkViewSet, UserSentenceMarkViewSet, UserExpressionMarkViewSet

router = DefaultRouter()
router.register(r"word-marks", UserWordMarkViewSet, basename="lexicon-word-marks")
router.register(r"expression-marks", UserExpressionMarkViewSet, basename="lexicon-expression-marks")
router.register(r"sentence-marks", UserSentenceMarkViewSet, basename="lexicon-sentence-marks")
urlpatterns = [
    path("", include(router.urls)),
]
