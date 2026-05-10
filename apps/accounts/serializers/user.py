from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models.user import User
from apps.accounts.serializers.entitlement import EntitlementReadSerializer
from apps.accounts.serializers.user_data import UserDataReadSerializer

USERNAME_MAX_LENGTH = User._meta.get_field("telephone").max_length


class UserMeReadSerializer(serializers.ModelSerializer):
    """
    Read serializer for /users/me.
    """

    user_data = UserDataReadSerializer(read_only=True)
    entitlements = EntitlementReadSerializer(many=True, read_only=True)
    has_platform_wide_access = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "telephone",
            "country_code",
            "username",
            "email",
            "is_staff",
            "is_superuser",
            "has_platform_wide_access",
            "user_data",
            "entitlements",
        )
        read_only_fields = fields


class UserMeWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer for /users/me.
    """

    username = serializers.CharField(
        max_length=USERNAME_MAX_LENGTH,
        allow_blank=True,
        allow_null=True,
        required=False,
        trim_whitespace=True,
        error_messages={
            "max_length": f"用户名不能超过{USERNAME_MAX_LENGTH}个字符。",
            "blank": "用户名不能为空。",
            "null": "用户名不能为空。",
        },
    )
    email = serializers.EmailField(
        allow_blank=True,
        allow_null=True,
        required=False,
        error_messages={
            "invalid": "邮箱格式错误。",
        },
    )

    def validate_username(self, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        if normalized == "":
            return None

        return normalized

    def validate_email(self, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        if normalized == "":
            return None

        return normalized

    class Meta:
        model = User
        fields = (
            "username",
            "email",
        )
