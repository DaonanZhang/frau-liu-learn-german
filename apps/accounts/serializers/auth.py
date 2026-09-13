from __future__ import annotations

from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.maintenance import maintenance_message, user_allowed_during_maintenance
from apps.accounts.models import AccountLoginSession
from apps.accounts.serializers.registration import COUNTRY_CODE_CHOICES


def _session_authentication_failed(detail: str, code: str) -> AuthenticationFailed:
    return AuthenticationFailed(
        detail={"detail": detail, "code": code},
        code=code,
    )


class TelephoneTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    JWT login serializer using telephone as username field.
    """

    username_field = "telephone"
    country_code = serializers.ChoiceField(choices=COUNTRY_CODE_CHOICES)
    device_id = serializers.CharField(
        max_length=64,
        trim_whitespace=True,
        required=False,
    )
    default_error_messages = {
        **TokenObtainPairSerializer.default_error_messages,
        "no_active_account": "账号或密码输入错误。",
    }

    def validate(self, attrs):
        telephone = attrs.get("telephone")
        country_code = attrs.get("country_code")
        password = attrs.get("password")
        device_id = attrs.get("device_id") or str(uuid4())

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

        now = timezone.now()
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=user.pk)
            current_device_session = AccountLoginSession.objects.filter(
                user=user,
                device_id=device_id,
            ).first()
            current_device_is_active = bool(
                current_device_session
                and current_device_session.revoked_at is None
                and current_device_session.expires_at > now
            )
            active_other_sessions = AccountLoginSession.objects.filter(
                user=user,
                revoked_at__isnull=True,
                expires_at__gt=now,
            )
            if current_device_session:
                active_other_sessions = active_other_sessions.exclude(
                    pk=current_device_session.pk
                )

            if (
                not current_device_is_active
                and active_other_sessions.count()
                >= settings.MAX_CONCURRENT_LOGIN_SESSIONS
            ):
                raise _session_authentication_failed(
                    f"该账号已达到最多 {settings.MAX_CONCURRENT_LOGIN_SESSIONS} 个设备同时登录的上限，请先在其他设备退出。",
                    "concurrent_session_limit",
                )

            session_values = {
                "token_id": uuid4(),
                "expires_at": now + api_settings.REFRESH_TOKEN_LIFETIME,
                "revoked_at": None,
            }
            if current_device_session:
                for field, value in session_values.items():
                    setattr(current_device_session, field, value)
                current_device_session.created_at = now
                current_device_session.save(
                    update_fields=(
                        "token_id",
                        "created_at",
                        "expires_at",
                        "revoked_at",
                    )
                )
                login_session = current_device_session
            else:
                login_session = AccountLoginSession.objects.create(
                    user=user,
                    device_id=device_id,
                    **session_values,
                )

            refresh = self.get_token(user)
            refresh["sid"] = str(login_session.token_id)
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
        session_id = refresh.get("sid")

        User = get_user_model()
        user = User.objects.filter(pk=user_id).first()
        if not user or not user_allowed_during_maintenance(user):
            raise AuthenticationFailed(
                maintenance_message(),
                "maintenance_mode",
            )

        if not session_id or not AccountLoginSession.objects.filter(
            user=user,
            token_id=session_id,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).exists():
            raise _session_authentication_failed(
                "登录会话已失效，请重新登录。",
                "login_session_invalid",
            )

        return super().validate(attrs)
