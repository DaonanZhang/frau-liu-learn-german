from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models.user import User
from apps.accounts.serializers.entitlement import EntitlementReadSerializer
from apps.accounts.serializers.user_data import UserDataReadSerializer


class UserMeReadSerializer(serializers.ModelSerializer):
    """Read serializer for /users/me."""

    user_data = UserDataReadSerializer(read_only=True)
    entitlements = EntitlementReadSerializer(many=True, read_only=True)
    has_lifetime_access = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "is_staff",
            "is_superuser",
            "has_lifetime_access",
            "user_data",
            "entitlements",
        )
        read_only_fields = fields


class UserMeWriteSerializer(serializers.ModelSerializer):
    """
    Write serializer for /users/me.
    """

    class Meta:
        model = User
        fields = ("email", "username")
