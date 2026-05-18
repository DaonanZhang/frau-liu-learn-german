from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.maintenance import maintenance_message, user_allowed_during_maintenance
from apps.accounts.serializers.registration import COUNTRY_CODE_CHOICES


class TelephoneTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    JWT login serializer using telephone as username field.
    """

    username_field = "telephone"
    country_code = serializers.ChoiceField(choices=COUNTRY_CODE_CHOICES)
    default_error_messages = {
        **TokenObtainPairSerializer.default_error_messages,
        "no_active_account": "账号或密码输入错误。",
    }

    def validate(self, attrs):
        telephone = attrs.get("telephone")
        country_code = attrs.get("country_code")
        password = attrs.get("password")

        cleaned = "".join(ch for ch in str(telephone or "").strip() if ch.isdigit())
        if not cleaned:
            raise AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            )

        User = get_user_model()
        user = User.objects.filter(telephone=cleaned, country_code=country_code).first()
        if not user or not user.is_active or not user.check_password(password):
            raise AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            )
        if not user_allowed_during_maintenance(user):
            raise AuthenticationFailed(
                maintenance_message(),
                "maintenance_mode",
            )

        refresh = self.get_token(user)
        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

        if api_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, user)

        return data


class MaintenanceAwareTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = RefreshToken(attrs["refresh"])
        user_id = refresh.get("user_id")

        User = get_user_model()
        user = User.objects.filter(pk=user_id).first()
        if not user or not user_allowed_during_maintenance(user):
            raise AuthenticationFailed(
                maintenance_message(),
                "maintenance_mode",
            )

        return super().validate(attrs)
