from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import EntitlementViewSet, UserDataViewSet, UserViewSet, ModuleSeasonViewSet
from apps.accounts.views.registration import (
    RegisterVerifyCodeAPIView,
    RegisterAPIView,
)
from apps.accounts.views.activation import ActivationCodeApplyAPIView

from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views.auth import LoginAPIView


router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"user-data", UserDataViewSet, basename="user-data")
router.register(r"entitlements", EntitlementViewSet, basename="entitlement")
router.register(r"module-seasons", ModuleSeasonViewSet, basename="module-season")

urlpatterns = [
    path("", include(router.urls)),
]


# Registration Urls
urlpatterns += [
    path(
        "auth/register/verify-code/",
        RegisterVerifyCodeAPIView.as_view(),
        name="register-verify-code",
    ),
    path(
        "auth/register/",
        RegisterAPIView.as_view(),
        name="register",
    ),
    path(
        "auth/activate-code/",
        ActivationCodeApplyAPIView.as_view(),
        name="activate-code",
    ),
]


# Login Urls
urlpatterns += [
    path(
        "auth/login/",
        LoginAPIView.as_view(),
        name="login",
    ),
    path(
        "auth/refresh/",
        TokenRefreshView.as_view(),
        name="token-refresh",
    ),
]
