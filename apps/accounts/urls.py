from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import (
    EntitlementViewSet,
    HomepageSettingViewSet,
    ModuleSeasonViewSet,
    PurchaseOfferViewSet,
    UserDataViewSet,
    UserViewSet,
)
from apps.accounts.views.registration import (
    RegisterVerifyCodeAPIView,
    RegisterAPIView,
)
from apps.accounts.views.activation import ActivationCodeApplyAPIView
from apps.accounts.views.payment import (
    AlipayNotifyAPIView,
    AlipayPaymentStatusAPIView,
    CreateAlipayPurchaseAPIView,
    CreateAlipayDebugPaymentAPIView,
)

from apps.accounts.views.auth import LoginAPIView, RefreshAPIView
from apps.accounts.views.password_reset import (
    PasswordResetConfirmAPIView,
    PasswordResetRequestAPIView,
)
from apps.accounts.views.public_status import PublicStatusAPIView


router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"user-data", UserDataViewSet, basename="user-data")
router.register(r"entitlements", EntitlementViewSet, basename="entitlement")
router.register(r"module-seasons", ModuleSeasonViewSet, basename="module-season")
router.register(r"homepage-settings", HomepageSettingViewSet, basename="homepage-setting")
router.register(r"purchase-offers", PurchaseOfferViewSet, basename="purchase-offer")

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
        "public/status/",
        PublicStatusAPIView.as_view(),
        name="public-status",
    ),
    path(
        "auth/login/",
        LoginAPIView.as_view(),
        name="login",
    ),
    path(
        "auth/refresh/",
        RefreshAPIView.as_view(),
        name="token-refresh",
    ),
    path(
        "auth/password-reset/request/",
        PasswordResetRequestAPIView.as_view(),
        name="password-reset-request",
    ),
    path(
        "auth/password-reset/confirm/",
        PasswordResetConfirmAPIView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "payments/alipay/debug-create/",
        CreateAlipayDebugPaymentAPIView.as_view(),
        name="alipay-debug-create",
    ),
    path(
        "payments/alipay/create/",
        CreateAlipayPurchaseAPIView.as_view(),
        name="alipay-create",
    ),
    path(
        "payments/alipay/notify/",
        AlipayNotifyAPIView.as_view(),
        name="alipay-notify",
    ),
    path(
        "payments/alipay/status/",
        AlipayPaymentStatusAPIView.as_view(),
        name="alipay-status",
    ),
]
