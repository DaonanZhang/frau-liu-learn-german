from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.accounts.feature_flags import user_has_release_access
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
    release_access = serializers.SerializerMethodField()

    def get_release_access(self, user: User) -> bool:
        return user_has_release_access(user)

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
            "has_seen_schreiben_guide",
            "has_seen_b2_schreiben_guide",
            "has_platform_wide_access",
            "release_access",
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
    has_seen_schreiben_guide = serializers.BooleanField(required=False)
    has_seen_b2_schreiben_guide = serializers.BooleanField(required=False)

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
            "has_seen_schreiben_guide",
            "has_seen_b2_schreiben_guide",
        )


class PromotionCodeBatchSerializer(serializers.Serializer):
    partner_name = serializers.CharField(max_length=128, trim_whitespace=True)
    operator_name = serializers.CharField(max_length=128, trim_whitespace=True)
    count = serializers.IntegerField(min_value=1, max_value=10000)
    discount_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        default=Decimal("5.00"),
    )


class PromotionCodeHistoryQuerySerializer(serializers.Serializer):
    generation_batch_id = serializers.UUIDField(required=False)
    search = serializers.CharField(
        max_length=128,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        default="",
    )
    page = serializers.IntegerField(min_value=1, required=False, default=1)
