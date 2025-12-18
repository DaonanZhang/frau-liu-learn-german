from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import EntitlementViewSet, UserDataViewSet, UserViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"user-data", UserDataViewSet, basename="user-data")
router.register(r"entitlements", EntitlementViewSet, basename="entitlement")

urlpatterns = [
    path("", include(router.urls)),
]
