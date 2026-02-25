from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings

from apps.accounts.serializers.registration import COUNTRY_CODE_CHOICES


class TelephoneTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    JWT login serializer using telephone as username field.
    """

    username_field = "telephone"
    country_code = serializers.ChoiceField(choices=COUNTRY_CODE_CHOICES)

    def validate(self, attrs):
        telephone = attrs.get("telephone")
        country_code = attrs.get("country_code")
        password = attrs.get("password")

        cleaned = "".join(ch for ch in str(telephone or "").strip() if ch.isdigit())
        if len(cleaned) != 11:
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

        refresh = self.get_token(user)
        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

        if api_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, user)

        return data
